// Ported from Forge WebGL engine/terrain/worldTerrainMove.ts @ forge-webgl-final (04b5fb23); docs/PORT_LOG.md §2.
// Adapted (plan 5d step 4, user decision 2026-11-19): the origin and the
// world-frame splines move now; Forge's lakes, River Waters, oceans and
// puddles carried `terrainRef` and moved too. Water is phase 7 (its shifts
// come with its types); a puddle here is an actor of its own and stays put.
import type { Vec3 } from "../legacy/layout.ts";
import type { TerrainSpline, WorldTerrainDef } from "./terrainTypes.ts";
import { worldTerrainActorPosition } from "./worldTerrainActor.ts";

/**
 * Moving a World Terrain (OPEN_WORLD_PLAN Faz 8, bridge removal K1). Heights
 * are stored relative to the definition's datum, so a move only shifts
 * `origin`; tiles are untouched. Everything authored in world space on the
 * terrain moves with it: its world-frame splines (roads, river paths).
 * Rotation and scale stay unsupported.
 */

/** Float noise from adding centimetre deltas never reaches a saved file. */
function moved(value: number, delta: number): number {
  const next = Number((value + delta).toFixed(6));
  if (!Number.isFinite(next)) throw new Error("World Terrain move overflow");
  return next;
}

/** How far the actor sits from the centre its definition implies (zero when in sync). */
export function worldTerrainMoveDelta(def: Pick<WorldTerrainDef, "origin" | "tileQuads" | "spacing" | "tilesX" | "tilesZ">, position: Vec3): Vec3 {
  const centre = worldTerrainActorPosition(def);
  return [position[0] - centre[0], position[1] - centre[1], position[2] - centre[2]];
}

export function isZeroMove(delta: Vec3): boolean {
  return delta.every((value) => Math.abs(value) <= 1e-9);
}

export interface WorldTerrainMove {
  origin: Vec3;
  /** The definition's splines with world-frame points shifted; centre-local ones already follow the terrain. */
  splines: TerrainSpline[] | undefined;
}

/** The moved state, never mutating its input. */
export function moveWorldTerrain(def: Pick<WorldTerrainDef, "origin" | "splines">, delta: Vec3): WorldTerrainMove {
  const shift = (point: Vec3): Vec3 => [moved(point[0], delta[0]), moved(point[1], delta[1]), moved(point[2], delta[2])];
  const splines = def.splines?.map((spline) => {
    if (spline.coordinateSpace !== "world") return structuredClone(spline);
    const copy = structuredClone(spline);
    for (const point of copy.points) point.position = shift(point.position);
    return copy;
  });
  return { origin: shift(def.origin), splines };
}
