/**
 * A Forge WebGL material (`*.material.json`) as a `forge.material` asset
 * (architecture §4.6, phase 3 decision 5; user decisions 2026-11-13). Pure.
 *
 * The Forge file is read with Forge's own normaliser (`forgeMaterialDef.ts`),
 * so the converted material has the values Forge drew with: a legacy mask
 * moves into the ORM slot or the layer blend's mask, an opacity below 1
 * without a mode is a blend, numbers are clamped as Forge clamped them. Then:
 * - `name`, `schema`, `type` go (the asset's name is its file name);
 * - texture ids become GUIDs through `textureAsset`; an id that does not
 *   resolve leaves the slot empty and is reported;
 * - `{ x, y }` pairs become `[x, y]`;
 * - the groups Forge kept as null (`normalMotion`, `layerBlend`, `sway`) are
 *   written with `enabled: false` and their defaults; `terrainDetail` is off
 *   while it has no normal map; `terrainMetersPerRepeat` 0 when absent.
 *
 * Engine code cannot import a feature (layers), so the document's schema tag
 * is text here; the importer normalises it against the registry.
 */
import type { AssetId, JsonObject } from "../../core/index.ts";
import {
  defaultForgeMaterialNormalMotion,
  normalizeForgeMaterialDef,
  type ForgeMaterialDef,
  type ForgeMaterialLayer,
  type ForgeMaterialUvTiling,
} from "./forgeMaterialDef.ts";

export const MATERIAL_SCHEMA_TAG = "forge.material/1";

/** Forge's wind sway defaults (engine/environment/wind.ts `WIND_SWAY_DEFAULTS`), for a material without sway. */
const SWAY_OFF = { enabled: false, amplitude: 0.15, height: 1, frequency: 0.6 };

export interface ForgeMaterialConversion {
  /** The `forge.material` document: schema tag, id and field values. */
  readonly document: JsonObject;
  /** Texture ids the material names that have no GUID in the target, by slot path. */
  readonly missingTextures: ReadonlyArray<{ readonly slot: string; readonly textureId: string }>;
}

const pair = (value: ForgeMaterialUvTiling): [number, number] => [value.x, value.y];

/** `file name without .material.json`: Forge's fallback name, which the new asset no longer stores. */
export function forgeMaterialFallbackName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1).replace(/\.material\.json$/, "");
}

export function convertForgeMaterial(
  raw: unknown,
  id: AssetId,
  textureAsset: (forgeTextureId: string) => AssetId | null,
): ForgeMaterialConversion {
  const def: ForgeMaterialDef = normalizeForgeMaterialDef(raw);
  const missingTextures: { slot: string; textureId: string }[] = [];
  const tex = (slot: string, forgeId: string | null): AssetId | null => {
    if (forgeId === null) return null;
    const guid = textureAsset(forgeId);
    if (guid === null) missingTextures.push({ slot, textureId: forgeId });
    return guid;
  };
  const layer = (value: ForgeMaterialLayer, at: string): JsonObject => ({
    baseColor: value.baseColor,
    baseColorTexture: tex(`${at}.baseColorTexture`, value.baseColorTexture),
    normalTexture: tex(`${at}.normalTexture`, value.normalTexture),
    roughnessTexture: tex(`${at}.roughnessTexture`, value.roughnessTexture),
    metalnessTexture: tex(`${at}.metalnessTexture`, value.metalnessTexture),
    opacityTexture: tex(`${at}.opacityTexture`, value.opacityTexture),
    emissiveTexture: tex(`${at}.emissiveTexture`, value.emissiveTexture),
    aoTexture: tex(`${at}.aoTexture`, value.aoTexture),
    roughness: value.roughness,
    metalness: value.metalness,
    opacity: value.opacity,
    emissive: value.emissive,
    emissiveIntensity: value.emissiveIntensity,
    aoIntensity: value.aoIntensity,
    uvTiling: pair(value.uvTiling),
  });
  const motion = def.normalMotion ?? defaultForgeMaterialNormalMotion();
  const blend = def.layerBlend;
  const detail = def.terrainDetail;
  const document: JsonObject = {
    schema: MATERIAL_SCHEMA_TAG,
    id,
    materialType: def.materialType,
    baseColor: def.baseColor,
    baseColorTexture: tex("baseColorTexture", def.baseColorTexture),
    normalTexture: tex("normalTexture", def.normalTexture),
    maskTexture: tex("maskTexture", def.maskTexture),
    roughnessTexture: tex("roughnessTexture", def.roughnessTexture),
    metalnessTexture: tex("metalnessTexture", def.metalnessTexture),
    aoTexture: tex("aoTexture", def.aoTexture),
    opacityTexture: tex("opacityTexture", def.opacityTexture),
    useBaseColorAlphaForOpacity: def.useBaseColorAlphaForOpacity,
    emissiveTexture: tex("emissiveTexture", def.emissiveTexture),
    ormTexture: tex("ormTexture", def.ormTexture),
    uvTiling: pair(def.uvTiling),
    terrainMetersPerRepeat: def.terrainMetersPerRepeat ?? 0,
    flipY: def.flipY,
    roughness: def.roughness,
    metalness: def.metalness,
    aoIntensity: def.aoIntensity,
    opacity: def.opacity,
    alphaMode: def.alphaMode,
    alphaTest: def.alphaTest,
    side: def.side,
    emissive: def.emissive,
    emissiveIntensity: def.emissiveIntensity,
    normalMotion: {
      enabled: def.normalMotion !== null,
      primaryVelocity: pair(motion.primaryVelocity),
      secondaryTiling: pair(motion.secondaryTiling),
      secondaryVelocity: pair(motion.secondaryVelocity),
      strength: motion.strength,
    },
    layerBlend: blend
      ? {
        enabled: true,
        layer1: layer(blend.layer1, "layerBlend.layer1"),
        driver: blend.driver,
        amount: blend.amount,
        min: blend.min,
        max: blend.max,
        contrast: blend.contrast,
        maskTexture: tex("layerBlend.maskTexture", blend.maskTexture),
        vertexColorChannel: blend.vertexColorChannel,
        invertVertexColor: blend.invertVertexColor,
      }
      : { enabled: false },
    terrainDetail: detail
      ? {
        normalTexture: tex("terrainDetail.normalTexture", detail.normalTexture),
        atlasSize: detail.atlasSize === 2 ? "2x2" : "1x1",
        uvTiling: pair(detail.uvTiling),
        strength: detail.strength,
        coverage: detail.coverage,
        baseNormalStrength: detail.baseNormalStrength,
        patchSize: detail.patchSize,
        direction: detail.direction,
        directionVariation: detail.directionVariation,
        seed: detail.seed,
        roughness: detail.roughness,
      }
      : {},
    sway: def.sway ? { enabled: true, ...def.sway } : { ...SWAY_OFF },
  };
  return { document, missingTextures };
}
