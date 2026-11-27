import { expect, test, test as checkAsync } from "vitest";
import { defineFeature } from "../../core/index.ts";
import { actorId, assetId, levelId } from "../../core/level/testKit.ts";
import { PhysicsRuntimeKey, PhysicsServiceKey } from "../../engine/physics/physicsService.ts";
import { bootGame, type BootOptions } from "../../runtime/boot.ts";
import { Shape } from "../shape/schema.ts";
import { StaticMesh } from "../static-mesh/schema.ts";
import physicsFeature from "./feature.ts";
import navigationFeature from "../navigation/feature.ts";
import vehicleFeature from "../vehicle/feature.ts";
import { NavigationServiceKey } from "../../engine/navigation/worldNavigation.ts";
import { VehicleServiceKey } from "../../engine/physics/vehicle/worldVehicle.ts";
import { createFlatWorldTerrain } from "../../engine/terrain/worldTerrainCreate.ts";
import terrainFeature from "../terrain/feature.ts";

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
  const { options, step, shown } = harness({
    features: [physicsFeature, terrainFeature, navigationFeature, vehicleFeature],
    loadLevel: async () => ({ level: { ...LEVEL, actors: [floor, chassis] } }),
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
    expect(drive?.wheels.some((wheel) => wheel.inContact)).toBe(true);
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
