// The level viewer (plan phase 3): what the game page draws with until game
// cameras exist (phase 6). It owns the render host for the boot's `render`
// stage, a camera with Forge WebGL's lens (44 degrees, 0.1 - 2000 m), the
// one-shot pose handoff, a default framing of the level once its resources
// are in (the placements' bounds, Forge's room bounds: the terrain is not
// framed), Forge's default camera controls (flyCamera.ts; once the player
// moved, the level is not reframed) and the ready signal the render smoke
// waits for:
//
//   data-forge-ready="1" on the canvas once the world is attached, no
//   resource load is in flight and READY_FRAMES frames were drawn after that;
//   `data-forge-resource-errors` says how many loads failed.
//
// Its shape is the boot's render stage (src/runtime/boot.ts `BootRender`).

import { Box3, PerspectiveCamera, Quaternion, Sphere, Vector3, type Object3D } from "three/webgpu";
import type { FeatureDef } from "../../core/index.ts";
import type { FrameMetrics } from "../../engine/perf/frameMetrics.ts";
import { createRenderHost, type RenderHost, type RenderHostOptions, type RenderQuality } from "../host/renderHost.ts";
import { consumeCameraPose, type CameraPose } from "./cameraPose.ts";
import { attachFlyCamera, createFlyCamera } from "./flyCamera.ts";

export const CAMERA_FOV = 44;
export const CAMERA_NEAR = 0.1;
export const CAMERA_FAR = 2000;
export const READY_FRAMES = 3;
/** Default framing looks at the level from this direction (up and to the side). */
const FRAMING_DIRECTION = new Vector3(0.6, 0.55, 1).normalize();

export interface LevelViewerOptions extends RenderHostOptions {
  /** Where the pose handoff lives; null when the page has no storage. */
  readonly storage: Pick<Storage, "getItem" | "removeItem"> | null;
}

export interface LevelViewer {
  init(): Promise<void>;
  feature(features: readonly FeatureDef[]): FeatureDef;
  frame(now: number): void;
  onLost(listener: (message: string) => void): void;
  dispose(): void;
  readonly host: RenderHost | null;
  readonly camera: PerspectiveCamera;
  /** The effective quality; kept until the host exists. */
  setQuality(quality: RenderQuality): void;
  /** What the quality driver reads each tick; null before init. */
  signals(): { metrics: FrameMetrics; drawCalls: number; triangles: number; textures: number } | null;
  /** The GPU as the adapter names it (the hardware hint's GPU string); null before init or without one. */
  gpuName(): string | null;
}

export function applyCameraPose(camera: PerspectiveCamera, pose: CameraPose): void {
  camera.position.fromArray(pose.position);
  camera.quaternion.copy(new Quaternion().fromArray(pose.quaternion));
  camera.updateMatrixWorld();
}

/** Marks an object the default framing leaves out (`userData.framing = false`: a terrain). */
export const NOT_FRAMED = "framing";

/**
 * The level's room bounds (Forge's computeSceneRoomBounds): every drawn
 * object under `root` but those marked not to be framed, in world space; an
 * instanced batch counts with the bounds of all its instances.
 */
export function sceneRoomBounds(root: Object3D): Box3 {
  const bounds = new Box3();
  root.updateMatrixWorld(true);
  for (const child of root.children) {
    if (child.userData[NOT_FRAMED] === false) continue;
    bounds.expandByObject(child);
  }
  return bounds;
}

/** Puts the whole of `bounds` in view; an empty box looks at the origin. */
export function frameBounds(camera: PerspectiveCamera, bounds: Box3): void {
  if (bounds.isEmpty()) {
    camera.position.set(6, 5, 10);
    camera.lookAt(0, 0, 0);
  } else {
    const sphere = bounds.getBoundingSphere(new Sphere());
    const radius = Math.max(sphere.radius, 0.5);
    const distance = radius / Math.sin((camera.fov * Math.PI) / 360);
    camera.position.copy(sphere.center).addScaledVector(FRAMING_DIRECTION, distance);
    camera.lookAt(sphere.center);
  }
  camera.updateMatrixWorld();
}

export function createLevelViewer(options: LevelViewerOptions): LevelViewer {
  const camera = new PerspectiveCamera(CAMERA_FOV, 1, CAMERA_NEAR, CAMERA_FAR);
  const pendingListeners: ((message: string) => void)[] = [];
  let host: RenderHost | null = null;
  let framed = false;
  let settledFrames = 0;
  let ready = false;
  let quality: RenderQuality | null = null;
  const fly = createFlyCamera(camera);
  let unwire: (() => void) | null = null;
  let lastFrame: number | null = null;

  return {
    get host() {
      return host;
    },
    camera,
    async init() {
      const pose = consumeCameraPose(options.storage);
      if (pose) {
        applyCameraPose(camera, pose);
        framed = true;
      }
      host = await createRenderHost(options);
      if (quality) host.setQuality(quality);
      host.setCamera(camera);
      const window = options.document.defaultView;
      if (window) unwire = attachFlyCamera(fly, window, host.canvas);
      for (const listener of pendingListeners.splice(0)) host.onDeviceLost(listener);
    },
    feature(features) {
      if (!host) throw new Error("The level viewer is not initialised.");
      return host.feature(features, "game");
    },
    frame(now) {
      if (!host || host.world === null) return;
      const dt = lastFrame === null ? 0 : Math.min(0.1, Math.max(0, (now - lastFrame) / 1000));
      lastFrame = now;
      if (fly.update(dt)) framed = true;
      const { pending, failed } = host.cache.stats();
      if (pending === 0 && !framed) {
        frameBounds(camera, sceneRoomBounds(host.world.root));
        framed = true;
      }
      host.frame(now);
      if (ready) return;
      settledFrames = pending === 0 ? settledFrames + 1 : 0;
      if (settledFrames >= READY_FRAMES && !host.lost) {
        ready = true;
        host.canvas.dataset.forgeResourceErrors = String(failed);
        host.canvas.dataset.forgeReady = "1";
      }
    },
    setQuality(next) {
      quality = next;
      host?.setQuality(next);
    },
    signals() {
      if (!host) return null;
      const { render, memory } = host.renderer.info;
      return { metrics: host.perf.metrics(), drawCalls: render.drawCalls, triangles: render.triangles, textures: memory.textures };
    },
    gpuName() {
      const adapter = host?.proof.adapter;
      if (!adapter) return null;
      const name = [adapter.description, adapter.device].find((part) => part !== undefined && part !== "") ?? [adapter.vendor, adapter.architecture].filter(Boolean).join(" ");
      return name === "" ? null : name;
    },
    onLost(listener) {
      if (host) host.onDeviceLost(listener);
      else pendingListeners.push(listener);
    },
    dispose() {
      unwire?.();
      unwire = null;
      host?.dispose();
      host = null;
    },
  };
}
