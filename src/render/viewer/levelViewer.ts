// The level viewer (plan phase 3): what the game page draws with until game
// cameras exist (phase 6). It owns the render host for the boot's `render`
// stage, a camera with Forge WebGL's lens (44 degrees, 0.1 - 2000 m), the
// one-shot pose handoff, a default framing of the level once its resources
// are in, and the ready signal the render smoke waits for:
//
//   data-forge-ready="1" on the canvas once the world is attached, no
//   resource load is in flight and READY_FRAMES frames were drawn after that;
//   `data-forge-resource-errors` says how many loads failed.
//
// Its shape is the boot's render stage (src/runtime/boot.ts `BootRender`).

import { Box3, PerspectiveCamera, Quaternion, Sphere, Vector3 } from "three/webgpu";
import type { FeatureDef } from "../../core/index.ts";
import { createRenderHost, type RenderHost, type RenderHostOptions } from "../host/renderHost.ts";
import { consumeCameraPose, type CameraPose } from "./cameraPose.ts";

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
}

export function applyCameraPose(camera: PerspectiveCamera, pose: CameraPose): void {
  camera.position.fromArray(pose.position);
  camera.quaternion.copy(new Quaternion().fromArray(pose.quaternion));
  camera.updateMatrixWorld();
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
      host.setCamera(camera);
      for (const listener of pendingListeners.splice(0)) host.onDeviceLost(listener);
    },
    feature(features) {
      if (!host) throw new Error("The level viewer is not initialised.");
      return host.feature(features, "game");
    },
    frame(now) {
      if (!host || host.world === null) return;
      const { pending, failed } = host.cache.stats();
      if (pending === 0 && !framed) {
        frameBounds(camera, new Box3().setFromObject(host.world.root));
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
    onLost(listener) {
      if (host) host.onDeviceLost(listener);
      else pendingListeners.push(listener);
    },
    dispose() {
      host?.dispose();
      host = null;
    },
  };
}
