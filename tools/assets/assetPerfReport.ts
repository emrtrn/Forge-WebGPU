// Ported from Forge WebGL tools/assetPerfReport.ts @ forge-webgl-final (04b5fb23); docs/PORT_LOG.md §2.
/**
 * Pure asset-performance analysis (Performance Infrastructure, P5.4).
 *
 * Side-effect free: every function here takes bytes/data and returns numbers, so
 * the whole cost model is unit-tested headless (see tools/engine-tests.ts). The
 * IO wrapper (tools/asset-perf-report.ts) walks `public/assets`, reads each file
 * into a Uint8Array, and calls these to build the offline report.
 *
 * GLB geometry is measured by parsing the container's JSON chunk directly and
 * summing accessor counts — no glTF runtime or heavy dependency. Texture
 * resolutions come from tiny PNG/JPEG header parsers. Thresholds are advisory:
 * the report never fails a build, it just flags the biggest costs.
 */

export interface ImageDimensions {
  readonly width: number;
  readonly height: number;
}

interface GltfAccessor {
  count?: number;
}

interface GltfPrimitive {
  mode?: number;
  indices?: number;
  attributes?: Record<string, number>;
}

interface GltfMesh {
  primitives?: GltfPrimitive[];
}

interface GltfImage {
  bufferView?: number;
  mimeType?: string;
  uri?: string;
}

interface GltfBufferView {
  buffer?: number;
  byteOffset?: number;
  byteLength?: number;
}

export interface GltfJson {
  accessors?: GltfAccessor[];
  meshes?: GltfMesh[];
  images?: GltfImage[];
  bufferViews?: GltfBufferView[];
}

export interface GltfGeometryStats {
  /** Triangles across every TRIANGLES-mode primitive (index count / 3, or positions / 3). */
  readonly triangles: number;
  /** Vertices summed from each primitive's POSITION accessor. */
  readonly vertices: number;
  /** Number of mesh primitives contributing geometry. */
  readonly primitives: number;
}

export interface GltfTextureStats {
  /** Embedded + referenced images declared in the glTF. */
  readonly count: number;
  /** Largest embedded image dimension found (0 when none decodable). */
  readonly maxDimension: number;
}

const GLB_MAGIC = 0x46546c67; // 'glTF'
const CHUNK_JSON = 0x4e4f534a; // 'JSON'
const GLTF_MODE_TRIANGLES = 4;

/**
 * Splits a `.glb` container into its parsed JSON chunk and BIN chunk. Returns
 * null when the bytes are not a valid binary glTF (wrong magic / truncated).
 */
export function parseGlb(bytes: Uint8Array): { json: GltfJson; bin: Uint8Array | null } | null {
  if (bytes.byteLength < 12) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC) return null;

  let offset = 12;
  let json: GltfJson | null = null;
  let bin: Uint8Array | null = null;
  while (offset + 8 <= bytes.byteLength) {
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    const dataStart = offset + 8;
    const dataEnd = dataStart + chunkLength;
    if (dataEnd > bytes.byteLength) break;
    if (chunkType === CHUNK_JSON) {
      const text = new TextDecoder().decode(bytes.subarray(dataStart, dataEnd));
      json = JSON.parse(text) as GltfJson;
    } else {
      // First non-JSON chunk is the BIN payload (glTF spec: at most one).
      if (!bin) bin = bytes.subarray(dataStart, dataEnd);
    }
    offset = dataEnd;
  }
  return json ? { json, bin } : null;
}

/**
 * Sums triangles + vertices over a glTF JSON's meshes. A triangle count uses the
 * primitive's index accessor when present (count / 3), else its POSITION accessor
 * (count / 3); non-triangle modes (lines/points) contribute vertices but no
 * triangles. Missing/short accessors are treated as zero (defensive).
 */
export function computeGltfGeometry(json: GltfJson): GltfGeometryStats {
  const accessors = json.accessors ?? [];
  const accessorCount = (index: number | undefined): number =>
    index === undefined ? 0 : (accessors[index]?.count ?? 0);

  let triangles = 0;
  let vertices = 0;
  let primitives = 0;
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      primitives += 1;
      const positionCount = accessorCount(primitive.attributes?.POSITION);
      vertices += positionCount;
      const mode = primitive.mode ?? GLTF_MODE_TRIANGLES;
      if (mode !== GLTF_MODE_TRIANGLES) continue;
      const indexCount = accessorCount(primitive.indices);
      const forTriangles = indexCount > 0 ? indexCount : positionCount;
      triangles += Math.floor(forTriangles / 3);
    }
  }
  return { triangles, vertices, primitives };
}

/**
 * Best-effort texture stats for a parsed GLB: counts declared images, and for
 * each embedded (bufferView) image decodes its PNG/JPEG header from the BIN chunk
 * to track the largest dimension. Images with a `uri` are counted but not sized
 * here (they are reported as standalone files instead).
 */
export function computeGltfTextures(json: GltfJson, bin: Uint8Array | null): GltfTextureStats {
  const images = json.images ?? [];
  const bufferViews = json.bufferViews ?? [];
  let maxDimension = 0;
  if (bin) {
    for (const image of images) {
      if (image.bufferView === undefined) continue;
      const bufferView = bufferViews[image.bufferView];
      if (!bufferView) continue;
      const start = bufferView.byteOffset ?? 0;
      const length = bufferView.byteLength ?? 0;
      if (length <= 0 || start + length > bin.byteLength) continue;
      const dims = imageDimensions(bin.subarray(start, start + length));
      if (dims) maxDimension = Math.max(maxDimension, dims.width, dims.height);
    }
  }
  return { count: images.length, maxDimension };
}

/** PNG image dimensions from the IHDR chunk, or null when not a PNG. */
export function pngDimensions(bytes: Uint8Array): ImageDimensions | null {
  // Signature (8 bytes) + length (4) + "IHDR" (4) + width (4) + height (4).
  if (bytes.byteLength < 24) return null;
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < sig.length; i += 1) if (bytes[i] !== sig[i]) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16, false), height: view.getUint32(20, false) };
}

/** JPEG image dimensions from the first SOF marker, or null when not a JPEG. */
export function jpegDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.byteLength < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;
  while (offset + 9 < bytes.byteLength) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1]!;
    // SOF0..SOF15, excluding the non-frame markers 0xC4 (DHT), 0xC8, 0xCC.
    const isSof =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      const height = view.getUint16(offset + 5, false);
      const width = view.getUint16(offset + 7, false);
      return { width, height };
    }
    // Skip this segment by its declared length.
    const segmentLength = view.getUint16(offset + 2, false);
    if (segmentLength < 2) return null;
    offset += 2 + segmentLength;
  }
  return null;
}

/** WebP (VP8/VP8L/VP8X) image dimensions, or null when not a RIFF/WEBP file. */
export function webpDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.byteLength < 30) return null;
  const riff = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!);
  const webp = String.fromCharCode(bytes[8]!, bytes[9]!, bytes[10]!, bytes[11]!);
  if (riff !== "RIFF" || webp !== "WEBP") return null;
  const format = String.fromCharCode(bytes[12]!, bytes[13]!, bytes[14]!, bytes[15]!);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (format === "VP8X") {
    const width = 1 + (bytes[24]! | (bytes[25]! << 8) | (bytes[26]! << 16));
    const height = 1 + (bytes[27]! | (bytes[28]! << 8) | (bytes[29]! << 16));
    return { width, height };
  }
  if (format === "VP8 ") {
    // Lossy: 16-bit width/height (14 low bits) after the 3-byte start code.
    const width = view.getUint16(26, true) & 0x3fff;
    const height = view.getUint16(28, true) & 0x3fff;
    return { width, height };
  }
  if (format === "VP8L") {
    const b0 = bytes[21]!;
    const b1 = bytes[22]!;
    const b2 = bytes[23]!;
    const b3 = bytes[24]!;
    const width = 1 + (((b1 & 0x3f) << 8) | b0);
    const height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
    return { width, height };
  }
  return null;
}

/** Dispatches to the PNG / JPEG / WebP parser by signature. Null when unknown. */
export function imageDimensions(bytes: Uint8Array): ImageDimensions | null {
  return pngDimensions(bytes) ?? jpegDimensions(bytes) ?? webpDimensions(bytes);
}

/** Advisory per-asset thresholds; a fork tunes these for its content budget. */
export interface AssetPerfThresholds {
  readonly glbTriangles: number;
  readonly glbBytes: number;
  readonly textureDimension: number;
  readonly textureBytes: number;
}

export const DEFAULT_ASSET_THRESHOLDS: AssetPerfThresholds = {
  glbTriangles: 250_000,
  glbBytes: 5_000_000,
  textureDimension: 2048,
  textureBytes: 2_000_000,
};

export interface GlbAssetStat {
  readonly path: string;
  readonly bytes: number;
  readonly triangles: number;
  readonly vertices: number;
  readonly textureCount: number;
  readonly maxTextureDimension: number;
}

export interface TextureAssetStat {
  readonly path: string;
  readonly bytes: number;
  /** Largest dimension, or 0 when the format's header could not be parsed. */
  readonly maxDimension: number;
}

/** Advisory warnings for one GLB (empty when it is within budget). */
export function evaluateGlbThresholds(
  stat: GlbAssetStat,
  thresholds: AssetPerfThresholds = DEFAULT_ASSET_THRESHOLDS,
): string[] {
  const warnings: string[] = [];
  if (stat.triangles > thresholds.glbTriangles) {
    warnings.push(`triangles ${stat.triangles} > ${thresholds.glbTriangles}`);
  }
  if (stat.bytes > thresholds.glbBytes) {
    warnings.push(`bytes ${stat.bytes} > ${thresholds.glbBytes}`);
  }
  if (stat.maxTextureDimension > thresholds.textureDimension) {
    warnings.push(`texture ${stat.maxTextureDimension}px > ${thresholds.textureDimension}px`);
  }
  return warnings;
}

/** Advisory warnings for one standalone texture (empty when within budget). */
export function evaluateTextureThresholds(
  stat: TextureAssetStat,
  thresholds: AssetPerfThresholds = DEFAULT_ASSET_THRESHOLDS,
): string[] {
  const warnings: string[] = [];
  if (stat.maxDimension > thresholds.textureDimension) {
    warnings.push(`${stat.maxDimension}px > ${thresholds.textureDimension}px`);
  }
  if (stat.bytes > thresholds.textureBytes) {
    warnings.push(`bytes ${stat.bytes} > ${thresholds.textureBytes}`);
  }
  return warnings;
}

/** The `n` items with the largest `key`, descending (stable for ties). */
export function topBy<T>(items: readonly T[], key: (item: T) => number, n: number): T[] {
  return [...items]
    .map((item, index) => ({ item, index }))
    .sort((a, b) => key(b.item) - key(a.item) || a.index - b.index)
    .slice(0, Math.max(0, n))
    .map((entry) => entry.item);
}
