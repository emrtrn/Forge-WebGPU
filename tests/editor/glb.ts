// A tiny GLB for the editor smokes: a unit cube with normals and one
// material, built by hand (no exporter in the repo). Test-only.

/** A cube of edge `size` centred on the origin, coloured `rgba`. */
export function cubeGlb(size = 1, rgba: readonly [number, number, number, number] = [0.8, 0.35, 0.2, 1]): Buffer {
  const h = size / 2;
  const faces: [number[], number[][]][] = [
    [[1, 0, 0], [[h, -h, -h], [h, h, -h], [h, h, h], [h, -h, h]]],
    [[-1, 0, 0], [[-h, -h, h], [-h, h, h], [-h, h, -h], [-h, -h, -h]]],
    [[0, 1, 0], [[-h, h, -h], [-h, h, h], [h, h, h], [h, h, -h]]],
    [[0, -1, 0], [[-h, -h, h], [-h, -h, -h], [h, -h, -h], [h, -h, h]]],
    [[0, 0, 1], [[h, -h, h], [h, h, h], [-h, h, h], [-h, -h, h]]],
    [[0, 0, -1], [[-h, -h, -h], [-h, h, -h], [h, h, -h], [h, -h, -h]]],
  ];
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  faces.forEach(([normal, corners], face) => {
    for (const corner of corners) {
      positions.push(...corner);
      normals.push(...normal);
    }
    const base = face * 4;
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
  const positionBytes = Buffer.from(new Float32Array(positions).buffer);
  const normalBytes = Buffer.from(new Float32Array(normals).buffer);
  const indexBytes = Buffer.from(new Uint16Array(indices).buffer);
  const bin = Buffer.concat([positionBytes, normalBytes, indexBytes, Buffer.alloc((4 - (indexBytes.length % 4)) % 4)]);
  const json = {
    asset: { version: "2.0", generator: "forge editor smoke" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: "Cube" }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }] }],
    materials: [{ name: "Paint", pbrMetallicRoughness: { baseColorFactor: [...rgba], metallicFactor: 0, roughnessFactor: 0.6 } }],
    buffers: [{ byteLength: bin.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positionBytes.length, target: 34962 },
      { buffer: 0, byteOffset: positionBytes.length, byteLength: normalBytes.length, target: 34962 },
      { buffer: 0, byteOffset: positionBytes.length + normalBytes.length, byteLength: indexBytes.length, target: 34963 },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 24, type: "VEC3", min: [-h, -h, -h], max: [h, h, h] },
      { bufferView: 1, componentType: 5126, count: 24, type: "VEC3" },
      { bufferView: 2, componentType: 5123, count: 36, type: "SCALAR" },
    ],
  };
  let jsonBytes = Buffer.from(JSON.stringify(json), "utf8");
  jsonBytes = Buffer.concat([jsonBytes, Buffer.alloc((4 - (jsonBytes.length % 4)) % 4, 0x20)]);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonBytes.length + 8 + bin.length, 8);
  const chunk = (type: number, data: Buffer): Buffer => {
    const head = Buffer.alloc(8);
    head.writeUInt32LE(data.length, 0);
    head.writeUInt32LE(type, 4);
    return Buffer.concat([head, data]);
  };
  return Buffer.concat([header, chunk(0x4e4f534a, jsonBytes), chunk(0x004e4942, bin)]);
}
