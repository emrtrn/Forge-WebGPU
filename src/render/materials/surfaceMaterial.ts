// A `forge.material` asset as a node material (architecture §4.9; phase 3
// decision 5). Forge WebGL's createThreeMaterialFromForgeDef
// (engine/render-three/materials.ts) rewritten with TSL slot nodes instead of
// standard map properties and `onBeforeCompile` patches:
//
// - Standard -> MeshStandardNodeMaterial, Basic -> MeshBasicNodeMaterial;
//   colour, roughness, metalness, opacity, emissive, alpha mode, alpha test
//   and side as Forge set them. Base colour, roughness, metalness, opacity and
//   emissive are read through the material's own properties
//   (`materialColor`, ...), so a placement tint is a clone with another
//   `color` (Forge's tintedMaterial).
// - Textures are sampled in the slot nodes with the material's UV tiling and
//   flip, not through `texture.repeat` / `texture.flipY`: a texture is shared by
//   every material that uses it (`texture:<guid>:<colour space>`). Forge's
//   flipY (true by default, off for glTF UVs) flips V of an uncompressed image;
//   a compressed one (KTX2) was never flipped on upload and is not here either.
// - Channels as in three: roughness G, metalness B, AO R, opacity G; ORM
//   replaces the three separate maps. The base colour map's alpha multiplies
//   opacity; with `useBaseColorAlphaForOpacity` on an opaque material without
//   an opacity map it becomes a cutout at `alphaTest` (Forge's rule).
// - Emissive is authored in ~1-based units and scaled by 1000 (Forge's
//   EMISSIVE_INTENSITY_SCALE, the counterpart of its bloom scale).
// - Layer blend: layer 1 over the base by a constant, the world-normal slope,
//   world height, a mask texture (base UV, no tiling) or a vertex colour
//   channel (an unpainted mesh reads 0 and keeps the base, as in Forge), with
//   `pow(value, contrast)`; colour, roughness, metalness, opacity, emissive,
//   AO and (with a base normal map) the normal are mixed.
// - Normal motion: two scrolling samples of the normal map, averaged, scaled.
// - Contributions (world mask, ...) last, in their fixed order.
// `sway` (5c) and `terrainDetail` (5a) are drawn in their phases.

import {
  attribute,
  clamp,
  dot,
  float,
  Fn,
  materialColor,
  materialEmissive,
  materialMetalness,
  materialOpacity,
  materialRoughness,
  mix,
  normalize,
  normalMap,
  normalWorldGeometry,
  positionWorld,
  pow,
  smoothstep,
  texture,
  time,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import {
  BackSide,
  Color,
  DoubleSide,
  FrontSide,
  MeshBasicNodeMaterial,
  MeshStandardNodeMaterial,
  type Node,
  type Texture,
} from "three/webgpu";
import { applyContributions, type MaterialContributions } from "./contributions.ts";

/** Authored emissive 1 -> 1000 (Forge WebGL's scale, matched by its bloom). */
export const EMISSIVE_INTENSITY_SCALE = 1000;

type Pair = readonly [number, number];

/** The fields of a `forge.material` the renderer reads (the schema is the feature's; render cannot import it). */
export interface SurfaceLayerData {
  readonly baseColor: string;
  readonly baseColorTexture: string | null;
  readonly normalTexture: string | null;
  readonly roughnessTexture: string | null;
  readonly metalnessTexture: string | null;
  readonly opacityTexture: string | null;
  readonly emissiveTexture: string | null;
  readonly aoTexture: string | null;
  readonly roughness: number;
  readonly metalness: number;
  readonly opacity: number;
  readonly emissive: string;
  readonly emissiveIntensity: number;
  readonly aoIntensity: number;
  readonly uvTiling: Pair;
}

export interface SurfaceMaterialData extends Omit<SurfaceLayerData, "baseColor"> {
  readonly materialType: "standard" | "basic";
  readonly baseColor: string;
  readonly maskTexture: string | null;
  readonly ormTexture: string | null;
  readonly useBaseColorAlphaForOpacity: boolean;
  readonly flipY: boolean;
  readonly alphaMode: "opaque" | "blend" | "mask";
  readonly alphaTest: number;
  readonly side: "front" | "back" | "double";
  readonly normalMotion: {
    readonly enabled: boolean;
    readonly primaryVelocity: Pair;
    readonly secondaryTiling: Pair;
    readonly secondaryVelocity: Pair;
    readonly strength: number;
  };
  readonly layerBlend: {
    readonly enabled: boolean;
    readonly layer1: SurfaceLayerData;
    readonly driver: "constant" | "slope" | "worldHeight" | "maskTexture" | "vertexColor";
    readonly amount: number;
    readonly min: number;
    readonly max: number;
    readonly contrast: number;
    readonly maskTexture: string | null;
    readonly vertexColorChannel: "r" | "g" | "b" | "a";
    readonly invertVertexColor: boolean;
  };
}

/** Texture slots by field path (`baseColorTexture`, `layerBlend.layer1.normalTexture`, `layerBlend.maskTexture`). */
export type SurfaceTextures = ReadonlyMap<string, Texture>;

/** Every texture slot a material names, with its GUID and colour space. */
export function surfaceTextureSlots(data: SurfaceMaterialData): Array<{ slot: string; guid: string; colorSpace: "srgb" | "linear" }> {
  const out: Array<{ slot: string; guid: string; colorSpace: "srgb" | "linear" }> = [];
  const add = (slot: string, guid: string | null, srgb = false): void => {
    if (guid !== null) out.push({ slot, guid, colorSpace: srgb ? "srgb" : "linear" });
  };
  const layerSlots = (prefix: string, layer: SurfaceLayerData): void => {
    add(`${prefix}baseColorTexture`, layer.baseColorTexture, true);
    add(`${prefix}normalTexture`, layer.normalTexture);
    add(`${prefix}roughnessTexture`, layer.roughnessTexture);
    add(`${prefix}metalnessTexture`, layer.metalnessTexture);
    add(`${prefix}opacityTexture`, layer.opacityTexture);
    add(`${prefix}emissiveTexture`, layer.emissiveTexture, true);
    add(`${prefix}aoTexture`, layer.aoTexture);
  };
  layerSlots("", data);
  add("ormTexture", data.ormTexture);
  if (data.layerBlend.enabled) {
    layerSlots("layerBlend.layer1.", data.layerBlend.layer1);
    add("layerBlend.maskTexture", data.layerBlend.maskTexture);
  }
  return out;
}

const DRIVER_SLOPE = "slope";
type FloatNode = Node<"float">;
type Vec3Node = Node<"vec3">;

/** A colour as a linear vec3 (the hex is sRGB; Color converts it). */
function linear(hex: string, scale = 1): Vec3Node {
  const value = new Color(hex).multiplyScalar(scale);
  return vec3(value.r, value.g, value.b);
}

/** A vertex colour channel, or 0 when the geometry has no `color` attribute (or no alpha for `a`): Forge's rule. */
function vertexColorChannel(channel: SurfaceMaterialData["layerBlend"]["vertexColorChannel"]): FloatNode {
  // The geometry's attributes are part of the material's program key, so this branches per geometry.
  return Fn((builder) => {
    const geometry = (builder as unknown as { geometry?: { getAttribute(name: string): { itemSize: number } | undefined } }).geometry;
    const color = geometry?.getAttribute("color");
    if (!color) return float(0);
    if (channel === "a") return color.itemSize === 4 ? attribute("color", "vec4").w : float(0);
    return color.itemSize === 4 ? attribute("color", "vec4")[channel] : attribute("color", "vec3")[channel];
  })() as unknown as FloatNode;
}

export function createSurfaceMaterial(
  data: SurfaceMaterialData,
  textures: SurfaceTextures,
  contributions: MaterialContributions = {},
): MeshStandardNodeMaterial | MeshBasicNodeMaterial {
  const map = (slot: string): Texture | undefined => textures.get(slot);
  /** UV of a texture: tiled, then V flipped for an uncompressed image when the material flips. */
  const uvFor = (tex: Texture, tiling: Pair): Node<"vec2"> => {
    const tiled = uv().mul(vec2(tiling[0], tiling[1]));
    const flip = data.flipY && (tex as Texture & { isCompressedTexture?: boolean }).isCompressedTexture !== true;
    return flip ? vec2(tiled.x, float(1).sub(tiled.y)) : tiled;
  };
  const sample = (tex: Texture, tiling: Pair) => texture(tex, uvFor(tex, tiling));

  const baseMap = map("baseColorTexture");
  const opacityMap = map("opacityTexture");
  const cutout = data.useBaseColorAlphaForOpacity && baseMap !== undefined && opacityMap === undefined && data.alphaMode === "opaque";
  const shared = {
    transparent: data.alphaMode === "blend" || data.opacity < 1 || opacityMap !== undefined,
    opacity: data.opacity,
    alphaTest: data.alphaMode === "mask" || cutout ? data.alphaTest : 0,
    depthWrite: data.alphaMode !== "blend",
    side: data.side === "back" ? BackSide : data.side === "double" ? DoubleSide : FrontSide,
  };
  const material = data.materialType === "basic" ? new MeshBasicNodeMaterial(shared) : new MeshStandardNodeMaterial(shared);
  material.color = new Color(data.baseColor);

  // Base colour: the material's colour times the map; the map's alpha goes into opacity (three's rule).
  const baseSample = baseMap ? sample(baseMap, data.uvTiling) : null;
  let colorRgb: Vec3Node = baseSample ? materialColor.mul(baseSample.rgb) : materialColor;
  const colorAlpha: FloatNode = baseSample ? baseSample.a : float(1);
  let opacityNode: FloatNode = opacityMap ? materialOpacity.mul(sample(opacityMap, data.uvTiling).g) : materialOpacity;

  if (material instanceof MeshBasicNodeMaterial) {
    material.colorNode = vec4(colorRgb, colorAlpha);
    material.opacityNode = opacityNode;
    applyContributions(material, contributions);
    return material;
  }

  material.roughness = data.roughness;
  material.metalness = data.metalness;
  material.emissive = new Color(data.emissive);
  material.emissiveIntensity = data.emissiveIntensity * EMISSIVE_INTENSITY_SCALE;

  const orm = map("ormTexture");
  const ormSample = orm ? sample(orm, data.uvTiling) : null;
  const roughnessMap = map("roughnessTexture");
  const metalnessMap = map("metalnessTexture");
  const aoMap = map("aoTexture");
  const emissiveMap = map("emissiveTexture");
  let roughnessNode: FloatNode = ormSample
    ? materialRoughness.mul(ormSample.g)
    : roughnessMap ? materialRoughness.mul(sample(roughnessMap, data.uvTiling).g) : materialRoughness;
  let metalnessNode: FloatNode = ormSample
    ? materialMetalness.mul(ormSample.b)
    : metalnessMap ? materialMetalness.mul(sample(metalnessMap, data.uvTiling).b) : materialMetalness;
  const aoSource: FloatNode | null = ormSample ? ormSample.r : aoMap ? sample(aoMap, data.uvTiling).r : null;
  let aoNode: FloatNode | null = aoSource ? aoSource.sub(1).mul(data.aoIntensity).add(1) : null;
  let emissiveNode: Vec3Node = emissiveMap ? materialEmissive.mul(sample(emissiveMap, data.uvTiling).rgb) : materialEmissive;

  // Normal: the map, or two scrolling samples of it averaged (normal motion), in 0..1 for normalMap.
  const normalTex = map("normalTexture");
  let normalNode: Vec3Node | null = null;
  if (normalTex) {
    const motion = data.normalMotion;
    let packed: Vec3Node;
    if (motion.enabled) {
      const base = uvFor(normalTex, data.uvTiling);
      const first = texture(normalTex, base.add(vec2(motion.primaryVelocity[0], motion.primaryVelocity[1]).mul(time))).xyz.mul(2).sub(1);
      const second = texture(
        normalTex,
        base.mul(vec2(motion.secondaryTiling[0], motion.secondaryTiling[1])).add(vec2(motion.secondaryVelocity[0], motion.secondaryVelocity[1]).mul(time)),
      ).xyz.mul(2).sub(1);
      packed = normalize(mix(first, second, 0.5)).mul(0.5).add(0.5);
    } else {
      packed = sample(normalTex, data.uvTiling).xyz;
    }
    const scale = motion.enabled ? motion.strength : 1;
    normalNode = normalMap(packed, vec2(scale, scale)) as unknown as Vec3Node;
  }

  const blend = data.layerBlend;
  if (blend.enabled) {
    const layer = blend.layer1;
    const layerMap = (slot: string): Texture | undefined => map(`layerBlend.layer1.${slot}`);
    const maskMap = map("layerBlend.maskTexture");
    let value: FloatNode;
    if (blend.driver === DRIVER_SLOPE) value = smoothstep(blend.min, blend.max, clamp(dot(normalWorldGeometry, vec3(0, 1, 0)), 0, 1));
    else if (blend.driver === "worldHeight") value = smoothstep(blend.min, blend.max, positionWorld.y);
    // The blend mask covers the whole surface: base UV, no tiling.
    else if (blend.driver === "maskTexture") value = maskMap ? texture(maskMap, uvFor(maskMap, [1, 1])).r : float(0);
    else if (blend.driver === "vertexColor") {
      const channel = vertexColorChannel(blend.vertexColorChannel);
      value = blend.invertVertexColor ? float(1).sub(channel) : channel;
    } else value = float(blend.amount);
    const f = clamp(pow(clamp(value, 0, 1), blend.contrast), 0, 1).toVar("forgeLayerBlend");

    const layerColorMap = layerMap("baseColorTexture");
    const layerColor = layerColorMap ? linear(layer.baseColor).mul(sample(layerColorMap, layer.uvTiling).rgb) : linear(layer.baseColor);
    colorRgb = mix(colorRgb, layerColor, f);
    const layerRoughnessMap = layerMap("roughnessTexture");
    roughnessNode = mix(roughnessNode, layerRoughnessMap ? float(layer.roughness).mul(sample(layerRoughnessMap, layer.uvTiling).g) : float(layer.roughness), f);
    const layerMetalnessMap = layerMap("metalnessTexture");
    metalnessNode = mix(metalnessNode, layerMetalnessMap ? float(layer.metalness).mul(sample(layerMetalnessMap, layer.uvTiling).b) : float(layer.metalness), f);
    const layerOpacityMap = layerMap("opacityTexture");
    opacityNode = mix(opacityNode, layerOpacityMap ? float(layer.opacity).mul(sample(layerOpacityMap, layer.uvTiling).g) : float(layer.opacity), f);
    if (layer.opacity < 1 || layerOpacityMap) material.transparent = true;
    const layerEmissive = linear(layer.emissive, layer.emissiveIntensity * EMISSIVE_INTENSITY_SCALE);
    const layerEmissiveMap = layerMap("emissiveTexture");
    emissiveNode = mix(emissiveNode, layerEmissiveMap ? layerEmissive.mul(sample(layerEmissiveMap, layer.uvTiling).rgb) : layerEmissive, f);
    const layerAoMap = layerMap("aoTexture");
    const layerAo: FloatNode = layerAoMap ? sample(layerAoMap, layer.uvTiling).r.sub(1).mul(layer.aoIntensity).add(1) : float(1);
    aoNode = mix(aoNode ?? float(1), layerAo, f);
    // The layer's normal only over a base normal map (Forge's USE_NORMALMAP_TANGENTSPACE condition).
    const layerNormalMap = layerMap("normalTexture");
    if (normalNode && layerNormalMap) {
      normalNode = normalize(mix(normalNode, normalMap(sample(layerNormalMap, layer.uvTiling).xyz) as unknown as Vec3Node, f));
    }
  }

  material.colorNode = vec4(colorRgb, colorAlpha);
  material.opacityNode = opacityNode;
  material.roughnessNode = roughnessNode;
  material.metalnessNode = metalnessNode;
  material.emissiveNode = emissiveNode;
  if (aoNode) material.aoNode = aoNode;
  if (normalNode) material.normalNode = normalNode;
  applyContributions(material, contributions);
  return material;
}
