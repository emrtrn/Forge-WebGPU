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
// In dry, snowless weather the factors are zero behind one uniform branch and
// the cover is not read. Terrain applies it through the contribution order
// (`nodes`); every other static surface through the world's surface weather
// (surfaceWeather.ts).
import { Color, Vector2, Vector4 } from "three/webgpu";
import * as TSLTyped from "three/tsl";
import type { ResolvedWorldEnvironment } from "../../engine/environment/worldEnvironment.ts";
import type { WorldEnvironmentState } from "../../engine/environment/environmentResolve.ts";
import {
  COVER_READ_LIFT, COVER_READ_OUT, MATERIAL_WEATHER_DEFAULTS, SNOW_NORMAL_SOFTEN, SNOW_ROUGHNESS, WET_DARKEN, WET_DOWN_DRY,
  WET_ROUGHNESS, WET_UP_FULL, type SurfaceWind,
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

/** The default response (`MATERIAL_WEATHER_DEFAULTS`) as constants: terrain until its layers have their own (W5). */
export function defaultResponseNodes(): SurfaceResponseNodes {
  const { float } = TSL;
  return { wetting: float(MATERIAL_WEATHER_DEFAULTS.wetting), porosity: float(MATERIAL_WEATHER_DEFAULTS.porosity), snowAccept: float(MATERIAL_WEATHER_DEFAULTS.snowAccept) };
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

export function createSurfaceCover(sheltered?: (position: Node) => Node) {
  const { uniform } = TSL;
  /** x snow coverage, y wetness. */
  const amount = uniform(new Vector2());
  const snowColor = uniform(new Color("#f2f5fa"));
  const slope = uniform(new Vector2(Math.cos(55 * Math.PI / 180), Math.cos(30 * Math.PI / 180)));
  const altitude = uniform(new Vector2(-1000000, 1));
  /** x vertical share, y windward share × wind strength, zw the wind's XZ direction. */
  const share = uniform(new Vector4(0.35, 0, 1, 0));

  /** vec2(wet, snow) on a face (world normal, unit) before the material's acceptance; zero without a cover read in dry, snowless weather. */
  const factors = (normal: Node, position: Node): Node => {
    const { Fn, If, dot, float, length, max, min, smoothstep, vec2, vec3 } = TSL;
    return Fn(() => {
      const out = vec2(0, 0).toVar("forgeWeatherFactors");
      If(amount.x.add(amount.y).greaterThan(0), () => {
        const up = normal.y;
        const facing = max(dot(normal.xz, share.zw).negate(), 0).div(max(length(normal.xz), 0.0001));
        const side = min(share.x.add(share.y.mul(facing)), 1);
        const wetShare = side.mul(float(1).sub(smoothstep(0, WET_DOWN_DRY, up.negate()))).add(float(1).sub(side).mul(smoothstep(0, WET_UP_FULL, up)));
        const snowSlope = smoothstep(slope.x, max(slope.x.add(0.00001), slope.y), up);
        const height = smoothstep(altitude.x, altitude.x.add(altitude.y), position.y);
        // Read above the point and out along the face (surfaceResponse.ts `coverReadPoint`).
        const read = position.add(vec3(normal.x.mul(COVER_READ_OUT), COVER_READ_LIFT, normal.z.mul(COVER_READ_OUT)));
        const open = sheltered ? float(1).sub(sheltered(read)) : float(1);
        out.assign(vec2(amount.y.mul(wetShare).mul(open), amount.x.mul(snowSlope).mul(height).mul(open)));
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
      const floor = response.porosity.mul(WET_ROUGHNESS[1]).add(WET_ROUGHNESS[0]);
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
      amount.value.set(input?.state.snowCoverage ?? 0, input?.state.wetness ?? 0);
      if (!input) return;
      const s = input.settings;
      snowColor.value.set(s.snowColor);
      const start = Math.min(s.snowSlopeStartDeg, s.snowSlopeEndDeg);
      const end = Math.max(s.snowSlopeStartDeg, s.snowSlopeEndDeg);
      slope.value.set(Math.cos(end * Math.PI / 180), Math.cos(start * Math.PI / 180));
      altitude.value.set(s.snowMinAltitude ?? -1000000, Math.max(.001, s.snowAltitudeBlend));
      const wind = input.wind ?? null;
      share.value.set(
        clamp01(s.verticalWetting ?? 0.35),
        clamp01(s.windwardWetting ?? 0) * clamp01(wind?.strength ?? 0),
        wind?.direction[0] ?? 1,
        wind?.direction[1] ?? 0,
      );
    },
    /** Terrain (the contribution order's wetness slot): colour, roughness and (with a normal node) the normal from its geometric world normal. */
    nodes(color: Node, roughness: Node, baseNormal: Node) {
      const { positionWorld, transformNormalToView, vec4 } = TSL;
      const response = defaultResponseNodes();
      const f = factors(baseNormal, positionWorld);
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
