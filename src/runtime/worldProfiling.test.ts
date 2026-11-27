import assert from "node:assert/strict";
import { test as check } from "vitest";
import { createSchemaRegistry, defineFeature, defineSubsystem, type SubsystemDef } from "../core/index.ts";
import { buildFrameRegionRows, UNMEASURED_REGION_ID } from "../engine/perf/frameRegions.ts";
import { createWorld } from "./world.ts";

function scene(...subsystems: SubsystemDef[]) {
  return createWorld({
    features: [defineFeature({ id: "test.profiling", subsystems })],
    registry: createSchemaRegistry(), resolveClass: () => undefined, strict: true,
  });
}

const first = defineSubsystem({
  id: "test.first", tickGroups: ["prePhysics"], create: () => ({ tick() {} }),
});
const second = defineSubsystem({
  id: "test.second", tickGroups: ["postPhysics"], create: () => ({ tick() {} }),
});

// Integration checks from Forge WebGL frameRegions.test.ts, now driven by World.
check("the subsystem block is a region whose residual is the registry's own cost", () => {
  const world = scene(first, second);
  world.init();
  world.beginPlay();
  let clock = 0;
  const profiler = world.enableProfiling(() => ++clock);
  world.tick(0.016);
  profiler.recordFrame(20);
  profiler.endFrame();

  assert.deepEqual(buildFrameRegionRows(profiler.snapshot()).map(({ id, depth, averageMs }) => [id, depth, averageMs]), [
    ["engine", 0, 5],
    [first.id, 1, 1],
    [second.id, 1, 1],
    ["engine (other)", 1, 3],
    [UNMEASURED_REGION_ID, 0, 15],
  ]);
  world.dispose();
});

check("a subsystem registered after profiling started still nests under engine", () => {
  // World fixes its definitions up front and installs their instances at init.
  const world = scene(first);
  let clock = 0;
  const profiler = world.enableProfiling(() => ++clock);
  world.init();
  world.beginPlay();
  world.tick(0.016);
  profiler.endFrame();
  assert.equal(profiler.snapshot().subsystems.find(({ id }) => id === first.id)?.parent, "engine");
  world.dispose();
});

// From Forge WebGL tools/engine-tests.ts. World can tick one subsystem in several groups.
check("subsystem profiler: registry times each subsystem with an injected clock", () => {
  const ticks: string[] = [];
  const multi = defineSubsystem({
    id: "test.multi", tickGroups: ["prePhysics", "renderSync"],
    create: () => ({ tick: (group) => ticks.push(group) }),
  });
  const physics = defineSubsystem({
    id: "test.physics", tickGroups: ["physics"], create: () => ({ tick: (group) => ticks.push(group) }),
  });
  const world = scene(multi, physics);
  world.init();
  world.beginPlay();
  world.tick(0.016);
  assert.deepEqual(ticks.splice(0), ["prePhysics", "physics", "renderSync"]);

  let clock = 0;
  const profiler = world.enableProfiling(() => ++clock);
  assert.equal(world.enableProfiling(), profiler);
  world.tick(0.016);
  assert.deepEqual(ticks, ["prePhysics", "physics", "renderSync"]);
  assert.equal(profiler.snapshot().frames, 0);
  profiler.recordFrame(10);
  profiler.endFrame();
  const snapshot = profiler.snapshot();
  assert.equal(snapshot.frames, 1);
  assert.equal(snapshot.frame?.averageMs, 10);
  assert.deepEqual(snapshot.subsystems.map(({ id, lastMs, samples, parent }) => [id, lastMs, samples, parent]), [
    ["engine", 7, 1, null],
    [multi.id, 2, 1, "engine"],
    [physics.id, 1, 1, "engine"],
  ]);
  assert.equal(snapshot.totalAverageMs, 7);
  world.dispose();
});
