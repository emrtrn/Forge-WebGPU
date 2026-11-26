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
// Plan phase W5: drying is patchy. A point's wetness comes from the level's
// wetness and standing water by how late it dries: world-space noise and its
// hollowness (a material's ambient occlusion; terrain's concave ground)
// (`patchyWetness` / `dryingLateness`, the same formulas). Uniforms only.
// W5 refinement: snow takes the same pattern (`patchySnow`, hollows first),
// and each amount reaches only its spread (`wetSpread`, `snowSpread`; the live
// state is unchanged); `patchSize` scales the noise. The noise is built once.
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
  WET_DARKEN, WET_DOWN_DRY, WET_FILM_ROUGHNESS, WET_ROUGHNESS, WET_UP_FULL, patchSizeOf, poolSlopeWindow, type SurfaceWind,
} from "../../engine/environment/surfaceResponse.ts";

type Node = any;
const TSL = TSLTyped as unknown as Record<string, any>;

export interface SurfaceCoverInput {
  readonly state: WorldEnvironmentState["surface"];
  readonly settings: ResolvedWorldEnvironment["surface"];
  /** The wind the rain is driven by; absent: none (the windward share is off). */
  readonly wind?: SurfaceWind | null;
}

/** A material's response as shader values (constants or material references). */
export interface SurfaceResponseNodes {
  readonly wetting: Node;
  readonly porosity: Node;
  readonly snowAccept: Node;
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
 * surfaceResponse.ts `hash12` / `valueNoise` / `dryingLateness` / `patchyWetness` / `patchySnow`: the noise once per
 * pixel, wetness and snow from it. `amount` x snow, y wetness, z standing water (each × its spread); `noiseScale` the
 * reciprocal noise sizes (× patch size).
 */
function patchyNode(amount: Node, noiseScale: Node, position: Node, cavity: Node | null): { wet: Node; snow: Node } {
  const { dot, float, floor, fract, max, mix, smoothstep, vec2, vec3 } = TSL;
  const hash = (p: Node): Node => {
    const p3 = fract(vec3(p.x, p.y, p.x).mul(0.1031));
    const q = p3.add(dot(p3, p3.yzx.add(33.33)));
    return fract(q.x.add(q.y).mul(q.z));
  };
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
    wet: max(smoothstep(start, end, amount.y), late.mul(smoothstep(start, end, amount.z))),
    snow: smoothstep(start, end, amount.x),
  };
}

export function createSurfaceCover(sheltered?: (position: Node) => Node, terrain?: SurfaceCoverTerrain) {
  const { uniform } = TSL;
  /** x snow coverage, y wetness, z standing water (plan phase W5), each × its spread (`SurfacePattern`). */
  const amount = uniform(new Vector3());
  /** The reciprocal sizes of the two noise layers, × patch size. */
  const noiseScale = uniform(new Vector2(1 / DRY_NOISE[0][0], 1 / DRY_NOISE[1][0]));
  const snowColor = uniform(new Color("#f2f5fa"));
  const slope = uniform(new Vector2(Math.cos(55 * Math.PI / 180), Math.cos(30 * Math.PI / 180)));
  const altitude = uniform(new Vector2(-1000000, 1));
  /** The normal Y window of standing water's gloss (`poolSlopeWindow`). */
  const pool = uniform(new Vector2(...poolSlopeWindow()));
  /** x vertical share, y windward share × wind strength, zw the wind's XZ direction. */
  const share = uniform(new Vector4(0.35, 0, 1, 0));

  /**
   * vec3(wet, snow, pool) on a face (world normal, unit) before the material's acceptance; zero without a cover read
   * in dry, snowless weather. The wetness is patchy by how late the point dries (`cavity`: its hollowness); `pool` is
   * the share of standing water's gloss its slope allows (`poolShare`), the rest is a wet film's.
   */
  const factors = (normal: Node, position: Node, cavity?: CavityNode): Node => {
    const { Fn, If, dot, float, length, max, min, smoothstep, vec3 } = TSL;
    return Fn(() => {
      const out = vec3(0, 0, 0).toVar("forgeWeatherFactors");
      If(amount.x.add(amount.y).add(amount.z).greaterThan(0), () => {
        const patchy = patchyNode(amount, noiseScale, position, cavity ? cavity() : null);
        const up = normal.y;
        const facing = max(dot(normal.xz, share.zw).negate(), 0).div(max(length(normal.xz), 0.0001));
        const side = min(share.x.add(share.y.mul(facing)), 1);
        const wetShare = side.mul(float(1).sub(smoothstep(0, WET_DOWN_DRY, up.negate()))).add(float(1).sub(side).mul(smoothstep(0, WET_UP_FULL, up)));
        const snowSlope = smoothstep(slope.x, max(slope.x.add(0.00001), slope.y), up);
        const height = smoothstep(altitude.x, altitude.x.add(altitude.y), position.y);
        // Read above the point and out along the face (surfaceResponse.ts `coverReadPoint`).
        const read = position.add(vec3(normal.x.mul(COVER_READ_OUT), COVER_READ_LIFT, normal.z.mul(COVER_READ_OUT)));
        const open = sheltered ? float(1).sub(sheltered(read)) : float(1);
        out.assign(vec3(patchy.wet.mul(wetShare).mul(open), patchy.snow.mul(snowSlope).mul(height).mul(open), smoothstep(pool.x, pool.y, up)));
      });
      return out;
    })();
  };

  const wetOf = (f: Node, response: SurfaceResponseNodes): Node => f.x.mul(response.wetting);
  const snowOf = (f: Node, response: SurfaceResponseNodes): Node => f.y.mul(response.snowAccept);

  const look = {
    /** Linear rgb under the factors. */
    color(rgb: Node, f: Node, response: SurfaceResponseNodes): Node {
      const { float, mix } = TSL;
      const darken = float(1).sub(wetOf(f, response).mul(response.porosity.mul(WET_DARKEN[1]).add(WET_DARKEN[0])));
      return mix(rgb.mul(darken), snowColor, snowOf(f, response));
    },
    roughness(roughness: Node, f: Node, response: SurfaceResponseNodes): Node {
      const { min, mix } = TSL;
      const film = response.porosity.mul(WET_FILM_ROUGHNESS[1]).add(WET_FILM_ROUGHNESS[0]);
      const floor = mix(film, response.porosity.mul(WET_ROUGHNESS[1]).add(WET_ROUGHNESS[0]), f.z);
      return mix(mix(roughness, min(roughness, floor), wetOf(f, response)), SNOW_ROUGHNESS, snowOf(f, response));
    },
    metalness(metalness: Node, f: Node, response: SurfaceResponseNodes): Node {
      return TSL.mix(metalness, 0, snowOf(f, response));
    },
    /** A view-space normal flattened toward `geometry` (view space) under snow. */
    normal(normal: Node, geometry: Node, f: Node, response: SurfaceResponseNodes): Node {
      const { mix, normalize } = TSL;
      return normalize(mix(normal, geometry, snowOf(f, response).mul(SNOW_NORMAL_SOFTEN)));
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
        (input?.state.wetness ?? 0) * wetSpread,
        (input?.state.puddleFill ?? 0) * wetSpread,
      );
      if (!input || !s) return;
      const patchSize = patchSizeOf(s);
      noiseScale.value.set(1 / (DRY_NOISE[0][0] * patchSize), 1 / (DRY_NOISE[1][0] * patchSize));
      snowColor.value.set(s.snowColor);
      const start = Math.min(s.snowSlopeStartDeg, s.snowSlopeEndDeg);
      const end = Math.max(s.snowSlopeStartDeg, s.snowSlopeEndDeg);
      slope.value.set(Math.cos(end * Math.PI / 180), Math.cos(start * Math.PI / 180));
      altitude.value.set(s.snowMinAltitude ?? -1000000, Math.max(.001, s.snowAltitudeBlend));
      pool.value.set(...poolSlopeWindow(s.puddleMaxSlopeDeg));
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
        normal: (normal: Node) => look.normal(normal, transformNormalToView(baseNormal), f, response),
      };
    },
  };
}

export type SurfaceCover = ReturnType<typeof createSurfaceCover>;
