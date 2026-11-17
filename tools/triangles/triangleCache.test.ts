import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { cachedTriangles, prepareTriangleModels } from "./triangleCache.ts";
import { Document, NodeIO } from "@gltf-transform/core";
import { shapeMesh } from "../../src/engine/procgen/shapePrimitives.ts";

test("derived cache is byte deterministic, and a corrupt or colliding entry is rebuilt", async () => {
  const dir = await mkdtemp(join(tmpdir(), "forge-r7-cache-"));
  try {
    const shape = shapeMesh("sphere");
    const input = { attributes: { position: { size: 3, values: Array.from(shape.positions) }, normal: { size: 3, values: Array.from(shape.normals) } }, indices: Array.from(shape.indices) };
    const first = await cachedTriangles(input, dir), file = join(dir, `${first.data.key}.json`);
    const bytes = await readFile(file, "utf8");
    await cachedTriangles(input, dir); expect(await readFile(file, "utf8")).toBe(bytes);
    await writeFile(file, JSON.stringify({ ...first, signature: "collision" }));
    await cachedTriangles(input, dir); expect(await readFile(file, "utf8")).toBe(bytes);
    await writeFile(file, "{"); await cachedTriangles(input, dir); expect(await readFile(file, "utf8")).toBe(bytes);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("Node model preprocessing publishes the same derivatives for cache and static build", async () => {
  const dir = await mkdtemp(join(tmpdir(), "forge-r7-build-"));
  try {
    const shape = shapeMesh("sphere"), doc = new Document(), buffer = doc.createBuffer();
    const position = doc.createAccessor().setType("VEC3").setArray(new Float32Array(shape.positions)).setBuffer(buffer);
    const normal = doc.createAccessor().setType("VEC3").setArray(new Float32Array(shape.normals)).setBuffer(buffer);
    const indices = doc.createAccessor().setType("SCALAR").setArray(new Uint32Array(shape.indices)).setBuffer(buffer);
    const primitive = doc.createPrimitive().setAttribute("POSITION", position).setAttribute("NORMAL", normal).setIndices(indices);
    doc.createScene().addChild(doc.createNode().setMesh(doc.createMesh().addPrimitive(primitive)));
    const file = join(dir, "sphere.glb"), cache = join(dir, "cache"), out = join(dir, "out");
    await new NodeIO().write(file, doc);
    const keys = await prepareTriangleModels([file], cache, out); expect(keys).toHaveLength(1);
    expect(await readFile(join(cache, `${keys[0]}.json`), "utf8")).toBe(await readFile(join(out, `${keys[0]}.json`), "utf8"));
    expect(JSON.parse(await readFile(join(out, "index.json"), "utf8"))).toEqual(keys);
    const empty = join(dir, "empty"); expect(await prepareTriangleModels([], cache, empty)).toEqual([]);
    expect(JSON.parse(await readFile(join(empty, "index.json"), "utf8"))).toEqual([]);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
