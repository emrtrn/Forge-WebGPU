// Plants on the GPU-driven foliage path (vegetation plan PG2, §5.4 / §6.9):
// what the foliage binding (a foliage type with a family) and the plant
// binding (a single `forge.plant` actor) share in one world, so the same
// family looks the same in both (PV-WES-02):
//
// - one wind (render/foliage/foliageWind.ts) and simulation clock;
// - per family one set of appearance uniforms, resolved once a frame from
//   the live WES state (engine/plant/plantResponse.ts): leaves shown, tint,
//   snow on wood / leaves, wetness, wind flexibility;
// - the instance-shading hook that applies them (`plantShading`): a leaf
//   cluster draws while its stable shedding threshold (`_leaf`.x, the same id
//   at every LOD), shifted a little per instance, is below the leaves shown,
//   in the shadow too; the season tint with a per-leaf spread (`_leaf`.y);
//   snow on up-facing wood and leaves × the family's acceptance (undersides
//   stay dark); wetness darkens and smooths; the sway from the vertex weights
//   scaled by the family's flexibility.
// The impostor LOD takes the same appearance per pixel (impostorMaterial.ts).
// Season changes move uniforms only: no program is rebuilt and nothing is
// written back to the family, the level or the placements.

import { attribute, clamp, float, hash, max, mix, normalWorld, smoothstep, uniform, vec3, vec4 } from "three/tsl";
import { Color, Vector3, type Node, type NodeMaterial } from "three/webgpu";
import type { RenderWorldView } from "../sync/renderBinding.ts";
import { resolveWorldWind } from "../../engine/environment/worldWind.ts";
import { WorldEnvironmentKey } from "../../engine/environment/worldEnvironmentRuntime.ts";
import { resolvePlantAppearance, type PlantResponseProfile } from "../../engine/plant/plantResponse.ts";
import { createFoliageWind, type FoliageSway, type FoliageWind } from "../foliage/foliageWind.ts";
import type { InstanceShading } from "../gpu/instanceShading.ts";
import { applyImpostor, isImpostor } from "./impostorMaterial.ts";

/** What drawing needs of a `forge.plantFamily`. */
export interface PlantFamilyDraw {
  readonly id: string;
  /** Material GUIDs of slot 0 (wood) and slot 1 (leaves); a slot without one keeps the GLB's ("Wood" / "Leaf"). */
  readonly wood: string | null;
  readonly leaf: string | null;
  readonly response: PlantResponseProfile;
}

const floatUniform = (value: number) => uniform(value);
const vectorUniform = (value: Vector3) => uniform(value);
type FloatUniform = ReturnType<typeof floatUniform>;
type VectorUniform = ReturnType<typeof vectorUniform>;

interface Appearance {
  profile: PlantResponseProfile;
  readonly foliage: FloatUniform;
  readonly tint: VectorUniform;
  readonly snowWood: FloatUniform;
  readonly snowLeaf: FloatUniform;
  readonly wet: FloatUniform;
  readonly windFlex: FloatUniform;
}

/** A lit node material's roughness slot (NodeMaterial does not declare it). */
type Lit = { roughnessNode?: Node | null };

export interface PlantWorld {
  readonly wind: FoliageWind;
  /** Once a frame (the first binding to call it wins): wind, clock and every family's appearance. */
  sync(frame: object, dt: number, camera: { x: number; y: number; z: number } | null): void;
  /** The hook of a family's instances (with its sway, if any). */
  shading(family: PlantFamilyDraw, sway: FoliageSway | null, fadeEnd: number): InstanceShading;
  /** A drawn family's response edited (an editor preview): its uniforms follow, no program is rebuilt. */
  setResponse(family: string, response: PlantResponseProfile): void;
}

const worlds = new WeakMap<object, PlantWorld>();
const SNOW = new Color("#f2f5fa");

/** The plant drawing of one render world, made on first use. */
export function plantWorld(world: Pick<RenderWorldView, "services" | "componentsOf">): PlantWorld {
  const existing = worlds.get(world);
  if (existing) return existing;
  const wind = createFoliageWind();
  const appearances = new Map<string, Appearance>();
  let lastFrame: object | null = null;
  let seconds = 0;
  const snowColor = vectorUniform(new Vector3(SNOW.r, SNOW.g, SNOW.b));

  const appearanceOf = (family: PlantFamilyDraw): Appearance => {
    let entry = appearances.get(family.id);
    if (!entry) {
      entry = {
        profile: family.response,
        foliage: floatUniform(1), tint: vectorUniform(new Vector3(1, 1, 1)), snowWood: floatUniform(0), snowLeaf: floatUniform(0), wet: floatUniform(0), windFlex: floatUniform(1),
      };
      appearances.set(family.id, entry);
    } else {
      entry.profile = family.response;
    }
    return entry;
  };

  const resolve = (): void => {
    const runtime = world.services.get(WorldEnvironmentKey);
    const state = runtime?.controller.current() ?? null;
    for (const entry of appearances.values()) {
      const look = resolvePlantAppearance(entry.profile, state);
      entry.foliage.value = look.foliage;
      entry.tint.value.set(look.tint[0], look.tint[1], look.tint[2]);
      entry.snowWood.value = look.snowWood;
      entry.snowLeaf.value = look.snowLeaf;
      entry.wet.value = look.wet;
      entry.windFlex.value = look.windFlex;
    }
  };

  const plant: PlantWorld = {
    wind,
    sync(frame, dt, camera) {
      if (frame === lastFrame) return;
      lastFrame = frame;
      if (Number.isFinite(dt) && dt > 0) seconds += dt;
      wind.update(resolveWorldWind(world), seconds, camera ?? { x: 0, y: 0, z: 0 });
      resolve();
    },
    setResponse(family, response) {
      const entry = appearances.get(family);
      if (entry) entry.profile = response;
    },
    shading(family, sway, fadeEnd) {
      const look = appearanceOf(family);
      resolve();
      const swayHook = sway ? wind.shading(sway, fadeEnd, look.windFlex) : null;
      return (material, instance, role) => {
        // The impostor LOD (PG3): the same appearance per pixel, no sway.
        if (isImpostor(material)) {
          return applyImpostor(material, instance, role, {
            foliage: look.foliage, tint: look.tint, snowWood: look.snowWood, snowLeaf: look.snowLeaf, wet: look.wet, snowColor,
          });
        }
        const name = (material as { name?: string }).name ?? "";
        const isLeaf = name === family.leaf || (family.leaf === null && name === "Leaf");
        const isWood = name === family.wood || (family.wood === null && name === "Wood");
        if (isLeaf) leafNodes(material, look, instance.seed, snowColor);
        else if (isWood) woodNodes(material, look, snowColor);
        return swayHook?.(material, instance, role);
      };
    },
  };
  worlds.set(world, plant);
  return plant;
}

const rgbOf = (material: NodeMaterial): { rgb: Node<"vec3">; a: Node<"float"> } => {
  const color = material.colorNode as Node<"vec4"> | null;
  return color ? { rgb: color.xyz as Node<"vec3">, a: color.w as Node<"float"> } : { rgb: vec3(1, 1, 1), a: float(1) };
};

/** Snow on up-facing surfaces, then the wet darkening (shared by wood and leaves). */
function surfaceCover(rgb: Node<"vec3">, snow: Node<"float">, wet: Node<"float">, snowColor: Node<"vec3">, from: number, to: number): Node<"vec3"> {
  const up = smoothstep(from, to, max(normalWorld.y, 0));
  return mix(rgb.mul(float(1).sub(wet.mul(0.45))), snowColor, clamp(snow.mul(up), 0, 1));
}

function leafNodes(material: NodeMaterial, look: Appearance, seed: Node<"uint">, snowColor: Node<"vec3">): void {
  const leaf = attribute("_leaf", "vec2");
  // Which leaves fall first: the cluster's own threshold, shifted per instance so neighbours do not shed alike.
  // Kept inside (0, 1): no leaf at 0 shown (bare winter), every leaf at 1.
  const jitter = hash(seed).sub(0.5).mul(0.24);
  const keep = clamp(leaf.x.add(jitter), 0.001, 0.999).lessThan(look.foliage);
  material.maskNode = material.maskNode ? (material.maskNode as Node<"bool">).and(keep) : keep;
  material.maskShadowNode = material.maskShadowNode ? (material.maskShadowNode as Node<"bool">).and(keep) : keep;
  const { rgb, a } = rgbOf(material);
  const spread = float(0.85).add(leaf.y.mul(0.3));
  const tinted = rgb.mul(look.tint).mul(spread);
  material.colorNode = vec4(surfaceCover(tinted, look.snowLeaf, look.wet, snowColor, 0.15, 0.6), a);
  const lit = material as unknown as Lit;
  if (lit.roughnessNode) lit.roughnessNode = (lit.roughnessNode as Node<"float">).mul(float(1).sub(look.wet.mul(0.4)));
}

function woodNodes(material: NodeMaterial, look: Appearance, snowColor: Node<"vec3">): void {
  const { rgb, a } = rgbOf(material);
  material.colorNode = vec4(surfaceCover(rgb, look.snowWood, look.wet, snowColor, 0.35, 0.85), a);
  const lit = material as unknown as Lit;
  if (lit.roughnessNode) lit.roughnessNode = (lit.roughnessNode as Node<"float">).mul(float(1).sub(look.wet.mul(0.5)));
}
