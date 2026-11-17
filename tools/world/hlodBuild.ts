// Forge's world-space bake -> weld -> meshoptimizer simplify, with level-folder inputs.
import { Document, Logger, Verbosity } from "@gltf-transform/core";
import { simplify, weld } from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";
import { stringifyDocument, type Vec3 } from "../../src/core/index.ts";
import {
  HLOD_SCHEMA, HLOD_INDEX_FILE, hlodCellFileOf, hlodCellSourceHash, hlodIncludesPlacement, isHlodShapePlacement, maxAxisScale,
  type HlodIndex,
} from "../../src/engine/world/hlod.ts";
import { multiplyMat4, transformPoint, type Mat4 } from "../../src/engine/math/affine.ts";
import { shapeBoundingRadius, shapeDoubleSided, shapeMesh } from "../../src/engine/procgen/shapePrimitives.ts";
import { createHlodAssets, linearColor, multiplyColor } from "./hlodAssets.ts";
import { hlodCellsOf, loadHlodLevel, type HlodInput } from "./hlodInput.ts";
import { mirrored } from "./hlodMath.ts";

interface Bucket { positions: number[]; colors: number[] }
interface Simplified extends Bucket { indices: number[] }

function proxyDocument(bucket: Bucket, indices: readonly number[]): Document {
  const doc = new Document().setLogger(new Logger(Verbosity.SILENT));
  const buffer = doc.createBuffer();
  const attribute = (values: number[]) => doc.createAccessor().setType("VEC3").setArray(new Float32Array(values)).setBuffer(buffer);
  const primitive = doc.createPrimitive().setAttribute("POSITION", attribute(bucket.positions))
    .setAttribute("COLOR_0", attribute(bucket.colors))
    .setIndices(doc.createAccessor().setType("SCALAR").setArray(Uint32Array.from(indices)).setBuffer(buffer))
    .setMaterial(doc.createMaterial().setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(1).setMetallicFactor(0));
  doc.createScene().addChild(doc.createNode().setMesh(doc.createMesh().addPrimitive(primitive)));
  return doc;
}

/** Weld + meshoptimizer simplify of each bucket on its own; empty buckets stay empty. */
async function simplifyBuckets(buckets: readonly Bucket[], ratio: number, error: number): Promise<Simplified[]> {
  return Promise.all(buckets.map(async (bucket): Promise<Simplified> => {
    if (!bucket.positions.length) return { positions: [], colors: [], indices: [] };
    const doc = proxyDocument(bucket, Array.from({ length: bucket.positions.length / 3 }, (_, index) => index));
    await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio, error }));
    const primitive = doc.getRoot().listMeshes()[0]?.listPrimitives()[0];
    const indices = primitive?.getIndices()?.getArray();
    if (!primitive || !indices?.length) return { positions: [], colors: [], indices: [] };
    return { positions: Array.from(primitive.getAttribute("POSITION")!.getArray()!),
      colors: Array.from(primitive.getAttribute("COLOR_0")!.getArray()!), indices: Array.from(indices) };
  }));
}

export interface HlodBuildOptions { readonly ratio?: number; readonly error?: number }
export interface HlodBuildResult {
  readonly index: HlodIndex;
  /** Level-relative files, index included. */
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
  const files = new Map<string, Uint8Array>();
  const entries: HlodIndex["cells"][number][] = [];
  let skippedPlacements = 0;
  for (const [key, placements] of hlodCellsOf(level, input)) {
    // No normals (plan R8.0): per-face normals kept weld from joining any corner, so the
    // simplifier saw only borders and kept every triangle. The proxy material shades flat.
    // Double-sided parts simplify on their own and gain their back faces afterwards:
    // without normals a welded front and back would collapse each other.
    const one: Bucket = { positions: [], colors: [] }, two: Bucket = { positions: [], colors: [] };
    const emit = (bucket: Bucket, matrix: Mat4, count: number, index: (corner: number) => number, vertexCount: number,
      position: (index: number) => Vec3, color: readonly number[], label: string): void => {
      const isMirrored = mirrored(matrix);
      for (let offset = 0; offset + 2 < count; offset += 3) {
        const corners = [0, 1, 2].map((corner) => index(offset + corner));
        if (isMirrored) [corners[1], corners[2]] = [corners[2]!, corners[1]!];
        if (corners.some((corner) => corner < 0 || corner >= vertexCount)) {
          warn(`indices:${label}`, `Asset ${label}: skipped invalid triangle indices`); continue;
        }
        const vertices = corners.map((corner) => transformPoint(matrix, position(corner)));
        if (vertices.some((vertex) => !vertex.every(Number.isFinite))) continue;
        for (const vertex of vertices) { bucket.positions.push(...vertex); bucket.colors.push(...color); }
      }
    };
    for (const placement of placements) {
      const before = one.positions.length + two.positions.length;
      if (isHlodShapePlacement(placement)) {
        if (!hlodIncludesPlacement(shapeBoundingRadius(placement.shape), maxAxisScale(placement.matrix), level.settings.loadRange)) {
          skippedPlacements += 1; continue;
        }
        const mesh = shapeMesh(placement.shape), color = linearColor(placement.color);
        const at = (index: number): Vec3 => [mesh.positions[index * 3]!, mesh.positions[index * 3 + 1]!, mesh.positions[index * 3 + 2]!];
        const vertexCount = mesh.positions.length / 3;
        // The plane draws double-sided (shape/render.ts); the shared proxy material is not.
        emit(shapeDoubleSided(placement.shape) ? two : one, placement.matrix, mesh.indices.length,
          (corner) => mesh.indices[corner]!, vertexCount, at, color, placement.shape);
        if (before === one.positions.length + two.positions.length) skippedPlacements += 1;
        continue;
      }
      const asset = await assets.loadAsset(placement.model);
      if (!asset || !hlodIncludesPlacement(asset.radius, maxAxisScale(placement.matrix), level.settings.loadRange)) {
        skippedPlacements += 1; continue;
      }
      for (const part of asset.parts) {
        const source = part.primitive.getAttribute("POSITION")!;
        const indices = part.primitive.getIndices();
        const count = indices?.getCount() ?? source.getCount();
        const overrideId = placement.materials[part.slot];
        let color = (overrideId ? await assets.slotColor(overrideId) : null) ?? part.color;
        if (placement.color !== null) color = multiplyColor(color, linearColor(placement.color));
        emit(one, multiplyMat4(placement.matrix, part.matrix), count, (corner) => indices ? indices.getScalar(corner) : corner,
          source.getCount(), (index) => source.getElement(index, [0, 0, 0] as Vec3), color, placement.model);
      }
      if (before === one.positions.length + two.positions.length) skippedPlacements += 1;
    }
    if (!one.positions.length && !two.positions.length) continue;
    const source = await simplifyBuckets([one, two], ratio, error);
    const merged = { positions: [...source[0]!.positions, ...source[1]!.positions], colors: [...source[0]!.colors, ...source[1]!.colors] };
    const base = source[0]!.positions.length / 3;
    const back = source[1]!.indices.map((_, i) => source[1]!.indices[i - 2 * (i % 3) + 2]!);
    const indices = [...source[0]!.indices, ...source[1]!.indices.map((corner) => corner + base), ...back.map((corner) => corner + base)];
    if (!indices.length) continue;
    const doc = proxyDocument(merged, indices);
    doc.getRoot().setExtras({ hlodSourceTriangles: (one.positions.length + 2 * two.positions.length) / 9 });
    files.set(hlodCellFileOf(key), await assets.nodeIO.writeBinary(doc));
    entries.push({ key, triangles: indices.length / 3, sourceHash: hlodCellSourceHash(placements) });
  }
  const index: HlodIndex = { schema: HLOD_SCHEMA, level: level.id, cellSize: level.settings.cellSize, cells: entries };
  files.set(HLOD_INDEX_FILE, new TextEncoder().encode(stringifyDocument(index)));
  return { index, files, warnings, skippedPlacements };
}
