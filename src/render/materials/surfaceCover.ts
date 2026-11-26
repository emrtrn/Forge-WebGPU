// WES visual cover: phase 5a step 7, v2 in plan phase W4. Uniforms only: no
// paint, geometry, physical material or shader permutation changes as the
// cover advances or the weather changes.
//
// The rule is engine/environment/surfaceResponse.ts (its CPU twin; the
// formulas below repeat it): the wetness falls by the face's world normal (up
// all of it, standing `verticalWetting` and more on the windward side, down
// none), snow by the slope window and the altitude floor; under the
// precipitation cover (plan phase W3: a roof, an overhang; `sheltered`,
// render/sync/precipitationCover.ts) neither. A material takes its share
// (`wetting`, `snowAccept`) and shows it by its porosity: porous darkens, hard
// turns glossy; snow is white, rough, not metal and flattens the fine normal.
//
// Plan phase W5, user decisions 2026-11-26: three layers of wet. The wetness
// darkens every face evenly, without gloss; the standing water makes wet
// patches by how late a point dries, world-space noise and its hollowness (a
// material's ambient occlusion; terrain's concave ground), up to `wetSpread`,
// with `wetGloss`, and puddles in their inner part (`puddleCore`), a mirror
// with the fine normal flattened (`patchyWater` / `dryingLateness`, the same
// formulas). Patches and puddles only on flat ground (`poolShare`). Snow
// takes the same pattern (`patchySnow`, hollows first) up to `snowSpread`;
// `patchSize` scales the noise. Uniforms only; the noise is built once.
//
// Plan phase W6: rain rings on a puddle (a wet patch faintly) and the wind's
// crests on a puddle (waterRipples.ts; the CPU twin
// engine/environment/rainRipples.ts) bend the normal; a material's
// `puddleAccept` scales its patches, puddles and so their ripples.
//
// In dry, snowless weather the factors are zero behind one uniform branch and
// the cover is not read. Terrain applies it through the contribution order
// (`nodes`, with its layers' blended response and its concavity); every other
// static surface through the world's surface weather (surfaceWeather.ts).
import { Color, Vector2, Vector3, Vector4 } from "three/webgpu";
import * as TSLTyped from "three/tsl";
import type { ResolvedWorldEnvironment } from "../../engine/environment/worldEnvironment.ts";
import type { WorldEnvironmentState } from "../../engine/environment/environmentResolve.ts";
import {
  COVER_READ_LIFT, COVER_READ_OUT, DRY_BAND, DRY_NOISE, DRY_NOISE_EDGE, MATERIAL_WEATHER_DEFAULTS, SNOW_NORMAL_SOFTEN, SNOW_ROUGHNESS,
  PUDDLE_ROUGHNESS, SURFACE_PATTERN_DEFAULTS, WET_DARKEN, WET_DOWN_DRY, WET_GLOSS, WET_UP_FULL, patchSizeOf, poolSlopeWindow, type SurfaceWind,
} from "../../engine/environment/surfaceResponse.ts";
import { RIPPLE_PATCH_SHARE, type WaterRippleSettings } from "../../engine/environment/rainRipples.ts";
import { createWaterRipples, hash12Node } from "./waterRipples.ts";

type Node = any;
const TSL = TSLTyped as unknown as Record<string, any>;

export interface SurfaceCoverInput {
  readonly state: WorldEnvironmentState["surface"];
  readonly settings: ResolvedWorldEnvironment["surface"] & Partial<WaterRippleSettings>;
  /** The wind the rain is driven by; absent: none (the windward share is off, the puddles' crests still). */
  readonly wind?: (SurfaceWind & { readonly gust?: number }) | null;
  /** Plan phase W6: the live rain, 0..1 (`livePrecipitation`); absent: none (no rings). */
  readonly rain?: number;
  /** Plan phase W6: simulation seconds, the ripples' clock; absent: 0. */
  readonly seconds?: number;
}

/** A material's response as shader values (constants or material references). */
export interface SurfaceResponseNodes {
  readonly wetting: Node;
  readonly porosity: Node;
  readonly snowAccept: Node;
  /** How much standing water it holds (wet patches, puddles, their ripples); absent: 1. */
  readonly puddleAccept?: Node;
}

/** The default response (`MATERIAL_WEATHER_DEFAULTS`) as constants. */
export function defaultResponseNodes(): SurfaceResponseNodes {
  const { float } = TSL;
  return { wetting: float(MATERIAL_WEATHER_DEFAULTS.wetting), porosity: float(MATERIAL_WEATHER_DEFAULTS.porosity), snowAccept: float(MATERIAL_WEATHER_DEFAULTS.snowAccept) };
}

/** A surface's hollowness (0..1), built where the factors need it (inside their weather branch). */
export type CavityNode = () => Node;

/** Terrain's own: its layers' blended response and its concave ground. */
export interface SurfaceCoverTerrain {
  readonly response: SurfaceResponseNodes;
  readonly cavity?: CavityNode;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * surfaceResponse.ts `hash12` / `valueNoise` / `dryingLateness` / `patchyWater` / `patchySnow`: the noise once per
 * pixel, wet patches, puddles and snow from it. `amount` x snow (× its spread), y wetness (even), z standing water
 * (× its spread); `core` the puddle's share of it; `noiseScale` the reciprocal noise sizes (× patch size).
 */
function patchyNode(amount: Node, core: Node, noiseScale: Node, position: Node, cavity: Node | null): { patch: Node; puddle: Node; snow: Node } {
  const { float, floor, fract, mix, smoothstep, vec2 } = TSL;
  const hash = hash12Node;
  const valueNoise = (p: Node): Node => {
    const i = floor(p);
    const f = fract(p);
    const u = f.mul(f).mul(f.mul(-2).add(3));
    const bottom = mix(hash(i), hash(i.add(vec2(1, 0))), u.x);
    const top = mix(hash(i.add(vec2(0, 1))), hash(i.add(vec2(1, 1))), u.x);
    return mix(bottom, top, u.y);
  };
  const noise = valueNoise(position.xz.mul(noiseScale.x)).mul(DRY_NOISE[0][1]).add(valueNoise(position.xz.mul(noiseScale.y)).mul(DRY_NOISE[1][1]));
  const patches = smoothstep(DRY_NOISE_EDGE[0], DRY_NOISE_EDGE[1], noise);
  const late = cavity ? patches.add(float(1).sub(patches).mul(cavity)) : patches;
  const start = float(1).sub(late).mul(1 - DRY_BAND);
  const end = start.add(DRY_BAND);
  return {
    patch: smoothstep(start, end, amount.z),
    puddle: smoothstep(start, end, amount.z.mul(core)),
    snow: smoothstep(start, end, amount.x),
  };
}

export function createSurfaceCover(sheltered?: (position: Node) => Node, terrain?: SurfaceCoverTerrain) {
  const { uniform } = TSL;
  /** x snow coverage × its spread, y wetness (the even film), z standing water × its spread (`SurfacePattern`). */
  const amount = uniform(new Vector3());
  /** The reciprocal sizes of the two noise layers, × patch size. */
  const noiseScale = uniform(new Vector2(1 / DRY_NOISE[0][0], 1 / DRY_NOISE[1][0]));
  const snowColor = uniform(new Color("#f2f5fa"));
  const slope = uniform(new Vector2(Math.cos(55 * Math.PI / 180), Math.cos(30 * Math.PI / 180)));
  const altitude = uniform(new Vector2(-1000000, 1));
  /** The normal Y window of wet patches and puddles (`poolSlopeWindow`). */
  const pool = uniform(new Vector2(...poolSlopeWindow()));
  /** x the puddle's share of a patch (`puddleCore`), y the wet patches' gloss (`wetGloss`). */
  const waterShape = uniform(new Vector2(SURFACE_PATTERN_DEFAULTS.puddleCore, WET_GLOSS));
  /** x vertical share, y windward share × wind strength, zw the wind's XZ direction. */
  const share = uniform(new Vector4(0.35, 0, 1, 0));
  const ripples = createWaterRipples();

  /**
   * vec4(wet, snow, patch, puddle) on a face (world normal, unit) before the material's acceptance; zero without a
   * cover read in dry, snowless weather. `wet` is the even darkening (the look takes at least the patch's), `patch` and `puddle` the
   * standing water the point holds by how late it dries (`cavity`: its hollowness) where its slope allows (`poolShare`).
   */
  const factors = (normal: Node, position: Node, cavity?: CavityNode): Node => {
    const { Fn, If, dot, float, length, max, min, smoothstep, vec3, vec4 } = TSL;
    return Fn(() => {
      const out = vec4(0, 0, 0, 0).toVar("forgeWeatherFactors");
      If(amount.x.add(amount.y).add(amount.z).greaterThan(0), () => {
        const patchy = patchyNode(amount, waterShape.x, noiseScale, position, cavity ? cavity() : null);
        const up = normal.y;
        const facing = max(dot(normal.xz, share.zw).negate(), 0).div(max(length(normal.xz), 0.0001));
        const side = min(share.x.add(share.y.mul(facing)), 1);
        const wetShare = side.mul(float(1).sub(smoothstep(0, WET_DOWN_DRY, up.negate()))).add(float(1).sub(side).mul(smoothstep(0, WET_UP_FULL, up)));
        const snowSlope = smoothstep(slope.x, max(slope.x.add(0.00001), slope.y), up);
        const height = smoothstep(altitude.x, altitude.x.add(altitude.y), position.y);
        // Read above the point and out along the face (surfaceResponse.ts `coverReadPoint`).
        const read = position.add(vec3(normal.x.mul(COVER_READ_OUT), COVER_READ_LIFT, normal.z.mul(COVER_READ_OUT)));
        const open = sheltered ? float(1).sub(sheltered(read)) : float(1);
        const flat = smoothstep(pool.x, pool.y, up).mul(open);
        const patch = patchy.patch.mul(flat);
        out.assign(vec4(amount.y.mul(wetShare).mul(open), patchy.snow.mul(snowSlope).mul(height).mul(open), patch, patchy.puddle.mul(flat)));
      });
      return out;
    })();
  };

  const water = (response: SurfaceResponseNodes): Node => (response.puddleAccept ? response.wetting.mul(response.puddleAccept) : response.wetting);
  const snowOf = (f: Node, response: SurfaceResponseNodes): Node => f.y.mul(response.snowAccept);
  const patchOf = (f: Node, response: SurfaceResponseNodes): Node => f.z.mul(water(response));
  const puddleOf = (f: Node, response: SurfaceResponseNodes): Node => f.w.mul(water(response));
  /** The darkening: the film, at least the patch's (surfaceResponse.ts `surfaceWeatherAt`). */
  const wetOf = (f: Node, response: SurfaceResponseNodes): Node => TSL.max(f.x.mul(response.wetting), patchOf(f, response));

  const look = {
    /** Linear rgb under the factors. */
    color(rgb: Node, f: Node, response: SurfaceResponseNodes): Node {
      const { float, mix } = TSL;
      const darken = float(1).sub(wetOf(f, response).mul(response.porosity.mul(WET_DARKEN[1]).add(WET_DARKEN[0])));
      return mix(rgb.mul(darken), snowColor, snowOf(f, response));
    },
    roughness(roughness: Node, f: Node, response: SurfaceResponseNodes): Node {
      const { float, min, mix } = TSL;
      // surfaceResponse.ts `wetPatchRoughness`: 1 - gloss at porosity 0.5, × (0.5 + porosity).
      const patchFloor = min(float(1).sub(waterShape.y).mul(response.porosity.add(0.5)), 1);
      const patched = mix(roughness, min(roughness, patchFloor), patchOf(f, response));
      const pooled = mix(patched, min(patched, PUDDLE_ROUGHNESS), puddleOf(f, response));
      return mix(pooled, SNOW_ROUGHNESS, snowOf(f, response));
    },
    metalness(metalness: Node, f: Node, response: SurfaceResponseNodes): Node {
      return TSL.mix(metalness, 0, snowOf(f, response));
    },
    /**
     * A view-space normal flattened toward `geometry` (view space) under snow and, fully, under a puddle's water; then
     * the puddle's ripples at `position` (world): rain rings (a wet patch faintly) and the wind's crests.
     */
    normal(normal: Node, geometry: Node, f: Node, response: SurfaceResponseNodes, position: Node): Node {
      const { cameraViewMatrix, float, max, mix, normalize, vec4 } = TSL;
      const snow = snowOf(f, response);
      const puddle = puddleOf(f, response);
      const flat = normalize(mix(normal, geometry, max(snow.mul(SNOW_NORMAL_SOFTEN), puddle)));
      const open = float(1).sub(snow);
      const slope = ripples.slope(position, max(puddle, patchOf(f, response).mul(RIPPLE_PATCH_SHARE)).mul(open), puddle.mul(open));
      return normalize(flat.add(cameraViewMatrix.mul(vec4(slope.x.negate(), 0, slope.y.negate(), 0)).xyz));
    },
  };

  return {
    amount,
    /** Identifies this cover's uniforms in a material's program cache key. */
    key: String(amount.id),
    factors,
    look,
    update(input: SurfaceCoverInput | null) {
      const s = input?.settings;
      const wetSpread = clamp01(s?.wetSpread ?? 1);
      amount.value.set(
        (input?.state.snowCoverage ?? 0) * clamp01(s?.snowSpread ?? 1),
        input?.state.wetness ?? 0,
        (input?.state.puddleFill ?? 0) * wetSpread,
      );
      ripples.update(input && s ? { rain: input.rain ?? 0, seconds: input.seconds ?? 0, settings: s, wind: input.wind ?? null } : null);
      if (!input || !s) return;
      const patchSize = patchSizeOf(s);
      noiseScale.value.set(1 / (DRY_NOISE[0][0] * patchSize), 1 / (DRY_NOISE[1][0] * patchSize));
      snowColor.value.set(s.snowColor);
      const start = Math.min(s.snowSlopeStartDeg, s.snowSlopeEndDeg);
      const end = Math.max(s.snowSlopeStartDeg, s.snowSlopeEndDeg);
      slope.value.set(Math.cos(end * Math.PI / 180), Math.cos(start * Math.PI / 180));
      altitude.value.set(s.snowMinAltitude ?? -1000000, Math.max(.001, s.snowAltitudeBlend));
      pool.value.set(...poolSlopeWindow(s.puddleMaxSlopeDeg));
      waterShape.value.set(clamp01(s.puddleCore ?? SURFACE_PATTERN_DEFAULTS.puddleCore!), clamp01(s.wetGloss ?? WET_GLOSS));
      const wind = input.wind ?? null;
      share.value.set(
        clamp01(s.verticalWetting ?? 0.35),
        clamp01(s.windwardWetting ?? 0) * clamp01(wind?.strength ?? 0),
        wind?.direction[0] ?? 1,
        wind?.direction[1] ?? 0,
      );
    },
    /**
     * Terrain (the contribution order's wetness slot): colour, roughness and (with a normal node) the normal from its
     * geometric world normal; its layers' response and concavity when given, else the defaults.
     */
    nodes(color: Node, roughness: Node, baseNormal: Node) {
      const { positionWorld, transformNormalToView, vec4 } = TSL;
      const response = terrain?.response ?? defaultResponseNodes();
      const f = factors(baseNormal, positionWorld, terrain?.cavity);
      const c = vec4(color);
      return {
        color: vec4(look.color(c.rgb, f, response), c.a),
        roughness: look.roughness(roughness, f, response),
        normal: (normal: Node) => look.normal(normal, transformNormalToView(baseNormal), f, response, positionWorld),
      };
    },
  };
}

export type SurfaceCover = ReturnType<typeof createSurfaceCover>;
