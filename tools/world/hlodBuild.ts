// Forge's world-space bake -> weld -> meshoptimizer simplify, with level-folder inputs.
// Layer 1 (plan 5c R8.2): each 4 × 4 cluster of cells bakes its cells' simplified
// proxies once more, coarser, into one proxy drawn far away instead of up to 16.
// Landmarks (plan 5c R8.4): every landmark placement of the level, persistent ones
// too and whatever its size, bakes into one proxy whose vertices carry their
// placement's origin (`_CENTER`), so the renderer shows each one only past the view
// distance and within the landmark distance.
import { Document, Logger, Verbosity } from "@gltf-transform/core";
import { simplify, weld } from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";
import { compareCellKeys, parseCellKey, stringifyDocument, type Vec3 } from "../../src/core/index.ts";
import {
  HLOD_SCHEMA, HLOD_INDEX_FILE, HLOD_LANDMARK_FILE, hlodCellFileOf, hlodCellSourceHash, hlodClusterFileOf, hlodClusterOf, hlodClusterSourceHash,
  hlodIncludesPlacement, isHlodShapePlacement, maxAxisScale,
  type HlodIndex, type HlodPlacement,
} from "../../src/engine/world/hlod.ts";
import { multiplyMat4, transformPoint, type Mat4 } from "../../src/engine/math/affine.ts";
import { shapeBoundingRadius, shapeDoubleSided, shapeMesh } from "../../src/engine/procgen/shapePrimitives.ts";
import { createHlodAssets, linearColor, multiplyColor } from "./hlodAssets.ts";
import { hlodCellsOf, hlodLandmarksOf, loadHlodLevel, type HlodInput } from "./hlodInput.ts";
import { mirrored } from "./hlodMath.ts";

/** Triangle soup (or welded vertices) of one side; `centers` only for the landmark proxy. */
interface Bucket { positions: number[]; colors: number[]; centers: number[] }
interface Simplified extends Bucket { indices: number[] }
type Sides = [single: Bucket, double: Bucket];

const bucket = (): Bucket => ({ positions: [], colors: [], centers: [] });
const sides = (): Sides => [bucket(), bucket()];
const vertexCount = ([one, two]: Sides): number => (one.positions.length + two.positions.length) / 3;

function proxyDocument(source: Bucket, indices: readonly number[]): Document {
  const doc = new Document().setLogger(new Logger(Verbosity.SILENT));
  const buffer = doc.createBuffer();
  const attribute = (values: number[]) => doc.createAccessor().setType("VEC3").setArray(new Float32Array(values)).setBuffer(buffer);
  const primitive = doc.createPrimitive().setAttribute("POSITION", attribute(source.positions))
    .setAttribute("COLOR_0", attribute(source.colors))
    .setIndices(doc.createAccessor().setType("SCALAR").setArray(Uint32Array.from(indices)).setBuffer(buffer))
    .setMaterial(doc.createMaterial().setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(1).setMetallicFactor(0));
  // A different centre keeps two landmarks from welding together.
  if (source.centers.length) primitive.setAttribute("_CENTER", attribute(source.centers));
  doc.createScene().addChild(doc.createNode().setMesh(doc.createMesh().addPrimitive(primitive)));
  return doc;
}

/** Weld + meshoptimizer simplify of each bucket on its own; empty buckets stay empty. */
async function simplifyBuckets(buckets: readonly Bucket[], ratio: number, error: number): Promise<Simplified[]> {
  return Promise.all(buckets.map(async (source): Promise<Simplified> => {
    if (!source.positions.length) return { ...bucket(), indices: [] };
    const doc = proxyDocument(source, Array.from({ length: source.positions.length / 3 }, (_, index) => index));
    await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio, error }));
    const primitive = doc.getRoot().listMeshes()[0]?.listPrimitives()[0];
    const indices = primitive?.getIndices()?.getArray();
    if (!primitive || !indices?.length) return { ...bucket(), indices: [] };
    const values = (name: string) => Array.from(primitive.getAttribute(name)?.getArray() ?? []);
    return { positions: values("POSITION"), colors: values("COLOR_0"), centers: values("_CENTER"), indices: Array.from(indices) };
  }));
}

/** Back to a triangle soup, so a cluster welds its cells' outputs together. */
function soup(source: Simplified): Bucket {
  const out = bucket();
  const copy = (from: number[], to: number[], corner: number) => { if (from.length) to.push(from[corner * 3]!, from[corner * 3 + 1]!, from[corner * 3 + 2]!); };
  for (const corner of source.indices) {
    copy(source.positions, out.positions, corner); copy(source.colors, out.colors, corner); copy(source.centers, out.centers, corner);
  }
  return out;
}

const concat = (buckets: readonly Bucket[]): Bucket => ({
  positions: buckets.flatMap((one) => one.positions), colors: buckets.flatMap((one) => one.colors), centers: buckets.flatMap((one) => one.centers),
});

/** One proxy from simplified [single-sided, double-sided] buckets: the double-sided ones gain their back faces. */
function proxyOf([one, two]: readonly Simplified[]): { doc: Document; triangles: number } | null {
  const base = one!.positions.length / 3;
  const back = two!.indices.map((_, i) => two!.indices[i - 2 * (i % 3) + 2]!);
  const indices = [...one!.indices, ...two!.indices.map((corner) => corner + base), ...back.map((corner) => corner + base)];
  if (!indices.length) return null;
  return { doc: proxyDocument(concat([one!, two!]), indices), triangles: indices.length / 3 };
}

/** Layer 1 keeps the cell ratio and error, applied again to the cells' outputs. */
export interface HlodBuildOptions { readonly ratio?: number; readonly error?: number }
export interface HlodBuildResult {
  readonly index: HlodIndex;
  /** Level-relative files, index included; empty when there is nothing to bake (no index is written). */
  readonly files: Map<string, Uint8Array>;
  readonly warnings: string[];
  readonly skippedPlacements: number;
}

export function validateHlodOptions(options: HlodBuildOptions): { ratio: number; error: number } {
  const ratio = options.ratio ?? 0.25, error = options.error ?? 0.01;
  for (const [name, value] of Object.entries({ ratio, error })) {
    if (!Number.isFinite(value) || value <= 0 || value > 1) throw new Error(`HLOD ${name} must be in (0, 1]`);
  }
  return { ratio, error };
}

export async function buildLevelHlod(folder: string, input: HlodInput, options: HlodBuildOptions = {}): Promise<HlodBuildResult> {
  const { ratio, error } = validateHlodOptions(options);
  const level = loadHlodLevel(folder, input);
  const warnings: string[] = [], warned = new Set<string>();
  const warn = (key: string, message: string): void => { if (!warned.has(key)) { warned.add(key); warnings.push(message); } };
  const assets = await createHlodAssets(input, warn);
  await MeshoptSimplifier.ready;

  // No normals (plan R8.0): per-face normals kept weld from joining any corner, so the
  // simplifier saw only borders and kept every triangle. The proxy material shades flat.
  // Double-sided parts simplify on their own and gain their back faces afterwards:
  // without normals a welded front and back would collapse each other.
  const emit = (target: Bucket, matrix: Mat4, count: number, index: (corner: number) => number, vertices: number,
    position: (index: number) => Vec3, color: readonly number[], center: Vec3 | null, label: string): void => {
    const isMirrored = mirrored(matrix);
    for (let offset = 0; offset + 2 < count; offset += 3) {
      const corners = [0, 1, 2].map((corner) => index(offset + corner));
      if (isMirrored) [corners[1], corners[2]] = [corners[2]!, corners[1]!];
      if (corners.some((corner) => corner < 0 || corner >= vertices)) {
        warn(`indices:${label}`, `Asset ${label}: skipped invalid triangle indices`); continue;
      }
      const points = corners.map((corner) => transformPoint(matrix, position(corner)));
      if (points.some((point) => !point.every(Number.isFinite))) continue;
      for (const point of points) {
        target.positions.push(...point); target.colors.push(...color);
        if (center) target.centers.push(...center);
      }
    }
  };
  /** Bakes one placement into `target`; false when it adds nothing. `landmark` keeps small ones and adds centres. */
  const emitPlacement = async (placement: HlodPlacement, target: Sides, landmark: boolean): Promise<boolean> => {
    const before = vertexCount(target);
    const center: Vec3 | null = landmark ? [placement.matrix[12]!, placement.matrix[13]!, placement.matrix[14]!] : null;
    if (isHlodShapePlacement(placement)) {
      if (!landmark && !hlodIncludesPlacement(shapeBoundingRadius(placement.shape), maxAxisScale(placement.matrix), level.settings.loadRange)) return false;
      const mesh = shapeMesh(placement.shape), color = linearColor(placement.color);
      const at = (index: number): Vec3 => [mesh.positions[index * 3]!, mesh.positions[index * 3 + 1]!, mesh.positions[index * 3 + 2]!];
      // The plane draws double-sided (shape/render.ts); the shared proxy material is not.
      emit(target[shapeDoubleSided(placement.shape) ? 1 : 0], placement.matrix, mesh.indices.length,
        (corner) => mesh.indices[corner]!, mesh.positions.length / 3, at, color, center, placement.shape);
      return vertexCount(target) > before;
    }
    const asset = await assets.loadAsset(placement.model);
    if (!asset || (!landmark && !hlodIncludesPlacement(asset.radius, maxAxisScale(placement.matrix), level.settings.loadRange))) return false;
    for (const part of asset.parts) {
      const source = part.primitive.getAttribute("POSITION")!;
      const indices = part.primitive.getIndices();
      const count = indices?.getCount() ?? source.getCount();
      const overrideId = placement.materials[part.slot];
      let color = (overrideId ? await assets.slotColor(overrideId) : null) ?? part.color;
      if (placement.color !== null) color = multiplyColor(color, linearColor(placement.color));
      emit(target[0], multiplyMat4(placement.matrix, part.matrix), count, (corner) => indices ? indices.getScalar(corner) : corner,
        source.getCount(), (index) => source.getElement(index, [0, 0, 0] as Vec3), color, center, placement.model);
    }
    return vertexCount(target) > before;
  };

  const files = new Map<string, Uint8Array>();
  const entries: HlodIndex["cells"][number][] = [];
  const clusterInputs = new Map<string, { cells: HlodIndex["cells"][number][]; parts: Simplified[][] }>();
  let skippedPlacements = 0;
  for (const [key, placements] of hlodCellsOf(level, input)) {
    const target = sides();
    for (const placement of placements) if (!(await emitPlacement(placement, target, false))) skippedPlacements += 1;
    if (!vertexCount(target)) continue;
    const source = await simplifyBuckets(target, ratio, error);
    const proxy = proxyOf(source);
    if (!proxy) continue;
    proxy.doc.getRoot().setExtras({ hlodSourceTriangles: (target[0].positions.length + 2 * target[1].positions.length) / 9 });
    files.set(hlodCellFileOf(key), await assets.nodeIO.writeBinary(proxy.doc));
    const entry = { key, triangles: proxy.triangles, sourceHash: hlodCellSourceHash(placements) };
    entries.push(entry);
    const coord = parseCellKey(key)!;
    const cluster = hlodClusterOf(coord.x, coord.z);
    const inputs = clusterInputs.get(cluster) ?? { cells: [], parts: [] };
    inputs.cells.push(entry); inputs.parts.push(source);
    clusterInputs.set(cluster, inputs);
  }
  const clusters: HlodIndex["clusters"][number][] = [];
  for (const [key, inputs] of clusterInputs) {
    const source = await simplifyBuckets([0, 1].map((side) => concat(inputs.parts.map((part) => soup(part[side]!)))), ratio, error);
    const proxy = proxyOf(source);
    if (!proxy) continue;
    proxy.doc.getRoot().setExtras({ hlodSourceTriangles: inputs.cells.reduce((sum, cell) => sum + cell.triangles, 0) });
    files.set(hlodClusterFileOf(key), await assets.nodeIO.writeBinary(proxy.doc));
    clusters.push({ key, triangles: proxy.triangles, sourceHash: hlodClusterSourceHash(inputs.cells) });
  }
  clusters.sort((a, b) => compareCellKeys(a.key, b.key));

  const landmarkPlacements = hlodLandmarksOf(level, input);
  let landmarks: HlodIndex["landmarks"];
  if (landmarkPlacements.length) {
    const target = sides();
    for (const placement of landmarkPlacements) await emitPlacement(placement, target, true);
    const proxy = vertexCount(target) ? proxyOf(await simplifyBuckets(target, ratio, error)) : null;
    if (proxy) {
      files.set(HLOD_LANDMARK_FILE, await assets.nodeIO.writeBinary(proxy.doc));
      landmarks = { triangles: proxy.triangles, sourceHash: hlodCellSourceHash(landmarkPlacements) };
    }
  }
  const index: HlodIndex = { schema: HLOD_SCHEMA, level: level.id, cellSize: level.settings.cellSize, cells: entries, clusters, ...(landmarks ? { landmarks } : {}) };
  // Nothing to bake: no index either, so opening or playing a level never writes one.
  if (entries.length || clusters.length || landmarks) files.set(HLOD_INDEX_FILE, new TextEncoder().encode(stringifyDocument(index)));
  return { index, files, warnings, skippedPlacements };
}

