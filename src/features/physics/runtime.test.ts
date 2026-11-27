import { expect, test, test as checkAsync } from "vitest";
import { defineFeature, type SaveGameDoc } from "../../core/index.ts";
import { actorId, assetId, levelId } from "../../core/level/testKit.ts";
import { PhysicsRuntimeKey, PhysicsServiceKey } from "../../engine/physics/physicsService.ts";
import { defineBehavior, type BehaviorEvent } from "../../engine/behavior/worldBehavior.ts";
import { ActorMotionKey } from "../../engine/world/actorMotion.ts";
import { CheckpointKey } from "../../engine/persistence/checkpointService.ts";
import { SaveGameStore, createMemoryStorageAdapter } from "../../engine/persistence/saveGameStore.ts";
import { bootGame, type BootOptions } from "../../runtime/boot.ts";
import { defineGameModule } from "../../runtime/gameModule.ts";
import { Shape } from "../shape/schema.ts";
import { StaticMesh } from "../static-mesh/schema.ts";
import physicsFeature from "./feature.ts";
import behaviorFeature from "../behavior/feature.ts";
import navigationFeature from "../navigation/feature.ts";
import vehicleFeature from "../vehicle/feature.ts";
import { NavigationServiceKey } from "../../engine/navigation/worldNavigation.ts";
import { VehicleServiceKey } from "../../engine/physics/vehicle/worldVehicle.ts";
import { createFlatWorldTerrain } from "../../engine/terrain/worldTerrainCreate.ts";
import terrainFeature from "../terrain/feature.ts";

const check = test;
const LEVEL = { schema: "forge.level/1", id: levelId("1") };

const ShapeFeature = defineFeature({ id: "test.shape", components: [Shape] });

function harness(overrides: Pick<BootOptions, "features" | "loadLevel" | "headlessTerrain" | "modelCollision">) {
  const shown: { kind: string; title: string }[] = [];
  let pending: ((time: number) => void) | undefined;
  const options = {
    ...overrides,
    strict: true,
    screen: {
      info: (title: string) => { shown.push({ kind: "info", title }); },
      error: ({ title, message }: { title: string; message: string }) => { shown.push({ kind: "error", title: title + " " + message }); },
      clear: () => { shown.push({ kind: "clear", title: "" }); },
    },
    scheduler: {
      request: (frame: (time: number) => void) => { pending = frame; return 1; },
      cancel: () => { pending = undefined; },
    },
  } satisfies BootOptions;
  return { options, shown, step: (time: number) => pending!(time) };
}

test("headless physics is queryable before the first step and stays isolated across Worlds", async () => {
  const features = [physicsFeature, ShapeFeature];
  const floor = {
    id: actorId("1"), name: "Floor",
    transform: { p: [0, 0, 0], s: [8, 2, 8] },
    components: { shape: { type: "forge.shape@2", parent: null } },
  };
  const a = harness({ features, loadLevel: async () => ({ level: { ...LEVEL, actors: [floor] } }) });
  const b = harness({ features, loadLevel: async () => ({ level: { ...LEVEL, actors: [] } }) });
  const [first, second] = await Promise.all([bootGame(a.options), bootGame(b.options)]);
  expect(a.shown).toEqual([{ kind: "clear", title: "" }]);
  expect(b.shown).toEqual([{ kind: "clear", title: "" }]);
  try {
    const physics = first!.world.services.require(PhysicsServiceKey);
    const other = second!.world.services.require(PhysicsServiceKey);
    const ray = { origin: [0, 4, 0], direction: [0, -2, 0], distance: 5 } as const;
    const shape = { ...ray, shape: { kind: "sphere", radius: 0.25 } } as const;
    expect(physics.castRay(ray)).toMatchObject({ actor: floor.id, component: "shape", distance: 3.5, normal: [0, 1, 0] });
    const initialShape = physics.castShape(shape);
    expect(initialShape?.distance).toBeCloseTo(3.25);
    expect(other.castRay(ray)).toBeNull();
    a.step(0);
    a.step(20);
    expect(physics.castShape(shape)?.distance).toBeCloseTo(initialShape!.distance);
    expect(physics.castRay(ray, { ignore: [floor.id] })).toBeNull();

    first!.world.context.destroyActors([floor.id]);
    expect(physics.castRay(ray)).toBeNull();
    const spawned = first!.world.context.spawnActors([{ ...floor, id: actorId("2") }]);
    expect(physics.castRay(ray)?.actor).toBe(spawned[0]?.id);
    expect(other.castRay(ray)).toBeNull();
  } finally {
    first?.stop();
    second?.stop();
  }
});

test("model collision profiles keep visibility and camera queries independent", async () => {
  const actors = [{
    id: actorId("8"), name: "Transparent Wall", transform: { p: [0, 0, -2] },
    components: { wall: { type: "forge.staticMesh@2", mesh: assetId("e") } },
  }, {
    id: actorId("9"), name: "Solid Wall", transform: { p: [0, 0, -5] },
    components: { wall: { type: "forge.staticMesh@2", mesh: assetId("f") } },
  }];
  const setup = harness({
    features: [physicsFeature, defineFeature({ id: "test.mesh", components: [StaticMesh] })],
    loadLevel: async () => ({ level: { ...LEVEL, actors } }),
    modelCollision: (asset) => ({
      bounds: { min: [-1, -1, -0.5], max: [1, 1, 0.5] },
      settings: asset === assetId("e") ? { profile: { preset: "custom", responses: { visibility: "ignore" } } } : {},
    }),
  });
  const game = await bootGame(setup.options);
  expect(game).not.toBeNull();
  try {
    const physics = game!.world.services.require(PhysicsServiceKey);
    const query = { origin: [0, 0, 0], direction: [0, 0, -1], distance: 10 } as const;
    expect(physics.castRay(query)?.actor).toBe(actorId("9"));
    expect(physics.castRay(query, { channel: "camera" })?.actor).toBe(actorId("8"));
    setup.step(0);
    setup.step(20);
    expect(physics.castRay(query)?.actor).toBe(actorId("9"));
    expect(physics.castRay(query, { channel: "camera" })?.actor).toBe(actorId("8"));
  } finally {
    game?.stop();
  }
});

test.each([
  { wall: "block", mover: "block", expected: "hit" },
  { wall: "overlap", mover: "block", expected: "overlap" },
  { wall: "block", mover: "overlap", expected: "overlap" },
  { wall: "overlap", mover: "ignore", expected: null },
  { wall: "ignore", mover: "block", expected: null },
])("Rapier responds to wall $wall and mover $mover with $expected", async ({ wall, mover, expected }) => {
  const wallId = actorId("a"), moverId = actorId("b");
  const actors = [{
    id: wallId, name: "Wall", transform: { p: [0, 0, 0] },
    components: { volume: { type: "forge.blockingVolume@1", size: [0.25, 4, 4],
      profile: { preset: "custom", responses: { worldDynamic: wall } } } },
  }, {
    id: moverId, name: "Mover", transform: { p: [-2, 0, 0] },
    components: { body: { type: "forge.collider@1", size: [0.5, 0.5, 0.5], gravity: false, motion: "dynamic",
      profile: { preset: "custom", objectType: "worldDynamic", responses: { worldStatic: mover } } } },
  }];
  const setup = harness({ features: [physicsFeature], loadLevel: async () => ({ level: { ...LEVEL, actors } }) });
  const game = await bootGame(setup.options);
  expect(game).not.toBeNull();
  try {
    const runtime = game!.world.services.require(PhysicsRuntimeKey);
    game!.world.services.require(PhysicsServiceKey).applyImpulse(moverId, [3, 0, 0]);
    const observed = new Set<string>();
    for (let frame = 0; frame <= 90; frame += 1) {
      setup.step(frame * (1000 / 60));
      for (const contact of runtime.contacts()) observed.add(contact.isSensor ? "overlap" : "hit");
    }
    expect([...observed]).toEqual(expected === null ? [] : [expected]);
    const x = game!.world.context.actor(moverId)!.transform.p[0];
    if (expected === "hit") expect(x).toBeLessThan(-0.25);
    else expect(x).toBeGreaterThan(2);
    if (expected !== "hit") expect(runtime.contacts()).toEqual([]);
  } finally {
    game?.stop();
  }
});

test("a pawn sweep and a visibility trace select different profile responses", async () => {
  const actors = [
    { id: actorId("a"), name: "Overlapping Pawn", transform: { p: [0, 0, -2] },
      components: { volume: { type: "forge.collider@1", profile: { preset: "custom", responses: { pawn: "overlap" } } } } },
    { id: actorId("b"), name: "Query Only", transform: { p: [0, 0, -4] },
      components: { volume: { type: "forge.collider@1", profile: { preset: "custom", collisionEnabled: "query" } } } },
    { id: actorId("c"), name: "Physics Only", transform: { p: [0, 0, -6] },
      components: { volume: { type: "forge.collider@1", profile: { preset: "custom", collisionEnabled: "physics" } } } },
    { id: actorId("d"), name: "Disabled", transform: { p: [0, 0, -1] },
      components: { volume: { type: "forge.collider@1", profile: { preset: "noCollision" } } } },
  ];
  const setup = harness({ features: [physicsFeature], loadLevel: async () => ({ level: { ...LEVEL, actors } }) });
  const game = await bootGame(setup.options);
  expect(game).not.toBeNull();
  try {
    const physics = game!.world.services.require(PhysicsServiceKey);
    const query = { origin: [0, 0, 0], direction: [0, 0, -1], distance: 10 } as const;
    expect(physics.castRay(query)?.actor).toBe(actorId("a"));
    expect(physics.castRay(query, { ignore: [actorId("a")] })?.actor).toBe(actorId("b"));
    expect(physics.castRay(query, { ignore: [actorId("a"), actorId("b")] })).toBeNull();
    const shape = { ...query, shape: { kind: "sphere", radius: 0.15 } } as const;
    expect(physics.castShape(shape, { physicalChannel: "pawn" })?.actor).toBe(actorId("c"));
  } finally {
    game?.stop();
  }
});

test("the World delivers an opted-in Rapier impact to the actor's code behavior", async () => {
  const crate = actorId("2"), floor = actorId("3");
  const observed: Extract<BehaviorEvent, { kind: "impact" }>[] = [];
  const behavior = defineBehavior({
    id: "test.impact",
    events: { impact(_context, event) { if (event.kind === "impact") observed.push(event); } },
  });
  const actors = [{
    id: crate, name: "Crate", transform: { p: [0, 2.5, 0] },
    components: { body: { type: "forge.collider@1", motion: "dynamic", mass: 10 },
      behavior: { type: "forge.behavior@1", script: behavior.id } },
  }, {
    id: floor, name: "Floor", transform: { p: [0, -0.5, 0] },
    components: { body: { type: "forge.collider@1", size: [20, 1, 20] } },
  }];
  const setup = harness({ features: [behaviorFeature, physicsFeature], loadLevel: async () => ({ level: { ...LEVEL, actors } }) });
  const game = await bootGame({ ...setup.options, gameModule: defineGameModule({ id: "test.impacts", behaviors: [behavior] }) });
  expect(game).not.toBeNull();
  try {
    for (let frame = 0; frame <= 90; frame += 1) setup.step(frame * (1000 / 60));
    const landing = observed.find((event) => event.impulse > 50);
    expect(landing).toMatchObject({ other: floor });
    expect(landing!.impulse).toBeLessThan(80);
    expect(landing!.normal[1]).toBeLessThan(-0.99);
    expect(landing!.point![1]).toBeCloseTo(0, 1);
  } finally {
    game?.stop();
  }
});

check("behavior can react to physics contacts from the engine tick", async () => {
  const mover = actorId("1"), sensor = actorId("2");
  const overlapping: { other: string; phase: string }[] = [];
  const reaction = defineBehavior({
    id: "test.contactReaction",
    events: { overlap({ actor, world }, event) {
      if (event.kind !== "overlap" || event.phase !== "begin") return;
      overlapping.push({ other: event.other, phase: event.phase });
      const [x, y] = actor.transform.p;
      world.services.require(ActorMotionKey).setTransforms([{ actor: actor.id, transform: { ...actor.transform, p: [x, y, 7] } }]);
    } },
  });
  const actors = [
    { id: mover, name: "Mover", components: {
      body: { type: "forge.collider@1", motion: "dynamic", gravity: false },
      reaction: { type: "forge.behavior@1", script: reaction.id },
    } },
    { id: sensor, name: "Sensor", transform: { p: [0.25, 0, 0] },
      components: { body: { type: "forge.collider@1", sensor: true } } },
  ];
  const setup = harness({ features: [behaviorFeature, physicsFeature], loadLevel: async () => ({ level: { ...LEVEL, actors } }) });
  const game = await bootGame({ ...setup.options, gameModule: defineGameModule({ id: "test.contacts", behaviors: [reaction] }) });
  expect(game).not.toBeNull();
  try {
    setup.step(0);
    setup.step(20);
    expect(overlapping).toEqual([{ other: sensor, phase: "begin" }]);
    expect(game!.world.context.actor(mover)?.transform.p).toEqual([0, 0, 7]);
  } finally {
    game?.stop();
  }
});

check("actor command: destroy cuts subsequent ticks, contacts and messages", async () => {
  const doomed = actorId("a"), player = actorId("b");
  let ticks = 0, overlaps = 0, received = 0, sent = 0;
  const remove = defineBehavior({
    id: "test.selfRemove",
    events: { overlap(_context, event) { if (event.kind === "overlap" && event.phase === "begin") overlaps += 1; } },
    messages: { ping: { target: "self", handle() { received += 1; } } },
    tick({ world, deltaSeconds }) {
      if (deltaSeconds === 0) return;
      ticks += 1;
      world.destroyActors([doomed]);
    },
  });
  const sender = defineBehavior({ id: "test.sender", tick({ world, send }) {
    if (world.actor(doomed)) return;
    sent += 1;
    send("ping", doomed);
  } });
  const actors = [
    { id: doomed, name: "Doomed", components: { body: { type: "forge.collider@1", sensor: true },
      behavior: { type: "forge.behavior@1", script: remove.id } } },
    { id: player, name: "Player", components: { body: { type: "forge.collider@1", motion: "dynamic", gravity: false },
      behavior: { type: "forge.behavior@1", script: sender.id } } },
  ];
  const setup = harness({ features: [behaviorFeature, physicsFeature], loadLevel: async () => ({ level: { ...LEVEL, actors } }) });
  const game = await bootGame({ ...setup.options, gameModule: defineGameModule({ id: "test.destroy", behaviors: [remove, sender] }) });
  expect(game).not.toBeNull();
  try {
    setup.step(0);
    setup.step(20);
    expect(overlaps).toBe(1);
    expect(ticks).toBe(1);
    const runtime = game!.world.services.require(PhysicsRuntimeKey);
    expect(game!.world.context.actor(doomed)).toBeUndefined();
    expect([...runtime.ids(doomed)]).toEqual([]);
    expect(runtime.contacts()).toEqual([]);
    setup.step(40);
    expect(ticks).toBe(1);
    expect(sent).toBeGreaterThan(0);
    expect(received).toBe(0);
  } finally {
    game?.stop();
  }
});

check("actor command: setCollisionEnabled reaches the host sink at end of tick", async () => {
  const door = actorId("a");
  const openDoor = defineBehavior({ id: "test.openDoor", tick({ actor, world }) {
    world.services.require(PhysicsServiceKey).setCollisionEnabled(actor.id, false);
  } });
  const actor = { id: door, name: "Door", transform: { p: [0, 0, -2] },
    components: { shape: { type: "forge.collider@1" }, script: { type: "forge.behavior@1", script: openDoor.id } } };
  const setup = harness({ features: [behaviorFeature, physicsFeature], loadLevel: async () => ({ level: { ...LEVEL, actors: [actor] } }) });
  const game = await bootGame({ ...setup.options, gameModule: defineGameModule({ id: "test.door", behaviors: [openDoor] }) });
  expect(game).not.toBeNull();
  try {
    const physics = game!.world.services.require(PhysicsServiceKey);
    const query = { origin: [0, 0, 0], direction: [0, 0, -1], distance: 5 } as const;
    expect(physics.castRay(query)?.actor).toBe(door);
    setup.step(0);
    expect(physics.castRay(query)).toBeNull();
    expect(game!.world.context.actor(door)).toBeDefined();
    expect(physics.setCollisionEnabled(door, true)).toBe(true);
    expect(physics.castRay(query)?.actor).toBe(door);
  } finally {
    game?.stop();
  }
});

test("actor collision saved through a checkpoint applies to all colliders before the first query", async () => {
  const door = actorId("a");
  const actor = { id: door, name: "Door", transform: { p: [0, 0, -2] },
    components: { body: { type: "forge.collider@1" }, volume: { type: "forge.blockingVolume@1" } } };
  const loadLevel = async () => ({ level: { ...LEVEL, actors: [actor] } });
  const check = harness({ features: [physicsFeature], loadLevel });
  const store = new SaveGameStore<SaveGameDoc>({ gameId: "collision-fixture", schema: 1, storage: createMemoryStorageAdapter() });
  const query = { origin: [0, 0, 0], direction: [0, 0, -1], distance: 5 } as const;
  const original = await bootGame({ ...check.options, checkpoint: { store } });
  expect(original).not.toBeNull();
  try {
    const physics = original!.world.services.require(PhysicsServiceKey);
    expect(physics.setCollisionEnabled(door, false, { persist: true })).toBe(true);
    expect(physics.castRay(query)).toBeNull();
    expect(physics.setCollisionEnabled(door, true)).toBe(true);
    expect(physics.castRay(query)?.actor).toBe(door);
    expect(original!.world.services.require(CheckpointKey).save("quick")).toBe(true);
  } finally {
    original?.stop();
  }
  const restored = await bootGame({ ...check.options, checkpoint: { store, initialSlot: "quick" } });
  expect(restored).not.toBeNull();
  try {
    const physics = restored!.world.services.require(PhysicsServiceKey);
    expect(physics.castRay(query)).toBeNull();
    expect(physics.setCollisionEnabled(door, true, { persist: true })).toBe(true);
    expect(physics.castRay(query)?.actor).toBe(door);
  } finally {
    restored?.stop();
  }
});

checkAsync("physics contacts: a static crowd does not change reported pairs or their order", async () => {
  const box = (name: string, p: [number, number, number], motion = "static", sensor = false) => ({
    name, transform: { p }, components: { collider: { type: "forge.collider@1", motion, sensor, gravity: false } },
  });
  const actors = Array.from({ length: 60 }, (_, index) => box(`static:${index}`, [20 + (index % 10) * 3, 0, Math.floor(index / 10) * 3]));
  actors.splice(51, 0, box("crowd-trigger", [20, 0, 0.3], "static", true));
  actors.splice(41, 0, box("probe", [0, 0, 0.4], "dynamic", true));
  actors.splice(31, 0, box("dynamic", [0, 0, 0], "dynamic"));
  actors.splice(21, 0, box("trigger", [-0.25, 0, 0], "static", true));
  actors.splice(11, 0, box("wall", [0.25, 0, 0]));
  const authored = actors.map((actor, index) => ({
    ...actor, id: `act_${index.toString(16).padStart(32, "0")}`,
  }));
  const contactsFor = async (levelActors: typeof authored) => {
    const setup = harness({ features: [physicsFeature], loadLevel: async () => ({ level: { ...LEVEL, actors: levelActors } }) });
    const game = await bootGame(setup.options);
    expect(game).not.toBeNull();
    try {
      setup.step(0);
      setup.step(16);
      const runtime = game!.world.services.require(PhysicsRuntimeKey);
      const actorName = (body: string) => game!.world.context.actor(runtime.owner(body)!)?.name;
      return runtime.contacts().map(({ a, b, isSensor }) => [actorName(a), actorName(b), isSensor]);
    } finally {
      game?.stop();
    }
  };
  const baseline = await contactsFor(authored.filter(({ name }) => !name.startsWith("static:") && name !== "crowd-trigger"));
  expect(baseline).toEqual([
    ["wall", "dynamic", false], ["wall", "probe", true], ["trigger", "dynamic", true],
    ["trigger", "probe", true], ["dynamic", "probe", true],
  ]);
  expect(await contactsFor(authored)).toEqual(baseline);
});

test("a runtime vehicle drives on the loaded terrain heightfield and Recast finds a path across it", async () => {
  const chassis = {
    id: actorId("3"), name: "Car", transform: { p: [0, 0.8, -4] },
    components: {
      chassis: { type: "forge.collider@1", motion: "dynamic", size: [1.53, 0.48, 3.15], mass: 1150, parent: null },
      vehicle: { type: "forge.vehicle@1", parent: null },
    },
  };
  const floor = {
    id: actorId("4"), name: "World Terrain",
    components: { terrain: { type: "forge.terrain@2", parent: null, data: assetId("3") } },
  };
  const overlappingDeck = {
    id: actorId("5"), name: "Non-blocking deck", transform: { p: [0, 0.43, 0] },
    components: { volume: { type: "forge.blockingVolume@1", size: [4, 0.08, 20],
      profile: { preset: "custom", responses: { worldDynamic: "overlap" } } } },
  };
  const { options, step, shown } = harness({
    features: [physicsFeature, terrainFeature, navigationFeature, vehicleFeature],
    loadLevel: async () => ({ level: { ...LEVEL, actors: [floor, overlappingDeck, chassis] } }),
    headlessTerrain: async () => createFlatWorldTerrain({ name: "Test", tilesX: 1, tilesZ: 1, tileQuads: 64, spacing: 1, baseHeight: 0 }),
  });
  const game = await bootGame(options);
  expect(shown).toEqual([{ kind: "clear", title: "" }]);
  try {
    step(0);
    const world = game!.world;
    const vehicle = world.services.require(VehicleServiceKey);
    expect(vehicle.input(chassis.id, { throttle: 1, brake: 0, steer: 0, handbrake: false })).toBe(true);
    for (let frame = 1; frame <= 120; frame += 1) step(frame * 1000 / 60);
    const drive = vehicle.state(chassis.id);
    const grounded = drive!.wheels.filter((wheel) => wheel.inContact);
    expect(grounded.length).toBeGreaterThan(0);
    expect(grounded.every((wheel) => Math.abs(wheel.contactPoint![1]) < 0.1)).toBe(true);
    expect(drive?.forwardSpeed).toBeGreaterThan(2);
    expect(world.context.actor(chassis.id)?.transform.p[2]).toBeGreaterThan(-3);

    const navigation = world.services.require(NavigationServiceKey);
    expect(await navigation.ready()).toBe(true);
    const path = navigation.path([-5, 0, -4], [-3, 0, 6], { radius: 0.3, height: 1.8 });
    expect(path.status).toBe("success");
    expect(path.points.length).toBeGreaterThan(1);
  } finally {
    game?.stop();
  }
});
