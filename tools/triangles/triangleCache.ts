import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer/decoder";
import { prepareTriangles } from "../../src/engine/geometry/prepareTriangles.ts";
import { TRIANGLE_VERSION, triangleKey, triangleSignature, type TriangleData, type TriangleInput } from "../../src/engine/geometry/triangleData.ts";

export interface TriangleArtifact { readonly signature: string; readonly data: TriangleData }
export async function cachedTriangles(input: TriangleInput, dir: string): Promise<TriangleArtifact> {
  const key = triangleKey(input), signature = triangleSignature(input), file = join(dir, `${key}.json`);
  try {
    const existing = JSON.parse(await readFile(file, "utf8")) as TriangleArtifact;
    if (existing.signature === signature && existing.data.version === TRIANGLE_VERSION && existing.data.key === key) return existing;
  } catch { /* A missing / interrupted cache is rebuilt, never authored content. */ }
  const artifact = { signature, data: await prepareTriangles(input) };
  await mkdir(dir, { recursive: true });
  await writeFile(file, `${JSON.stringify(artifact)}\n`);
  return artifact;
}

/** All model primitives, independent of their current material selection. Read only
 * authored files; unsupported GLTF extensions are reported, never rewritten. */
export async function prepareTriangleModels(files: readonly string[], cacheDir: string, outDir?: string): Promise<string[]> {
  if (outDir) await mkdir(outDir, { recursive: true });
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
  const keys = new Set<string>();
  for (const file of [...new Set(files)].sort()) {
    try {
      const doc = await io.read(file);
      for (const mesh of doc.getRoot().listMeshes()) for (const primitive of mesh.listPrimitives()) {
        if (primitive.getMode() !== 4 || primitive.listTargets().length || !primitive.getAttribute("POSITION")) continue;
        const attributes: Record<string, { size: number; values: number[] }> = {};
        const names: Record<string, string> = { POSITION: "position", NORMAL: "normal", TEXCOORD_0: "uv", TEXCOORD_1: "uv1", COLOR_0: "color", TANGENT: "tangent" };
        for (const semantic of primitive.listSemantics()) {
          const name = names[semantic]; if (!name) continue;
          const accessor = primitive.getAttribute(semantic)!;
          const values = Array.from(accessor.getArray()!);
          if (accessor.getNormalized()) {
            const component = accessor.getComponentType();
            const max = component === 5120 ? 127 : component === 5121 ? 255 : component === 5122 ? 32767 : component === 5123 ? 65535 : 1;
            for (let i = 0; i < values.length; i += 1) values[i] = Math.fround(Math.max(-1, values[i]! / max));
          }
          attributes[name] = { size: accessor.getElementSize(), values };
        }
        const count = attributes.position!.values.length / 3;
        const input: TriangleInput = { attributes, indices: Array.from(primitive.getIndices()?.getArray() ?? Array.from({ length: count }, (_, i) => i)) };
        const artifact = await cachedTriangles(input, cacheDir);
        keys.add(artifact.data.key);
        if (outDir) { await mkdir(outDir, { recursive: true }); await writeFile(join(outDir, `${artifact.data.key}.json`), `${JSON.stringify(artifact)}\n`); }
      }
    } catch (error) { console.warn(`forge triangles: ${file}: ${String(error)}`); }
  }
  const sorted = [...keys].sort();
  if (outDir) await writeFile(join(outDir, "index.json"), `${JSON.stringify(sorted)}\n`);
  return sorted;
}
