// The editor viewport's remembered pose (plan phase 4 step 3; INV-A03):
// Forge WebGL's EditorCameraPoseStore (editor/input/editorCameraPose.ts @
// forge-webgl-final). The editor is reloaded all the time; reframing the
// level on every reload would throw away where the user was working, so the
// last perspective pose is kept per level and restored on the next open.
//
// A machine-local preference in the page's storage, never in the level (a
// reload must not dirty it). Orthographic presets are passing view choices
// and are not kept: a reload comes back in Perspective at the last pose.
// Writes are throttled (fly navigation moves the camera every frame); `save`
// writes at once (page hide).

import type { PerspectiveCamera } from "three/webgpu";

const STORAGE_PREFIX = "forge.editor.cameraPose.";
const SAVE_INTERVAL_MS = 700;

export interface EditorCameraPose {
  readonly position: [number, number, number];
  readonly quaternion: [number, number, number, number];
  readonly up: [number, number, number];
}

export type PoseStorage = Pick<Storage, "getItem" | "setItem">;

const finiteTuple = (value: unknown, length: number): boolean =>
  Array.isArray(value) && value.length === length && value.every((n) => typeof n === "number" && Number.isFinite(n));

export function parseEditorCameraPose(raw: string): EditorCameraPose | null {
  try {
    const parsed = JSON.parse(raw) as Partial<EditorCameraPose> | null;
    if (parsed && finiteTuple(parsed.position, 3) && finiteTuple(parsed.quaternion, 4) && finiteTuple(parsed.up, 3)) return parsed as EditorCameraPose;
  } catch {
    // Corrupt JSON: the default framing.
  }
  return null;
}

export function readEditorCameraPose(camera: PerspectiveCamera): EditorCameraPose {
  return {
    position: [camera.position.x, camera.position.y, camera.position.z],
    quaternion: [camera.quaternion.x, camera.quaternion.y, camera.quaternion.z, camera.quaternion.w],
    up: [camera.up.x, camera.up.y, camera.up.z],
  };
}

export interface EditorCameraPoseStore {
  /** Applies the remembered pose; false when there is none (the default framing stays). */
  restore(camera: PerspectiveCamera): boolean;
  /** Frame-loop hook: writes at most once per SAVE_INTERVAL_MS. */
  maybeSave(camera: PerspectiveCamera, nowMs: number): void;
  /** Unthrottled write (page hide). */
  save(camera: PerspectiveCamera): void;
}

/** The store of one level (`levelKey`: the project and the level folder); null storage keeps nothing. */
export function createEditorCameraPoseStore(storage: PoseStorage | null, levelKey: string): EditorCameraPoseStore {
  const key = `${STORAGE_PREFIX}${encodeURIComponent(levelKey)}`;
  let lastSerialized: string | null = null;
  let lastWrite = Number.NEGATIVE_INFINITY;
  const save = (camera: PerspectiveCamera): void => {
    if (!storage) return;
    const serialized = JSON.stringify(readEditorCameraPose(camera));
    if (serialized === lastSerialized) return;
    try {
      storage.setItem(key, serialized);
      lastSerialized = serialized;
    } catch {
      // Private mode / quota: editing goes on without a remembered pose.
    }
  };
  return {
    restore(camera) {
      if (!storage) return false;
      let raw: string | null = null;
      try {
        raw = storage.getItem(key);
      } catch {
        return false;
      }
      const pose = raw === null ? null : parseEditorCameraPose(raw);
      if (!pose) return false;
      camera.up.set(...pose.up);
      camera.position.set(...pose.position);
      camera.quaternion.set(...pose.quaternion);
      camera.updateMatrixWorld();
      lastSerialized = raw;
      return true;
    },
    maybeSave(camera, nowMs) {
      if (nowMs - lastWrite < SAVE_INTERVAL_MS) return;
      lastWrite = nowMs;
      save(camera);
    },
    save,
  };
}
