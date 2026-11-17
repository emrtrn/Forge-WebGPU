// The painted foliage of one cell, `foliage/<x>_<z>.bin` (phase 5c decision 4),
// little-endian, every field 4-byte aligned:
//   "FFOL", u32 version (1), u32 typeCount, u32 instanceTotal,
//   typeCount × u32 counts (the index's `types` order),
//   then per type, structure of arrays for its n instances: positions f32[3n]
//   (world metres), rotations f32[4n] (unit quaternion x, y, z, w), scales f32[n]
//   (uniform, > 0), seeds u32[n].
// 36 bytes an instance; GPU-ready arrays without a parse step.
import type { AssetId, LevelId } from "../id.ts";
import type { Vec3, Vec4 } from "../schema/fields.ts";
import { cellAt, cellKey, compareCellKeys } from "./cells.ts";
import { LEVEL_FOLIAGE_SCHEMA, type LevelFoliageIndex } from "./foliage.ts";

const MAGIC = 0x4c4f4646; // "FFOL" read as a little-endian u32
const VERSION = 1;
const HEADER = 16;
const INSTANCE_BYTES = 36;
const QUATERNION_TOLERANCE = 1e-3;

export interface FoliageInstances {
  readonly positions: Float32Array;
  readonly rotations: Float32Array;
  readonly scales: Float32Array;
  readonly seeds: Uint32Array;
}

function countOf(instances: FoliageInstances): number {
  const n = instances.scales.length;
  if (instances.positions.length !== n * 3 || instances.rotations.length !== n * 4 || instances.seeds.length !== n) {
    throw new Error("foliage cell: positions / rotations / scales / seeds disagree on the instance count");
  }
  return n;
}

export function encodeFoliageCell(perType: readonly FoliageInstances[]): Uint8Array {
  const counts = perType.map(countOf);
  const total = counts.reduce((sum, count) => sum + count, 0);
  const bytes = new Uint8Array(HEADER + 4 * counts.length + INSTANCE_BYTES * total);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, MAGIC, true);
  view.setUint32(4, VERSION, true);
  view.setUint32(8, counts.length, true);
  view.setUint32(12, total, true);
  let at = HEADER;
  for (const count of counts) { view.setUint32(at, count, true); at += 4; }
  for (const instances of perType) {
    for (const value of instances.positions) { view.setFloat32(at, value, true); at += 4; }
    for (const value of instances.rotations) { view.setFloat32(at, value, true); at += 4; }
    for (const value of instances.scales) { view.setFloat32(at, value, true); at += 4; }
    for (const value of instances.seeds) { view.setUint32(at, value, true); at += 4; }
  }
  return bytes;
}

/** Throws on a malformed file, or when `expectedCounts` (the index) disagrees with it. */
export function decodeFoliageCell(source: Uint8Array | ArrayBuffer, expectedCounts?: readonly number[]): FoliageInstances[] {
  const bytes = source instanceof Uint8Array ? source : new Uint8Array(source);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < HEADER || view.getUint32(0, true) !== MAGIC) throw new Error("foliage cell: not a foliage cell file (magic)");
  const version = view.getUint32(4, true);
  if (version !== VERSION) throw new Error(`foliage cell: unsupported version ${version}`);
  const typeCount = view.getUint32(8, true);
  const total = view.getUint32(12, true);
  if (bytes.byteLength < HEADER + 4 * typeCount) throw new Error("foliage cell: truncated header");
  const counts = Array.from({ length: typeCount }, (_, index) => view.getUint32(HEADER + 4 * index, true));
  if (counts.reduce((sum, count) => sum + count, 0) !== total) throw new Error("foliage cell: type counts do not add up to the total");
  const expectedLength = HEADER + 4 * typeCount + INSTANCE_BYTES * total;
  if (bytes.byteLength !== expectedLength) throw new Error(`foliage cell: ${bytes.byteLength} bytes, expected ${expectedLength}`);
  if (expectedCounts && (expectedCounts.length !== typeCount || expectedCounts.some((count, index) => count !== counts[index]))) {
    throw new Error(`foliage cell: counts ${counts.join(",")} differ from the index's ${expectedCounts.join(",")}`);
  }
  let at = HEADER + 4 * typeCount;
  const floats = (length: number): Float32Array => {
    const out = new Float32Array(length);
    for (let index = 0; index < length; index += 1, at += 4) {
      const value = view.getFloat32(at, true);
      if (!Number.isFinite(value)) throw new Error("foliage cell: non-finite value");
      out[index] = value;
    }
    return out;
  };
  return counts.map((n) => {
    const positions = floats(n * 3);
    const rotations = floats(n * 4);
    const scales = floats(n);
    const seeds = new Uint32Array(n);
    for (let index = 0; index < n; index += 1, at += 4) seeds[index] = view.getUint32(at, true);
    for (let index = 0; index < n; index += 1) {
      if (!(scales[index]! > 0)) throw new Error("foliage cell: scale must be positive");
      const length = Math.hypot(rotations[index * 4]!, rotations[index * 4 + 1]!, rotations[index * 4 + 2]!, rotations[index * 4 + 3]!);
      if (Math.abs(length - 1) > QUATERNION_TOLERANCE) throw new Error("foliage cell: rotation is not a unit quaternion");
    }
    return { positions, rotations, scales, seeds };
  });
}

export interface FoliageInstanceInput {
  readonly position: Readonly<Vec3>;
  readonly rotation: Readonly<Vec4>;
  readonly scale: number;
  readonly seed: number;
}

export interface LevelFoliageInput {
  readonly level: LevelId;
  readonly cellSize: number;
  readonly groups: readonly { readonly type: AssetId; readonly instances: readonly FoliageInstanceInput[] }[];
}

/**
 * The level part for painted instances: each instance goes to the cell under
 * its X / Z, groups of one type merge, types sort ascending, and the bytes are
 * the same for the same input.
 */
export function buildLevelFoliage(input: LevelFoliageInput): { index: LevelFoliageIndex; cells: Map<string, Uint8Array> } {
  const types = [...new Set(input.groups.filter((group) => group.instances.length > 0).map((group) => group.type))].sort();
  const byCell = new Map<string, FoliageInstanceInput[][]>();
  for (const group of input.groups) {
    const slot = types.indexOf(group.type);
    for (const instance of group.instances) {
      const key = cellKey(cellAt(input.cellSize, instance.position[0], instance.position[2]));
      let perType = byCell.get(key);
      if (!perType) { perType = types.map(() => []); byCell.set(key, perType); }
      perType[slot]!.push(instance);
    }
  }
  const keys = [...byCell.keys()].sort(compareCellKeys);
  const cells = new Map<string, Uint8Array>();
  for (const key of keys) {
    cells.set(key, encodeFoliageCell(byCell.get(key)!.map((list) => ({
      positions: Float32Array.from(list.flatMap((instance) => [...instance.position])),
      rotations: Float32Array.from(list.flatMap((instance) => [...instance.rotation])),
      scales: Float32Array.from(list.map((instance) => instance.scale)),
      seeds: Uint32Array.from(list.map((instance) => instance.seed >>> 0)),
    }))));
  }
  return {
    index: {
      schema: LEVEL_FOLIAGE_SCHEMA,
      level: input.level,
      cellSize: input.cellSize,
      types,
      cells: keys.map((key) => ({ key, counts: byCell.get(key)!.map((list) => list.length) })),
    },
    cells,
  };
}
