// Deterministic automatic discrete LODs, using the pinned meshoptimizer.
// The same producer runs in Node builds and the browser's selectable R7 path.
import { MeshoptSimplifier } from "meshoptimizer/simplifier";
import { SMALL_TRIANGLES, TRIANGLE_VERSION, triangleKey, validateTriangleInput, type TriangleData, type TriangleInput } from "./triangleData.ts";

export async function prepareTriangles(input: TriangleInput): Promise<TriangleData> {
  validateTriangleInput(input);
  const key = triangleKey(input);
  if (input.groups?.length) {
    const groups = input.groups;
    for (const group of groups) if (group.start < 0 || group.count < 3 || group.start % 3 || group.count % 3 || group.start + group.count > input.indices.length) throw new Error("triangles: invalid material group");
    const parts = await Promise.all(groups.map((group) => prepareTriangles({ attributes: input.attributes, indices: input.indices.slice(group.start, group.start + group.count) })));
    const lods: { indices: number[]; error: number; groups: { start: number; count: number; materialIndex: number }[] }[] = [];
    for (let level = 0; level < Math.max(...parts.map((part) => part.lods.length)); level += 1) {
      const result = { indices: [] as number[], error: 0, groups: [] as { start: number; count: number; materialIndex: number }[] };
      parts.forEach((part, i) => {
        const lod = part.lods[Math.min(level, part.lods.length - 1)]!;
        result.groups.push({ start: result.indices.length, count: lod.indices.length, materialIndex: groups[i]!.materialIndex });
        for (const index of lod.indices) result.indices.push(index);
        result.error = Math.max(result.error, lod.error);
      });
      if (level === 0 || result.indices.length <= lods.at(-1)!.indices.length * .85) lods.push(result);
    }
    return { version: TRIANGLE_VERSION, key, lods };
  }
  if (input.indices.length / 3 <= SMALL_TRIANGLES) return { version: TRIANGLE_VERSION, key, lods: [{ indices: [...input.indices], error: 0 }] };
  await MeshoptSimplifier.ready;
  const positions = Float32Array.from(input.attributes.position!.values);
  const scale = MeshoptSimplifier.getScale(positions, 3);
  const source = Uint32Array.from(input.indices);
  const lods: { indices: number[]; error: number }[] = [{ indices: [...source], error: 0 }];
  // Fallback keeps source vertex indices: textures, normals and every custom
  // attribute retain their correspondence; border seams remain locked.
  for (const ratio of [0.5, 0.15]) {
    const previous = lods.at(-1)!;
    const [indices, error] = MeshoptSimplifier.simplify(Uint32Array.from(previous.indices), positions, 3, Math.max(3, Math.floor(source.length * ratio / 3) * 3), 0.02, ["LockBorder"]);
    if (indices.length >= 3 && indices.length <= previous.indices.length * 0.85) lods.push({ indices: Array.from(indices), error: previous.error + error * scale });
  }
  return { version: TRIANGLE_VERSION, key, lods };
}
