import assert from "node:assert";
import { test } from "vitest";
import { glbAccessor, readGlb, writeGlb } from "./glb.ts";
import type { GlbInput, GlbPrimitive } from "./glb.ts";
import { computeVertexNormals } from "./mesh.ts";
import type { ProcMesh } from "./mesh.ts";
import { generateRock } from "./rock/rockGenerator.ts";

function tetrahedron(): ProcMesh {
  const mesh: ProcMesh = {
    positions: new Float32Array([-0.1, -1, -0.25, 2, -1, -0.25, 0, 1, -0.25, 0, 0, 3]),
    normals: new Float32Array(12),
    colors: new Float32Array([1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 0.75, 0.3, 0.4, 0.5, 1]),
    indices: new Uint32Array([0, 2, 1, 0, 1, 3, 1, 2, 3, 2, 0, 3]),
  };
  computeVertexNormals(mesh);
  return mesh;
}

function triangleStrip(vertices: number): ProcMesh {
  const positions = new Float32Array(vertices * 3);
  const normals = new Float32Array(positions.length);
  const indices = new Uint32Array((vertices - 2) * 3);
  for (let i = 0; i < vertices; i++) {
    positions.set([Math.floor(i / 2), i % 2, -2], i * 3);
    normals[i * 3 + 2] = 1;
  }
  for (let i = 0; i < vertices - 2; i++) {
    indices.set(i % 2 === 0 ? [i + 1, i, i + 2] : [i, i + 1, i + 2], i * 3);
  }
  return { positions, normals, indices };
}

function tetraInput(): GlbInput {
  return {
    nodes: [{ name: "Tétra", primitives: [{ mesh: tetrahedron(), material: 0 }] }],
    materials: [{ name: "Default" }],
  };
}

test("round trips colored geometry, UVs, 32-bit indices, materials, and extras", () => {
  const input = tetraInput();
  const tetra = input.nodes[0]!.primitives[0]!;
  tetra.uvs = new Float32Array([0, 0, 1, 0, 0, 1, 0.5, 0.5]);
  const strip = triangleStrip(70_000);
  input.nodes.push({ name: "Strip", primitives: [{ mesh: strip, material: 1 }] });
  input.nodes[0]!.extras = { lod: 0, labels: ["rock", false] };
  input.extras = { seed: 19, source: { name: "procedural" } };
  input.generator = "Forge GLB test";
  input.materials[0] = { name: "Paint", baseColor: [0.25, 0.5, 0.75, 0.9], roughness: 0, metalness: 0.25, doubleSided: true };
  input.materials.push({ name: "Default", doubleSided: false });

  const bytes = writeGlb(input);
  const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLength = header.getUint32(12, true);
  const binOffset = 20 + jsonLength;
  const binLength = header.getUint32(binOffset, true);
  assert.strictEqual(header.getUint32(0, true), 0x46546c67);
  assert.strictEqual(header.getUint32(4, true), 2);
  assert.strictEqual(header.getUint32(8, true), bytes.length);
  assert.strictEqual(header.getUint32(16, true), 0x4e4f534a);
  assert.strictEqual(header.getUint32(binOffset + 4, true), 0x004e4942);
  assert.strictEqual(jsonLength % 4, 0);
  assert.strictEqual(binLength % 4, 0);
  assert.strictEqual(binOffset + 8 + binLength, bytes.length);

  const framedBytes = new Uint8Array(bytes.length + 1);
  framedBytes.set(bytes, 1);
  const glb = readGlb(framedBytes.subarray(1));
  const { json, bin } = glb;
  const unpaddedJson = new TextEncoder().encode(JSON.stringify(json));
  assert.deepStrictEqual(bytes.subarray(20, 20 + unpaddedJson.length), unpaddedJson);
  assert.ok(jsonLength - unpaddedJson.length < 4);
  assert.ok(bytes.subarray(20 + unpaddedJson.length, binOffset).every(value => value === 0x20));
  assert.strictEqual(bin.length, binLength);
  assert.deepStrictEqual(json.asset, { version: "2.0", generator: input.generator, extras: input.extras });
  assert.strictEqual(json.scene, 0);
  assert.deepStrictEqual(json.scenes, [{ nodes: [0, 1] }]);
  assert.deepStrictEqual(json.nodes, [
    { name: "Tétra", mesh: 0, extras: input.nodes[0]!.extras }, { name: "Strip", mesh: 1 },
  ]);
  assert.deepStrictEqual(json.meshes.map((mesh: { name: string }) => mesh.name), ["Tétra", "Strip"]);
  assert.deepStrictEqual(json.materials, [
    { name: "Paint", doubleSided: true, pbrMetallicRoughness: { baseColorFactor: [0.25, 0.5, 0.75, 0.9], roughnessFactor: 0, metallicFactor: 0.25 } },
    { name: "Default", pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], roughnessFactor: 1, metallicFactor: 0 } },
  ]);
  assert.deepStrictEqual(json.buffers, [{ byteLength: binLength }]);
  assert.strictEqual(json.bufferViews.length, json.accessors.length);
  assert.strictEqual(new Set(json.accessors.map((entry: { bufferView: number }) => entry.bufferView)).size, json.accessors.length);

  function assertAccessor(index: number, type: string, count: number, componentType: number, target: number,
    data: Float32Array | Uint16Array | Uint32Array): void {
    const accessor = json.accessors[index];
    const view = json.bufferViews[accessor.bufferView];
    assert.strictEqual(accessor.type, type);
    assert.strictEqual(accessor.count, count);
    assert.strictEqual(accessor.componentType, componentType);
    assert.strictEqual(view.target, target);
    assert.strictEqual(view.byteOffset % 4, 0);
    assert.strictEqual(view.byteLength, data.byteLength);
    assert.deepStrictEqual(glbAccessor(glb, index), data);
  }

  const small = json.meshes[0].primitives[0];
  const large = json.meshes[1].primitives[0];
  assert.strictEqual(small.material, 0);
  assert.strictEqual(large.material, 1);
  assert.strictEqual(small.mode ?? 4, 4);
  assert.strictEqual(large.mode ?? 4, 4);
  assert.deepStrictEqual(Object.keys(large.attributes), ["POSITION", "NORMAL"]);
  assertAccessor(small.attributes.POSITION, "VEC3", 4, 5126, 34962, tetra.mesh.positions);
  assertAccessor(small.attributes.NORMAL, "VEC3", 4, 5126, 34962, tetra.mesh.normals);
  assertAccessor(small.attributes.COLOR_0, "VEC4", 4, 5126, 34962, tetra.mesh.colors!);
  assertAccessor(small.attributes.TEXCOORD_0, "VEC2", 4, 5126, 34962, tetra.uvs);
  assertAccessor(small.indices, "SCALAR", tetra.mesh.indices.length, 5123, 34963, new Uint16Array(tetra.mesh.indices));
  assertAccessor(large.attributes.POSITION, "VEC3", 70_000, 5126, 34962, strip.positions);
  assertAccessor(large.attributes.NORMAL, "VEC3", 70_000, 5126, 34962, strip.normals);
  assertAccessor(large.indices, "SCALAR", strip.indices.length, 5125, 34963, strip.indices);
  assert.deepStrictEqual(json.accessors[small.attributes.POSITION].min, [Math.fround(-0.1), -1, -0.25]);
  assert.deepStrictEqual(json.accessors[small.attributes.POSITION].max, [2, 1, 3]);
  assert.deepStrictEqual(json.accessors[large.attributes.POSITION].min, [0, 0, -2]);
  assert.deepStrictEqual(json.accessors[large.attributes.POSITION].max, [34_999, 1, -2]);

  const indexAccessor = json.accessors[small.indices];
  indexAccessor.byteOffset = 2;
  indexAccessor.count = 3;
  const partial = glbAccessor(glb, small.indices);
  assert.deepStrictEqual(partial, new Uint16Array(tetra.mesh.indices.subarray(1, 4)));
  partial[0] = 42;
  assert.strictEqual(glbAccessor(glb, small.indices)[0], tetra.mesh.indices[1]);
});

test("writes deterministic bytes and reflects a position change", () => {
  const input = tetraInput();
  const before = writeGlb(input);
  assert.deepStrictEqual(writeGlb(input), before);
  input.nodes[0]!.primitives[0]!.mesh.positions[0] = -0.2;
  assert.notDeepStrictEqual(writeGlb(input), before);
});

test("rejects invalid primitives with their node and primitive indices", () => {
  const cases: [string, (primitive: GlbPrimitive) => void][] = [
    ["positions", ({ mesh }) => { mesh.positions = new Float32Array(10); }],
    ["normals", ({ mesh }) => { mesh.normals = new Float32Array(9); }],
    ["colors", ({ mesh }) => { mesh.colors = new Float32Array(12); }],
    ["uvs", primitive => { primitive.uvs = new Float32Array(7); }],
    ["indices length", ({ mesh }) => { mesh.indices = new Uint32Array(2); }],
    ["index out of range", ({ mesh }) => { mesh.indices[0] = 4; }],
    ["material index", primitive => { primitive.material = 1; }],
    ["positions contains non-finite", ({ mesh }) => { mesh.positions[0] = NaN; }],
    ["normals contains non-finite", ({ mesh }) => { mesh.normals[0] = Infinity; }],
    ["colors contains non-finite", ({ mesh }) => { mesh.colors![0] = -Infinity; }],
    ["uvs contains non-finite", primitive => { primitive.uvs = new Float32Array(8).fill(NaN); }],
  ];
  for (const [message, corrupt] of cases) {
    const input = tetraInput();
    const invalid = { mesh: tetrahedron(), material: 0 };
    input.nodes.push({ name: "Invalid", primitives: [{ mesh: tetrahedron(), material: 0 }, invalid] });
    corrupt(invalid);
    assert.throws(() => writeGlb(input), new RegExp(`node 1 primitive 1.*${message}`));
  }
  assert.throws(() => writeGlb({ ...tetraInput(), nodes: [] }), /nodes.*empty/);
});

test("writes and reads one mesh per generated rock LOD", () => {
  const rock = generateRock({ seed: 7 });
  if (!rock.ok) assert.fail(rock.report.message);
  const glb = readGlb(writeGlb({
    nodes: rock.lods.map((mesh, index) => ({ name: `Rock LOD${index}`, primitives: [{ mesh, material: 0 }] })),
    materials: [{ name: "Rock" }],
  }));
  assert.strictEqual(glb.json.asset.generator, "Forge procgen");
  assert.strictEqual(glb.json.nodes.length, rock.lods.length);
  assert.strictEqual(glb.json.meshes.length, rock.lods.length);
  for (const [index, lod] of rock.lods.entries()) {
    const primitive = glb.json.meshes[index].primitives[0];
    assert.strictEqual(glb.json.accessors[primitive.attributes.POSITION].count, lod.positions.length / 3);
    assert.strictEqual(glb.json.accessors[primitive.indices].count, lod.indices.length);
    assert.strictEqual(glbAccessor(glb, primitive.attributes.POSITION).length, lod.positions.length);
    assert.strictEqual(glbAccessor(glb, primitive.indices).length, lod.indices.length);
  }
});

test("pads the binary chunk and rejects malformed GLB containers", () => {
  const input = tetraInput();
  const mesh = input.nodes[0]!.primitives[0]!.mesh;
  mesh.indices = mesh.indices.slice(0, 3);
  const bytes = writeGlb(input);
  const { json, bin } = readGlb(bytes);
  assert.deepStrictEqual(bin.subarray(json.buffers[0].byteLength), new Uint8Array(2));

  const badPadding = bytes.slice();
  badPadding[badPadding.length - 1] = 1;
  assert.throws(() => readGlb(badPadding), /padding/);
  assert.throws(() => readGlb(bytes.subarray(0, 10)), /header/);
  assert.throws(() => readGlb(bytes.subarray(0, -1)), /header length/);

  const badChunk = bytes.slice();
  const view = new DataView(badChunk.buffer);
  view.setUint32(12, view.getUint32(12, true) - 1, true);
  assert.throws(() => readGlb(badChunk), /aligned/);
  view.setUint32(12, bytes.length, true);
  assert.throws(() => readGlb(badChunk), /chunk length/);
});

test("custom attributes are written as float vectors and read back; bad names and sizes throw", () => {
  const mesh = { positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), indices: new Uint32Array([0, 1, 2]) };
  const wind = new Float32Array([0, 0.1, 0.2, 0.3, 1, 1.1, 1.2, 1.3, 2, 2.1, 2.2, 2.3]);
  const glb = readGlb(writeGlb({ nodes: [{ name: "a", primitives: [{ mesh, material: 0, attributes: { _WIND: { data: wind, size: 4 } } }] }], materials: [{ name: "m" }] }));
  const index = glb.json.meshes[0].primitives[0].attributes._WIND;
  assert.equal(glb.json.accessors[index].type, "VEC4");
  assert.deepEqual([...glbAccessor(glb, index)], [...wind]);
  assert.throws(() => writeGlb({ nodes: [{ name: "a", primitives: [{ mesh, material: 0, attributes: { wind: { data: wind, size: 4 } } }] }], materials: [{ name: "m" }] }), /node 0/);
  assert.throws(() => writeGlb({ nodes: [{ name: "a", primitives: [{ mesh, material: 0, attributes: { _WIND: { data: wind, size: 3 } } }] }], materials: [{ name: "m" }] }), /node 0/);
});
