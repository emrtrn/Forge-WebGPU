// A world's surface weather on its static surfaces (plan phase W4,
// architecture §4.9): `forge.material` assets, a GLB's own materials, shapes,
// road meshes, HLOD proxies and foliage without a plant family (rocks) take
// the World Environment's wetness and snow by the same rule as terrain
// (surfaceCover.ts; the CPU twin engine/environment/surfaceResponse.ts).
// Plant families keep their own PG2 response.
//
// - One cover per world: its uniforms follow the World Environment each frame
//   (`update`), its shelter is the world's precipitation cover. Weather
//   changes write uniforms only; nothing compiles.
// - `material(source)` is the material as this world draws it: a weathered
//   copy (cached until the source is disposed, or the world goes), or the
//   source itself when it takes no weather: an unlit material, or a
//   `forge.material` whose `weather` takes neither wetness nor snow.
// - The colour is weathered after three's diffuse setup, so a placement's
//   instance colour and the mesh's vertex colours tint the surface, never the
//   snow (`setupDiffuseColor`, kept through `clone()` by the class); roughness,
//   metalness and (with a normal map) the normal through their node slots.
// - A material's response is read per draw (`materialReference`): every
//   weathered material of a world shares one program shape (two with plan
//   phase W5: a material with ambient occlusion dries late in its hollows,
//   one without by the noise alone).

import { MeshPhysicalNodeMaterial, MeshStandardNodeMaterial, type Material, type NodeMaterial } from "three/webgpu";
import * as TSLTyped from "three/tsl";
import { MATERIAL_WEATHER_DEFAULTS, materialTakesNoWeather, type MaterialWeather } from "../../engine/environment/surfaceResponse.ts";
import { createSurfaceCover, type SurfaceCoverInput, type SurfaceResponseNodes } from "./surfaceCover.ts";

type Node = any;
const TSL = TSLTyped as unknown as Record<string, any>;

/** Where a built `forge.material` keeps its `weather` group (surfaceMaterial.ts). */
export const MATERIAL_WEATHER_KEY = "forgeWeather";

const WETTING = "forgeWeatherWetting";
const POROSITY = "forgeWeatherPorosity";
const SNOW_ACCEPT = "forgeWeatherSnowAccept";
const RESPONSE_KEYS = [WETTING, POROSITY, SNOW_ACCEPT] as const;

interface WeatherHook {
  /** The world's cover in the program cache key: the hook's nodes are not node slots three hashes. */
  readonly key: string;
  /** Weathers `diffuseColor` after the material's own diffuse setup. */
  diffuse(): void;
}

type Weathered = NodeMaterial & { forgeWeather: WeatherHook | null } & Record<string, unknown>;
type NodeMaterialClass = new () => NodeMaterial;

const weatheredClasses = new WeakMap<NodeMaterialClass, NodeMaterialClass>();

/** `Base` with the weather hook; `clone()` keeps the class, so the batches' copies stay weathered. */
function weatheredClass(Base: NodeMaterialClass): NodeMaterialClass {
  const existing = weatheredClasses.get(Base);
  if (existing) return existing;
  const Weathered = class extends (Base as new () => NodeMaterial) {
    forgeWeather: WeatherHook | null = null;
    override setupDiffuseColor(builder: Parameters<NodeMaterial["setupDiffuseColor"]>[0]): void {
      super.setupDiffuseColor(builder);
      this.forgeWeather?.diffuse();
    }
    override customProgramCacheKey(): string {
      return `${super.customProgramCacheKey()}|weather:${this.forgeWeather?.key ?? ""}`;
    }
    override copy(source: Material): this {
      super.copy(source);
      const from = source as unknown as Record<string, unknown>;
      this.forgeWeather = (from.forgeWeather as WeatherHook | null | undefined) ?? null;
      for (const key of RESPONSE_KEYS) (this as unknown as Record<string, unknown>)[key] = from[key];
      return this;
    }
  };
  weatheredClasses.set(Base, Weathered as unknown as NodeMaterialClass);
  return Weathered as unknown as NodeMaterialClass;
}

/** Keys three's node library skips when it turns a plain material into a node material; and so do we. */
const NOT_COPIED = new Set(["uuid", "id", "type", "version", "_listeners"]);

/** A weathered node-material copy of `source`; null when it is unlit or not a standard / physical material. */
function weatheredCopy(source: Material): Weathered | null {
  const s = source as Material & Record<string, unknown>;
  if (s.isNodeMaterial === true) {
    if (s.isMeshStandardNodeMaterial !== true) return null;
    const copy = new (weatheredClass(source.constructor as NodeMaterialClass))() as Weathered;
    copy.copy(source);
    return copy;
  }
  if (s.isMeshStandardMaterial !== true) return null;
  // A plain glTF material (three converts it at draw time; we do it once, as three's NodeLibrary.fromMaterial does).
  const Base = (s.isMeshPhysicalMaterial === true ? MeshPhysicalNodeMaterial : MeshStandardNodeMaterial) as unknown as NodeMaterialClass;
  const copy = new (weatheredClass(Base))() as Weathered;
  for (const key in s) {
    if (NOT_COPIED.has(key) || key.startsWith("is")) continue;
    (copy as Record<string, unknown>)[key] = s[key];
  }
  copy.name = source.name;
  return copy;
}

export interface SurfaceWeather {
  /** Follows the World Environment (null: none; dry, snowless). Uniforms only. */
  update(input: SurfaceCoverInput | null): void;
  /** `source` as this world draws it: a weathered copy, or `source` itself when it takes no weather. */
  material(source: Material): Material;
  /** `material` over a part's material or materials. */
  materials<T extends Material | Material[]>(source: T): T;
  /** Weathered copies made so far (tests, measurement). */
  readonly size: number;
  dispose(): void;
}

/** The `weather` group a material carries (a built `forge.material`), or the defaults (a glTF material, a shape). */
export function materialWeatherOf(material: Material): MaterialWeather {
  const own = material.userData?.[MATERIAL_WEATHER_KEY] as Partial<MaterialWeather> | undefined;
  return own ? { ...MATERIAL_WEATHER_DEFAULTS, ...own } : MATERIAL_WEATHER_DEFAULTS;
}

export function createSurfaceWeather(sheltered?: (position: Node) => Node): SurfaceWeather {
  const cover = createSurfaceCover(sheltered);
  const { diffuseColor, faceDirection, float, materialAO, materialMetalness, materialNormal, materialReference, materialRoughness, normalView, normalWorldGeometry, positionWorld, vec4 } = TSL;
  // One graph for every weathered material of the world: the face's normal (both sides), its acceptance by reference.
  const response: SurfaceResponseNodes = {
    wetting: materialReference(WETTING, "float"),
    porosity: materialReference(POROSITY, "float"),
    snowAccept: materialReference(SNOW_ACCEPT, "float"),
  };
  const normal = normalWorldGeometry.mul(faceDirection);
  /** The factors and the diffuse hook, without and with the material's ambient occlusion as its hollows. */
  const shapes = new Map<"plain" | "ao", { factors: Node; hook: WeatherHook }>();
  const shapeOf = (material: NodeMaterial & { aoNode?: Node | null; aoMap?: unknown }) => {
    const aoNode = material.aoNode ?? null;
    const kind = aoNode || material.aoMap ? "ao" : "plain";
    // A forge.material's own AO node is per material: its graph is too (one program shape: textures are bindings).
    if (kind === "ao" && aoNode) return build(() => float(1).sub(aoNode), `${cover.key}:ao`);
    const existing = shapes.get(kind);
    if (existing) return existing;
    const made = build(kind === "ao" ? () => float(1).sub(materialAO) : undefined, `${cover.key}:${kind}`);
    shapes.set(kind, made);
    return made;
  };
  const build = (cavity: (() => Node) | undefined, key: string) => {
    const factors = cover.factors(normal, positionWorld, cavity);
    const hook: WeatherHook = {
      key,
      diffuse() {
        diffuseColor.assign(vec4(cover.look.color(diffuseColor.rgb, factors, response), diffuseColor.a));
      },
    };
    return { factors, hook };
  };

  const made = new Map<Material, Material>();
  const onSourceDisposed = (event: { target: Material }): void => {
    const source = event.target;
    source.removeEventListener("dispose", onSourceDisposed as never);
    const copy = made.get(source);
    made.delete(source);
    if (copy && copy !== source) copy.dispose();
  };

  const derive = (source: Material): Material => {
    // Already weathered (a copy handed back in): drawn as it is.
    if ((source as Partial<Weathered>).forgeWeather) return source;
    const weather = materialWeatherOf(source);
    if (materialTakesNoWeather(weather)) return source;
    const copy = weatheredCopy(source);
    if (!copy) return source;
    const { factors, hook } = shapeOf(copy);
    copy.forgeWeather = hook;
    copy[WETTING] = weather.wetting;
    copy[POROSITY] = weather.porosity;
    copy[SNOW_ACCEPT] = weather.snowAccept;
    const lit = copy as unknown as MeshStandardNodeMaterial & { normalMap?: unknown; bumpMap?: unknown };
    lit.roughnessNode = cover.look.roughness(lit.roughnessNode ?? materialRoughness, factors, response);
    lit.metalnessNode = cover.look.metalness(lit.metalnessNode ?? materialMetalness, factors, response);
    // Only a fine normal is flattened; `normalView` in the normal's own build is the geometry's.
    if (lit.normalNode || lit.normalMap || lit.bumpMap) lit.normalNode = cover.look.normal(lit.normalNode ?? materialNormal, normalView, factors, response);
    return copy;
  };

  const material = (source: Material): Material => {
    const existing = made.get(source);
    if (existing) return existing;
    const drawn = derive(source);
    made.set(source, drawn);
    if (drawn !== source) source.addEventListener("dispose", onSourceDisposed as never);
    return drawn;
  };

  return {
    update: (input) => cover.update(input),
    material,
    materials: <T extends Material | Material[]>(source: T): T => (Array.isArray(source) ? source.map(material) : material(source)) as T,
    get size() {
      let count = 0;
      for (const [source, drawn] of made) if (source !== drawn) count += 1;
      return count;
    },
    dispose() {
      for (const [source, drawn] of made) {
        source.removeEventListener("dispose", onSourceDisposed as never);
        if (drawn !== source) drawn.dispose();
      }
      made.clear();
    },
  };
}
