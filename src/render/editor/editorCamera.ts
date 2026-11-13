// The editor viewport's camera (plan phase 4 step 3; INV-A03): Forge WebGL's
// EditorCameraController (editor/input/editorCameraController.ts @
// forge-webgl-final) with its constants, the camera presets of its SceneApp
// (setCameraView / setTechnicalView / applyPerspectivePose / focusSelected,
// the orbit target) and the camera part of its input bindings
// (editor/input/bindings.ts):
//
// - right-drag: fly (mouse look, W A S D along the ground facing, E / Q up /
//   down; the wheel changes the speed while flying);
// - Alt + left-drag orbits the orbit target, middle-drag (or Alt + middle)
//   pans, Alt + right-drag dollies; the wheel dollies (zooms an orthographic
//   view);
// - Perspective / Top / Left / Front: the technical presets are orthographic;
//   Perspective comes back as a 3/4 view of the orbit target.
//
// The orbit target is the selection's centre when the editor gives one, else
// where the view meets the ground (y = 0), else 5 m ahead.
//
// Two changes from Forge: an orthographic camera stands ORTHO_BACKOFF metres
// back along its axis (Forge kept it 3 - 10 m from the target, so anything
// taller than that was cut by the near plane; the projection does not depend
// on the distance), and focusing a large selection backs off far enough to
// see it (Forge capped the distance at 4.2 m but for an ocean).
//
// A plain left click is not the camera's: it goes to `onClick` (selection,
// step 3b). Three-only, no editor import; the editor wires it.

import { Box3, MathUtils, OrthographicCamera, PerspectiveCamera, Plane, Ray, Vector3 } from "three/webgpu";

/** The viewport camera presets (Forge's CameraView). */
export type CameraView = "perspective" | "top" | "left" | "front";
export const CAMERA_VIEWS: readonly CameraView[] = ["perspective", "top", "left", "front"];

const CAMERA_MOVE_SPEED = 5.5;
const CAMERA_MIN_MOVE_SPEED = 0.8;
const CAMERA_MAX_MOVE_SPEED = 400;
const CAMERA_LOOK_SENSITIVITY = 0.003;
const CAMERA_PITCH_LIMIT = Math.PI * 0.47;
const CAMERA_ORBIT_SENSITIVITY = 0.006;
const CAMERA_PAN_SENSITIVITY = 0.0025;
const CAMERA_DOLLY_SENSITIVITY = 0.018;
const ORTHO_MIN_VIEW_HEIGHT = 3;
const ORTHO_MAX_VIEW_HEIGHT = 80;
/** Metres an orthographic camera stands back from its target (half the far plane). */
const ORTHO_BACKOFF = 1000;
const NAVIGATION_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE"]);

export type ViewportCamera = PerspectiveCamera | OrthographicCamera;

/** The pointer event fields the controller reads (tests pass plain objects). */
export interface CameraPointer {
  readonly pointerId: number;
  readonly button: number;
  readonly movementX: number;
  readonly movementY: number;
  readonly altKey: boolean;
  preventDefault(): void;
}

/** The canvas fields the controller uses. */
export interface CameraSurface {
  readonly style: { cursor: string };
  setPointerCapture(pointerId: number): void;
  releasePointerCapture(pointerId: number): void;
  hasPointerCapture(pointerId: number): boolean;
}

export interface EditorCameraOptions {
  readonly fov: number;
  readonly near: number;
  readonly far: number;
  /** The selection's centre, the preferred orbit target; null without a selection. */
  readonly selectionCentre?: () => Vector3 | null;
  readonly onStatus?: (message: string) => void;
}

export interface EditorCamera {
  readonly perspective: PerspectiveCamera;
  readonly orthographic: OrthographicCamera;
  /** The camera the viewport draws with. */
  active(): ViewportCamera;
  readonly view: CameraView;
  setView(view: CameraView): void;
  /** Frames a box (Forge's focusSelected); a null or empty box looks at `fallback`. */
  focus(box: Box3 | null, fallback: Vector3): void;
  /** The viewport's size in CSS pixels (the orthographic projection follows it). */
  resize(width: number, height: number): void;
  /** Fly movement for this frame; true when the camera moved. */
  update(dt: number): boolean;
  /** The user moved the camera at least once (the default framing stays away). */
  readonly touched: boolean;
  markTouched(): void;
  /** Re-reads yaw / pitch from the camera (after the pose was set from outside). */
  syncAngles(): void;
  readonly navigating: boolean;
  readonly dragging: boolean;
  readonly speed: number;

  pointerDown(event: CameraPointer, surface: CameraSurface): boolean;
  pointerMove(event: CameraPointer): boolean;
  pointerUp(event: CameraPointer, surface: CameraSurface): void;
  wheel(deltaY: number): void;
  key(code: string, down: boolean): boolean;
}

type Drag = { mode: "orbit"; pointerId: number; target: Vector3; distance: number } | { mode: "pan"; pointerId: number } | { mode: "dolly"; pointerId: number };

const isOrthographic = (camera: ViewportCamera): camera is OrthographicCamera => (camera as OrthographicCamera).isOrthographicCamera === true;
const viewHeight = (camera: OrthographicCamera): number => (camera.top - camera.bottom) / Math.max(camera.zoom, 0.01);

export function createEditorCamera(options: EditorCameraOptions): EditorCamera {
  const perspective = new PerspectiveCamera(options.fov, 1, options.near, options.far);
  perspective.name = "editor perspective";
  const orthographic = new OrthographicCamera(-1, 1, 1, -1, options.near, options.far);
  orthographic.name = "editor orthographic";
  let activeCamera: ViewportCamera = perspective;
  let view: CameraView = "perspective";
  let orthoViewHeight = 20;
  let aspect = 1;
  const pressed = new Set<string>();
  const forward = new Vector3();
  const right = new Vector3();
  const move = new Vector3();
  const floor = new Plane(new Vector3(0, 1, 0), 0);
  const ray = new Ray();
  let navigationPointer: number | null = null;
  let drag: Drag | null = null;
  let touched = false;
  let yaw = 0;
  let pitch = 0;
  let speed = CAMERA_MOVE_SPEED;
  const status = (message: string): void => options.onStatus?.(message);

  const updateOrthoProjection = (): void => {
    const half = orthoViewHeight * 0.5;
    orthographic.left = -half * aspect;
    orthographic.right = half * aspect;
    orthographic.top = half;
    orthographic.bottom = -half;
    orthographic.updateProjectionMatrix();
  };

  const syncAngles = (): void => {
    const direction = activeCamera.getWorldDirection(new Vector3());
    yaw = Math.atan2(-direction.x, -direction.z);
    pitch = Math.asin(MathUtils.clamp(direction.y, -1, 1));
  };

  const lookDirection = (): Vector3 =>
    new Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)).normalize();

  const orbitTarget = (): Vector3 => {
    const selected = options.selectionCentre?.();
    if (selected) return selected.clone();
    const direction = activeCamera.getWorldDirection(new Vector3());
    const hit = ray.set(activeCamera.position, direction).intersectPlane(floor, new Vector3());
    return hit ?? activeCamera.position.clone().addScaledVector(direction, 5);
  };

  const dolly = (amount: number): void => {
    if (isOrthographic(activeCamera)) {
      const factor = amount < 0 ? 1.1 : 1 / 1.1;
      activeCamera.zoom = MathUtils.clamp(activeCamera.zoom * factor, 0.05, 20);
      activeCamera.updateProjectionMatrix();
      return;
    }
    const direction = activeCamera.getWorldDirection(new Vector3());
    if (direction.lengthSq() === 0) return;
    activeCamera.position.addScaledVector(direction.normalize(), -amount);
  };

  const setTechnicalView = (preset: "top" | "front" | "left"): void => {
    const target = orbitTarget();
    const distance = MathUtils.clamp(activeCamera.position.distanceTo(target), 3, 10);
    touched = true;
    orthoViewHeight = MathUtils.clamp(distance * 1.8, ORTHO_MIN_VIEW_HEIGHT, ORTHO_MAX_VIEW_HEIGHT);
    orthographic.zoom = 1;
    updateOrthoProjection();
    if (preset === "top") {
      orthographic.up.set(0, 0, -1);
      orthographic.position.copy(target).add(new Vector3(0, ORTHO_BACKOFF, 0));
    } else if (preset === "front") {
      orthographic.up.set(0, 1, 0);
      orthographic.position.copy(target).add(new Vector3(0, 0, ORTHO_BACKOFF));
    } else {
      orthographic.up.set(0, 1, 0);
      orthographic.position.copy(target).add(new Vector3(ORTHO_BACKOFF, 0, 0));
    }
    orthographic.lookAt(target);
    orthographic.updateMatrixWorld();
    activeCamera = orthographic;
    syncAngles();
  };

  const applyPerspectivePose = (): void => {
    const target = orbitTarget();
    const distance = MathUtils.clamp(activeCamera.position.distanceTo(target), 4, 12);
    touched = true;
    perspective.up.set(0, 1, 0);
    perspective.position.copy(target).add(new Vector3(distance * 0.7, distance * 0.6, distance * 0.7));
    perspective.lookAt(target);
    perspective.updateMatrixWorld();
    activeCamera = perspective;
    syncAngles();
  };

  return {
    perspective,
    orthographic,
    active: () => activeCamera,
    get view() {
      return view;
    },
    setView(next) {
      if (next === "perspective") {
        applyPerspectivePose();
        status("Perspective view");
      } else {
        setTechnicalView(next);
        status(`${next[0]!.toUpperCase()}${next.slice(1)} view`);
      }
      view = next;
    },
    focus(box, fallback) {
      const target = box && !box.isEmpty() ? box.getCenter(new Vector3()) : fallback.clone();
      const direction = activeCamera.getWorldDirection(new Vector3());
      const radius = box && !box.isEmpty() ? box.getSize(new Vector3()).length() * 0.5 : 0.8;
      const maxDistance = Math.max(4.2, Math.min(activeCamera.far * 0.5, radius * 2.5));
      const distance = MathUtils.clamp(radius * 1.8, 1.25, maxDistance);
      if (isOrthographic(activeCamera)) {
        orthoViewHeight = MathUtils.clamp(radius * 4, ORTHO_MIN_VIEW_HEIGHT, ORTHO_MAX_VIEW_HEIGHT);
        activeCamera.zoom = 1;
        updateOrthoProjection();
        activeCamera.position.copy(target).addScaledVector(direction, -ORTHO_BACKOFF);
      } else {
        activeCamera.position.copy(target).addScaledVector(direction, -distance);
        activeCamera.up.set(0, 1, 0);
      }
      activeCamera.lookAt(target);
      activeCamera.updateMatrixWorld();
      touched = true;
      syncAngles();
    },
    resize(width, height) {
      aspect = width / Math.max(height, 1);
      updateOrthoProjection();
    },
    update(dt) {
      if (navigationPointer === null || pressed.size === 0) return false;
      activeCamera.getWorldDirection(forward);
      forward.y = 0;
      if (forward.lengthSq() === 0) forward.set(0, 0, -1);
      forward.normalize();
      right.crossVectors(forward, activeCamera.up).normalize();
      move.set(0, 0, 0);
      if (pressed.has("KeyW")) move.add(forward);
      if (pressed.has("KeyS")) move.sub(forward);
      if (pressed.has("KeyD")) move.add(right);
      if (pressed.has("KeyA")) move.sub(right);
      if (pressed.has("KeyE")) move.y += 1;
      if (pressed.has("KeyQ")) move.y -= 1;
      if (move.lengthSq() === 0) return false;
      activeCamera.position.add(move.normalize().multiplyScalar(speed * dt));
      return true;
    },
    get touched() {
      return touched;
    },
    markTouched() {
      touched = true;
    },
    syncAngles,
    get navigating() {
      return navigationPointer !== null;
    },
    get dragging() {
      return drag !== null;
    },
    get speed() {
      return speed;
    },

    pointerDown(event, surface) {
      const capture = (): void => {
        try {
          surface.setPointerCapture(event.pointerId);
        } catch {
          // Synthetic events can reject capture.
        }
      };
      // Alt + a button, or the middle button alone: orbit / pan / dolly.
      if (event.altKey || event.button === 1) {
        if (event.button !== 0 && event.button !== 1 && event.button !== 2) return false;
        event.preventDefault();
        touched = true;
        drag = null;
        if (event.button === 0) {
          if (isOrthographic(activeCamera)) {
            drag = { mode: "pan", pointerId: event.pointerId };
            surface.style.cursor = "move";
            status("Camera pan");
          } else {
            activeCamera.up.set(0, 1, 0);
            const target = orbitTarget();
            drag = { mode: "orbit", pointerId: event.pointerId, target, distance: Math.max(0.3, activeCamera.position.distanceTo(target)) };
            surface.style.cursor = "grabbing";
            status("Camera orbit");
          }
        } else if (event.button === 1) {
          drag = { mode: "pan", pointerId: event.pointerId };
          surface.style.cursor = "move";
          status("Camera pan");
        } else {
          if (!isOrthographic(activeCamera)) activeCamera.up.set(0, 1, 0);
          drag = { mode: "dolly", pointerId: event.pointerId };
          surface.style.cursor = "ns-resize";
          status(isOrthographic(activeCamera) ? "Camera zoom" : "Camera dolly");
        }
        capture();
        return true;
      }
      if (event.button === 2) {
        event.preventDefault();
        if (isOrthographic(activeCamera)) {
          status("Orthographic view: use pan and zoom.");
          return true;
        }
        navigationPointer = event.pointerId;
        touched = true;
        activeCamera.up.set(0, 1, 0);
        drag = null;
        surface.style.cursor = "none";
        status("Camera navigation");
        capture();
        return true;
      }
      return false;
    },

    pointerMove(event) {
      if (navigationPointer === event.pointerId) {
        if (isOrthographic(activeCamera)) return true;
        yaw -= event.movementX * CAMERA_LOOK_SENSITIVITY;
        pitch = MathUtils.clamp(pitch - event.movementY * CAMERA_LOOK_SENSITIVITY, -CAMERA_PITCH_LIMIT, CAMERA_PITCH_LIMIT);
        activeCamera.up.set(0, 1, 0);
        activeCamera.lookAt(activeCamera.position.clone().add(lookDirection()));
        return true;
      }
      if (!drag || drag.pointerId !== event.pointerId) return false;
      event.preventDefault();
      touched = true;
      if (drag.mode === "orbit") {
        yaw -= event.movementX * CAMERA_ORBIT_SENSITIVITY;
        pitch = MathUtils.clamp(pitch - event.movementY * CAMERA_ORBIT_SENSITIVITY, -CAMERA_PITCH_LIMIT, CAMERA_PITCH_LIMIT);
        activeCamera.position.copy(drag.target).addScaledVector(lookDirection(), -drag.distance);
        activeCamera.lookAt(drag.target);
        syncAngles();
        return true;
      }
      if (drag.mode === "pan") {
        const scale = isOrthographic(activeCamera) ? viewHeight(activeCamera) : Math.max(1, orbitTarget().distanceTo(activeCamera.position));
        const sideways = new Vector3(1, 0, 0).applyQuaternion(activeCamera.quaternion).normalize();
        const up = new Vector3(0, 1, 0).applyQuaternion(activeCamera.quaternion).normalize();
        activeCamera.position
          .addScaledVector(sideways, -event.movementX * CAMERA_PAN_SENSITIVITY * scale)
          .addScaledVector(up, event.movementY * CAMERA_PAN_SENSITIVITY * scale);
        return true;
      }
      dolly(event.movementY * CAMERA_DOLLY_SENSITIVITY);
      return true;
    },

    pointerUp(event, surface) {
      const release = (): void => {
        try {
          if (surface.hasPointerCapture(event.pointerId)) surface.releasePointerCapture(event.pointerId);
        } catch {
          // The capture may already be gone.
        }
        surface.style.cursor = "";
      };
      if (navigationPointer === event.pointerId) {
        navigationPointer = null;
        pressed.clear();
        release();
      }
      if (drag && drag.pointerId === event.pointerId) {
        drag = null;
        syncAngles();
        release();
      }
    },

    wheel(deltaY) {
      if (navigationPointer !== null) {
        const factor = deltaY < 0 ? 1.15 : 1 / 1.15;
        speed = MathUtils.clamp(speed * factor, CAMERA_MIN_MOVE_SPEED, CAMERA_MAX_MOVE_SPEED);
        status(`Camera speed ${speed.toFixed(1)}`);
        return;
      }
      touched = true;
      dolly(deltaY * CAMERA_DOLLY_SENSITIVITY);
    },

    key(code, down) {
      if (!NAVIGATION_KEYS.has(code)) return false;
      if (!down) {
        pressed.delete(code);
        return false;
      }
      if (navigationPointer === null) return false;
      pressed.add(code);
      return true;
    },
  };
}
