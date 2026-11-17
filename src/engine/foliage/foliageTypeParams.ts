// Ported from Forge WebGL engine/scene/foliage.ts @ forge-webgl-final (04b5fb23); generation fields only.
import type { Vec3 } from "../../core/schema/fields.ts";

/** Pure placement inputs, independent of the asset schema. */
export interface FoliageTypeParams {
  scaleMin: Vec3;
  scaleMax: Vec3;
  randomYaw: boolean;
  alignToNormal: boolean;
  zOffsetMin: number;
  zOffsetMax: number;
  slopeMin: number;
  slopeMax: number;
  heightMin?: number;
  heightMax?: number;
  farTint?: number;
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clampMin(value: number, min: number): number {
  return value < min ? min : value;
}

function clampRange(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function readBool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function readVec3(value: unknown, fallback: Vec3): Vec3 {
  if (Array.isArray(value) && value.length === 3) {
    return [
      finiteNumber(value[0], fallback[0]),
      finiteNumber(value[1], fallback[1]),
      finiteNumber(value[2], fallback[2]),
    ];
  }
  return [...fallback];
}

function readOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Forge defaults/clamps, restricted to the fields generation actually reads. */
export function normalizeFoliageTypeParams(input: Readonly<Record<string, unknown>>): FoliageTypeParams {
  const scaleMinValue = clampMin(readVec3(input.scaleMin, [1, 1, 1])[0], 0.001);
  const scaleMaxValue = Math.max(scaleMinValue, clampMin(readVec3(input.scaleMax, [1, 1, 1])[0], 0.001));
  const slopeMin = clampRange(finiteNumber(input.slopeMin, 0), 0, 90);
  const slopeMax = clampRange(finiteNumber(input.slopeMax, 90), 0, 90);
  const zOffsetMin = finiteNumber(input.zOffsetMin, 0);
  const zOffsetMax = finiteNumber(input.zOffsetMax, 0);
  const heightMin = readOptionalNumber(input.heightMin);
  const heightMax = readOptionalNumber(input.heightMax);
  const farTint = clampRange(finiteNumber(input.farTint, 0), 0, 1);
  return {
    scaleMin: [scaleMinValue, scaleMinValue, scaleMinValue],
    scaleMax: [scaleMaxValue, scaleMaxValue, scaleMaxValue],
    randomYaw: readBool(input.randomYaw, true),
    alignToNormal: readBool(input.alignToNormal, true),
    zOffsetMin: Math.min(zOffsetMin, zOffsetMax),
    zOffsetMax: Math.max(zOffsetMin, zOffsetMax),
    slopeMin: Math.min(slopeMin, slopeMax),
    slopeMax: Math.max(slopeMin, slopeMax),
    ...(heightMin !== undefined ? { heightMin } : {}),
    ...(heightMax !== undefined ? { heightMax } : {}),
    ...(farTint > 0 ? { farTint } : {}),
  };
}
