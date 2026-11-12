// Ported from Forge WebGL tests/engine/terrainSplineData.test.ts @ forge-webgl-final (04b5fb23): checks unchanged, run by
// Vitest; 4 check(s) not yet portable left out. docs/PORT_LOG.md §2.
import assert from "node:assert/strict";
import { type ForgeLandscapeSpline } from "./landscape.ts";
import { createTerrainEditWorld } from "./terrainEdit.ts";
import { migrateTerrainSplineCoordinates, terrainSplineInLocalFrame, terrainSplineToWorld } from "./terrainSplineData.ts";
import { WORLD_TERRAIN_CREATE_DEFAULTS, createFlatWorldTerrain } from "./worldTerrainCreate.ts";
import { captureWorldTerrainSave } from "./worldTerrainSave.ts";
import { test } from "vitest";


type Check = (label: string, fn: () => void) => void;
type CheckAsync = (label: string, fn: () => Promise<void>) => Promise<void>;
const path = "landscapes/spline-data.terrain.json";
const actor = { id: "terrain", dataRef: path, position: [31, 7, -13] as [number, number, number] };

function spline(): ForgeLandscapeSpline {
  return { id: "river-road", name: "Road", smooth: true, smoothness: 0.6, hidden: false, locked: false,
    points: [
      { id: "a", position: [-8, -1.25, -4], arriveTangent: [1, 2, 3], width: 5, falloff: 2 },
      { id: "b", position: [8, -0.5, 4], leaveTangent: [4, 5, 6], width: 7, falloff: 3 },
    ],
    segments: [{ id: "ab", startPointId: "a", endPointId: "b",
      deform: { enabled: true, flatten: true, raiseTerrain: false, lowerTerrain: true, targetOffset: -1 },
      paint: { enabled: true, layerId: "dirt", strength: 0.5 },
      mesh: { enabled: true, assetId: "road", collision: true, deform: true, offset: [1, 2, 3], scale: [1, 1, 2] } }],
  };
}

/** A one-tile World Terrain centred on `actor`, its spline saved in world space. */
function single() {
  const created = createFlatWorldTerrain({ ...WORLD_TERRAIN_CREATE_DEFAULTS, tilesX: 1, tilesZ: 1, tileQuads: 64, spacing: 1 });
  created.def.origin = [actor.position[0] - 32, actor.position[1], actor.position[2] - 32];
  created.def.splines = [spline()];
  const saved = captureWorldTerrainSave(createTerrainEditWorld(created.def, created.tiles.values()), ["0_0"], new Map());
  return { data: { splines: [spline()] }, snapshot: { def: saved.def, bytes: saved.tiles[0]!.bytes } };
}

function multi() {
  const created = createFlatWorldTerrain({ ...WORLD_TERRAIN_CREATE_DEFAULTS, tilesX: 2, tilesZ: 2, tileQuads: 64 });
  created.def.origin = [17.25, -5, -80.5];
  created.def.splines = [spline()];
  return createTerrainEditWorld(created.def, created.tiles.values());
}

export function registerTerrainSplineDataTests(check: Check): void {

  check("terrain spline data: explicit mixed-frame migration is idempotent, keeps absent arrays and does not mutate", () => {
    const world = multi();
    const marked = terrainSplineToWorld(world.def, { ...spline(), id: "already-world" });
    world.def.splines!.push(marked);
    const before = structuredClone(world.def);
    const migrated = migrateTerrainSplineCoordinates(world.def);
    assert.deepEqual(world.def, before);
    assert.deepEqual(migrated.splines![1], marked);
    assert.deepEqual(migrateTerrainSplineCoordinates(migrated), migrated);
    assert.deepEqual(terrainSplineInLocalFrame(world.def, migrated.splines![0]!), spline());
    migrated.splines![1]!.points[0]!.position[0] = 999;
    assert.deepEqual(world.def, before, "the migration owns all nested objects");
    delete world.def.splines;
    assert.equal(Object.hasOwn(migrateTerrainSplineCoordinates(world.def), "splines"), false);
  });

}

export async function registerTerrainSplineDataAsyncTests(checkAsync: CheckAsync): Promise<void> {
}

registerTerrainSplineDataTests(test as unknown as Parameters<typeof registerTerrainSplineDataTests>[0]);
registerTerrainSplineDataAsyncTests(test as unknown as Parameters<typeof registerTerrainSplineDataAsyncTests>[0]);
