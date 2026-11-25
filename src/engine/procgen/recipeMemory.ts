// The GPU memory a generated family takes, counted as the vegetation plan
// does (§8): compressed textures 1 byte per texel with the mip chain (4/3),
// meshes by their buffers.

export interface FamilyMemoryInput {
  /** Leaf atlas edge, pixels; null without one. */
  readonly atlasSize: number | null;
  /** Textures of that size (the sprays' colour and normals); default 1. */
  readonly atlasTextures?: number;
  /** Two textures per prototype, wood beside leaves; null without impostors. */
  readonly impostor: { readonly views: number; readonly frameSize: number } | null;
  readonly prototypes: number;
  /** Vertex + index bytes of one prototype's LODs. */
  readonly meshBytes: number;
}

/** Bytes. */
export interface FamilyMemory {
  readonly atlas: number;
  readonly impostors: number;
  readonly meshes: number;
  readonly total: number;
}

const MIP_CHAIN = 4 / 3;

export function familyMemory(input: FamilyMemoryInput): FamilyMemory {
  const atlas = input.atlasSize === null ? 0 : Math.round(input.atlasSize ** 2 * MIP_CHAIN * (input.atlasTextures ?? 1));
  const edge = input.impostor ? input.impostor.views * input.impostor.frameSize : 0;
  const impostors = Math.round(2 * (2 * edge) * edge * MIP_CHAIN * input.prototypes);
  const meshes = Math.round(input.meshBytes * input.prototypes);
  return { atlas, impostors, meshes, total: atlas + impostors + meshes };
}

export interface MeshBuffers {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly indices: Uint32Array | Uint16Array;
  readonly uvs?: Float32Array | undefined;
  readonly colors?: Float32Array | undefined;
  readonly attributes?: { readonly [name: string]: Float32Array | undefined } | undefined;
}

export function meshBytes(meshes: readonly MeshBuffers[]): number {
  let bytes = 0;
  for (const mesh of meshes) {
    bytes += mesh.positions.byteLength + mesh.normals.byteLength + mesh.indices.byteLength + (mesh.uvs?.byteLength ?? 0) + (mesh.colors?.byteLength ?? 0);
    for (const data of Object.values(mesh.attributes ?? {})) bytes += data?.byteLength ?? 0;
  }
  return bytes;
}

/** `1.3 MiB`, `640 KiB`, `12 B`. */
export function memoryText(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
  return bytes >= 1024 ? `${Math.round(bytes / 1024)} KiB` : `${Math.round(bytes)} B`;
}
