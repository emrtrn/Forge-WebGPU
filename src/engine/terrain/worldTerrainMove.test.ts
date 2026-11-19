// Ported from Forge WebGL tests/engine/worldTerrainMove.test.ts @ forge-webgl-final (04b5fb23): checks unchanged, run by
// Vitest; 3 check(s) left out: they move lakes and River Waters, phase 7 (plan 5d step 4, user decision 2026-11-19).
// The spline and round-trip parts of those checks without water are below them, marked as this repo's.
import assert from "node:assert/strict";
import type { TerrainSpline } from "./terrainTypes.ts";
import { worldTerrainActorPosition } from "./worldTerrainActor.ts";
import { isZeroMove, moveWorldTerrain, worldTerrainMoveDelta } from "./worldTerrainMove.ts";
import { test } from "vitest";

type Check = (label: string, fn: () => void) => void;

const DEF = { origin: [-128, 2, -64] as [number, number, number], tileQuads: 64, spacing: 2, tilesX: 2, tilesZ: 1 };

function spline(id: string, world: boolean, position: [number, number, number]): TerrainSpline {
  return {
    id, closed: false, ...(world ? { coordinateSpace: "world" as const } : {}),
    points: [{ id: `${id}-p`, position, tangent: [1, 0, 0] }],
  } as unknown as TerrainSpline;
}

/** OPEN_WORLD_PLAN Faz 8 bridge removal K1: moving a World Terrain. */
export function registerWorldTerrainMoveTests(check: Check): void {
  check("world terrain move: the delta is the actor's offset from the definition centre", () => {
    // 2x1 tiles of 64 quads at 2 m: 256 m x 128 m, centred at (0, 2, 0).
    assert.deepEqual(worldTerrainActorPosition(DEF), [0, 2, 0]);
    assert.deepEqual(worldTerrainMoveDelta(DEF, [0, 2, 0]), [0, 0, 0]);
    assert.ok(isZeroMove(worldTerrainMoveDelta(DEF, [0, 2, 0])));
    assert.deepEqual(worldTerrainMoveDelta(DEF, [10.5, 1, -3]), [10.5, -1, -3]);
    assert.equal(isZeroMove([0, 1e-6, 0]), false);
  });

  // This repo's (plan 5d step 4): Forge's second and fourth checks without their lakes.
  check("world terrain move: origin and world-frame splines shift, centre-local splines and the input do not", () => {
    const splines = [spline("road", true, [1, 2, 3]), spline("legacy", false, [5, 6, 7])];
    const before = structuredClone(splines);
    const result = moveWorldTerrain({ origin: DEF.origin, splines }, [10, -1, 0.1]);
    assert.deepEqual(result.origin, [-118, 1, -63.9]);
    assert.deepEqual(result.splines![0]!.points[0]!.position, [11, 1, 3.1], "world spline points move");
    assert.deepEqual((result.splines![0]!.points[0] as unknown as { tangent: unknown }).tangent, [1, 0, 0], "tangents are directions");
    assert.deepEqual(result.splines![1]!.points[0]!.position, [5, 6, 7], "centre-local splines already follow the terrain");
    assert.deepEqual(splines, before, "inputs are never mutated");
    assert.equal(moveWorldTerrain({ origin: DEF.origin }, [1, 0, 0]).splines, undefined);
  });

  check("world terrain move: moving origin and splines back restores the exact values", () => {
    const there = moveWorldTerrain({ origin: [0.1, 0.2, 0.3], splines: [spline("road", true, [0.1, 0.2, 0.3])] }, [0.2, 0.1, 0.7]);
    assert.deepEqual(there.origin, [0.3, 0.3, 1], "0.1 + 0.2 is stored as 0.3");
    const back = moveWorldTerrain({ origin: there.origin, splines: there.splines }, [-0.2, -0.1, -0.7]);
    assert.deepEqual(back.origin, [0.1, 0.2, 0.3]);
    assert.deepEqual(back.splines![0]!.points[0]!.position, [0.1, 0.2, 0.3]);
    assert.throws(() => moveWorldTerrain({ origin: [Number.MAX_VALUE, 0, 0] }, [Number.MAX_VALUE, 0, 0]), /overflow/);
  });
}

registerWorldTerrainMoveTests((label, fn) => test(label, fn));
