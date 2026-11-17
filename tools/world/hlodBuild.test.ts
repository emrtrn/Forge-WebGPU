import { expect, test } from "vitest";
import { NodeIO } from "@gltf-transform/core";
import sharp from "sharp";
import { splitLevel, stringifyDocument } from "../../src/core/index.ts";
import { hlodClusterSourceHash, normalizeHlodIndex } from "../../src/engine/world/hlod.ts";
import { cross, dot, normalize, sub } from "../../src/engine/math/affine.ts";
import { buildLevelHlod } from "./hlodBuild.ts";
import { loadHlodLevel, type HlodInput } from "./hlodInput.ts";
import { actor, actorId, cube, encode, fixture, FOLDER, GREEN, GREY, inputOf, level, LEVEL, meta, MODEL } from "./hlodTestKit.ts";

const proxy = async (files: Map<string, Uint8Array>, key: string) =>
  (await new NodeIO().readBinary(files.get(`hlod/${key}.glb`)!)).getRoot().listMeshes()[0]!.listPrimitives()[0]!;

test("Forge: in-memory build produces two world-space red proxies and a canonical index", async () => {
  const source = await fixture(), reads = new Map<string, number>();
  const result = await buildLevelHlod(FOLDER, await inputOf(source, reads));
  expect(result.index.cells.map((cell) => cell.key)).toEqual(["0_0", "2_0"]);
  expect(result.index).toMatchObject({ level: LEVEL, cellSize: 128 });
  // Two cell proxies, their 4 × 4 cluster (plan 5c R8.2) and the index.
  expect(result.files.size).toBe(4);
  expect(result.index.clusters.map((cluster) => cluster.key)).toEqual(["0_0"]);
  expect(result.index.clusters[0]!.sourceHash).toBe(hlodClusterSourceHash(result.index.cells));
  expect(result.index.clusters[0]!.triangles).toBeGreaterThan(0);
  expect(result.files.has("hlod/l1_0_0.glb")).toBe(true);
  expect(reads.get("content/cube.glb")).toBe(1);
  expect(result.warnings).toEqual([]);
  expect(result.skippedPlacements).toBe(0);
  const serialized = new TextDecoder().decode(result.files.get("hlod.json"));
  expect(serialized).toBe(stringifyDocument(result.index));
  expect(normalizeHlodIndex(JSON.parse(serialized)).value).toEqual(result.index);
  for (const cell of result.index.cells) {
    const primitive = await proxy(result.files, cell.key);
    expect(cell.triangles).toBeGreaterThan(0);
    expect(primitive.getIndices()!.getCount() / 3).toBe(cell.triangles);
    expect(primitive.getIndices()!.getComponentType()).toBe(5125);
    const colors = primitive.getAttribute("COLOR_0")!;
    expect(colors.getType()).toBe("VEC3");
    for (let index = 0; index < colors.getCount(); index += 1) expect(colors.getElement(index, [])).toEqual([1, 0, 0]);
    // Normals blocked weld + simplify (plan R8.0); proxies shade flat.
    expect(primitive.getAttribute("NORMAL")).toBeNull();
    expect(primitive.getMaterial()!.getBaseColorFactor()).toEqual([1, 1, 1, 1]);
    expect(primitive.getMaterial()!.getBaseColorTexture()).toBeNull();
    const positions = primitive.getAttribute("POSITION")!;
    const xs = Array.from({ length: positions.getCount() }, (_, index) => positions.getElement(index, [])[0]!);
    expect(Math.min(...xs)).toBeGreaterThan(cell.key === "0_0" ? 8 : 264);
    expect(Math.max(...xs)).toBeLessThan(cell.key === "0_0" ? 24 : 268);
  }
});

test("Forge: saved cells merge identically, missing or invalid cell indexes fail", async () => {
  const source = await fixture(), input = await inputOf(source);
  const before = await buildLevelHlod(FOLDER, input, { ratio: 1 });
  const split = splitLevel(loadHlodLevel(FOLDER, input), { strict: true, registry: input.registry, resolveClass: input.index.resolveClass });
  source.set(`${FOLDER}/level.json`, encode(split.persistent));
  source.set(`${FOLDER}/cells.json`, encode({ schema: "forge.levelCells/1", level: LEVEL, persistent: "0".repeat(16),
    cells: Object.fromEntries(split.cells.map((cell) => [cell.cell, "0".repeat(16)])) }));
  for (const cell of split.cells) source.set(`${FOLDER}/cells/${cell.cell}.json`, encode(cell));
  const after = await buildLevelHlod(FOLDER, await inputOf(source), { ratio: 1 });
  expect(after.index).toEqual(before.index);
  expect(after.files).toEqual(before.files);
  source.delete(`${FOLDER}/cells/2_0.json`);
  await expect(buildLevelHlod(FOLDER, await inputOf(source))).rejects.toThrow(/Missing level resource/);
  source.set(`${FOLDER}/cells.json`, encode({ schema: "wrong" }));
  await expect(buildLevelHlod(FOLDER, await inputOf(source))).rejects.toThrow(/Invalid cells.json/);
});

test("Forge: model slots and per-placement slot overrides bake sRGB colours in linear space; tint multiplies", async () => {
  const source = await fixture();
  source.set("content/cube.glb.meta.json", encode(meta(MODEL, "forge.model@2", { materials: [GREY] })));
  source.set("content/grey.material.json", encode({ schema: "forge.material/1", id: GREY, baseColor: "#808080" }));
  source.set("content/green.material.json", encode({ schema: "forge.material/1", id: GREEN, baseColor: "#00ff00" }));
  const actors = [actor(1), actor(2, 20), actor(3, 266)];
  Object.assign(actors[2]!.components.mesh, { materials: [GREEN], color: "#808080" });
  const l = level(actors);
  source.set(`${FOLDER}/level.json`, encode(l));
  const result = await buildLevelHlod(FOLDER, await inputOf(source), { ratio: 1 });
  const grey = (await proxy(result.files, "0_0")).getAttribute("COLOR_0")!.getElement(0, []);
  const green = (await proxy(result.files, "2_0")).getAttribute("COLOR_0")!.getElement(0, []);
  for (const value of grey) expect(value).toBeCloseTo(0.21586, 4);
  expect(green[0]).toBe(0); expect(green[1]).toBeCloseTo(.21586, 4); expect(green[2]).toBe(0);
});

test("Forge: external GLTF resources use injected IO and retain node transforms", async () => {
  const source = await fixture(), io = new NodeIO(), doc = await cube();
  doc.getRoot().listScenes()[0]!.listChildren()[0]!.setTranslation([2, 1, 0]).setScale([1, 2, 1]);
  const gltf = await io.writeJSON(doc);
  source.delete("content/cube.glb"); source.delete("content/cube.glb.meta.json");
  source.set("content/cube.gltf", encode(gltf.json)); source.set("content/cube.gltf.meta.json", encode(meta()));
  for (const [path, bytes] of Object.entries(gltf.resources)) source.set(`content/${path}`, bytes);
  const reads = new Map<string, number>();
  const result = await buildLevelHlod(FOLDER, await inputOf(source, reads), { ratio: 1 });
  expect(result.warnings).toEqual([]);
  for (const path of Object.keys(gltf.resources)) expect(reads.get(`content/${path}`)).toBe(1);
  const position = (await proxy(result.files, "2_0")).getAttribute("POSITION")!;
  const vertices = Array.from({ length: position.getCount() }, (_, index) => position.getElement(index, []));
  expect(Math.min(...vertices.map((vertex) => vertex[0]!))).toBeCloseTo(270.5);
  expect(Math.max(...vertices.map((vertex) => vertex[1]!))).toBeCloseTo(6);
});

test("unique material slot order is preserved across primitives and placement overrides affect only their slot", async () => {
  const source = await fixture(), doc = await cube();
  const mesh = doc.getRoot().listMeshes()[0]!, primitive = mesh.listPrimitives()[0]!;
  mesh.addPrimitive(primitive.clone().setMaterial(doc.createMaterial("blue").setBaseColorFactor([0, 0, 1, 1])));
  source.set("content/cube.glb", await new NodeIO().writeBinary(doc));
  source.set("content/green.material.json", encode({ schema: "forge.material/1", id: GREEN, baseColor: "#00ff00" }));
  const placement = actor(1);
  Object.assign(placement.components.mesh, { materials: [null, GREEN] });
  source.set(`${FOLDER}/level.json`, encode(level([placement])));
  const result = await buildLevelHlod(FOLDER, await inputOf(source), { ratio: 1 });
  const colors = (await proxy(result.files, "0_0")).getAttribute("COLOR_0")!;
  const unique = new Set(Array.from({ length: colors.getCount() }, (_, i) => JSON.stringify(colors.getElement(i, []))));
  expect(unique).toEqual(new Set(["[1,0,0]", "[0,1,0]"]));
});

test("class overrides, parent actors and component local transforms feed the world-space bake", async () => {
  const source = await fixture();
  source.set("content/model.actor.json", encode({ schema: "forge.actorClass/1", id: GREY, name: "Model",
    components: { mesh: { type: "forge.staticMesh@2", parent: null, mesh: MODEL, local: { p: [2, 0, 0] } } } }));
  source.set(`${FOLDER}/level.json`, encode(level([
    { id: actorId(1), transform: { p: [266, 0, 10], s: [3, 3, 3] }, components: {} },
    { id: actorId(2), parent: actorId(1), transform: { p: [1, 0, 0] }, class: GREY,
      overrides: { mesh: { type: "forge.staticMesh@2", local: { p: [4, 0, 0] } } } },
  ])));
  const result = await buildLevelHlod(FOLDER, await inputOf(source), { ratio: 1 });
  expect(result.index.cells.map((cell) => cell.key)).toEqual(["2_0"]);
  const p = (await proxy(result.files, "2_0")).getAttribute("POSITION")!;
  const xs = Array.from({ length: p.getCount() }, (_, i) => p.getElement(i, [])[0]!);
  expect(Math.min(...xs)).toBeCloseTo(279.5); expect(Math.max(...xs)).toBeCloseTo(282.5);
});

test("texture colour uses Forge's decoded average in linear space times GLTF factor; proxies have no textures", async () => {
  const source = await fixture(), doc = await cube();
  const png = await sharp(Buffer.from([128, 64, 32, 255]), { raw: { width: 1, height: 1, channels: 4 } }).png().toBuffer();
  const texture = doc.createTexture().setImage(png).setMimeType("image/png");
  doc.getRoot().listMaterials()[0]!.setBaseColorFactor([.5, 1, 1, 1]).setBaseColorTexture(texture);
  source.set("content/cube.glb", await new NodeIO().writeBinary(doc));
  const result = await buildLevelHlod(FOLDER, await inputOf(source), { ratio: 1 });
  expect(result.warnings).toEqual([]);
  const color = (await proxy(result.files, "0_0")).getAttribute("COLOR_0")!.getElement(0, []);
  expect(color[0]).toBeCloseTo(.21586 * .5, 4); expect(color[1]).toBeCloseTo(.051269, 4); expect(color[2]).toBeCloseTo(.014444, 4);
  expect((await new NodeIO().readBinary(result.files.get("hlod/0_0.glb")!)).getRoot().listTextures()).toEqual([]);
});

test("mirrored non-uniform matrices correct winding", async () => {
  const source = await fixture(), doc = await cube();
  const primitive = doc.getRoot().listMeshes()[0]!.listPrimitives()[0]!;
  primitive.setIndices(null).getAttribute("POSITION")!.setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 1]));
  source.set("content/cube.glb", await new NodeIO().writeBinary(doc));
  source.set(`${FOLDER}/level.json`, encode(level([actor(1, 10, [-3, 6, 9])])));
  const result = await buildLevelHlod(FOLDER, await inputOf(source), { ratio: 1 });
  const built = await proxy(result.files, "0_0"), p = built.getAttribute("POSITION")!;
  const indices = built.getIndices()!, vertices = [0, 1, 2].map((i) => p.getElement(indices.getScalar(i), [0, 0, 0] as [number, number, number]));
  const face = normalize(cross(sub(vertices[1]!, vertices[0]!), sub(vertices[2]!, vertices[0]!)));
  const expected = normalize([0, -1 / 6, 1 / 9]);
  expect(dot(face, expected)).toBeCloseTo(1);
});

test("small placements and shapes/markers/editor helpers leave an empty index; bad model warns once", async () => {
  const source = await fixture();
  const missing = `ast_${"e".repeat(32)}` as typeof MODEL;
  source.set(`${FOLDER}/level.json`, encode(level([
    actor(1, 10, [1, 1, 1]), actor(2, 20, [3, 3, 3], missing), actor(3, 266, [3, 3, 3], missing),
    { id: actorId(4), components: { shape: { type: "forge.shape@2", parent: null } } },
    { id: actorId(5), components: {} },
  ])));
  const result = await buildLevelHlod(FOLDER, await inputOf(source));
  expect(result.index.cells).toEqual([]); expect(result.files.size).toBe(1);
  expect(result.skippedPlacements).toBe(4); expect(result.warnings).toHaveLength(1); expect(result.warnings[0]).toContain(missing);
});

test("large shapes bake in their colour (plan 5c R1); a plane bakes both sides", async () => {
  const source = await fixture();
  const shape = (index: number, x: number, primitive: string, color: string) =>
    ({ id: actorId(index), transform: { p: [x, 0, 10], s: [20, 20, 20] },
      components: { shape: { type: "forge.shape@2", parent: null, primitive, color } } });
  source.set(`${FOLDER}/level.json`, encode(level([shape(1, 10, "cube", "#ff0000"), shape(2, 266, "plane", "#00ff00")])));
  const result = await buildLevelHlod(FOLDER, await inputOf(source));
  expect(result.warnings).toEqual([]);
  expect(result.index.cells.map((cell) => cell.key)).toEqual(["0_0", "2_0"]);
  const cube = await proxy(result.files, "0_0");
  const colors = cube.getAttribute("COLOR_0")!;
  for (let index = 0; index < colors.getCount(); index += 1) expect(colors.getElement(index, [])).toEqual([1, 0, 0]);
  const xs = cube.getAttribute("POSITION")!;
  const values = Array.from({ length: xs.getCount() }, (_, index) => xs.getElement(index, [])[0]!);
  expect(Math.min(...values)).toBeCloseTo(5); expect(Math.max(...values)).toBeCloseTo(15);
  expect(result.index.cells[1]!.triangles).toBe(4);
  const plane = await proxy(result.files, "2_0");
  const p = plane.getAttribute("POSITION")!, indices = plane.getIndices()!;
  const corner = (i: number) => p.getElement(indices.getScalar(i), [0, 0, 0] as [number, number, number]);
  const ys = new Set(Array.from({ length: indices.getCount() / 3 }, (_, t) =>
    Math.sign(cross(sub(corner(3 * t + 1), corner(3 * t)), sub(corner(3 * t + 2), corner(3 * t)))[1]!)));
  expect(ys).toEqual(new Set([1, -1]));
});

test("level loadRange determines inclusion; persistent meshes are excluded", async () => {
  const source = await fixture();
  source.set(`${FOLDER}/level.json`, encode({ ...level(), settings: { cellSize: 128, loadRange: 999 },
    actors: [actor(1), { ...actor(2, 200, [30, 30, 30]), spatiallyLoaded: false }] }));
  const result = await buildLevelHlod(FOLDER, await inputOf(source));
  expect(result.index.cells).toEqual([]); expect(result.skippedPlacements).toBe(1);
});

test("Forge: invalid build parameters reject (both ratio and error are in (0, 1])", async () => {
  const input = {} as HlodInput;
  for (const name of ["ratio", "error"]) for (const value of [0, -1, 1.01, NaN, Infinity]) {
    await expect(buildLevelHlod(FOLDER, input, { [name]: value })).rejects.toThrow(name);
  }
});
