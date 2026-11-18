// Adapted from Forge WebGL engine/world/hlod.ts @ forge-webgl-final (04b5fb23).
// Phase 5b: level-owned parts and schema components replace RoomLayout inputs;
// FNV-1a, rounding, inclusion and linear colour averaging remain Forge's.
import { isId, type ActorId, type AssetId } from "../../core/id.ts";
import { effectiveComponents, type ClassResolver } from "../../core/level/actorClass.ts";
import type { ActorDoc, ComponentMap, ComponentRecord } from "../../core/level/model.ts";
import { parseComponentTypeTag } from "../../core/schema/component.ts";
import { worldMatrixOf } from "../edit/hierarchy.ts";
import { composeMat4, decomposeMat4, multiplyMat4, type Mat4 } from "../math/affine.ts";
import { SHAPE_PLANE_SIZE, SHAPE_SOLID_SIZE, type ShapePrimitiveName } from "../procgen/shapePrimitives.ts";
import { detailCullDistance } from "./detailCulling.ts";
import { buildZoneSet, transformZoneBox, zoneOfBox, type ZoneBox, type ZoneInput, type ZoneSet } from "./zones.ts";

import { createServiceKey } from "../../core/world/services.ts";
import type { HlodIndex as HlodIndexDoc } from "../../core/level/hlod.ts";

/**
 * A level's HLOD proxies as the world sees them (phase 5b decision 5): the
 * index, whether a cell's real actors are in the world, and a proxy's GLB
 * bytes by its level-relative file (`hlodCellFileOf` / `hlodClusterFileOf`). The run time (or the editor) provides it; the renderer draws the
 * proxies of cells within the view distance whose actors are not active.
 */
export interface HlodSource {
  readonly index: HlodIndexDoc;
  /** The editor bumps this after rebuilding / replacing the level's proxy files. */
  readonly revision?: number;
  isCellActive(key: string): boolean;
  load(file: string): Promise<ArrayBuffer | null>;
}

export const HlodSourceKey = createServiceKey<HlodSource>("forge.hlodSource");

export {
  HLOD_SCHEMA, HLOD_INDEX_FILE, HLOD_DIR, HLOD_CLUSTER_CELLS, HLOD_LANDMARK_FILE, hlodCellFileOf, hlodClusterFileOf, hlodClusterOf, normalizeHlodIndex,
  type HlodCellEntry, type HlodIndex,
} from '../../core/level/hlod.ts';

export interface HlodModelPlacement {
  model: AssetId;
  materials: readonly (AssetId | null)[];
  color: string | null;
  /** Component world matrix, column-major. */
  matrix: Mat4;
  /** Plan 5c R8.4: also baked into the level's landmark proxy. Absent when off. */
  landmark?: true;
}

/** A `forge.shape` (plan 5c R1): its procedural primitive and colour, baked like a mesh. */
export interface HlodShapePlacement {
  shape: ShapePrimitiveName;
  color: string;
  matrix: Mat4;
  landmark?: true;
}

export type HlodPlacement = HlodModelPlacement | HlodShapePlacement;

export const isHlodShapePlacement = (placement: HlodPlacement): placement is HlodShapePlacement => "shape" in placement;

const SHAPE_NAMES: ReadonlySet<string> = new Set<ShapePrimitiveName>(["cube", "sphere", "cylinder", "cone", "plane"]);

/** The component's local chain, applied from the actor root down; cycle-safe like render/sync/transforms. */
function placementMatrix(actorMatrix: Mat4, components: ComponentMap, key: string): Mat4 {
  const chain: ComponentRecord[] = [];
  const seen = new Set<string>();
  let current: string | null | undefined = key;
  while (current !== null && current !== undefined && !seen.has(current)) {
    seen.add(current);
    const component: ComponentRecord | undefined = Object.hasOwn(components, current) ? components[current] : undefined;
    if (!component) break;
    chain.push(component);
    current = component.parent;
  }
  let matrix = actorMatrix;
  for (let index = chain.length - 1; index >= 0; index -= 1) {
    const local = chain[index]!.local;
    if (local) matrix = multiplyMat4(matrix, composeMat4(local.p, local.r, local.s));
  }
  return matrix;
}

/** One placement per effective static mesh or shape component. */
export function hlodPlacementsOf(
  actors: readonly ActorDoc[],
  lookup: (id: ActorId) => ActorDoc | undefined,
  resolveClass: ClassResolver,
): HlodPlacement[] {
  const placements: HlodPlacement[] = [];
  for (const actor of actors) {
    const components = effectiveComponents(actor, actor.class ? resolveClass(actor.class) : undefined);
    const actorMatrix = worldMatrixOf(lookup, actor);
    for (const [key, component] of Object.entries(components)) {
      const name = parseComponentTypeTag(component.type)?.name;
      // ActorDoc inputs are already schema-normalised. Keep feature imports out of engine.
      if (name === "forge.shape") {
        const primitive = component.primitive ?? "cube", color = component.color ?? "#c8c8c8";
        if (typeof primitive !== "string" || !SHAPE_NAMES.has(primitive) || typeof color !== "string") continue;
        placements.push({ shape: primitive as ShapePrimitiveName, color, matrix: placementMatrix(actorMatrix, components, key),
          ...(component.landmark === true ? { landmark: true as const } : {}) });
        continue;
      }
      if (name !== "forge.staticMesh" || !isId(component.mesh, "asset")) continue;
      placements.push({
        model: component.mesh,
        materials: (component.materials ?? []) as readonly (AssetId | null)[],
        color: (component.color ?? null) as string | null,
        matrix: placementMatrix(actorMatrix, components, key),
        ...(component.landmark === true ? { landmark: true as const } : {}),
      });
    }
  }
  return placements;
}

export interface HlodZoneContext {
  readonly set: ZoneSet;
  readonly source: string;
}

/** Effective zone bounds and a stable source signature shared by the bake and editor checks. */
export function hlodZonesOf(actors: readonly ActorDoc[], resolveClass: ClassResolver): HlodZoneContext | null {
  const lookup = new Map(actors.map(actor => [actor.id, actor]));
  const zones: ZoneInput[] = [], sources: string[] = [];
  for (const actor of actors) {
    const components = effectiveComponents(actor, actor.class ? resolveClass(actor.class) : undefined);
    let zoneFound = false;
    for (const [key, component] of Object.entries(components)) {
      const name = parseComponentTypeTag(component.type)?.name;
      if (name !== "forge.zone" && name !== "forge.portal") continue;
      if (!Array.isArray(component.size)) continue;
      const matrix = placementMatrix(worldMatrixOf(id => lookup.get(id), actor), components, key);
      if (name === "forge.portal") {
        sources.push(JSON.stringify([actor.id, key, name, matrix, component.size, component.zoneA, component.zoneB]));
        continue;
      }
      if (zoneFound) continue;
      zoneFound = true;
      const { p, r, s } = decomposeMat4(matrix);
      const [x, y, z] = component.size as [number, number, number];
      zones.push({ id: actor.id, center: p, rotation: r, halfExtents: [Math.abs(x * s[0]) / 2, Math.abs(y * s[1]) / 2, Math.abs(z * s[2]) / 2] });
      sources.push(JSON.stringify([actor.id, key, name, matrix, component.size, component.alwaysCastShadows]));
    }
  }
  return sources.length ? { set: buildZoneSet(zones, []), source: fnv1a(JSON.stringify(sources.sort())) } : null;
}

export function hlodPlacementInZone(placement: HlodPlacement, zones: HlodZoneContext | null, modelBounds?: ZoneBox): boolean {
  if (!zones?.set.zones.length) return false;
  let local = modelBounds;
  if (isHlodShapePlacement(placement)) {
    const plane = placement.shape === "plane";
    const width = (plane ? SHAPE_PLANE_SIZE : SHAPE_SOLID_SIZE) / 2;
    const height = plane ? 0 : width;
    local = { min: [-width, -height, -width], max: [width, height, width] };
  }
  return local !== undefined && zoneOfBox(zones.set, transformZoneBox(local, placement.matrix)) !== null;
}

/** A cluster's hash covers its cells' index entries (key and sourceHash), in any order. */
export function hlodClusterSourceHash(cells: readonly { readonly key: string; readonly sourceHash: string }[]): string {
  return fnv1a(JSON.stringify(cells.map((cell) => `${cell.key}:${cell.sourceHash}`).sort()));
}

function fnv1a(source: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash = Math.imul(hash ^ source.charCodeAt(index), 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** Order-independent FNV-1a; asset bytes and editor visibility are not document inputs. */
export function hlodCellSourceHash(placements: readonly HlodPlacement[], zoneSource?: string): string {
  const rounded = (values: readonly number[]) => values.map((value) => Math.round(value * 1e4) / 1e4);
  // Model entries keep their pre-R1 form, so levels without shapes keep their hashes; a landmark
  // (plan 5c R8.4) adds a marker only when on, so unmarked levels keep theirs too.
  const canonical = placements.map((placement) => JSON.stringify([...(isHlodShapePlacement(placement)
    ? [`shape:${placement.shape}`, placement.color, rounded(placement.matrix)]
    : [placement.model, placement.materials, placement.color, rounded(placement.matrix)]), ...(placement.landmark ? ["landmark"] : [])])).sort();
  return fnv1a(JSON.stringify(zoneSource === undefined ? canonical : [zoneSource, ...canonical]));
}

/** Largest absolute axis scale, including mirrored and non-uniform transforms. */
export function maxAxisScale(matrix: Mat4): number {
  return Math.max(
    Math.hypot(matrix[0]!, matrix[1]!, matrix[2]!),
    Math.hypot(matrix[4]!, matrix[5]!, matrix[6]!),
    Math.hypot(matrix[8]!, matrix[9]!, matrix[10]!),
  );
}

/** Small details that disappear before their cell unloads need no proxy. */
export function hlodIncludesPlacement(boundingRadius: number, maxScale: number, loadRange: number): boolean {
  const distance = detailCullDistance(boundingRadius * Math.abs(maxScale));
  return distance === null || distance > loadRange;
}

/** Averages decoded sRGB pixels in linear space, ignoring near-transparent pixels. */
export function averageLinearColor(pixels: Uint8Array, channels: 3 | 4): [number, number, number] {
  const sum: [number, number, number] = [0, 0, 0];
  let count = 0;
  for (let index = 0; index + channels <= pixels.length; index += channels) {
    if (channels === 4 && pixels[index + 3]! < 8) continue;
    for (let channel = 0; channel < 3; channel += 1) {
      const srgb = pixels[index + channel]! / 255;
      sum[channel]! += srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
    }
    count += 1;
  }
  return count ? [sum[0] / count, sum[1] / count, sum[2] / count] : [1, 1, 1];
}
