// Paint layer textures as one array texture (plan phase 5a step 3): Forge
// WebGL's terrainLayerArray (engine/render-three/terrain/terrainLayerArray.ts
// @ forge-webgl-final), its rules unchanged.
//
// One sampler per layer cost up to eight texture bindings, which the sun's
// shadow cascades compete for (WebGPU's default is 16 sampled textures per
// stage); the array takes one whatever the layer count. Array layers share one
// size: every textured layer is resampled to the largest layer's longest edge
// (capped at 2048). UVs map the whole image either way, so a non-square or
// smaller texture looks the same, only its texel density changes. Rows are
// stored with row 0 at v = 0, honouring each layer's flip, so a layer samples
// exactly as its own texture did. RGB stays sRGB and alpha linear.
//
// Differences from Forge: textures here are uploaded unflipped and a material
// flips V itself, so the caller passes each layer's flip (Forge read
// `texture.flipY`); the roughness packing Forge drew through a canvas at load
// (materialAssets.packTerrainRoughness: the roughness map's green into the
// albedo's alpha, or into the base colour where there is no albedo) is
// `packTerrainLayerRoughness` on decoded pixels. A compressed (KTX2) texture
// cannot be read back: its layer draws with its colour, as in Forge.

import {
  DataArrayTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  RepeatWrapping,
  RGBAFormat,
  SRGBColorSpace,
  UnsignedByteType,
  type Texture,
} from "three/webgpu";

/** Largest layer edge. */
export const TERRAIN_LAYER_ARRAY_MAX_SIZE = 2048;

/** A layer's RGBA8 pixels, row 0 at v = 0. */
export interface TerrainLayerPixels {
  width: number;
  height: number;
  data: Uint8Array;
}

/** The shared edge of the array's layers: the largest source edge, capped. */
export function terrainLayerArraySize(sources: readonly { width: number; height: number }[]): number {
  let size = 1;
  for (const source of sources) size = Math.max(size, source.width, source.height);
  return Math.min(TERRAIN_LAYER_ARRAY_MAX_SIZE, size);
}

/** Bilinear resample of tiling RGBA8 pixels to `width × height`, wrapping at the edges. Same size is copied. */
function resampleWrapped(source: TerrainLayerPixels, outWidth: number, outHeight: number): Uint8Array {
  const { width, height, data } = source;
  if (width === outWidth && height === outHeight) return data.slice(0, outWidth * outHeight * 4);
  const out = new Uint8Array(outWidth * outHeight * 4);
  const scaleX = width / outWidth;
  const scaleY = height / outHeight;
  for (let y = 0; y < outHeight; y += 1) {
    const sy = (y + 0.5) * scaleY - 0.5;
    const y0f = Math.floor(sy);
    const fy = sy - y0f;
    const y0 = ((y0f % height) + height) % height;
    const y1 = (y0 + 1) % height;
    for (let x = 0; x < outWidth; x += 1) {
      const sx = (x + 0.5) * scaleX - 0.5;
      const x0f = Math.floor(sx);
      const fx = sx - x0f;
      const x0 = ((x0f % width) + width) % width;
      const x1 = (x0 + 1) % width;
      const a = (y0 * width + x0) * 4;
      const b = (y0 * width + x1) * 4;
      const c = (y1 * width + x0) * 4;
      const d = (y1 * width + x1) * 4;
      const o = (y * outWidth + x) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        const top = data[a + channel]! + (data[b + channel]! - data[a + channel]!) * fx;
        const bottom = data[c + channel]! + (data[d + channel]! - data[c + channel]!) * fx;
        out[o + channel] = Math.round(top + (bottom - top) * fy);
      }
    }
  }
  return out;
}

/**
 * Bilinear resample of tiling RGBA8 pixels to `size`², wrapping at the edges
 * (layers repeat across the terrain). Same-size input is copied unchanged.
 */
export function resampleTerrainLayer(source: TerrainLayerPixels, size: number): Uint8Array {
  return resampleWrapped(source, size, size);
}

/** Reverses pixel rows in place (a flipped layer's top row is v = 1). */
export function flipTerrainLayerRows(pixels: TerrainLayerPixels): TerrainLayerPixels {
  const row = pixels.width * 4;
  const scratch = new Uint8Array(row);
  for (let top = 0, bottom = pixels.height - 1; top < bottom; top += 1, bottom -= 1) {
    scratch.set(pixels.data.subarray(top * row, top * row + row));
    pixels.data.copyWithin(top * row, bottom * row, bottom * row + row);
    pixels.data.set(scratch, bottom * row);
  }
  return pixels;
}

/**
 * Forge's roughness packing on pixels: the albedo (or a fill of `color` the
 * roughness map's size when there is none) with the roughness map's green in
 * alpha, the map resampled to the albedo's size. Both upright, unflipped.
 */
export function packTerrainLayerRoughness(albedo: TerrainLayerPixels | null, roughness: TerrainLayerPixels, color: string): TerrainLayerPixels {
  const width = albedo?.width ?? roughness.width;
  const height = albedo?.height ?? roughness.height;
  const data = albedo ? albedo.data.slice(0, width * height * 4) : new Uint8Array(width * height * 4);
  if (!albedo) {
    const hex = Number.parseInt(color.replace("#", ""), 16) || 0;
    for (let i = 0; i < width * height; i += 1) data.set([(hex >> 16) & 255, (hex >> 8) & 255, hex & 255, 255], i * 4);
  }
  const rough = resampleWrapped(roughness, width, height);
  for (let i = 0; i < width * height; i += 1) data[i * 4 + 3] = rough[i * 4 + 1]!;
  return { width, height, data };
}

/** Decoded pixels per source texture and flip: rebuilds reuse them. */
const decoded = new WeakMap<Texture, Map<boolean, { version: number; pixels: TerrainLayerPixels | null }>>();

/**
 * A texture's RGBA8 pixels, row 0 at v = 0 (reversed when `flipY`; default the
 * texture's own), or null when they cannot be read (no image yet, a non-RGBA8
 * data texture, a compressed texture, no 2D canvas outside a browser).
 */
export function readTerrainLayerPixels(texture: Texture, flipY = texture.flipY): TerrainLayerPixels | null {
  let byFlip = decoded.get(texture);
  if (!byFlip) decoded.set(texture, (byFlip = new Map()));
  const cached = byFlip.get(flipY);
  if (cached && cached.version === texture.version) return cached.pixels;
  const pixels = decodeTexture(texture);
  if (pixels && flipY) flipTerrainLayerRows(pixels);
  byFlip.set(flipY, { version: texture.version, pixels });
  return pixels;
}

function decodeTexture(texture: Texture): TerrainLayerPixels | null {
  if ((texture as Texture & { isCompressedTexture?: boolean }).isCompressedTexture) return null;
  const image = texture.image as { width?: number; height?: number; data?: ArrayLike<number> } | null | undefined;
  const width = image?.width ?? 0;
  const height = image?.height ?? 0;
  if (!image || width < 1 || height < 1) return null;
  if (image.data) {
    // A DataTexture: raw bytes, row 0 first.
    if (texture.format !== RGBAFormat || texture.type !== UnsignedByteType || image.data.length < width * height * 4) return null;
    return { width, height, data: Uint8Array.from(image.data as ArrayLike<number>) };
  }
  const canvas = createCanvas(width, height);
  const context = canvas?.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null | undefined;
  if (!context) return null;
  try {
    context.drawImage(image as CanvasImageSource, 0, 0, width, height);
    // Canvas rows are top-down: row 0 is the image's top, v = 0 for an unflipped upload.
    return { width, height, data: new Uint8Array(context.getImageData(0, 0, width, height).data.buffer) };
  } catch {
    return null;
  }
}

function createCanvas(width: number, height: number): HTMLCanvasElement | OffscreenCanvas | null {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(width, height);
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/** One layer's source: decoded pixels, or a texture read on demand. */
export type TerrainLayerSource = TerrainLayerPixels | { readonly texture: Texture; readonly flipY: boolean } | null | undefined;

export interface TerrainLayerArray {
  /** Null when no layer has a readable source: the material then samples no layer texture. */
  texture: DataArrayTexture | null;
  /** Array layer per source, -1 for a layer drawn with its colour. */
  index: number[];
}

function pixelsOf(source: TerrainLayerSource): { pixels: TerrainLayerPixels; anisotropy: number } | null {
  if (!source) return null;
  if ("data" in source) return { pixels: source, anisotropy: 1 };
  const pixels = readTerrainLayerPixels(source.texture, source.flipY);
  return pixels ? { pixels, anisotropy: source.texture.anisotropy } : null;
}

/**
 * Packs the readable sources into one mipmapped, repeating array (sRGB, or
 * linear for normals). A source whose atlas size is 2 is cut into four
 * separate slices (its index is the first), so atlas neighbours never bleed
 * through filtering or mips.
 */
export function createTerrainLayerArray(sources: readonly TerrainLayerSource[], linear = false, atlasSizes: readonly number[] = []): TerrainLayerArray {
  const index = sources.map(() => -1);
  const slices: TerrainLayerPixels[] = [];
  let anisotropy = 1;
  sources.forEach((source, layer) => {
    const found = pixelsOf(source);
    if (!found) return;
    const { pixels } = found;
    index[layer] = slices.length;
    const grid = atlasSizes[layer] === 2 ? 2 : 1;
    if (grid === 1) slices.push(pixels);
    else {
      const width = Math.floor(pixels.width / grid);
      const height = Math.floor(pixels.height / grid);
      if (width < 1 || height < 1) {
        index[layer] = -1;
        return;
      }
      for (let y = 0; y < grid; y += 1) {
        for (let x = 0; x < grid; x += 1) {
          const data = new Uint8Array(width * height * 4);
          for (let row = 0; row < height; row += 1) {
            const start = ((y * height + row) * pixels.width + x * width) * 4;
            data.set(pixels.data.subarray(start, start + width * 4), row * width * 4);
          }
          slices.push({ width, height, data });
        }
      }
    }
    anisotropy = Math.max(anisotropy, found.anisotropy);
  });
  if (slices.length === 0) return { texture: null, index };
  const size = terrainLayerArraySize(slices);
  const texels = size * size * 4;
  const data = new Uint8Array(texels * slices.length);
  slices.forEach((slice, layer) => data.set(resampleTerrainLayer(slice, size), layer * texels));
  const texture = new DataArrayTexture(data, size, size, slices.length);
  texture.format = RGBAFormat;
  texture.type = UnsignedByteType;
  texture.colorSpace = linear ? NoColorSpace : SRGBColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = anisotropy;
  texture.needsUpdate = true;
  return { texture, index };
}
