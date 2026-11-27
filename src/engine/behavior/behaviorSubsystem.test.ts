// Ported from Forge WebGL tests/engine/behaviorSubsystem.test.ts @ forge-webgl-final (04b5fb23).
// The fixtures register behavior handlers in code. See docs/PORT_LOG.md §2.
import assert from "node:assert/strict";
import { ActionMap } from "../input/actionMap.ts";
import { type Entity } from "../legacy/entity.ts";
import { BehaviorSubsystem } from "./behaviorSubsystem.ts";
import { type ActorCommandSink, type BehaviorRegistry, type PersistentScriptStateEntry } from "./behaviorTypes.ts";
import { test } from "vitest";


type Check = (label: string, fn: () => void) => void;

function actor(id = "actor:0"): Entity {
  return {
    id, name: id, tags: ["streamed"],
    components: {
      Transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      Behavior: { scriptId: "lifecycle" },
    },
  };
}

function subsystem(registry: BehaviorRegistry, effects: string[] = []): BehaviorSubsystem {
  const actorCommandSink: ActorCommandSink = {
    setVisibility: (id, visible) => effects.push(`visibility:${id}:${visible}`),
    setCollisionEnabled: (id, enabled) => effects.push(`collision:${id}:${enabled}`),
    destroy: (id) => effects.push(`destroy:${id}`),
  };
  return new BehaviorSubsystem(registry, new ActionMap({}), () => undefined, undefined, undefined, { actorCommandSink });
}

function tick(behavior: BehaviorSubsystem, frame: number): void {
  behavior.update({ deltaSeconds: 0.016, elapsedSeconds: frame * 0.016, frame });
}

export function registerBehaviorSubsystemTests(check: Check): void {
  check("behavior unload: persisted hide/collision markers survive and apply on re-add", () => {
    let firstLife = true;
    const effects: string[] = [];
    const behavior = subsystem({ get: () => ({ events: {
      beginPlay(context) {
        if (!firstLife) return;
        firstLife = false;
        context.actor.setVisibility(false, { persist: true });
        context.actor.setCollisionEnabled(false, { persist: true });
      },
    } }) }, effects);
    behavior.setEntities([actor()]);
    tick(behavior, 1);
    const snapshot = behavior.getPersistentStateSnapshot();
    assert.deepEqual(snapshot, [
      { entityId: "actor:0", key: "__actorCollisionDisabled", value: true },
      { entityId: "actor:0", key: "__actorHidden", value: true },
    ]);
    effects.length = 0;
    assert.equal(behavior.unloadEntity("actor:0"), true);
    assert.deepEqual(behavior.getPersistentStateSnapshot(), snapshot);
    assert.deepEqual(effects, []);
    assert.equal(behavior.addEntity(actor()), true);
    assert.deepEqual(effects, ["visibility:actor:0:false", "collision:actor:0:false"]);
    tick(behavior, 2);
    assert.equal(effects.length, 2);
  });

  check("behavior unload: EndPlay destroy marker survives without issuing a host destroy command", () => {
    const effects: string[] = [];
    const behavior = subsystem({ get: () => ({ events: {
      endPlay(context) { context.actor.destroy({ persist: true }); },
    } }) }, effects);
    behavior.setEntities([actor()]);
    tick(behavior, 1);
    assert.equal(behavior.unloadEntity("actor:0"), true);
    assert.equal(behavior.isPersistedDestroyed("actor:0"), true);
    assert.deepEqual(behavior.getPersistentStateSnapshot(), [
      { entityId: "actor:0", key: "__actorDestroyed", value: true },
    ]);
    tick(behavior, 2);
    assert.deepEqual(effects, [], "queued EndPlay commands never destroy an unloaded actor through the host");
    assert.equal(behavior.unloadEntity("actor:0"), false);
  });

  check("behavior snapshot: non-live entries survive and effects wait until that entity is added", () => {
    const effects: string[] = [];
    const seen: unknown[] = [];
    const behavior = subsystem({ get: () => ({ events: {
      beginPlay(context) { seen.push(context.state.get("saved", null)); },
    } }) }, effects);
    behavior.setEntities([]);
    const entries: PersistentScriptStateEntry[] = [
      { entityId: "actor:0", key: "__actorHidden", value: true },
      { entityId: "actor:0", key: "__actorCollisionDisabled", value: true },
      { entityId: "actor:0", key: "saved", value: { visits: [1, 2] } },
      { entityId: "actor:1", key: "__actorDestroyed", value: true },
      { entityId: "actor:1", key: "__actorHidden", value: true },
      { entityId: "actor:1", key: "__actorCollisionDisabled", value: true },
    ];
    const before = structuredClone(entries);
    behavior.applyPersistentStateSnapshot(entries);
    assert.deepEqual(behavior.getPersistentStateSnapshot(), [...before].sort((a, b) =>
      a.entityId.localeCompare(b.entityId) || a.key.localeCompare(b.key)));
    assert.deepEqual(effects, []);
    assert.equal(behavior.isPersistedDestroyed("actor:1"), true);
    assert.equal(behavior.isPersistedDestroyed("actor:0"), false);
    assert.equal(behavior.isPersistedDestroyed("missing"), false);
    (entries[2]!.value as { visits: number[] }).visits.push(3);
    assert.equal(behavior.addEntity(actor()), true);
    assert.deepEqual(effects, ["visibility:actor:0:false", "collision:actor:0:false"]);
    tick(behavior, 1);
    assert.deepEqual(seen, [{ visits: [1, 2] }], "restored state is cloned and visible to BeginPlay");
    effects.length = 0;
    assert.equal(behavior.addEntity(actor("actor:2")), true);
    assert.deepEqual(effects, [], "adding another actor does not replay live effects");
    assert.equal(behavior.addEntity(actor("actor:1")), true);
    assert.deepEqual(effects, ["destroy:actor:1"], "destroy supersedes hide/collision");
    assert.equal(behavior.getScriptActorDebugInfo("actor:1"), null);
    assert.equal(behavior.isPersistedDestroyed("actor:1"), true);
    effects.length = 0;
    behavior.applyPersistentStateSnapshot([]);
    assert.deepEqual(effects, ["visibility:actor:0:false", "collision:actor:0:false"], "restore effects only target live actors");
  });

  check("behavior snapshot: setEntities and clear wipe unloaded state and destroy markers", () => {
    const behavior = subsystem({ get: () => undefined });
    for (const reset of [() => behavior.setEntities([]), () => behavior.clear()]) {
      behavior.applyPersistentStateSnapshot([
        { entityId: "actor:0", key: "saved", value: 42 },
        { entityId: "actor:1", key: "__actorDestroyed", value: true },
      ]);
      assert.equal(behavior.isPersistedDestroyed("actor:1"), true);
      reset();
      assert.deepEqual(behavior.getPersistentStateSnapshot(), []);
      assert.equal(behavior.isPersistedDestroyed("actor:1"), false);
    }
  });
}

registerBehaviorSubsystemTests(test as unknown as Parameters<typeof registerBehaviorSubsystemTests>[0]);
