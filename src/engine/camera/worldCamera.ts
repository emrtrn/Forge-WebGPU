import { createServiceKey, type ActorId, type Transform, type Vec3, type Vec4 } from "../../core/index.ts";

export interface RuntimeCameraPose {
  readonly position: Readonly<Vec3>;
  readonly quaternion: Readonly<Vec4>;
  /** Vertical field of view (degrees). */
  readonly fov: number;
}

export interface CameraService {
  set(pose: RuntimeCameraPose | null): void;
  /** Possesses an authored camera, optionally offset by its spring arm. */
  follow(actor: ActorId, camera: string, springArm?: string): boolean;
  current(): RuntimeCameraPose | null;
  /** Selects a camera-space model on an active actor. Null clears the selection. */
  setViewModel(actor: ActorId, component: string): boolean;
  setViewModel(actor: null): boolean;
  currentViewModel(): RuntimeViewModel | null;
}

export interface RuntimeViewModel {
  readonly model: string;
  readonly fov: number;
  readonly local: Transform;
}

export const CameraServiceKey = createServiceKey<CameraService>("forge.camera");
