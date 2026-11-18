import { meshBounds } from "./mesh.ts";
import type { ProcMesh } from "./mesh.ts";

export interface GlbMaterial {
  name: string;
  /** Linear RGBA 0..1, defaults to white. */
  baseColor?: readonly [number, number, number, number];
  /** Defaults to 1. */
  roughness?: number;
  /** Defaults to 0. */
  metalness?: number;
  /** Omitted from the output unless true. */
  doubleSided?: boolean;
}
export interface GlbPrimitive {
  mesh: ProcMesh;
  /** Optional TEXCOORD_0, two floats per vertex. */
  uvs?: Float32Array;
  /** Index into GlbInput.materials. */
  material: number;
}
export interface GlbMeshNode {
  name: string;
  primitives: GlbPrimitive[];
  /** Copied to node.extras. */
  extras?: Record<string, unknown>;
}
export interface GlbInput {
  /** One mesh and one root node per entry. */
  nodes: GlbMeshNode[];
  materials: GlbMaterial[];
  /** Defaults to "Forge procgen". */
  generator?: string;
  /** Copied to asset.extras. */
  extras?: Record<string, unknown>;
}

const MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;
const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 } as const;
type AccessorType = keyof typeof COMPONENTS;
type AccessorData = Float32Array | Uint16Array | Uint32Array;

function align4(length: number): number {
  return Math.ceil(length / 4) * 4;
}

function validatePrimitive({ mesh, uvs, material }: GlbPrimitive, materialCount: number, label: string): number {
  const { positions, normals, colors, indices } = mesh;
  const vertices = positions.length / 3;
  if (!Number.isInteger(vertices)) throw new Error(`${label}: positions length is not a multiple of 3`);
  if (vertices === 0) throw new Error(`${label}: positions are empty`);
  if (normals.length !== positions.length) throw new Error(`${label}: normals length does not match positions`);
  if (colors && colors.length !== vertices * 4) throw new Error(`${label}: colors require four values per vertex`);
  if (uvs && uvs.length !== vertices * 2) throw new Error(`${label}: uvs require two values per vertex`);
  if (indices.length % 3) throw new Error(`${label}: indices length is not a multiple of 3`);
  if (indices.length === 0) throw new Error(`${label}: indices are empty`);
  if (indices.some(index => index >= vertices)) throw new Error(`${label}: index out of range`);
  if (!Number.isInteger(material) || material < 0 || material >= materialCount) {
    throw new Error(`${label}: material index out of range`);
  }
  for (const [name, values] of [["positions", positions], ["normals", normals], ["colors", colors], ["uvs", uvs]] as const) {
    if (values?.some(value => !Number.isFinite(value))) throw new Error(`${label}: ${name} contains non-finite values`);
  }
  return vertices;
}

export function writeGlb(input: GlbInput): Uint8Array {
  if (input.nodes.length === 0) throw new Error("GLB nodes list is empty");
  const arrays: AccessorData[] = [];
  const bufferViews: { buffer: number; byteOffset: number; byteLength: number; target: number }[] = [];
  const accessors: { bufferView: number; componentType: number; count: number; type: AccessorType; min?: number[]; max?: number[] }[] = [];
  let binLength = 0;

  function addAccessor(data: AccessorData, type: AccessorType, bounds?: { min: number[]; max: number[] }): number {
    const index = arrays.length;
    const byteOffset = align4(binLength);
    const componentType = type !== "SCALAR" ? 5126 : data.BYTES_PER_ELEMENT === 2 ? 5123 : 5125;
    const target = type === "SCALAR" ? 34963 : 34962;
    bufferViews.push({ buffer: 0, byteOffset, byteLength: data.byteLength, target });
    accessors.push({ bufferView: index, componentType, count: data.length / COMPONENTS[type], type, ...bounds });
    arrays.push(data);
    binLength = byteOffset + data.byteLength;
    return index;
  }

  const meshes = input.nodes.map(({ name, primitives }, nodeIndex) => {
    if (primitives.length === 0) throw new Error(`node ${nodeIndex}: primitives list is empty`);
    const gltfPrimitives = primitives.map((primitive, primitiveIndex) => {
      const vertices = validatePrimitive(primitive, input.materials.length, `node ${nodeIndex} primitive ${primitiveIndex}`);
      const { mesh, uvs, material } = primitive;
      const attributes: Record<string, number> = {
        POSITION: addAccessor(mesh.positions, "VEC3", meshBounds(mesh)),
        NORMAL: addAccessor(mesh.normals, "VEC3"),
      };
      if (mesh.colors) attributes.COLOR_0 = addAccessor(mesh.colors, "VEC4");
      if (uvs) attributes.TEXCOORD_0 = addAccessor(uvs, "VEC2");
      const indices = addAccessor(vertices <= 65535 ? new Uint16Array(mesh.indices) : mesh.indices, "SCALAR");
      return { attributes, indices, material };
    });
    return { name, primitives: gltfPrimitives };
  });
  const nodes = input.nodes.map(({ name, extras }, mesh) => ({ name, mesh, extras }));
  const materials = input.materials.map(material => ({
    name: material.name,
    pbrMetallicRoughness: {
      baseColorFactor: material.baseColor ?? [1, 1, 1, 1],
      roughnessFactor: material.roughness ?? 1,
      metallicFactor: material.metalness ?? 0,
    },
    ...(material.doubleSided === true ? { doubleSided: true } : {}),
  }));
  const json = {
    asset: { version: "2.0", generator: input.generator ?? "Forge procgen", extras: input.extras },
    scene: 0, scenes: [{ nodes: nodes.map((_, index) => index) }],
    nodes, meshes, materials, accessors, bufferViews, buffers: [{ byteLength: binLength }],
  };

  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonLength = align4(jsonBytes.length);
  const binStart = 28 + jsonLength;
  const paddedBinLength = align4(binLength);
  const length = binStart + paddedBinLength;
  if (length > 0xffffffff) throw new Error("GLB exceeds the 32-bit length limit");
  const bytes = new Uint8Array(length);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, MAGIC, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, length, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, JSON_CHUNK, true);
  bytes.set(jsonBytes, 20);
  bytes.fill(0x20, 20 + jsonBytes.length, binStart - 8);
  view.setUint32(binStart - 8, paddedBinLength, true);
  view.setUint32(binStart - 4, BIN_CHUNK, true);

  arrays.forEach((data, index) => {
    const start = binStart + bufferViews[index]!.byteOffset;
    const componentType = accessors[index]!.componentType;
    if (componentType === 5126) data.forEach((value, i) => view.setFloat32(start + i * 4, value, true));
    else if (componentType === 5123) data.forEach((value, i) => view.setUint16(start + i * 2, value, true));
    else data.forEach((value, i) => view.setUint32(start + i * 4, value, true));
  });
  return bytes;
}

/** Reads the GLB container and its embedded binary buffer. */
export function readGlb(bytes: Uint8Array): { json: any; bin: Uint8Array } {
  if (bytes.length < 12) throw new Error("Truncated GLB header");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== MAGIC) throw new Error("Invalid GLB magic");
  if (view.getUint32(4, true) !== 2) throw new Error("Unsupported GLB version");
  if (view.getUint32(8, true) !== bytes.length) throw new Error("GLB header length does not match input");
  let offset = 12;

  function nextChunk() {
    if (offset + 8 > bytes.length) throw new Error("Truncated GLB chunk header");
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    if (length % 4) throw new Error("GLB chunk length is not 4-byte aligned");
    const start = offset + 8;
    offset = start + length;
    if (offset > bytes.length) throw new Error("GLB chunk length exceeds input");
    return { type, data: bytes.subarray(start, offset) };
  }

  const jsonChunk = nextChunk();
  if (jsonChunk.type !== JSON_CHUNK) throw new Error("Missing GLB JSON chunk");
  let json: any;
  try {
    json = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(jsonChunk.data));
  } catch {
    throw new Error("Invalid JSON in GLB JSON chunk");
  }
  if (json?.asset?.version !== "2.0") throw new Error("Missing or unsupported glTF asset version");
  if (offset === bytes.length) throw new Error("Missing GLB BIN chunk");
  const binChunk = nextChunk();
  if (binChunk.type !== BIN_CHUNK) throw new Error("Missing GLB BIN chunk");
  const bin = binChunk.data;
  const buffer = json.buffers?.[0];
  const length = buffer?.byteLength;
  if (buffer?.uri !== undefined || !Number.isSafeInteger(length) || length < 1 || align4(length) !== bin.length) {
    throw new Error("GLB BIN chunk length does not match the embedded buffer");
  }
  if (bin.subarray(length).some(value => value !== 0)) throw new Error("GLB BIN chunk padding must be zero");
  while (offset < bytes.length) {
    const { type } = nextChunk();
    if (type === JSON_CHUNK || type === BIN_CHUNK) throw new Error("Duplicate GLB JSON or BIN chunk");
  }
  return { json, bin };
}

/** Copies a scalar or vector accessor out of the embedded buffer. */
export function glbAccessor(glb: { json: any; bin: Uint8Array }, accessor: number): AccessorData {
  const entry = glb.json.accessors?.[accessor];
  const bufferView = glb.json.bufferViews?.[entry?.bufferView];
  const label = `GLB accessor ${accessor}`;
  if (!entry || bufferView?.buffer !== 0 || entry.sparse !== undefined || !Object.hasOwn(COMPONENTS, entry.type)) {
    throw new Error(`${label}: invalid or unsupported accessor layout`);
  }
  const { componentType, count } = entry;
  const components = COMPONENTS[entry.type as AccessorType];
  const componentSize = componentType === 5123 ? 2 : 4;
  const elementSize = components * componentSize;
  const viewOffset = bufferView.byteOffset ?? 0;
  const accessorOffset = entry.byteOffset ?? 0;
  const { byteLength } = bufferView;
  const stride = bufferView.byteStride ?? elementSize;
  if (![viewOffset, accessorOffset, byteLength, count, stride].every(Number.isSafeInteger) ||
    viewOffset < 0 || accessorOffset < 0 || count < 1 || stride < elementSize ||
    viewOffset + byteLength > glb.bin.length || accessorOffset + (count - 1) * stride + elementSize > byteLength) {
    throw new Error(`${label}: data exceeds its buffer view or has invalid bounds`);
  }
  const view = new DataView(glb.bin.buffer, glb.bin.byteOffset + viewOffset + accessorOffset);
  const length = count * components;
  const data = componentType === 5126 ? new Float32Array(length)
    : componentType === 5123 ? new Uint16Array(length)
    : componentType === 5125 ? new Uint32Array(length) : undefined;
  if (!data) throw new Error(`${label}: unsupported component type ${componentType}`);
  const read = componentType === 5126 ? view.getFloat32 : componentType === 5123 ? view.getUint16 : view.getUint32;
  for (let element = 0; element < count; element++) {
    for (let component = 0; component < components; component++) {
      data[element * components + component] = read.call(view, element * stride + component * componentSize, true);
    }
  }
  return data;
}
