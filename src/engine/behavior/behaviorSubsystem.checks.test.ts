// Ported from Forge WebGL tools/engine-tests.ts @ forge-webgl-final (04b5fb23).
// These checks exercise the legacy behavior API directly. See docs/PORT_LOG.md.
import assert from "node:assert/strict";
import { ActionMap } from "../input/actionMap.ts";
import { type Entity } from "../legacy/entity.ts";
import { type TransformSink } from "../movement/movementHostTypes.ts";
import { BehaviorSubsystem } from "./behaviorSubsystem.ts";
import { type BehaviorDefinition, type BehaviorRegistry } from "./behaviorTypes.ts";
import { test } from "vitest";

const check = test;

function tick(behavior: BehaviorSubsystem, frame = 1): void {
  behavior.update({ deltaSeconds: 0.016, elapsedSeconds: frame * 0.016, frame });
}

check("behavior world exposes read-only transform snapshots, distance and direction vectors", () => {
  const reports: Array<{
    targetX: number | null;
    mutatedSourceX: number | null;
    nextTargetX: number | null;
    distance: number | null;
    missingDistance: number | null;
    forward: readonly number[] | null;
    right: readonly number[] | null;
    up: readonly number[] | null;
  }> = [];
  const registry: BehaviorRegistry = {
    get: (scriptId) => {
      if (scriptId !== "probe") return undefined;
      return (context) => {
        const target = context.world.byTag("target")[0] ?? null;
        if (!target) return;
        const snapshot = context.world.transformOf(target);
        const mutableSnapshot = snapshot as { position: [number, number, number] } | null;
        if (mutableSnapshot) mutableSnapshot.position[0] = 99;
        reports.push({
          targetX: snapshot?.position[0] ?? null,
          mutatedSourceX: context.world.transformOf(target)?.position[0] ?? null,
          nextTargetX: context.world.transformOf(context.world.byName("Missing") ?? "")?.position[0] ?? null,
          distance: context.world.distanceTo(target),
          missingDistance: context.world.distanceTo("missing"),
          forward: context.world.forwardOf(target),
          right: context.world.rightOf(target),
          up: context.world.upOf(target),
        });
      };
    },
  };
  const behavior = new BehaviorSubsystem(registry, new ActionMap({}), () => undefined);
  behavior.setEntities([
    {
      id: "probe",
      components: {
        Transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        Behavior: { scriptId: "probe" },
      },
    },
    {
      id: "target",
      name: "Target",
      tags: ["target"],
      components: {
        Transform: { position: [3, 4, 0], rotation: [0, 90, 0], scale: [2, 2, 2] },
      },
    },
  ]);
  tick(behavior);

  assert.deepEqual(reports, [
    {
      targetX: 99,
      mutatedSourceX: 3,
      nextTargetX: null,
      distance: 5,
      missingDistance: null,
      forward: [1, 0, 0],
      right: [0, 0, -1],
      up: [0, 1, 0],
    },
  ]);
});

// A1 actor command surface: a behavior's `setVisibility` is queued during the tick
// and delivered to the host sink after the tick's behaviors + message flush run.
check("actor command: setVisibility reaches the host sink at end of tick", () => {
  const calls: Array<{ id: string; visible: boolean }> = [];
  const registry: BehaviorRegistry = {
    get: () => (context) => context.actor.setVisibility(false),
  };
  const entity: Entity = {
    id: "actor:0",
    components: {
      Transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      Behavior: { scriptId: "hide-self", params: {} },
    },
  };
  const behavior = new BehaviorSubsystem(
    registry,
    new ActionMap({}),
    () => undefined,
    undefined,
    undefined,
    {
      actorCommandSink: {
        setVisibility: (id, visible) => calls.push({ id, visible }),
        destroy: () => undefined,
      },
    },
  );
  behavior.setEntities([entity]);
  tick(behavior);
  assert.deepEqual(calls, [{ id: "actor:0", visible: false }]);
});

// A1.3 persistence: `destroy`/`setVisibility(false)` with `{ persist: true }` writes a
// reserved key into the persistent snapshot; applying that snapshot to a fresh scene
// re-issues the effect through the host sink (the save-game restore path).
check("actor command: persisted destroy + hide re-apply on a snapshot restore", () => {
  const registry: BehaviorRegistry = {
    get: (scriptId) => {
      if (scriptId === "persist-destroy") {
        return (context) => context.actor.destroy({ persist: true });
      }
      if (scriptId === "persist-hide") {
        return (context) => context.actor.setVisibility(false, { persist: true });
      }
      return undefined;
    },
  };
  const doomed: Entity = {
    id: "actor:0",
    components: {
      Transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      Behavior: { scriptId: "persist-destroy", params: {} },
    },
  };
  const dimmed: Entity = {
    id: "actor:1",
    components: {
      Transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      Behavior: { scriptId: "persist-hide", params: {} },
    },
  };
  const source = new BehaviorSubsystem(
    registry,
    new ActionMap({}),
    () => undefined,
    undefined,
    undefined,
    { actorCommandSink: { setVisibility: () => undefined, destroy: () => undefined } },
  );
  source.setEntities([doomed, dimmed]);
  tick(source);
  assert.deepEqual(source.getPersistentStateSnapshot(), [
    { entityId: "actor:0", key: "__actorDestroyed", value: true },
    { entityId: "actor:1", key: "__actorHidden", value: true },
  ]);

  // A fresh scene rebuilds the same entities; applying the snapshot re-issues the
  // effects immediately (restore runs after the scene is built, before the first tick).
  const effects: string[] = [];
  const restored = new BehaviorSubsystem(
    registry,
    new ActionMap({}),
    () => undefined,
    undefined,
    undefined,
    {
      actorCommandSink: {
        setVisibility: (id, visible) => effects.push(`hide:${id}:${visible}`),
        destroy: (id) => effects.push(`destroy:${id}`),
      },
    },
  );
  restored.setEntities([doomed, dimmed]);
  restored.applyPersistentStateSnapshot(source.getPersistentStateSnapshot());
  assert.deepEqual(effects.sort(), ["destroy:actor:0", "hide:actor:1:false"]);
});

// A6 velocity access (Unreal GetVelocity): `world.velocityOf` delegates to the
// host-wired provider, returns null for an unknown ref, and is null with no
// provider wired (pure engine tests, static/parked actors).
check("world.velocityOf delegates to the wired provider and is null otherwise", () => {
  const seen: Array<readonly [number, number, number] | null> = [];
  const registry: BehaviorRegistry = {
    get: () => (context) => {
      seen.push(context.world.velocityOf(context.entityId));
      seen.push(context.world.velocityOf("ghost:0"));
    },
  };
  const entity: Entity = {
    id: "actor:0",
    components: {
      Transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      Behavior: { scriptId: "probe", params: {} },
    },
  };
  const withProvider = new BehaviorSubsystem(
    registry,
    new ActionMap({}),
    () => undefined,
    undefined,
    undefined,
    { velocityProvider: { velocityOf: (id) => (id === "actor:0" ? [2, 0, -1] : null) } },
  );
  withProvider.setEntities([entity]);
  tick(withProvider);
  assert.deepEqual(seen[0], [2, 0, -1]);
  assert.equal(seen[1], null, "unknown ref has no velocity");

  seen.length = 0;
  const noProvider = new BehaviorSubsystem(registry, new ActionMap({}), () => undefined);
  noProvider.setEntities([entity]);
  tick(noProvider);
  assert.equal(seen[0], null, "no provider → null velocity");
});

// A6 impulse/launch: a behavior's addImpulse/launch queue during the tick and are
// delivered to the host sink after the tick's behaviors run, carrying the vector
// (and launch options). The physics/character effects themselves need a live
// backend, so this asserts the command surface reaches the host.
check("actor command: addImpulse/launch reach the host sink at end of tick", () => {
  const impulses: Array<{ id: string; v: readonly number[] }> = [];
  const launches: Array<{ id: string; v: readonly number[]; opts: unknown }> = [];
  const registry: BehaviorRegistry = {
    get: () => (context) => {
      context.actor.addImpulse([0, 5, 0]);
      context.actor.launch([1, 8, 0], { zOverride: true });
    },
  };
  const entity: Entity = {
    id: "actor:0",
    components: {
      Transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      Behavior: { scriptId: "knock", params: {} },
    },
  };
  const behavior = new BehaviorSubsystem(
    registry,
    new ActionMap({}),
    () => undefined,
    undefined,
    undefined,
    {
      actorCommandSink: {
        setVisibility: () => undefined,
        destroy: () => undefined,
        addImpulse: (id, v) => impulses.push({ id, v }),
        launch: (id, v, opts) => launches.push({ id, v, opts }),
      },
    },
  );
  behavior.setEntities([entity]);
  tick(behavior);
  assert.deepEqual(impulses, [{ id: "actor:0", v: [0, 5, 0] }]);
  assert.deepEqual(launches, [{ id: "actor:0", v: [1, 8, 0], opts: { zOverride: true } }]);
});

// A6 AttachToActor (keepWorld): an attached child follows its parent's motion at
// the world offset captured on attach; detaching leaves it where it is.
check("actor command: attachTo makes a child follow its parent; detach stops it", () => {
  const positions = new Map<string, [number, number, number]>();
  const record: TransformSink = (id, t) => {
    positions.set(id, [t.position[0], t.position[1], t.position[2]]);
  };
  const registry = new Map<string, BehaviorDefinition>([
    ["move", {
      messages: {
        Move: { target: "self", handle(context) {
          context.transform.position[0] += 3;
          context.transform.position[2] += 1;
        } },
      },
    }],
    ["attachDetach", {
      messages: {
        Attach: { target: "self", handle: ({ actor }) => actor.attachTo("parent:0") },
        Detach: { target: "self", handle: ({ actor }) => actor.detach() },
      },
    }],
  ]);
  const parent: Entity = {
    id: "parent:0",
    components: {
      Transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      Behavior: { scriptId: "move" },
    },
  };
  const child: Entity = {
    id: "child:0",
    components: {
      Transform: { position: [1, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      Behavior: { scriptId: "attachDetach" },
    },
  };
  const behavior = new BehaviorSubsystem(registry, new ActionMap({}), record);
  behavior.setEntities([parent, child]);
  tick(behavior); // settle
  behavior.emitScriptMessage("Attach", "child:0", undefined, "child:0");
  tick(behavior, 2); // captures offset [1,0,0]; child stays at [1,0,0]
  assert.deepEqual(positions.get("child:0"), [1, 0, 0]);
  behavior.emitScriptMessage("Move", "parent:0", undefined, "parent:0");
  tick(behavior, 3); // parent -> [3,0,1]; child follows to [4,0,1]
  assert.deepEqual(positions.get("child:0"), [4, 0, 1]);
  behavior.emitScriptMessage("Detach", "child:0", undefined, "child:0");
  tick(behavior, 4);
  behavior.emitScriptMessage("Move", "parent:0", undefined, "parent:0");
  tick(behavior, 5); // parent -> [6,0,2]; detached child stays put
  assert.deepEqual(positions.get("child:0"), [4, 0, 1]);
});

// A6 AttachToActor: a keepWorld child orbits + co-rotates as the parent turns; a
// snapToTarget child glues onto the parent's transform.
check("actor command: attachTo orbits a keepWorld child and snaps a snapToTarget child", () => {
  const transforms = new Map<string, { position: number[]; rotation: number[] }>();
  const record: TransformSink = (id, t) => {
    transforms.set(id, { position: [...t.position], rotation: [...t.rotation] });
  };
  const registry = new Map<string, BehaviorDefinition>([
    ["spin90", { messages: {
      Spin: { target: "self", handle(context) { context.transform.rotation[1] += 90; } },
    } }],
    ["attachKeep", { messages: {
      Attach: { target: "self", handle: ({ actor }) => actor.attachTo("parent:0") },
    } }],
    ["attachSnap", { messages: {
      Attach: { target: "self", handle: ({ actor }) => actor.attachTo("parent:0", { rule: "snapToTarget" }) },
    } }],
  ]);
  const parent: Entity = {
    id: "parent:0",
    components: {
      Transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      Behavior: { scriptId: "spin90" },
    },
  };
  const keepChild: Entity = {
    id: "keep:0",
    components: {
      Transform: { position: [1, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      Behavior: { scriptId: "attachKeep" },
    },
  };
  const snapChild: Entity = {
    id: "snap:0",
    components: {
      Transform: { position: [5, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      Behavior: { scriptId: "attachSnap" },
    },
  };
  const behavior = new BehaviorSubsystem(registry, new ActionMap({}), record);
  behavior.setEntities([parent, keepChild, snapChild]);
  tick(behavior);
  behavior.emitScriptMessage("Attach", "keep:0", undefined, "keep:0");
  behavior.emitScriptMessage("Attach", "snap:0", undefined, "snap:0");
  tick(behavior, 2);
  // snapToTarget glued onto the parent immediately.
  assert.deepEqual(transforms.get("snap:0")?.position, [0, 0, 0]);
  behavior.emitScriptMessage("Spin", "parent:0", undefined, "parent:0");
  tick(behavior, 3); // parent yaw -> 90
  const keep = transforms.get("keep:0");
  const snap = transforms.get("snap:0");
  const near = (a: number[] | undefined, b: number[]) =>
    a !== undefined && a.every((v, i) => Math.abs(v - (b[i] as number)) < 1e-9);
  assert.ok(near(keep?.position, [0, 0, -1]), `keep orbited: ${keep?.position}`);
  assert.ok(Math.abs((keep?.rotation[1] ?? 0) - 90) < 1e-9, "keep co-rotated to yaw 90");
  assert.ok(near(snap?.position, [0, 0, 0]), `snap stayed glued: ${snap?.position}`);
  assert.ok(Math.abs((snap?.rotation[1] ?? 0) - 90) < 1e-9, "snap tracks parent yaw");
});
