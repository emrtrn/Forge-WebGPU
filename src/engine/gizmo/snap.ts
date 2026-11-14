// The editor's snap settings and rounding (Forge WebGL editor/core/numeric.ts
// and SceneApp's snapSettings @ forge-webgl-final; plan phase 4 step 4,
// INV-A06). A dragged value lands on a multiple of the step when its snap is
// on; either way it is kept to two decimals, as Forge wrote it.

export interface SnapSettings {
  readonly move: number;
  readonly moveEnabled: boolean;
  /** Degrees. */
  readonly rotate: number;
  readonly rotateEnabled: boolean;
  readonly scale: number;
  readonly scaleEnabled: boolean;
}

/** Forge's defaults: every snap on, 1 m, 15°, 0.1. */
export const DEFAULT_SNAP: SnapSettings = { move: 1, moveEnabled: true, rotate: 15, rotateEnabled: true, scale: 0.1, scaleEnabled: true };

/** The toolbar's choices (Forge's snap widgets). */
export const SNAP_STEPS = {
  move: [0.25, 0.5, 1],
  rotate: [5, 10, 15, 30, 45, 90],
  scale: [0.05, 0.1, 0.25, 0.5, 1],
} as const;

/** Two decimals (Forge's `round`). */
export function round(value: number): number {
  return Number(value.toFixed(2));
}

/** `value` on the nearest multiple of `step` when enabled; rounded either way. */
export function snapValue(value: number, step: number, enabled = true): number {
  if (!enabled || !Number.isFinite(step) || step <= 0) return round(value);
  return round(Math.round(value / step) * step);
}

/** Reads stored settings, keeping the defaults for anything missing or out of shape. */
export function readSnapSettings(raw: unknown): SnapSettings {
  const source = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const step = (key: "move" | "rotate" | "scale"): number => {
    const value = source[key];
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : DEFAULT_SNAP[key];
  };
  const on = (key: "moveEnabled" | "rotateEnabled" | "scaleEnabled"): boolean => (typeof source[key] === "boolean" ? (source[key] as boolean) : DEFAULT_SNAP[key]);
  return { move: step("move"), moveEnabled: on("moveEnabled"), rotate: step("rotate"), rotateEnabled: on("rotateEnabled"), scale: step("scale"), scaleEnabled: on("scaleEnabled") };
}
