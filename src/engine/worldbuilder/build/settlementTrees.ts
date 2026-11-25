// A single tree near each settlement's centre (vegetation plan PG5, user
// decision 2026-11-25): the generated world's `forge.plant` actors besides its
// foliage. It stands in the middle of the settlement's open square when it has
// one, otherwise on the nearest spot round the centre clear of the buildings'
// pads, the roads and the water. Placed only when the brief has a model row
// for the role. Pure and deterministic.

import { padWeight } from "../../terrain/terrainPads.ts";
import type { WorldTerrainDef } from "../../terrain/terrainTypes.ts";
import type { BriefTerrain } from "../briefTerrain.ts";
import { stablePick } from "../generatedModels.ts";
import { oceanLandDistance } from "../island.ts";
import type { WorldPoint } from "../normalize.ts";
import type { WorldRecipe } from "../recipe.ts";
import { briefToWorld, type WorldBrief } from "../worldBrief.ts";
import type { ScatterPlacement } from "./temporarySteps.ts";

export const SETTLEMENT_TREE_ROLE = "vegetation.tree";

const SQUARE_ROLE = "open.square";
/** Clear of a building's pad, a road's centre line, the water's edge, metres. */
const CLEAR = { pad: 4, road: 8, water: 6 } as const;
const RING = { first: 8, step: 4, last: 80, spots: 16 } as const;

function segmentDistance([x, z]: WorldPoint, a: readonly number[], b: readonly number[]): number {
  const [ax, az, bx, bz] = [a[0]!, a[2]!, b[0]!, b[2]!];
  const length = (bx - ax) ** 2 + (bz - az) ** 2;
  const t = length === 0 ? 0 : Math.min(1, Math.max(0, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / length));
  return Math.hypot(x - ax - t * (bx - ax), z - az - t * (bz - az));
}

export function settlementTrees(
  brief: WorldBrief, terrain: BriefTerrain, recipe: WorldRecipe, splines: NonNullable<WorldTerrainDef["splines"]>,
): { placements: ScatterPlacement[]; warnings: string[] } {
  const placements: ScatterPlacement[] = [], warnings: string[] = [];
  if (!brief.models.some((model) => model.role === SETTLEMENT_TREE_ROLE)) return { placements, warnings };
  const pads = recipe.generated.pads.map((pad) => ({ polygon: pad.polygon, height: pad.height, falloff: CLEAR.pad }));
  const roads = splines.flatMap((spline) => spline.points.slice(1).map((point, i) => [spline.points[i]!.position, point.position] as const));
  const clear = (at: WorldPoint): boolean => {
    if (pads.some((pad) => padWeight(pad, at[0], at[1]) > 0)) return false;
    if (roads.some(([a, b]) => segmentDistance(at, a, b) < CLEAR.road)) return false;
    const river = terrain.water(at[0], at[1]), lake = terrain.lake(at[0], at[1]);
    if (river && river.distance < river.course.width / 2 + CLEAR.water) return false;
    if (lake && lake.inside > -CLEAR.water) return false;
    return !terrain.ocean || oceanLandDistance(terrain.ocean, ...at) > CLEAR.water;
  };
  for (const settlement of brief.settlements) {
    const centre = recipe.generated.sites.find((site) => site.settlement === settlement.id)?.center ?? briefToWorld(brief, settlement.center);
    const square = recipe.generated.parcels.find((parcel) => parcel.settlement === settlement.id && parcel.role === SQUARE_ROLE && parcel.partOf === undefined);
    const spots: WorldPoint[] = [];
    if (square) spots.push([0, 1].map((axis) => square.polygon.reduce((sum, point) => sum + point[axis]!, 0) / square.polygon.length) as unknown as WorldPoint);
    for (let reach: number = RING.first; reach <= RING.last; reach += RING.step) {
      const turn = stablePick(`${settlement.id}/${reach}`) * Math.PI * 2;
      for (let spot = 0; spot < RING.spots; spot += 1) {
        const angle = turn + (spot * Math.PI * 2) / RING.spots;
        spots.push([centre[0] + Math.cos(angle) * reach, centre[1] + Math.sin(angle) * reach]);
      }
    }
    const at = spots.find(clear);
    if (!at) { warnings.push(`settlement ${settlement.id}: no clear spot for its tree`); continue; }
    const id = `${settlement.id}-tree`;
    placements.push({
      role: SETTLEMENT_TREE_ROLE, variant: null, id, name: "Tree", at, rotationYDeg: Math.round(stablePick(`${id}/yaw`) * 360),
      scale: Number((0.9 + stablePick(`${id}/scale`) * 0.3).toFixed(2)), collision: true, pick: stablePick(id),
    });
  }
  return { placements, warnings };
}
