import type { Vec3 } from "../../core/schema/fields.ts";
export type { Vec3 } from "../../core/schema/fields.ts";

export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0],
];
export function unit(v: Vec3): Vec3 {
  const length = Math.hypot(...v);
  return length > 0 ? [v[0] / length, v[1] / length, v[2] / length] : [0, 1, 0];
}
export const pointAt = (array: ArrayLike<number>, index: number): Vec3 => [
  array[index * 3]!, array[index * 3 + 1]!, array[index * 3 + 2]!,
];
