// The level viewer's camera controls (plan phase 3 step 8): Forge WebGL's
// default camera Game Mode (`forge.defaultCamera`, defaultCameraGameMode.ts)
// until game modes exist (phase 6). WASD / arrow keys pan along the camera's
// ground facing, E / Q fly up / down along world Y, a held right-mouse drag
// turns the view (yaw / pitch, 0.003 rad per pixel, pitch clamped); 6 m/s.
// The math is the ported pure module (engine/camera/cameraControl.ts); this
// file keeps the held keys and the pointer delta and aims the three camera.
// The camera keeps the pose it boots with (handed-off pose or framing) and
// is not reframed once the player moved it.
//
// `createFlyCamera` is DOM-free (tests drive it); `attachFlyCamera` wires it
// to a window's keys and an element's right-drag.

import { Vector3, type PerspectiveCamera } from "three/webgpu";
import {
  applyMouseLook,
  cameraPlanarPan,
  DEFAULT_LOOK_SENSITIVITY,
  forwardFromLookAngles,
  lookAnglesFromForward,
  type LookAngles,
} from "../../engine/camera/cameraControl.ts";

/** Forge's camera pawn speed (DEFAULT_CAMERA_SPEED), metres per second. */
export const FLY_CAMERA_SPEED = 6;

/** Forge's default bindings for the camera pawn's actions (engine/input/defaultInputBindings.ts + E / Q). */
const KEY_ACTIONS: Readonly<Record<string, "forward" | "back" | "left" | "right" | "up" | "down">> = {
  KeyW: "forward",
  ArrowUp: "forward",
  KeyS: "back",
  ArrowDown: "back",
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
  KeyE: "up",
  KeyQ: "down",
};

export interface FlyCamera {
  /** A key went down / up (`KeyboardEvent.code`); false when it is not a camera key. */
  key(code: string, down: boolean): boolean;
  /** Pointer travel of a right-drag, in pixels. */
  look(dx: number, dy: number): void;
  /** Lets go of every key (the window lost focus). */
  release(): void;
  /** Applies the frame's look and movement; true when the camera moved or turned. */
  update(dt: number): boolean;
  /** The player moved or turned the camera at least once. */
  readonly touched: boolean;
}

export function createFlyCamera(camera: PerspectiveCamera, speed = FLY_CAMERA_SPEED, sensitivity = DEFAULT_LOOK_SENSITIVITY): FlyCamera {
  const held = new Set<string>();
  const forward = new Vector3();
  let lookX = 0;
  let lookY = 0;
  let angles: LookAngles | null = null;
  let touched = false;
  return {
    key(code, down) {
      const action = KEY_ACTIONS[code];
      if (!action) return false;
      if (down) held.add(action);
      else held.delete(action);
      return true;
    },
    look(dx, dy) {
      lookX += dx;
      lookY += dy;
    },
    release() {
      held.clear();
      lookX = 0;
      lookY = 0;
    },
    update(dt) {
      let changed = false;
      if (lookX !== 0 || lookY !== 0) {
        // Seed the angles from the pose the camera has now (a handoff or a reframing may have set it).
        camera.getWorldDirection(forward);
        angles = applyMouseLook(lookAnglesFromForward(forward.x, forward.y, forward.z), lookX, lookY, sensitivity);
        lookX = 0;
        lookY = 0;
        const dir = forwardFromLookAngles(angles);
        camera.up.set(0, 1, 0);
        camera.lookAt(camera.position.x + dir.x, camera.position.y + dir.y, camera.position.z + dir.z);
        changed = true;
      }
      if (held.size > 0) {
        camera.getWorldDirection(forward);
        const step = cameraPlanarPan(forward.x, forward.z, {
          forward: held.has("forward"),
          back: held.has("back"),
          left: held.has("left"),
          right: held.has("right"),
          up: held.has("up"),
          down: held.has("down"),
        }, speed, dt);
        if (step.dx !== 0 || step.dy !== 0 || step.dz !== 0) {
          camera.position.x += step.dx;
          camera.position.y += step.dy;
          camera.position.z += step.dz;
          changed = true;
        }
      }
      if (changed) {
        camera.updateMatrixWorld();
        touched = true;
      }
      return changed;
    },
    get touched() {
      return touched;
    },
  };
}

const typing = (target: EventTarget | null): boolean => {
  const element = target as { tagName?: string; isContentEditable?: boolean } | null;
  return element?.isContentEditable === true || element?.tagName === "INPUT" || element?.tagName === "TEXTAREA" || element?.tagName === "SELECT";
};

/** Wires the controller to `window`'s keys and `element`'s right-drag; returns the unwiring. */
export function attachFlyCamera(fly: FlyCamera, window: Window, element: HTMLElement): () => void {
  let dragging = false;
  const keydown = (event: KeyboardEvent): void => {
    if (event.ctrlKey || event.metaKey || event.altKey || typing(event.target)) return;
    if (fly.key(event.code, true)) event.preventDefault();
  };
  const keyup = (event: KeyboardEvent): void => {
    fly.key(event.code, false);
  };
  const blur = (): void => {
    dragging = false;
    fly.release();
  };
  const pointerdown = (event: PointerEvent): void => {
    if (event.button !== 2) return;
    dragging = true;
    element.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  };
  const pointermove = (event: PointerEvent): void => {
    if (dragging) fly.look(event.movementX, event.movementY);
  };
  const pointerup = (event: PointerEvent): void => {
    if (event.button !== 2) return;
    dragging = false;
    element.releasePointerCapture?.(event.pointerId);
  };
  const contextmenu = (event: Event): void => event.preventDefault();
  window.addEventListener("keydown", keydown);
  window.addEventListener("keyup", keyup);
  window.addEventListener("blur", blur);
  element.addEventListener("pointerdown", pointerdown);
  element.addEventListener("pointermove", pointermove);
  element.addEventListener("pointerup", pointerup);
  element.addEventListener("contextmenu", contextmenu);
  return () => {
    window.removeEventListener("keydown", keydown);
    window.removeEventListener("keyup", keyup);
    window.removeEventListener("blur", blur);
    element.removeEventListener("pointerdown", pointerdown);
    element.removeEventListener("pointermove", pointermove);
    element.removeEventListener("pointerup", pointerup);
    element.removeEventListener("contextmenu", contextmenu);
  };
}
