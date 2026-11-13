// Ported from Forge WebGL src/game/gameModes/cameraControl.ts @ forge-webgl-final (04b5fb23); docs/PORT_LOG.md §2.
/**
 * Pure, headless-testable camera-pawn movement math. No Three.js or DOM: the
 * default camera Game Mode projects the live camera's facing onto the XZ plane
 * and feeds it here to turn WASD into a world-space planar pan.
 *
 * Axis convention matches the engine's WASD bindings (forward -> the camera's
 * horizontal facing; right -> 90deg clockwise of it when viewed from above).
 */

/**
 * Which movement actions are held this tick. The four planar directions plus the
 * optional world-vertical pair (`up`/`down`) that mirrors the editor's E/Q fly
 * controls. Vertical is optional so existing planar-only callers stay valid.
 */
export interface CameraPanInput {
  readonly forward: boolean;
  readonly back: boolean;
  readonly left: boolean;
  readonly right: boolean;
  readonly up?: boolean;
  readonly down?: boolean;
}

/** World-space pan delta for one tick (`dy` is the world-vertical component). */
export interface CameraPanStep {
  readonly dx: number;
  readonly dy: number;
  readonly dz: number;
}

/**
 * World-space pan for one tick. `forwardX`/`forwardZ` are the camera's forward
 * direction projected onto the ground plane (need not be normalized); a
 * degenerate (zero-length) forward falls back to world -z. Horizontal keys move
 * along that ground facing; `up`/`down` move along world +y/-y, matching the
 * editor viewport's E/Q fly controls. The combined 3D input is normalized before
 * scaling by `speed * dt`, so diagonals (including vertical ones) are not faster
 * than straight lines. Opposing keys cancel; no input or non-positive speed/dt
 * yields a zero delta.
 */
export function cameraPlanarPan(
  forwardX: number,
  forwardZ: number,
  input: CameraPanInput,
  speed: number,
  dt: number,
): CameraPanStep {
  const forwardAmount = (input.forward ? 1 : 0) - (input.back ? 1 : 0);
  const rightAmount = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const verticalAmount = (input.up ? 1 : 0) - (input.down ? 1 : 0);
  const magnitude = Math.hypot(forwardAmount, rightAmount, verticalAmount);
  if (magnitude === 0) return { dx: 0, dy: 0, dz: 0 };
  const distance = speed * dt;
  if (!(distance > 0)) return { dx: 0, dy: 0, dz: 0 };

  // Normalized horizontal forward; fall back to world -z when the camera looks
  // straight down (zero-length XZ projection).
  const length = Math.hypot(forwardX, forwardZ);
  const fx = length > 1e-6 ? forwardX / length : 0;
  const fz = length > 1e-6 ? forwardZ / length : -1;
  // Horizontal right = cross(forward, worldUp) projected to XZ = (-fz, fx).
  const rx = -fz;
  const rz = fx;

  const scale = distance / magnitude;
  return {
    dx: (fx * forwardAmount + rx * rightAmount) * scale,
    dy: verticalAmount * scale,
    dz: (fz * forwardAmount + rz * rightAmount) * scale,
  };
}

/** Yaw/pitch look angles in radians (engine convention: yaw 0 looks toward -z). */
export interface LookAngles {
  readonly yaw: number;
  readonly pitch: number;
}

export interface MouseLookSettings {
  readonly sensitivity?: number | undefined;
  readonly invertY?: boolean | undefined;
}

/** Default right-drag look sensitivity (radians per pixel of pointer travel). */
export const DEFAULT_LOOK_SENSITIVITY = 0.003;
/** Default analog look rate, in pointer-pixel-equivalent units per second. */
export const DEFAULT_LOOK_AXIS_RATE = 240;
/** Pitch clamp so the camera never flips past straight up/down. */
export const DEFAULT_PITCH_LIMIT = Math.PI * 0.47;

function clampPitch(pitch: number, limit: number): number {
  return pitch < -limit ? -limit : pitch > limit ? limit : pitch;
}

/**
 * Applies a pointer-drag delta to look angles. Matches the editor camera's feel:
 * moving right turns right (yaw decreases), moving down looks down, and pitch is
 * clamped so the view cannot flip over the poles.
 */
export function applyMouseLook(
  angles: LookAngles,
  dx: number,
  dy: number,
  sensitivity: number = DEFAULT_LOOK_SENSITIVITY,
  pitchLimit: number = DEFAULT_PITCH_LIMIT,
): LookAngles {
  return {
    yaw: angles.yaw - dx * sensitivity,
    pitch: clampPitch(angles.pitch - dy * sensitivity, pitchLimit),
  };
}

/** Applies controller-configured sensitivity and vertical inversion to mouse look. */
export function applyConfiguredMouseLook(
  angles: LookAngles,
  dx: number,
  dy: number,
  settings: MouseLookSettings = {},
  pitchLimit: number = DEFAULT_PITCH_LIMIT,
): LookAngles {
  return applyMouseLook(
    angles,
    dx,
    settings.invertY ? -dy : dy,
    settings.sensitivity,
    pitchLimit,
  );
}

/** Derives look angles from a (not necessarily normalized) forward direction. */
export function lookAnglesFromForward(fx: number, fy: number, fz: number): LookAngles {
  const length = Math.hypot(fx, fy, fz);
  if (!(length > 1e-6)) return { yaw: 0, pitch: 0 };
  const y = fy / length;
  const clampedY = y < -1 ? -1 : y > 1 ? 1 : y;
  return { yaw: Math.atan2(-fx, -fz), pitch: Math.asin(clampedY) };
}

/** Unit forward direction for the given look angles (inverse of {@link lookAnglesFromForward}). */
export function forwardFromLookAngles(angles: LookAngles): {
  readonly x: number;
  readonly y: number;
  readonly z: number;
} {
  const cosPitch = Math.cos(angles.pitch);
  return {
    x: -Math.sin(angles.yaw) * cosPitch,
    y: Math.sin(angles.pitch),
    z: -Math.cos(angles.yaw) * cosPitch,
  };
}
