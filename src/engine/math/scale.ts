import type { Vec3 } from "../../core/index.ts";

/** Linked scale keeps the current proportions. A zero source axis has no ratio: edit that axis only. */
export function linkedScaleAxis(scale: Vec3, axis: 0 | 1 | 2, value: number): Vec3 {
  const result: [number, number, number] = [...scale];
  const previous = scale[axis];
  if (previous !== 0) {
    const ratio = value / previous;
    for (const index of [0, 1, 2] as const) result[index] = scale[index] * ratio;
  }
  result[axis] = value;
  return result;
}
