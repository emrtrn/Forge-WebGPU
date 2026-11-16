// `forge.material` assets for the renderer (architecture §4.9, A6): a
// material GUID and a contribution set become one node material, keyed
// `material:<guid>:<signature>` in the host's cache and shared by every world
// and placement that asks for the same pair.
//
// The asset's JSON is read by GUID (dev server: `/__forge/read`) and
// normalised with the `forge.material` type the application hands the host
// (render cannot import a feature); its textures come from the cache too
// (`texture:<guid>:<colour space>`), counted by a host-level owner because
// they belong to the cached material, not to the world that first asked. A
// texture that fails to load is counted by the cache and its slot drawn
// without it, as Forge drew a missing map.

import { normalizeJsonAsset, type JsonAssetTypeDef } from "../../core/index.ts";
import type { Material, Texture } from "three/webgpu";
import { contributionSignature, type MaterialContributions } from "../materials/contributions.ts";
import { createSurfaceMaterial, surfaceTextureSlots, type SurfaceMaterialData } from "../materials/surfaceMaterial.ts";
import type { AssetUrls } from "./assetUrls.ts";
import { resourceKey, type ResourceOwner } from "./resourceCache.ts";
import type { TextureSource } from "./textures.ts";

export class MaterialNotFoundError extends Error {
  constructor(guid: string, why: string) {
    super(`Material ${guid}: ${why}.`);
    this.name = "MaterialNotFoundError";
  }
}

/** What a terrain paint layer draws from its material (plan phase 3 step 8; Forge's loadForgeMaterialLayer, read-only drawing). */
/** A material's `terrainDetail` (Forge's static normal stamps), with its normal map loaded. */
/** The `terrainDetail` fields of a `forge.material` (features/material/schema.ts). */
interface TerrainDetailFields {
  readonly normalTexture: string | null;
  readonly atlasSize: "1x1" | "2x2";
  readonly uvTiling: readonly [number, number];
  readonly strength: number;
  readonly coverage: number;
  readonly baseNormalStrength: number;
  readonly patchSize: number;
  readonly direction: number;
  readonly directionVariation: number;
  readonly seed: number;
  readonly roughness: number;
}

export interface TerrainLayerDetail {
  readonly normalTexture: Texture;
  /** 1: one image; 2: a 2 x 2 atlas of variants. */
  readonly atlasSize: 1 | 2;
  readonly uvTiling: readonly [number, number];
  readonly strength: number;
  readonly coverage: number;
  readonly baseNormalStrength: number;
  /** Metres. */
  readonly patchSize: number;
  /** Degrees. */
  readonly direction: number;
  /** Degrees. */
  readonly directionVariation: number;
  readonly seed: number;
  readonly roughness: number;
}

export interface TerrainLayerMaterial {
  readonly baseColor: string;
  /** The base colour texture (sRGB, shared through the cache); null without one or when it failed. */
  readonly baseColorTexture: Texture | null;
  /** Tangent-space normal map (linear); null without one or when it failed. */
  readonly normalTexture: Texture | null;
  /** Roughness map (linear, green); Forge packs it into the albedo's alpha. */
  readonly roughnessTexture: Texture | null;
  /** Static detail; null when off (no detail normal map, Forge's rule) or when its map failed. */
  readonly detail: TerrainLayerDetail | null;
  readonly uvTiling: readonly [number, number];
  readonly roughness: number;
  /** Metres per texture repeat; 0 uses the terrain's default tiling. */
  readonly terrainMetersPerRepeat: number;
  readonly flipY: boolean;
}

export interface SurfaceMaterials {
  /** The cache key of a material with these contributions. */
  key(guid: string, contributions?: MaterialContributions): string;
  /** Builds the material (the cache calls this once per key). */
  build(guid: string, contributions?: MaterialContributions): Promise<Material>;
  /** A terrain layer's inputs from the material; its texture is held by the host-level owner like a cached material's. */
  terrainLayer(guid: string): Promise<TerrainLayerMaterial>;
  /** Gives back the texture uses a built material holds (the cache evicted it, phase 5b). */
  releaseTextures(material: unknown): void;
}

/** The texture keys a built material holds under the texture owner. */
const TEXTURE_KEYS = "forgeTextureKeys";

export interface SurfaceMaterialOptions {
  readonly urls: AssetUrls;
  /** The `forge.material` type; null when the application has none (every material then fails). */
  readonly type: JsonAssetTypeDef | null;
  readonly textures: TextureSource;
  /** Holds the textures of cached materials. */
  readonly textureOwner: ResourceOwner;
  /** Development: a material with a loss is refused, as at load time elsewhere. */
  readonly strict: boolean;
  readonly fetchJson?: (url: string, headers: Readonly<Record<string, string>>) => Promise<unknown>;
  readonly warn?: (message: string, error: unknown) => void;
}

const defaultFetch = async (url: string, headers: Readonly<Record<string, string>>): Promise<unknown> => {
  const response = await fetch(url, { headers: { ...headers } });
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response.json();
};

export function createSurfaceMaterials(options: SurfaceMaterialOptions): SurfaceMaterials {
  const fetchJson = options.fetchJson ?? defaultFetch;
  const warn = options.warn ?? ((message, error) => console.warn(message, error));
  const data = async (guid: string): Promise<SurfaceMaterialData> => {
    if (options.type === null) throw new MaterialNotFoundError(guid, "no forge.material type is installed");
    const url = options.urls.url(guid);
    if (url === null || options.urls.type(guid) !== options.type.name) throw new MaterialNotFoundError(guid, "not a material in the asset index");
    const result = normalizeJsonAsset(options.type, await fetchJson(url, options.urls.headers), { strict: options.strict });
    if (!result.value || (options.strict && !result.ok)) {
      throw new MaterialNotFoundError(guid, result.issues.map((issue) => `${issue.path} ${issue.message}`).join("; ") || "unreadable");
    }
    return result.value as unknown as SurfaceMaterialData;
  };
  return {
    key: (guid, contributions = {}) => resourceKey.material(guid, contributionSignature(contributions)),
    async build(guid, contributions = {}) {
      const fields = await data(guid);
      const textures = new Map<string, Texture>();
      const held: string[] = [];
      await Promise.all(
        surfaceTextureSlots(fields).map(async ({ slot, guid: texture, colorSpace }) => {
          const key = resourceKey.texture(texture, colorSpace);
          try {
            textures.set(slot, await options.textureOwner.acquire(key, () => options.textures.load(texture, colorSpace)));
            held.push(key);
          } catch (error) {
            warn(`forge render: material ${guid} draws ${slot} without texture ${texture}`, error);
          }
        }),
      );
      const material = createSurfaceMaterial(fields, textures, contributions);
      material.name = guid;
      material.userData[TEXTURE_KEYS] = held;
      return material;
    },
    releaseTextures(material) {
      const data = (material as { userData?: Record<string, unknown> } | null)?.userData;
      const keys = data?.[TEXTURE_KEYS];
      if (!Array.isArray(keys)) return;
      for (const key of keys as string[]) options.textureOwner.release(key);
      data![TEXTURE_KEYS] = [];
    },
    async terrainLayer(guid) {
      const fields = (await data(guid)) as SurfaceMaterialData & { terrainMetersPerRepeat?: number; terrainDetail?: TerrainDetailFields | null };
      const load = async (texture: string | null | undefined, colorSpace: "srgb" | "linear", slot: string): Promise<Texture | null> => {
        if (!texture) return null;
        try {
          return await options.textureOwner.acquire(resourceKey.texture(texture, colorSpace), () => options.textures.load(texture, colorSpace));
        } catch (error) {
          warn(`forge render: terrain layer material ${guid} draws without its ${slot} ${texture}`, error);
          return null;
        }
      };
      const detailFields = fields.terrainDetail ?? null;
      const [baseColorTexture, normalTexture, roughnessTexture, detailTexture] = await Promise.all([
        load(fields.baseColorTexture, "srgb", "base colour texture"),
        load(fields.normalTexture, "linear", "normal map"),
        load(fields.roughnessTexture, "linear", "roughness map"),
        load(detailFields?.normalTexture, "linear", "detail normal map"),
      ]);
      const detail: TerrainLayerDetail | null = detailFields && detailTexture
        ? {
            normalTexture: detailTexture,
            atlasSize: detailFields.atlasSize === "2x2" ? 2 : 1,
            uvTiling: [detailFields.uvTiling[0], detailFields.uvTiling[1]],
            strength: detailFields.strength,
            coverage: detailFields.coverage,
            baseNormalStrength: detailFields.baseNormalStrength,
            patchSize: detailFields.patchSize,
            direction: detailFields.direction,
            directionVariation: detailFields.directionVariation,
            seed: detailFields.seed,
            roughness: detailFields.roughness,
          }
        : null;
      return {
        baseColor: fields.baseColor,
        baseColorTexture,
        normalTexture,
        roughnessTexture,
        detail,
        uvTiling: [fields.uvTiling[0], fields.uvTiling[1]],
        roughness: fields.roughness,
        terrainMetersPerRepeat: fields.terrainMetersPerRepeat ?? 0,
        flipY: fields.flipY,
      };
    },
  };
}
