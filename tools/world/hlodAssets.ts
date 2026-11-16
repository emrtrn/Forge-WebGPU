// Adapted from Forge WebGL tools/world/hlodBuild.ts @ forge-webgl-final.
import { posix } from "node:path";
import { createRequire } from "node:module";
import { NodeIO, getBounds, type Material, type Node, type Primitive, type Texture } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
import { averageLinearColor } from "../../src/engine/world/hlod.ts";
import type { Mat4 } from "../../src/engine/math/affine.ts";
import { contentPath, resourcePath, type HlodBuildIO, type HlodInput } from "./hlodInput.ts";
import { ensureNormals } from "./hlodMath.ts";

export type RGB = [number, number, number];
export const multiplyColor = (a: readonly number[], b: readonly number[]): RGB => [a[0]! * b[0]!, a[1]! * b[1]!, a[2]! * b[2]!];
export function linearColor(hex: string): RGB {
  const value = Number.parseInt(hex.slice(1), 16);
  return averageLinearColor(new Uint8Array([value >> 16 & 255, value >> 8 & 255, value & 255]), 3);
}

export interface AssetPart { primitive: Primitive; matrix: Mat4; color: RGB; slot: number }
export interface LoadedAsset { radius: number; parts: AssetPart[] }
export type Warn = (key: string, message: string) => void;

class ContentNodeIO extends NodeIO {
  readonly input: HlodBuildIO;
  constructor(input: HlodBuildIO) { super(); this.input = input; }
  protected override readURI(uri: string, type: "view"): Promise<Uint8Array<ArrayBuffer>>;
  protected override readURI(uri: string, type: "text"): Promise<string>;
  protected override async readURI(uri: string, type: "view" | "text"): Promise<Uint8Array<ArrayBuffer> | string> {
    const bytes = await this.input.read(resourcePath(uri));
    if (!bytes) throw new Error(`Missing content resource: ${uri}`);
    return type === "text" ? new TextDecoder().decode(bytes) : new Uint8Array(bytes);
  }
  protected override resolve(base: string, path: string): string {
    const decoded = decodeURIComponent(path).replaceAll("\\", "/");
    if (decoded.startsWith("/") || /^[a-z][a-z\d+.-]*:/i.test(decoded) || decoded.includes("\0")) throw new Error(`Path escapes content root: ${path}`);
    const resolved = resourcePath(posix.join(base, decoded));
    if (resolved.split("/")[0] !== base.split("/")[0]) throw new Error(`Path escapes content root: ${path}`);
    return resolved;
  }
  protected override dirname(uri: string): string { return posix.dirname(uri); }
}

export async function createHlodAssets(input: HlodInput, warn: Warn) {
  const nodeIO = new ContentNodeIO(input.io).registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ "meshopt.decoder": MeshoptDecoder }).setStrictResources(false).setLogger({
      debug() {}, info() {}, warn(message) { warn(`gltf:${message}`, message); }, error(message) { warn(`gltf:${message}`, message); },
    });
  // Forge's optional Draco support: no new dependency, warn only if an asset needs it.
  try {
    const draco = createRequire(import.meta.url)("draco3dgltf");
    nodeIO.registerDependencies({ "draco3d.decoder": await (draco.default ?? draco).createDecoderModule() });
  } catch { /* Unsupported compressed models are skipped by loadAsset. */ }
  await MeshoptDecoder.ready;
  const pathOf = (id: string): string | null => {
    const entry = input.index.entries.get(id);
    return entry ? contentPath(entry) : null;
  };
  const textureAverages = new Map<string | Texture, Promise<RGB>>();
  const loadSharp = () => import("sharp").then((module) => module.default);
  let sharpModule: ReturnType<typeof loadSharp> | undefined;
  const average = (key: string | Texture, bytes: () => Promise<Uint8Array | null>): Promise<RGB> => {
    let result = textureAverages.get(key);
    if (result) return result;
    result = (async (): Promise<RGB> => {
      let sharp: Awaited<ReturnType<typeof loadSharp>>;
      try { sharpModule ??= loadSharp(); sharp = await sharpModule; }
      catch { warn("sharp", "sharp is unavailable; texture colours use their material factor alone"); return [1, 1, 1]; }
      try {
        const image = await bytes();
        if (!image) throw new Error("Missing texture image");
        const pixels = await sharp(image).resize({ width: 32, height: 32, fit: "inside", withoutEnlargement: true })
          .toColourspace("srgb").ensureAlpha().raw().toBuffer();
        return averageLinearColor(pixels, 4);
      } catch (cause) {
        const label = typeof key === "string" ? key : key.getName() + key.getURI();
        warn(`texture:${label}`, `Texture ${label || "embedded image"}: ${String(cause)}; using factor alone`);
        return [1, 1, 1];
      }
    })();
    textureAverages.set(key, result);
    return result;
  };
  const slotColors = new Map<string, Promise<RGB | null>>();
  const slotColor = (id: string): Promise<RGB | null> => {
    let result = slotColors.get(id);
    if (result) return result;
    result = (async (): Promise<RGB | null> => {
      try {
        const def = input.index.jsonAssets.get(id);
        if (!def || def.schema !== "forge.material/1" || typeof def.baseColor !== "string") throw new Error("Material asset missing or unreadable");
        const factor = linearColor(def.baseColor);
        if (!def.baseColorTexture) return factor;
        const path = typeof def.baseColorTexture === "string" ? pathOf(def.baseColorTexture) : null;
        return multiplyColor(factor, await average(path ?? id, async () => path ? input.io.read(path) : null));
      } catch (cause) { warn(`material:${id}`, `Material ${id}: ${String(cause)}; using GLTF material`); return null; }
    })();
    slotColors.set(id, result);
    return result;
  };
  const gltfColor = async (material: Material | null, modelPath: string): Promise<RGB> => {
    if (!material) return [1, 1, 1];
    const factor = material.getBaseColorFactor();
    const texture = material.getBaseColorTexture();
    if (!texture) return [factor[0], factor[1], factor[2]];
    const uri = texture.getURI();
    const key = uri && !uri.startsWith("__") ? resourcePath(posix.join(posix.dirname(modelPath), decodeURIComponent(uri))) : texture;
    return multiplyColor(factor, await average(key, async () => texture.getImage()));
  };
  const assets = new Map<string, Promise<LoadedAsset | null>>();
  const loadAsset = (id: string): Promise<LoadedAsset | null> => {
    let result = assets.get(id);
    if (result) return result;
    result = (async () => {
      try {
        const path = pathOf(id);
        if (!path || input.index.entries.get(id)?.type !== "forge.model" || !/\.(glb|gltf)$/i.test(path)) throw new Error("Missing asset or unsupported model path");
        const doc = await nodeIO.read(resourcePath(path));
        const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
        if (!scene) throw new Error("GLTF has no scene");
        const bounds = getBounds(scene);
        const radius = Math.hypot(...bounds.max.map((value, index) => value - bounds.min[index]!)) / 2;
        const slots = input.index.metas.get(id)?.import.materials as readonly (string | null)[] | undefined;
        const materials = new Map<Material | null, number>();
        const parts: AssetPart[] = [];
        const nodes: Node[] = [];
        scene.traverse((node) => nodes.push(node));
        for (const node of nodes) for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
          const material = primitive.getMaterial();
          if (!materials.has(material)) materials.set(material, materials.size);
          if (primitive.getMode() !== 4 || !primitive.getAttribute("POSITION")) {
            warn(`primitive:${id}`, `Asset ${id}: skipped a non-triangle or undecodable primitive`); continue;
          }
          try { ensureNormals(doc, primitive); }
          catch (cause) { warn(`decode:${id}`, `Asset ${id}: ${String(cause)}; skipped undecodable primitive`); continue; }
          const slot = materials.get(material)!;
          const override = slots?.[slot] ? await slotColor(slots[slot]!) : null;
          parts.push({ primitive, slot, matrix: node.getWorldMatrix(), color: override ?? await gltfColor(material, path) });
        }
        return { radius, parts };
      } catch (cause) { warn(`asset:${id}`, `Asset ${id}: ${String(cause)}; skipped`); return null; }
    })();
    assets.set(id, result);
    return result;
  };
  return { nodeIO, loadAsset, slotColor };
}
