// Phase 5c step 4: `forge.foliageType` / `forge.landscapeFoliage` data → the pure
// generation inputs. The engine cannot import features, so the asset's fields are
// described structurally here (src/features/foliage/schema.ts is their owner).
// Forge WebGL kept optional fields absent; the schema keeps them as groups with
// an `enabled` switch or Forge's defaults, and this maps them back.
import type { FoliageTypeParams } from "./foliageTypeParams.ts";
import type { FoliageRuleParams } from "./proceduralFoliage.ts";

/** The `forge.foliageType` fields generation reads. */
export interface FoliageTypeAssetFields {
  readonly scaleMin: number;
  readonly scaleMax: number;
  readonly randomYaw: boolean;
  readonly alignToNormal: boolean;
  readonly zOffsetMin: number;
  readonly zOffsetMax: number;
  readonly slopeMin: number;
  readonly slopeMax: number;
  readonly heightLimit: { readonly enabled: boolean; readonly min: number; readonly max: number };
  readonly far: { readonly distance: number; readonly tint: number };
}

/** The fields of one `forge.landscapeFoliage` rule generation reads. */
export interface LandscapeFoliageRuleFields {
  readonly layer: string;
  readonly density: number;
  readonly minWeight: number;
  readonly seed: number;
  readonly height: { readonly enabled: boolean; readonly min: number; readonly max: number; readonly falloff: number };
  readonly slope: { readonly min: number; readonly max: number; readonly falloff: number };
  readonly noise: { readonly amount: number; readonly scale: number };
  readonly edgeScale: number;
  readonly groundRadius?: number;
  readonly edge: { readonly fadeIn: number; readonly maxWeight: number; readonly fadeOut: number };
  readonly stand: FoliageStandFields;
}

export interface FoliageStandFields {
  readonly enabled: boolean;
  readonly from: number;
  readonly to: number;
  readonly patch: number;
  readonly reach: number;
  readonly far: number;
  readonly tint: number;
  readonly detail: number;
}

/** Where a stand's models end and its far billboards take over, metres. */
export interface FoliageStandReach {
  readonly cullStart: number;
  readonly cullEnd: number;
  /** 0: no billboards. */
  readonly far: number;
  readonly tint: number;
  /** LOD distances are multiplied by it. */
  readonly detail: number;
}

/** Share of the reach over which a stand's models dissolve. */
const STAND_FADE = 0.15;

/** Null: the type's own distances. */
export function foliageStandReach(stand: FoliageStandFields): FoliageStandReach | null {
  if (!stand.enabled || !(stand.reach > 0)) return null;
  return {
    cullStart: stand.reach * (1 - STAND_FADE), cullEnd: stand.reach,
    far: stand.far > stand.reach ? stand.far : 0, tint: Math.min(1, Math.max(0, stand.tint)), detail: stand.detail,
  };
}

/** Forge's normalisation order: the max never goes below the min. */
function ordered(a: number, b: number): [number, number] {
  return a <= b ? [a, b] : [b, a];
}

export function foliageTypeParamsOf(data: FoliageTypeAssetFields): FoliageTypeParams {
  const scaleMin = Math.max(0.001, data.scaleMin);
  const scaleMax = Math.max(scaleMin, data.scaleMax);
  const [zOffsetMin, zOffsetMax] = ordered(data.zOffsetMin, data.zOffsetMax);
  const [slopeMin, slopeMax] = ordered(data.slopeMin, data.slopeMax);
  const farTint = Math.min(1, Math.max(0, data.far.tint));
  return {
    scaleMin: [scaleMin, scaleMin, scaleMin],
    scaleMax: [scaleMax, scaleMax, scaleMax],
    randomYaw: data.randomYaw,
    alignToNormal: data.alignToNormal,
    zOffsetMin,
    zOffsetMax,
    slopeMin,
    slopeMax,
    ...(data.heightLimit.enabled ? { heightMin: data.heightLimit.min, heightMax: data.heightLimit.max } : {}),
    ...(farTint > 0 ? { farTint } : {}),
  };
}

/** Bands at Forge's defaults stay absent, so an unbanded rule stays unbanded. */
export function foliageRuleParamsOf(rule: LandscapeFoliageRuleFields): FoliageRuleParams {
  return {
    layerId: rule.layer,
    density: rule.density,
    minWeight: rule.minWeight,
    seed: Math.floor(rule.seed) >>> 0,
    ...(rule.height.enabled ? { heightMin: rule.height.min, heightMax: rule.height.max } : {}),
    ...(rule.height.enabled && rule.height.falloff > 0 ? { heightFalloff: rule.height.falloff } : {}),
    ...(rule.slope.min > 0 ? { slopeMin: rule.slope.min } : {}),
    ...(rule.slope.max < 90 ? { slopeMax: rule.slope.max } : {}),
    ...(rule.slope.falloff > 0 ? { slopeFalloff: rule.slope.falloff } : {}),
    ...(rule.noise.amount > 0 ? { noiseAmount: rule.noise.amount, noiseScale: rule.noise.scale } : {}),
    ...(rule.edgeScale < 1 ? { edgeScale: rule.edgeScale } : {}),
    ...(rule.groundRadius ? { groundRadius: rule.groundRadius } : {}),
    ...(rule.edge.fadeIn > 0 ? { fadeIn: rule.edge.fadeIn } : {}),
    ...(rule.edge.maxWeight < 1 ? { maxWeight: rule.edge.maxWeight, fadeOut: rule.edge.fadeOut } : {}),
    ...(rule.stand.enabled ? { stand: { from: rule.stand.from, to: rule.stand.to, patch: rule.stand.patch } } : {}),
  };
}
