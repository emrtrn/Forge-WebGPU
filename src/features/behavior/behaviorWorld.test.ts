// World counterparts of the behavior checks from Forge WebGL tools/engine-tests.ts (04b5fb23).
import assert from "node:assert/strict";
import { afterEach, expect, test as check } from "vitest";
import {
  array, bool, createSchemaRegistry, defineComponent, defineFeature, installFeatures, normalizeActorClass,
  normalizeActorDoc, normalizeLevel, num, object, text, type ActorId, type SaveGameDoc, type Vec3,
} from "../../core/index.ts";
import { actorId, assetId, levelId } from "../../core/level/testKit.ts";
import { BehaviorDefinitionsKey, defineBehavior, type BehaviorDefinition } from "../../engine/behavior/worldBehavior.ts";
import { CheckpointKey } from "../../engine/persistence/checkpointService.ts";
import { createMemoryStorageAdapter, SaveGameStore } from "../../engine/persistence/saveGameStore.ts";
import { PhysicsServiceKey, PreparedPhysicsKey } from "../../engine/physics/physicsService.ts";
import { loadRapier } from "../../engine/physics/physicsSubsystem.ts";
import { ActorMotionKey } from "../../engine/world/actorMotion.ts";
import { bootGame } from "../../runtime/boot.ts";
import { defineGameModule } from "../../runtime/gameModule.ts";
import { installWorldCheckpoint } from "../../runtime/persistence/worldCheckpoint.ts";
import { createWorld, type World } from "../../runtime/world.ts";
import physicsFeature from "../physics/feature.ts";
import behaviorFeature from "./feature.ts";

const ProbeState = defineComponent("test.probeState", 1, {
  runtimeOnly: num({ default: 0 }),
  enabled: bool({ default: true, persist: true }),
  visits: array(num({ default: 0 }), { persist: true }),
});
const Projectile = defineComponent("test.projectile", 1, {
  damage: num({ default: 0 }), nested: object({ team: text() }),
});
const TestFeature = defineFeature({ id: "test.behaviorWorld", components: [ProbeState, Projectile] });
const LEVEL = levelId("a");
const PROJECTILE_CLASS = assetId("b");
const worlds: World[] = [];

function openWorld(definitions: readonly BehaviorDefinition[], options: {
  store?: SaveGameStore<SaveGameDoc>;
  initialSlot?: string;
  rapier?: Awaited<ReturnType<typeof loadRapier>>;
} = {}) {
  const features = options.rapier ? [physicsFeature, behaviorFeature, TestFeature] : [behaviorFeature, TestFeature];
  const registry = createSchemaRegistry();
  installFeatures(features, registry);
  const projectile = normalizeActorClass({
    schema: "forge.actorClass/1", id: PROJECTILE_CLASS, name: "Projectile",
    components: { projectile: { type: "test.projectile@1" } },
  }, { registry, strict: true });
  assert.deepEqual(projectile.issues, []);
  const schema = { registry, strict: true, resolveClass: (id: string) => id === PROJECTILE_CLASS ? projectile.value ?? undefined : undefined };
  const world = createWorld({ ...schema, features });
  worlds.push(world);
  world.services.provide(BehaviorDefinitionsKey, new Map(definitions.map((definition) => [definition.id, definition])));
  if (options.rapier) world.services.provide(PreparedPhysicsKey, { rapier: options.rapier });
  const checkpoint = options.store && installWorldCheckpoint(world, LEVEL, schema, {
    store: options.store, initialSlot: options.initialSlot,
  });
  world.init();
  return {
    world,
    play(actors: readonly unknown[]) {
      const level = normalizeLevel({ schema: "forge.level/1", id: LEVEL, actors }, schema);
      assert.deepEqual(level.issues, []);
      const docs = level.value!.actors;
      world.addActors(checkpoint?.persistentActors(docs) ?? docs, "level");
      checkpoint?.restoreSpawned();
      world.beginPlay();
    },
  };
}

function behaviorActor(id: ActorId, definition: BehaviorDefinition) {
  return { id, components: { behavior: { type: "forge.behavior@1", script: definition.id } } };
}

function memoryStore() {
  return new SaveGameStore<SaveGameDoc>({ gameId: "behavior-world", schema: 1, storage: createMemoryStorageAdapter() });
}

afterEach(() => {
  for (const world of worlds.splice(0)) world.dispose();
});

check("behavior persistent state snapshots only include opt-in keys and can restore", () => {
  const writer = defineBehavior({
    id: "test.writer",
    tick({ actor }) {
      const state = actor.components.probe!;
      state.runtimeOnly = 7;
      state.enabled = false;
      state.visits = [1, 2];
    },
  });
  const id = actorId("a");
  const source = behaviorActor(id, writer);
  const docs = [{ ...source, components: { ...source.components, probe: { type: "test.probeState@1" } } }];
  const store = memoryStore();
  const first = openWorld([writer], { store });
  first.play(docs);
  first.world.tick(0.016);
  const checkpoint = first.world.services.require(CheckpointKey);
  assert.deepEqual(checkpoint.capture().actors[id]?.components.probe, {
    type: "test.probeState@1", enabled: false, visits: [1, 2],
  });
  assert.equal(checkpoint.save("quick"), true);

  const restored = openWorld([writer], { store, initialSlot: "quick" });
  restored.play(docs);
  assert.deepEqual(restored.world.context.actor(id)?.components.probe, {
    type: "test.probeState@1", enabled: false, visits: [1, 2], runtimeOnly: 0,
  });
});

check("behavior resetEntityTransform updates the runtime transform before the next tick", () => {
  const seen: number[] = [];
  const probe = defineBehavior({
    id: "test.move",
    tick({ actor, world }) {
      const [x, y, z] = actor.transform.p;
      seen.push(x);
      world.services.require(ActorMotionKey).setTransforms([{ actor: actor.id, transform: { ...actor.transform, p: [x + 1, y, z] } }]);
    },
  });
  const id = actorId("a");
  const { world, play } = openWorld([probe]);
  play([behaviorActor(id, probe)]);
  const motion = world.services.require(ActorMotionKey);
  const actor = world.context.actor(id)!;
  motion.setTransforms([{ actor: id, transform: { ...actor.transform, p: [5, 0, 0] } }]);
  world.tick(0.016);
  assert.deepEqual(seen, [5]);
  assert.deepEqual(actor.transform.p, [6, 0, 0]);
});

check("actor command: persisted collision-disable re-applies on a snapshot restore", async () => {
  const disable = defineBehavior({
    id: "test.disable",
    tick({ actor, world }) {
      world.services.require(PhysicsServiceKey).setCollisionEnabled(actor.id, false, { persist: true });
    },
  });
  const destroy = defineBehavior({
    id: "test.destroy",
    tick({ actor, world }) { world.destroyActors([actor.id]); },
  });
  const door = behaviorActor(actorId("a"), disable);
  const doomed = behaviorActor(actorId("b"), destroy);
  const docs = [{ ...door, components: { ...door.components, body: { type: "forge.collider@1" } } }, doomed];
  const ray = { origin: [0, 0, 3], direction: [0, 0, -1], distance: 5 } as const;
  const store = memoryStore();
  const rapier = await loadRapier();
  const first = openWorld([disable, destroy], { store, rapier });
  first.play(docs);
  const physics = first.world.services.require(PhysicsServiceKey);
  assert.equal(physics.castRay(ray)?.actor, door.id);
  first.world.tick(0.016);
  assert.equal(physics.castRay(ray), null);
  assert.equal(first.world.context.actor(doomed.id), undefined);
  assert.equal(first.world.services.require(CheckpointKey).save("quick"), true);

  const restored = openWorld([disable, destroy], { store, initialSlot: "quick", rapier });
  restored.play(docs);
  const restoredPhysics = restored.world.services.require(PhysicsServiceKey);
  assert.ok(restored.world.context.actor(door.id));
  assert.equal(restored.world.context.actor(doomed.id), undefined);
  assert.equal(restoredPhysics.castRay(ray), null);
  assert.equal(restoredPhysics.setCollisionEnabled(door.id, true), true);
  assert.equal(restoredPhysics.castRay(ray)?.actor, door.id);
});

check("actor command: spawn delivers a cloned host request", () => {
  const spawned = actorId("b");
  const yaw = Math.SQRT1_2;
  const spawner = defineBehavior({
    id: "test.spawner",
    tick({ world }) {
      if (world.actor(spawned)) return;
      const p: Vec3 = [1, 2, 3];
      const projectile = { damage: 12, nested: { team: "blue" } };
      world.spawnActors([{
        id: spawned, class: PROJECTILE_CLASS, transform: { p, r: [0, yaw, 0, yaw], s: [2, 2, 2] }, overrides: { projectile },
      }]);
      p[0] = 99;
      projectile.damage = 99;
      projectile.nested.team = "red";
    },
  });
  const { world, play } = openWorld([spawner]);
  play([behaviorActor(actorId("a"), spawner)]);
  world.tick(0.016);
  const actor = world.context.actor(spawned);
  assert.equal(actor?.origin, "spawned");
  assert.deepEqual(actor?.transform.p, [1, 2, 3]);
  assert.ok(Math.abs((actor?.transform.r[1] ?? 0) - yaw) < 1e-9);
  assert.ok(Math.abs((actor?.transform.r[3] ?? 0) - yaw) < 1e-9);
  assert.deepEqual(actor?.transform.s, [2, 2, 2]);
  assert.deepEqual(actor?.components.projectile, { type: "test.projectile@1", damage: 12, nested: { team: "blue" } });
});

check("streamed behavior restores EndPlay state and receives one message after rejoining", async () => {
  const id = actorId("a");
  const events: unknown[][] = [];
  let ping = false;
  const probe = defineBehavior({
    id: "test.streamed",
    events: {
      beginPlay({ actor }) {
        const state = actor.components.probe!;
        events.push(["begin", state.visits, state.runtimeOnly]);
        state.runtimeOnly = 7;
      },
      endPlay({ actor }, event) {
        if (event.kind !== "endPlay" || event.reason !== "removed") return;
        events.push(["end"]);
        actor.components.probe!.visits = [1, 2];
      },
    },
    messages: { Ping: { target: "any", handle() { events.push(["ping"]); } } },
  });
  const sender = defineBehavior({
    id: "test.sender",
    tick({ emit }) {
      if (!ping) return;
      ping = false;
      emit("Ping");
    },
  });
  const streamed = behaviorActor(id, probe);
  let source: readonly [number, number] = [0, 0];
  let frame: ((time: number) => void) | undefined;
  let time = 0;
  const game = await bootGame({
    strict: true, features: [TestFeature, behaviorFeature],
    gameModule: defineGameModule({ id: "test.streaming", behaviors: [probe, sender] }),
    async loadLevel(registry) {
      const doc = normalizeActorDoc({ ...streamed, components: { ...streamed.components, probe: { type: "test.probeState@1" } } }, {
        registry, resolveClass: () => undefined, strict: true,
      });
      assert.deepEqual(doc.issues, []);
      return {
        level: { schema: "forge.level/1", id: LEVEL, settings: { cellSize: 100, loadRange: 150 }, actors: [behaviorActor(actorId("b"), sender)] },
        cells: { cells: ["0_0"], read: async () => ({ payload: { actors: [doc.value!], bytes: 100 }, issues: [] }) },
      };
    },
    render: {
      async init() {}, feature: () => defineFeature({ id: "test.render" }), frame() {}, onLost() {}, dispose() {},
      streamingSources: () => [{ position: source }],
    },
    scheduler: { request: (next) => { frame = next; return 1; }, cancel: () => { frame = undefined; } },
    screen: { info() {}, clear() {}, error(view) { throw new Error(view.message); } },
  });
  assert.ok(game);
  const advance = async () => {
    assert.ok(frame);
    frame(time += 16);
    await Promise.resolve();
  };
  try {
    await expect.poll(async () => { await advance(); return events.length; }).toBe(1);
    ping = true;
    await advance();
    source = [950, 0];
    await expect.poll(async () => { await advance(); return game.world.context.actor(id); }).toBeUndefined();
    ping = true;
    await advance();
    assert.deepEqual(events, [["begin", [], 0], ["ping"], ["end"]]);

    source = [0, 0];
    await expect.poll(async () => { await advance(); return events.length; }).toBe(4);
    ping = true;
    await advance();
    assert.deepEqual(events, [["begin", [], 0], ["ping"], ["end"], ["begin", [1, 2], 0], ["ping"]]);
  } finally {
    game.stop();
  }
});
