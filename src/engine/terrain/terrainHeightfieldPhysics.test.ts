// Ported from Forge WebGL tests/engine/terrainHeightfieldPhysics.test.ts @ forge-webgl-final (04b5fb23): checks unchanged, run by
// Vitest; 7 check(s) not yet portable left out. docs/PORT_LOG.md §2.
import assert from "node:assert/strict";
import { COLLIDER_COMPONENT, TRANSFORM_COMPONENT, type ColliderComponent } from "../legacy/components.ts";
import { type Entity, type EntityComponentData } from "../legacy/entity.ts";
import { type Vec3 } from "../legacy/layout.ts";
import { PhysicsSubsystem } from "../physics/physicsSubsystem.ts";
import { NEUTRAL_VEHICLE_INPUT, createReferenceCarDefinition } from "../physics/vehicle/vehicleTypes.ts";
import { terrainTileTrimesh } from "../testing/terrainTrimeshReference.ts";
import { terrainHeightAt } from "./terrainHeightQuery.ts";
import { createFlatTerrainTile, terrainTileHeightRange, tileKey, type TerrainTileData, type WorldTerrainDef } from "./terrainTypes.ts";
import { worldTerrainColliderEntities } from "./worldTerrainActor.ts";
import { test } from "vitest";


type Check = (label: string, fn: () => void) => void;
type CheckAsync = (label: string, fn: () => Promise<void>) => Promise<void>;

/**
 * OPEN_WORLD_PLAN Faz 3: World Terrain tiles and legacy Landscapes collide as heightfields. Their
 * static triangles are produced on demand, and every PhysicsSubsystem query
 * must answer exactly what the per-tile trimesh it replaces answered.
 */

const Q = 32;

function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** 2×2 tiles with one hole, relief from one global function, and a near-vertical cliff spike. */
function terrain(spacing: number, origin: Vec3): { def: WorldTerrainDef; tiles: Map<string, TerrainTileData> } {
  const def: WorldTerrainDef = {
    schema: 1, type: "worldTerrain", name: "Parity", tileQuads: Q, spacing, tilesX: 2, tilesZ: 2, origin,
    heightMin: -1e6, heightMax: 1e6, layers: [{ id: "grass", name: "Grass", color: "#4a7a3a" }], tiles: [], collision: true,
  };
  const tiles = new Map<string, TerrainTileData>();
  for (const [tx, tz] of [[0, 0], [1, 0], [0, 1]] as const) {
    const tile = createFlatTerrainTile(def, tx, tz);
    for (let z = 0; z <= Q; z += 1) {
      for (let x = 0; x <= Q; x += 1) {
        const gx = tx * Q + x;
        const gz = tz * Q + z;
        // A 50 km spike makes its side triangles nearly vertical: wall blockers.
        const spike = gx === 40 && gz === 9 ? 50_000 : 0;
        tile.heights[z * (Q + 1) + x] = Math.fround(3 * Math.sin(gx * 0.21) * Math.cos(gz * 0.13) + 0.05 * gz + spike);
      }
    }
    const range = terrainTileHeightRange(tile);
    def.tiles.push({ key: tileKey(tx, tz), minHeight: range.min, maxHeight: range.max });
    tiles.set(tileKey(tx, tz), tile);
  }
  return { def, tiles };
}

function staticBox(id: string, position: Vec3, size: Vec3): Entity {
  const collider: ColliderComponent = { shape: "box", size, isStatic: true, isSensor: false };
  return {
    id, name: id,
    components: {
      [TRANSFORM_COMPONENT]: { position, rotation: [0, 0, 0], scale: [1, 1, 1] },
      [COLLIDER_COMPONENT]: collider as unknown as EntityComponentData,
    },
  };
}

/** The same tiles as per-tile trimesh entities (the collider before Faz 3), same ids and frames. */
function trimeshEntities(heightfields: readonly Entity[], document: ReturnType<typeof terrain>): Entity[] {
  return heightfields.map((entity) => {
    const key = entity.id.split(":")[2]!;
    const { primitive } = terrainTileTrimesh(document.def, document.tiles.get(key)!);
    const collider = entity.components[COLLIDER_COMPONENT] as unknown as ColliderComponent;
    return {
      ...entity,
      components: {
        ...entity.components,
        [COLLIDER_COMPONENT]: { ...collider, primitives: [primitive] } as unknown as EntityComponentData,
      },
    };
  });
}

/** Interleaves other static bodies so body order matters in merged results. */
function scene(tiles: readonly Entity[]): Entity[] {
  return [
    staticBox("crate", [14, 2, 9], [3, 4, 3]),
    tiles[0]!,
    staticBox("wall", [30, 1, 20], [0.5, 6, 40]),
    ...tiles.slice(1),
    staticBox("far", [500, 0, 500], [2, 2, 2]),
  ];
}

function samplePoints(document: ReturnType<typeof terrain>, count: number): [number, number, number][] {
  const random = seeded(11);
  const { origin, spacing } = document.def;
  const extent = 2 * Q * spacing;
  const points: [number, number, number][] = [];
  for (let index = 0; index < count; index += 1) {
    points.push([origin[0] - 3 + random() * (extent + 6), origin[2] - 3 + random() * (extent + 6), random() * 6]);
  }
  // Tile seams, a 4 m cell boundary, the hole and the spike.
  const seam = origin[0] + Q * spacing;
  points.push([seam, origin[2] + 7.3, 1], [seam, origin[2] + Q * spacing, 2.5], [16, 16, 0], [16, 16, 4],
    [origin[0] + 1.5 * Q * spacing, origin[2] + 1.5 * Q * spacing, 1], [origin[0] + 40 * spacing, origin[2] + 9 * spacing, 1.5]);
  return points;
}

function assertSameStaticQueries(trimesh: PhysicsSubsystem, heightfield: PhysicsSubsystem, points: [number, number, number][], label: string): void {
  assert.equal(heightfield.hasStaticGround(), trimesh.hasStaticGround(), `${label}: hasStaticGround`);
  for (const [x, z, radius] of points) {
    assert.deepEqual(heightfield.staticSurfaceTrianglesNear(x, z), trimesh.staticSurfaceTrianglesNear(x, z), `${label}: surfaces at ${x},${z}`);
    assert.deepEqual(heightfield.staticBlockerAabbsNear(x, z, radius), trimesh.staticBlockerAabbsNear(x, z, radius), `${label}: blockers at ${x},${z} r${radius}`);
  }
  assert.deepEqual(heightfield.staticBlockerAabbs(), trimesh.staticBlockerAabbs(), `${label}: all blockers`);
  assert.deepEqual(heightfield.staticSurfaceTriangles(), trimesh.staticSurfaceTriangles(), `${label}: all surfaces`);
  assert.deepEqual(heightfield.staticNavigationBlockerAabbs(), trimesh.staticNavigationBlockerAabbs(), `${label}: nav blockers`);
  assert.deepEqual(heightfield.staticNavigationSurfaceTriangles(), trimesh.staticNavigationSurfaceTriangles(), `${label}: nav surfaces`);
}

/** Same 64 m square and 1 m samples: four 32-quad tiles or one 64-quad control. */
function vehicleTerrain(seamed: boolean): ReturnType<typeof terrain> {
  const def: WorldTerrainDef = {
    schema: 1, type: "worldTerrain", name: "Vehicle seams", tileQuads: seamed ? Q : 2 * Q,
    spacing: 1, tilesX: seamed ? 2 : 1, tilesZ: seamed ? 2 : 1, origin: [-Q, 0, -Q],
    heightMin: -1, heightMax: 1, layers: [{ id: "grass", name: "Grass", color: "#4a7a3a" }],
    tiles: [], collision: true,
  };
  const tiles = new Map<string, TerrainTileData>();
  for (let z = 0; z < def.tilesZ; z += 1) {
    for (let x = 0; x < def.tilesX; x += 1) {
      const key = tileKey(x, z);
      tiles.set(key, createFlatTerrainTile(def, x, z));
      def.tiles.push({ key, minHeight: 0, maxHeight: 0 });
    }
  }
  return { def, tiles };
}

interface SeamDrive {
  label: string;
  yaw: number;
  start: Vec3;
  endTile: string;
  touchedTiles: string[];
}

async function driveTerrainSeam(seamed: boolean, route: SeamDrive) {
  const physics = new PhysicsSubsystem({ backend: "rapier" });
  const ground = worldTerrainColliderEntities({ id: "seams", name: "Seams", collision: true }, vehicleTerrain(seamed));
  assert.equal(ground.length, seamed ? 4 : 1);
  assert.ok(ground.every((entity) => (entity.components[COLLIDER_COMPONENT] as unknown as ColliderComponent).primitives![0]!.shape === "heightfield"));
  // Same chassis and reference-car API as createVehicleTestWorld in tools/engine-tests.ts.
  physics.setGravity([0, -9.81, 0]);
  // Enable runtime pose synchronization; read simulatedTransform below, not the
  // sink's interpolated presentation pose (one slice behind at alpha = 0).
  physics.setTransformSink(() => {});
  physics.setEntities([...ground, {
    id: "car",
    components: {
      Transform: { position: route.start, rotation: [0, route.yaw, 0], scale: [1, 1, 1] },
      Collider: { shape: "box", size: [1.8, 0.6, 4.2], isStatic: false, isSensor: false, simulatePhysics: true },
    },
  }]);
  try {
    await physics.init();
    assert.equal(physics.usesRapier(), true);
    assert.equal(physics.createVehicle("car", createReferenceCarDefinition()), true);
    const dt = 1 / 60;
    let frame = 0;
    const tick = (): void => {
      frame += 1;
      physics.update({ deltaSeconds: dt, elapsedSeconds: frame * dt, frame });
      assert.equal(physics.lastFrameStepCount(), 1);
    };
    const wheels = () => physics.vehicleState("car")!.wheels;
    const tileId = (key: string) => `landscape:seams:${seamed ? key : "0_0"}`;
    // Exclude spawn drop/spring settling; the subsequent motion is driven only by throttle.
    for (let index = 0; index < 180; index += 1) tick();
    assert.ok(wheels().every((wheel) => wheel.inContact && wheel.groundEntityId === tileId("0_0")));
    physics.setVehicleInput("car", { ...NEUTRAL_VEHICLE_INPUT, throttle: 1 });
    const yaw = route.yaw * Math.PI / 180;
    const forwardX = Math.sin(yaw);
    const forwardZ = Math.cos(yaw);
    const progressAt = (position: Vec3) => route.label === "X" ? position[0]
      : route.label === "Z" ? position[2] : (position[0] + position[2]) / Math.SQRT2;
    let previous = physics.simulatedTransform("car")!.position;
    const nearSeam: { vy: number; dy: number }[] = [];
    const touched = new Set<string>();
    let crossed = false;
    for (let index = 0; index < 360; index += 1) {
      tick();
      const position = physics.simulatedTransform("car")!.position;
      const progress = progressAt(position);
      const state = physics.vehicleState("car")!;
      for (const wheel of state.wheels) {
        assert.ok(wheel.inContact && wheel.groundEntityId, `${route.label} (${seamed ? "2x2" : "control"}): grounded at frame ${frame}, position ${position}, speed ${state.forwardSpeed}`);
        touched.add(wheel.groundEntityId);
      }
      const lateral = (position[0] - route.start[0]) * forwardZ - (position[2] - route.start[2]) * forwardX;
      assert.ok(Math.abs(lateral) < 0.1, `${route.label}: stayed straight (${lateral} m)`);
      // ±4 m covers the complete wheelbase before/after each seam, including a straddling step.
      if (Math.min(progress, progressAt(previous)) <= 4 && Math.max(progress, progressAt(previous)) >= -4) {
        assert.ok(state.forwardSpeed > 1, `${route.label}: actually driving at the seam`);
        nearSeam.push({ vy: physics.velocityOf("car")![1], dy: position[1] - previous[1] });
      }
      previous = position;
      if (progress >= 10) {
        assert.ok(state.wheels.every((wheel) => wheel.groundEntityId === tileId(route.endTile)), `${route.label}: every wheel reached the far tile`);
        crossed = true;
        break;
      }
    }
    assert.ok(crossed, `${route.label}: crossed the seam under engine force within 6 s`);
    assert.ok(nearSeam.length >= 20, `${route.label}: enough seam samples (${nearSeam.length})`);
    assert.deepEqual([...touched].sort(), [...new Set(route.touchedTiles.map(tileId))].sort(), `${route.label}: real wheel rays reached the expected tile colliders`);
    return {
      samples: nearSeam,
      maxVy: Math.max(...nearSeam.map((sample) => Math.abs(sample.vy))),
      maxDy: Math.max(...nearSeam.map((sample) => Math.abs(sample.dy))),
    };
  } finally {
    physics.dispose();
  }
}

export function registerTerrainHeightfieldPhysicsTests(check: Check): void {

  check("terrain heightfield physics: a collision-free World Terrain leaves no static ground", () => {
    const document = terrain(1.5, [0, 0, 0]);
    const physics = new PhysicsSubsystem();
    physics.setEntities(worldTerrainColliderEntities({ id: "world", name: "World", collision: false }, document));
    assert.equal(physics.hasStaticGround(), false);
    physics.setEntities(worldTerrainColliderEntities({ id: "world", name: "World", collision: true }, document));
    assert.equal(physics.hasStaticGround(), true);
    for (const id of ["0_0", "1_0", "0_1"]) physics.setEntityCollisionEnabled(`landscape:world:${id}`, false);
    assert.equal(physics.hasStaticGround(), false);
  });
}

export async function registerTerrainHeightfieldRapierTests(checkAsync: CheckAsync): Promise<void> {

  await checkAsync("terrain heightfield physics: the Rapier collider PhysicsSubsystem builds is the queried surface", async () => {
    const document = terrain(1.5, [-7, 2, -5]);
    const physics = new PhysicsSubsystem({ backend: "rapier" });
    physics.setEntities(worldTerrainColliderEntities({ id: "world", name: "World", collision: true }, document));
    await physics.init();
    try {
      assert.equal(physics.usesRapier(), true);
      // Scene queries see colliders once the world has stepped, as in a running game.
      physics.update({ deltaSeconds: 1 / 30, elapsedSeconds: 1 / 30, frame: 1 });
      const lookup = { tile: (x: number, z: number) => document.tiles.get(tileKey(x, z)) };
      const random = seeded(5);
      const extent = 2 * Q * 1.5;
      let checked = 0;
      for (let index = 0; index < 200; index += 1) {
        const x = -7 + random() * extent;
        const z = -5 + random() * extent;
        const expected = terrainHeightAt(document.def, lookup, x, z);
        // Skip the spike's neighbourhood (a 50 km column) and the hole.
        if (expected === null || Math.abs(expected) > 100) continue;
        const fraction = physics.traceCamera([x, 200, z], [x, -200, z]);
        assert.ok(fraction !== null, `ray at ${x},${z} hit the terrain`);
        const y = 200 - fraction! * 400;
        assert.ok(Math.abs(y - expected) < 2e-3, `${x},${z}: rapier ${y} vs ${expected}`);
        checked += 1;
      }
      assert.ok(checked > 100, `checked ${checked}`);
      // The hole has no collider.
      assert.equal(physics.traceCamera([-7 + 1.5 * Q * 1.5, 200, -5 + 1.5 * Q * 1.5], [-7 + 1.5 * Q * 1.5, -200, -5 + 1.5 * Q * 1.5]), null);
    } finally {
      physics.dispose();
    }
  });
}

registerTerrainHeightfieldPhysicsTests(test as unknown as Parameters<typeof registerTerrainHeightfieldPhysicsTests>[0]);
await registerTerrainHeightfieldRapierTests(test as unknown as Parameters<typeof registerTerrainHeightfieldRapierTests>[0]);
