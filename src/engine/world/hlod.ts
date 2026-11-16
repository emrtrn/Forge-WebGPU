// Adapted from Forge WebGL engine/world/hlod.ts @ forge-webgl-final (04b5fb23).
// Phase 5b: level-owned parts and schema components replace RoomLayout inputs;
// FNV-1a, rounding, inclusion and linear colour averaging remain Forge's.
import { isId, type ActorId, type AssetId, type LevelId } from "../../core/id.ts";
import { isJsonObject } from "../../core/json.ts";
import { effectiveComponents, type ClassResolver } from "../../core/level/actorClass.ts";
import { compareCellKeys, isCellKey } from "../../core/level/cells.ts";
import type { ActorDoc, ComponentMap, ComponentRecord } from "../../core/level/model.ts";
import { reportUnknownKeys } from "../../core/level/normalizeLevel.ts";
import { parseComponentTypeTag } from "../../core/schema/component.ts";
import {
  createContext, finish, reportFatal, reportLoss, type NormalizeOptions, type NormalizeResult,
} from "../../core/schema/issues.ts";
import { worldMatrixOf } from "../edit/hierarchy.ts";
import { composeMat4, multiplyMat4, type Mat4 } from "../math/affine.ts";
import { detailCullDistance } from "./detailCulling.ts";

export const HLOD_SCHEMA = "forge.levelHlod/1";
export const HLOD_INDEX_FILE = "hlod.json";
export const HLOD_DIR = "hlod";

/** Proxy path relative to the level folder, like cellFileOf. */
export function hlodCellFileOf(key: string): string {
  return `${HLOD_DIR}/${key}.glb`;
}

export interface HlodCellEntry {
  readonly key: string;
  readonly triangles: number;
  readonly sourceHash: string;
}

export interface HlodIndex {
  readonly schema: typeof HLOD_SCHEMA;
  readonly level: LevelId;
  readonly cellSize: number;
  /** Sorted by compareCellKeys (z, then x). */
  readonly cells: readonly HlodCellEntry[];
}

/** Null for an unreadable document; invalid entries are dropped with loss issues. */
export function normalizeHlodIndex(
  value: unknown,
  options: NormalizeOptions = { strict: true },
): NormalizeResult<HlodIndex | null> {
  const ctx = createContext(options);
  if (!isJsonObject(value)) {
    reportFatal(ctx, "invalid-document", "", "An HLOD index must be a JSON object.");
    return finish(ctx, null);
  }
  if (value.schema !== HLOD_SCHEMA) {
    reportFatal(ctx, "invalid-document", "schema", `Expected "${HLOD_SCHEMA}".`);
    return finish(ctx, null);
  }
  if (!isId(value.level, "level")) {
    reportFatal(ctx, "invalid-document", "level", "An HLOD index needs the id of its level.");
    return finish(ctx, null);
  }
  if (typeof value.cellSize !== "number" || !Number.isFinite(value.cellSize) || value.cellSize <= 0) {
    reportFatal(ctx, "invalid-document", "cellSize", "Expected a finite positive cell size.");
    return finish(ctx, null);
  }
  if (!Array.isArray(value.cells)) {
    reportFatal(ctx, "invalid-document", "cells", "Expected an array of HLOD cells.");
    return finish(ctx, null);
  }
  const cells: HlodCellEntry[] = [];
  const seen = new Set<string>();
  for (const [index, cell] of value.cells.entries()) {
    const path = `cells[${index}]`;
    if (!isJsonObject(cell)) {
      reportLoss(ctx, "invalid-value", path, "Expected an HLOD cell object; entry dropped.");
    } else if (!isCellKey(cell.key)) {
      reportLoss(ctx, "invalid-value", `${path}.key`, 'Expected a "<x>_<z>" cell key; entry dropped.');
    } else if (seen.has(cell.key)) {
      reportLoss(ctx, "duplicate-id", `${path}.key`, "Duplicate HLOD cell key; entry dropped.");
    } else if (typeof cell.triangles !== "number" || !Number.isSafeInteger(cell.triangles) || cell.triangles < 0) {
      reportLoss(ctx, "invalid-value", `${path}.triangles`, "Expected a non-negative safe integer; entry dropped.");
    } else if (typeof cell.sourceHash !== "string" || cell.sourceHash.length !== 8 || !/^[0-9a-f]{8}$/.test(cell.sourceHash)) {
      reportLoss(ctx, "invalid-value", `${path}.sourceHash`, "Expected 8 lowercase hex digits; entry dropped.");
    } else {
      seen.add(cell.key);
      cells.push({ key: cell.key, triangles: cell.triangles, sourceHash: cell.sourceHash });
      reportUnknownKeys(cell, ["key", "triangles", "sourceHash"], path, ctx, "Unknown HLOD cell field; dropped.");
    }
  }
  cells.sort((a, b) => compareCellKeys(a.key, b.key));
  reportUnknownKeys(value, ["schema", "level", "cellSize", "cells"], "", ctx, "Unknown HLOD index field; dropped.");
  return finish(ctx, { schema: HLOD_SCHEMA, level: value.level, cellSize: value.cellSize, cells });
}

export interface HlodPlacement {
  model: AssetId;
  materials: readonly (AssetId | null)[];
  color: string | null;
  /** Component world matrix, column-major. */
  matrix: Mat4;
}

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

/** One placement per effective static mesh component. Shapes are deliberately not baked. */
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
      if (parseComponentTypeTag(component.type)?.name !== "forge.staticMesh" || !isId(component.mesh, "asset")) continue;
      // ActorDoc inputs are already schema-normalised. Keep feature imports out of engine.
      placements.push({
        model: component.mesh,
        materials: (component.materials ?? []) as readonly (AssetId | null)[],
        color: (component.color ?? null) as string | null,
        matrix: placementMatrix(actorMatrix, components, key),
      });
    }
  }
  return placements;
}

/** Order-independent FNV-1a; asset bytes and editor visibility are not document inputs. */
export function hlodCellSourceHash(placements: readonly HlodPlacement[]): string {
  const rounded = (values: readonly number[]) => values.map((value) => Math.round(value * 1e4) / 1e4);
  const canonical = placements.map((placement) => JSON.stringify([
    placement.model, placement.materials, placement.color, rounded(placement.matrix),
  ])).sort();
  const source = JSON.stringify(canonical);
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash = Math.imul(hash ^ source.charCodeAt(index), 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
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
