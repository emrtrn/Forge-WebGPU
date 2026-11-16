// Forge's world-space bake -> weld -> meshoptimizer simplify, with level-folder inputs.
import { Document, Logger, Verbosity } from "@gltf-transform/core";
import { simplify, weld } from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";
import { stringifyDocument, type Vec3 } from "../../src/core/index.ts";
import {
  HLOD_SCHEMA, HLOD_INDEX_FILE, hlodCellFileOf, hlodCellSourceHash, hlodIncludesPlacement, maxAxisScale,
  type HlodIndex,
} from "../../src/engine/world/hlod.ts";
import { multiplyMat4, transformPoint } from "../../src/engine/math/affine.ts";
import { createHlodAssets, linearColor, multiplyColor } from "./hlodAssets.ts";
import { hlodCellsOf, loadHlodLevel, type HlodInput } from "./hlodInput.ts";
import { mirrored, normalTransform } from "./hlodMath.ts";

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
    const positions: number[] = [], normals: number[] = [], colors: number[] = [];
    for (const placement of placements) {
      const asset = await assets.loadAsset(placement.model);
      if (!asset || !hlodIncludesPlacement(asset.radius, maxAxisScale(placement.matrix), level.settings.loadRange)) {
        skippedPlacements += 1; continue;
      }
      const before = positions.length;
      for (const part of asset.parts) {
        const source = part.primitive.getAttribute("POSITION")!;
        const sourceNormals = part.primitive.getAttribute("NORMAL")!;
        const indices = part.primitive.getIndices();
        const count = indices?.getCount() ?? source.getCount();
        const matrix = multiplyMat4(placement.matrix, part.matrix);
        const applyNormal = normalTransform(matrix);
        const isMirrored = mirrored(matrix);
        const overrideId = placement.materials[part.slot];
        let color = (overrideId ? await assets.slotColor(overrideId) : null) ?? part.color;
        if (placement.color !== null) color = multiplyColor(color, linearColor(placement.color));
        for (let offset = 0; offset + 2 < count; offset += 3) {
          const corners = [0, 1, 2].map((corner) => indices ? indices.getScalar(offset + corner) : offset + corner);
          if (isMirrored) [corners[1], corners[2]] = [corners[2]!, corners[1]!];
          if (corners.some((index) => index < 0 || index >= source.getCount())) {
            warn(`indices:${placement.model}`, `Asset ${placement.model}: skipped invalid triangle indices`); continue;
          }
          const vertices = corners.map((index) => transformPoint(matrix, source.getElement(index, [0, 0, 0] as Vec3)));
          if (vertices.some((vertex) => !vertex.every(Number.isFinite))) continue;
          vertices.forEach((vertex, corner) => {
            const normal = applyNormal(sourceNormals.getElement(corners[corner]!, [0, 0, 0] as Vec3));
            positions.push(...vertex); normals.push(...normal); colors.push(...color);
          });
        }
      }
      if (before === positions.length) skippedPlacements += 1;
    }
    if (!positions.length) continue;
    const doc = new Document().setLogger(new Logger(Verbosity.SILENT));
    const buffer = doc.createBuffer();
    const attribute = (values: number[]) => doc.createAccessor().setType("VEC3").setArray(new Float32Array(values)).setBuffer(buffer);
    const primitive = doc.createPrimitive().setAttribute("POSITION", attribute(positions))
      .setAttribute("NORMAL", attribute(normals)).setAttribute("COLOR_0", attribute(colors))
      .setIndices(doc.createAccessor().setType("SCALAR")
        .setArray(Uint32Array.from({ length: positions.length / 3 }, (_, index) => index)).setBuffer(buffer))
      .setMaterial(doc.createMaterial().setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(1).setMetallicFactor(0));
    doc.createScene().addChild(doc.createNode().setMesh(doc.createMesh().addPrimitive(primitive)));
    doc.getRoot().setExtras({ hlodSourceTriangles: positions.length / 9 });
    await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio, error }));
    const simplified = doc.getRoot().listMeshes()[0]?.listPrimitives()[0]?.getIndices();
    if (!simplified?.getCount()) continue;
    simplified.setArray(new Uint32Array(simplified.getArray()!));
    files.set(hlodCellFileOf(key), await assets.nodeIO.writeBinary(doc));
    entries.push({ key, triangles: simplified.getCount() / 3, sourceHash: hlodCellSourceHash(placements) });
  }
  const index: HlodIndex = { schema: HLOD_SCHEMA, level: level.id, cellSize: level.settings.cellSize, cells: entries };
  files.set(HLOD_INDEX_FILE, new TextEncoder().encode(stringifyDocument(index)));
  return { index, files, warnings, skippedPlacements };
}
