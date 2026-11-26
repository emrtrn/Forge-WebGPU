// WES visual cover, phase 5a step 7. Uniforms only: no paint, geometry,
// physical material or shader permutation changes as the cover advances.
// Under the precipitation cover (plan phase W3: a roof, an overhang) the
// surface stays dry and snowless (`sheltered`, render/sync/precipitationCover.ts).
import { Color, Vector2 } from "three/webgpu";
import * as TSLTyped from "three/tsl";
import type { ResolvedWorldEnvironment } from "../../engine/environment/worldEnvironment.ts";
import type { WorldEnvironmentState } from "../../engine/environment/environmentResolve.ts";

type Node = any;
const TSL = TSLTyped as unknown as Record<string, any>;

export interface SurfaceCoverInput {
  readonly state: WorldEnvironmentState["surface"];
  readonly settings: ResolvedWorldEnvironment["surface"];
}

export function createSurfaceCover(sheltered?: (position: Node) => Node) {
  const amount = TSL.uniform(new Vector2());
  const snowColor = TSL.uniform(new Color("#f2f5fa"));
  const slope = TSL.uniform(new Vector2(Math.cos(55 * Math.PI / 180), Math.cos(30 * Math.PI / 180)));
  const altitude = TSL.uniform(new Vector2(-1000000, 1));
  return {
    amount,
    update(input: SurfaceCoverInput | null) {
      amount.value.set(input?.state.snowCoverage ?? 0, input?.state.wetness ?? 0);
      if (!input) return;
      const s = input.settings;
      snowColor.value.set(s.snowColor);
      const start = Math.min(s.snowSlopeStartDeg, s.snowSlopeEndDeg);
      const end = Math.max(s.snowSlopeStartDeg, s.snowSlopeEndDeg);
      slope.value.set(Math.cos(end * Math.PI / 180), Math.cos(start * Math.PI / 180));
      altitude.value.set(s.snowMinAltitude ?? -1000000, Math.max(.001, s.snowAltitudeBlend));
    },
    nodes(color: Node, roughness: Node, baseNormal: Node) {
      const { float, max, smoothstep, mix, positionWorld } = TSL;
      // The geometric slope prevents fine layer normals from whitening the
      // underside of a slope. Winter alone never supplies snow coverage.
      const snowSlope = smoothstep(slope.x, max(slope.x.add(.00001), slope.y), baseNormal.y);
      const height = smoothstep(altitude.x, altitude.x.add(altitude.y), positionWorld.y);
      const open = sheltered ? float(1).sub(sheltered(positionWorld)) : float(1);
      const snow = amount.x.mul(snowSlope).mul(height).mul(open);
      const wet = amount.y.mul(open);
      const wetColor = color.mul(float(1).sub(wet.mul(.3)));
      const wetRoughness = mix(roughness, TSL.min(roughness, .12), wet);
      return { color: mix(wetColor, snowColor, snow), roughness: mix(wetRoughness, .9, snow) };
    },
  };
}

export type SurfaceCover = ReturnType<typeof createSurfaceCover>;
