// Ported from Forge WebGL input sources.
/**
 * Pure virtual-joystick math (DOM-free, testable).
 *
 * Shared by the on-screen touch controls: a drag offset in CSS pixels becomes a
 * normalized stick vector in `[-1, 1]` (screen Y is down-positive, matching a
 * gamepad's left-stick Y). The move pad thresholds the vector into the same
 * `Pad_LStick*` move codes the gamepad emits; the look pad feeds the vector as
 * the analog `Pad_RStick*` look axes. Reusing those codes means a project that
 * rebinds `move-*` / `look-*` reaches touch, gamepad, and keyboard alike.
 */

export interface JoystickVector {
  /** Horizontal deflection in [-1, 1] (right positive). */
  readonly x: number;
  /** Vertical deflection in [-1, 1] (down positive, screen-space). */
  readonly y: number;
  /** Deflection magnitude in [0, 1]. */
  readonly magnitude: number;
}

const ZERO: JoystickVector = { x: 0, y: 0, magnitude: 0 };

/**
 * Normalizes a raw drag offset (knob minus base, in px) to a stick vector,
 * clamping the magnitude to `radius` so a drag past the ring saturates at 1.
 */
export function joystickVector(dx: number, dy: number, radius: number): JoystickVector {
  const r = Math.max(1, radius);
  const len = Math.hypot(dx, dy);
  if (len === 0 || !Number.isFinite(len)) return ZERO;
  const clamped = Math.min(len, r);
  const scale = clamped / r / len;
  return { x: dx * scale, y: dy * scale, magnitude: clamped / r };
}

/**
 * The `Pad_LStick*` move codes active for a stick vector past `threshold`.
 * Up (negative Y) is forward, matching the gamepad left stick.
 */
export function joystickMoveCodes(vec: JoystickVector, threshold = 0.4): string[] {
  const codes: string[] = [];
  if (vec.y <= -threshold) codes.push("Pad_LStickUp");
  if (vec.y >= threshold) codes.push("Pad_LStickDown");
  if (vec.x <= -threshold) codes.push("Pad_LStickLeft");
  if (vec.x >= threshold) codes.push("Pad_LStickRight");
  return codes;
}
