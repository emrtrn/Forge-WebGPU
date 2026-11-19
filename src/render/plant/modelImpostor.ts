// An imported model's impostor, baked at run time (plan 5c F3; user decision 2026-11-19: the PG3 format for
// every far billboard, decision 6 updated). The model's parts (their slot materials applied) become bake
// surfaces in template space: positions and normals through the part's matrix, the base colour map read back
// to RGBA (at most 256 px a side: far billboards never need more), the material's colour, alpha test and
// sidedness. The CPU rasterizer (engine/procgen/bake) draws the hemi-octahedral atlas in one layer, in a
// worker (the same thread where `Worker` is missing or fails), so the billboard is drawn by the same
// impostor material as a generated plant's (render/plant/impostorMaterial.ts, `layers: 1`).
//
// Besides the textures: the alpha-weighted mean colour (linear) and the crown radius (farthest vertex from
// the up axis), which the far terrain tint reads (engine/foliage/foliageFarHost.ts).

import {
  Color, DataTexture, DoubleSide, LinearFilter, LinearMipmapLinearFilter, Matrix3, RGBAFormat, SRGBColorSpace, UnsignedByteType, Vector2,
  Vector3, type BufferGeometry, type Material, type Matrix4, type Texture,
} from "three/webgpu";
import { bakeImpostorAtlas, type ImpostorAtlas, type ImpostorBakeOptions } from "../../engine/procgen/bake/impostorAtlas.ts";
import type { BakeSurface, BakeTexture } from "../../engine/procgen/bake/rasterizer.ts";
import type { ImpostorBakeRequest, ImpostorBakeResponse } from "../../engine/world/workers/impostorBakeWorker.ts";
import { surfaceBakeSource } from "../materials/surfaceMaterial.ts";
import type { ImpostorAtlasDraw } from "./impostorMaterial.ts";

/** The bake of an imported model's far billboard: the PG3 defaults (8 × 8 views, 128 px frames), one layer. */
export const MODEL_IMPOSTOR_BAKE: ImpostorBakeOptions = { views: 8, frameSize: 128, layers: 1, supersample: 2, dilate: 4 };
/** Longest side of a colour map as the bake reads it. */
const MAX_BAKE_TEXTURE = 256;

export interface ModelImpostor {
  readonly draw: ImpostorAtlasDraw;
  /** Alpha-weighted mean colour of the atlas, linear RGB. */
  readonly color: readonly [number, number, number];
  /** Farthest vertex from the template's up axis, metres at scale 1. */
  readonly radius: number;
  dispose(): void;
}

/** What the bake reads of a model part (`GpuBatchPart` / `InstancePart`). */
export interface ImpostorSourcePart {
  readonly geometry: BufferGeometry;
  readonly material: Material | Material[];
  readonly local: Matrix4;
}

interface MaterialLike {
  readonly map?: Texture | null;
  readonly color?: Color;
  readonly alphaTest?: number;
  readonly transparent?: boolean;
  readonly side?: number;
}

const decoded = new WeakMap<Texture, BakeTexture | null>();

/** A texture's image as RGBA8 (sRGB as stored), at most {@link MAX_BAKE_TEXTURE} a side; null when unreadable. */
function decodeTexture(texture: Texture): BakeTexture | null {
  if (decoded.has(texture)) return decoded.get(texture)!;
  let result: BakeTexture | null = null;
  try {
    const image = texture.image as { width?: number; height?: number; data?: unknown } | null;
    const width = image?.width ?? 0, height = image?.height ?? 0;
    if (image && width > 0 && height > 0) {
      if (image.data instanceof Uint8Array && image.data.length === width * height * 4) {
        result = { width, height, rgba: image.data };
      } else {
        const scale = Math.min(1, MAX_BAKE_TEXTURE / Math.max(width, height));
        const w = Math.max(1, Math.round(width * scale)), h = Math.max(1, Math.round(height * scale));
        const canvas = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, h) : Object.assign(document.createElement("canvas"), { width: w, height: h });
        const context = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
        if (context) {
          context.drawImage(image as CanvasImageSource, 0, 0, w, h);
          result = { width: w, height: h, rgba: new Uint8Array(context.getImageData(0, 0, w, h).data.buffer) };
        }
      }
    }
  } catch (error) {
    console.warn(`forge render: impostor bake could not read a texture: ${String(error)}`);
  }
  decoded.set(texture, result);
  return result;
}

/** The bake surfaces of a model's parts, in template space. */
export function impostorSurfaces(parts: readonly ImpostorSourcePart[]): BakeSurface[] {
  const surfaces: BakeSurface[] = [];
  const point = new Vector3();
  const uv = new Vector2();
  for (const part of parts) {
    const geometry = part.geometry;
    const position = geometry.getAttribute("position");
    if (!position) continue;
    const normal = geometry.getAttribute("normal");
    const uvAttribute = geometry.getAttribute("uv");
    const count = position.count;
    const positions = new Float32Array(count * 3);
    const normals = new Float32Array(count * 3);
    const normalMatrix = new Matrix3().getNormalMatrix(part.local);
    for (let i = 0; i < count; i += 1) {
      point.fromBufferAttribute(position, i).applyMatrix4(part.local);
      positions.set([point.x, point.y, point.z], i * 3);
      if (normal) point.fromBufferAttribute(normal, i).applyMatrix3(normalMatrix).normalize();
      else point.set(0, 1, 0);
      normals.set([point.x, point.y, point.z], i * 3);
    }
    const index = geometry.getIndex();
    const all = index ? Uint32Array.from(index.array as ArrayLike<number>) : Uint32Array.from({ length: count }, (_, i) => i);
    // A mirrored matrix flips the winding: single-sided triangles keep facing out.
    if (part.local.determinant() < 0) for (let i = 0; i + 2 < all.length; i += 3) [all[i + 1], all[i + 2]] = [all[i + 2]!, all[i + 1]!];
    const materials = Array.isArray(part.material) ? part.material : [part.material];
    const groups = Array.isArray(part.material) && geometry.groups.length > 0
      ? geometry.groups : [{ start: 0, count: all.length, materialIndex: 0 }];
    for (const group of groups) {
      const material = materials[group.materialIndex ?? 0] as (Material & MaterialLike) | undefined;
      if (!material || material.visible === false) continue;
      const indices = all.subarray(group.start, Math.min(all.length, group.start + group.count));
      if (indices.length < 3) continue;
      // A forge.material samples its map in its colour node (tiling, flip); a plain GLB material through `map`.
      const source = surfaceBakeSource(material);
      const map = source?.map ?? material.map ?? null;
      const texture = map ? decodeTexture(map) : null;
      let uvs: Float32Array | undefined;
      if (texture && uvAttribute) {
        if (!source) map!.updateMatrix();
        uvs = new Float32Array(count * 2);
        for (let i = 0; i < count; i += 1) {
          uv.set(uvAttribute.getX(i), uvAttribute.getY(i));
          if (source) uv.set(uv.x * source.tiling[0], uv.y * source.tiling[1]);
          else uv.applyMatrix3(map!.matrix);
          // The bake reads v = 0 at the first row; a flipped upload (or a flipping material) has it at the last.
          const flip = source ? source.flipV : map!.flipY;
          uvs[i * 2] = uv.x; uvs[i * 2 + 1] = flip ? 1 - uv.y : uv.y;
        }
      }
      const color = material.color ? material.color.clone().convertLinearToSRGB() : new Color(1, 1, 1);
      const alphaTest = (material.alphaTest ?? 0) > 0 ? material.alphaTest! : (material.transparent ? 0.5 : (texture ? 0.5 : 0));
      surfaces.push({
        mesh: { positions, normals, indices },
        ...(texture && uvs ? { texture, uvs } : {}),
        color: [color.r, color.g, color.b],
        alphaTest,
        layer: 0,
        doubleSided: material.side === DoubleSide,
      });
    }
  }
  return surfaces;
}

let worker: Worker | null | undefined;
let nextId = 0;
const pending = new Map<number, { resolve(atlas: ImpostorAtlas): void; reject(error: unknown): void }>();

function bakeWorker(): Worker | null {
  if (worker !== undefined) return worker;
  worker = null;
  if (typeof Worker === "undefined") return null;
  try {
    const created = new Worker(new URL("../../engine/world/workers/impostorBakeWorker.ts", import.meta.url), { type: "module" });
    const fail = (message: string): void => {
      console.warn(`forge render: impostor bake worker failed (${message}); baking on the main thread`);
      created.terminate();
      worker = null;
      for (const entry of pending.values()) entry.reject(new Error(message));
      pending.clear();
    };
    created.onmessage = ({ data }: MessageEvent<ImpostorBakeResponse>) => {
      if (data.id === null) { fail(data.type === "error" ? data.message : "unscoped answer"); return; }
      const entry = pending.get(data.id);
      if (!entry) return;
      pending.delete(data.id);
      if (data.type === "baked") entry.resolve(data.atlas);
      else entry.reject(new Error(data.message));
    };
    created.onerror = (event) => { event.preventDefault?.(); fail(event.message || "error"); };
    worker = created;
  } catch (error) {
    console.warn(`forge render: impostor bake worker unavailable (${String(error)}); baking on the main thread`);
  }
  return worker;
}

async function bake(surfaces: BakeSurface[]): Promise<ImpostorAtlas> {
  const target = bakeWorker();
  if (target) {
    try {
      return await new Promise<ImpostorAtlas>((resolve, reject) => {
        const id = (nextId += 1);
        pending.set(id, { resolve, reject });
        target.postMessage({ id, surfaces, options: MODEL_IMPOSTOR_BAKE } satisfies ImpostorBakeRequest);
      });
    } catch {
      // The worker failed: the same bake here.
    }
  }
  return bakeImpostorAtlas(surfaces, MODEL_IMPOSTOR_BAKE);
}

const srgbToLinear = (byte: number): number => {
  const c = byte / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** Alpha-weighted mean colour (linear) of RGBA8 sRGB pixels over columns [x0, x1); null when nothing is covered. */
function meanColor(rgba: Uint8Array, width: number, x0: number, x1: number): [number, number, number] | null {
  let r = 0, g = 0, b = 0, weight = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    const x = (i / 4) % width;
    if (x < x0 || x >= x1) continue;
    const alpha = rgba[i + 3]! / 255;
    if (alpha <= 0) continue;
    r += srgbToLinear(rgba[i]!) * alpha; g += srgbToLinear(rgba[i + 1]!) * alpha; b += srgbToLinear(rgba[i + 2]!) * alpha;
    weight += alpha;
  }
  return weight > 0 ? [r / weight, g / weight, b / weight] : null;
}

/**
 * The mean colour of a loaded impostor atlas (a generated plant's): the whole image, or its right half (the
 * leaves of a two-layer atlas). Read back at most 256 px a side; null when unreadable or empty.
 */
export function textureMeanColor(texture: Texture, part: "all" | "right"): [number, number, number] | null {
  const image = decodeTexture(texture);
  if (!image) return null;
  return meanColor(image.rgba, image.width, part === "right" ? Math.floor(image.width / 2) : 0, image.width);
}

function atlasTexture(data: Uint8Array, size: number, srgb: boolean): DataTexture {
  const texture = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
  if (srgb) texture.colorSpace = SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/** Bakes a model's far billboard; null for a model with nothing to draw. */
export async function bakeModelImpostor(parts: readonly ImpostorSourcePart[]): Promise<ModelImpostor | null> {
  const surfaces = impostorSurfaces(parts);
  if (surfaces.length === 0) return null;
  let radius = 0;
  for (const { mesh } of surfaces) {
    for (let i = 0; i < mesh.positions.length; i += 3) radius = Math.max(radius, Math.hypot(mesh.positions[i]!, mesh.positions[i + 2]!));
  }
  // Structured clone copies the surfaces; their arrays stay usable here.
  const atlas = await bake(surfaces);
  const layer = atlas.layers[0]!;
  const color = meanColor(layer.albedo, atlas.size, 0, atlas.size);
  if (!color) return null;
  const albedo = atlasTexture(layer.albedo, atlas.size, true);
  const normal = atlasTexture(layer.normal, atlas.size, false);
  return {
    draw: { albedo, normal, views: atlas.views, center: new Vector3(...atlas.center), radius: atlas.radius, layers: 1 },
    color,
    radius,
    dispose() { albedo.dispose(); normal.dispose(); },
  };
}
