// Static batches split by world cell (plan 5c R9a, step a) and by zone (plan
// 5c R9b Z3): placements that draw alike share a batch only within one cell
// of `size` metres on X / Z and one zone, so a batch's draw can be skipped as
// a whole. Size 0 and no zones keep level-wide batches. A placement's zone is
// its origin's (the model's bounds load later; content in no zone always
// draws, so a pivot outside every room errs on the visible side).

import type { Matrix4 } from "three/webgpu";
import type { ActorId } from "../../core/index.ts";
import type { ZoneDrawing } from "./zoneDrawing.ts";

/** The batch key suffix of a placement at `matrix` (its translation); "" when cells are off. */
export function cellSuffix(matrix: Matrix4, size: number): string {
  if (!(size > 0)) return "";
  const e = matrix.elements;
  return `|cell ${Math.floor(e[12]! / size)},${Math.floor(e[14]! / size)}`;
}

/** The zone a placement at `matrix` falls in (its origin); null without zones or in none. */
export function placementZone(zones: ZoneDrawing | undefined, matrix: Matrix4): string | null {
  if (!zones) return null;
  const e = matrix.elements;
  return zones.zoneOf([e[12]!, e[13]!, e[14]!]);
}

/** The batch key suffix of a zone; "" in none. */
export const zoneSuffix = (zone: string | null): string => (zone === null ? "" : `|zone ${zone}`);

/** A placement id `<actor>/<component key>` split. */
export function placementParts(id: string): [ActorId, string] {
  const at = id.indexOf("/");
  return [id.slice(0, at) as ActorId, id.slice(at + 1)];
}
