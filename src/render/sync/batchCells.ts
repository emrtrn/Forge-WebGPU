// Static batches split by world cell (plan 5c R9a, step a) and by zone (plan
// 5c R9b Z3): placements that draw alike share a batch only within one cell
// of `size` metres on X / Z and one zone, so a batch's draw can be skipped as
// a whole. Size 0 and no zones keep level-wide batches. A placement needs a
// known world box that fits in one zone; content in no zone always draws.

import type { Box3, Matrix4 } from "three/webgpu";
import type { ActorId } from "../../core/index.ts";
import { transformZoneBox, type ZoneBox } from "../../engine/world/zones.ts";
import type { ZoneDrawing } from "./zoneDrawing.ts";

/** The batch key suffix of a placement at `matrix` (its translation); "" when cells are off. */
export function cellSuffix(matrix: Matrix4, size: number): string {
  if (!(size > 0)) return "";
  const e = matrix.elements;
  return `|cell ${Math.floor(e[12]! / size)},${Math.floor(e[14]! / size)}`;
}

/** World AABB of the full local shape or model bounds, including negative scales. */
export function placementBox(local: Box3, matrix: Matrix4): ZoneBox {
  const { min, max } = local;
  return transformZoneBox({ min: [min.x, min.y, min.z], max: [max.x, max.y, max.z] }, matrix.elements);
}

export function placementZone(zones: ZoneDrawing | undefined, matrix: Matrix4, local: Box3 | undefined): string | null {
  return zones && local ? zones.zoneOf(placementBox(local, matrix)) : null;
}

/** The batch key suffix of a zone; "" in none. */
export const zoneSuffix = (zone: string | null): string => (zone === null ? "" : `|zone ${zone}`);

/** A placement id `<actor>/<component key>` split. */
export function placementParts(id: string): [ActorId, string] {
  const at = id.indexOf("/");
  return [id.slice(0, at) as ActorId, id.slice(at + 1)];
}
