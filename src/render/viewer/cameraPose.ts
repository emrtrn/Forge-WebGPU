// The one-shot camera pose handoff (Forge WebGL src/play/cameraHandoff.ts, the
// same storage key and shape): the editor's Play, the Phase 0 harness and the
// render smoke write `forge.play.cameraPose`; the viewer reads it once and
// clears it, so a later reload falls back to the default framing.

export const CAMERA_POSE_KEY = "forge.play.cameraPose";

/** World position and orientation quaternion (x, y, z, w). */
export interface CameraPose {
  readonly position: readonly [number, number, number];
  readonly quaternion: readonly [number, number, number, number];
}

const finiteTuple = (value: unknown, length: number): boolean =>
  Array.isArray(value) && value.length === length && value.every((n) => typeof n === "number" && Number.isFinite(n));

export function parseCameraPose(raw: string | null): CameraPose | null {
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<CameraPose> | null;
    if (parsed && finiteTuple(parsed.position, 3) && finiteTuple(parsed.quaternion, 4)) return parsed as CameraPose;
  } catch {
    // corrupt JSON: default framing
  }
  return null;
}

/** Reads and clears the stored pose; null without storage or pose. */
export function consumeCameraPose(storage: Pick<Storage, "getItem" | "removeItem"> | null): CameraPose | null {
  if (storage === null) return null;
  let raw: string | null;
  try {
    raw = storage.getItem(CAMERA_POSE_KEY);
    if (raw !== null) storage.removeItem(CAMERA_POSE_KEY);
  } catch {
    return null;
  }
  return parseCameraPose(raw);
}
