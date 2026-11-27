import { createServiceKey, type ActorId, type Transform } from "../../core/index.ts";

export interface ActorTransformUpdate {
  readonly actor: ActorId;
  readonly transform: Transform;
}

export interface ActorMotion {
  /** Updates runtime-local transforms as a batch and synchronously notifies World subsystems. */
  setTransforms(updates: readonly ActorTransformUpdate[], source?: string): void;
}

export const ActorMotionKey = createServiceKey<ActorMotion>("forge.actorMotion");
