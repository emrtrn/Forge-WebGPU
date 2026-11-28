import { createServiceKey, type ActorId } from "../../core/index.ts";

export interface SkeletalClips {
  /** Selects a clip on a skeletal mesh. Null restores the authored clip. */
  play(actor: ActorId, component: string, clip: string | null): void;
  current(actor: ActorId, component: string): string | undefined;
}

export const SkeletalClipsKey = createServiceKey<SkeletalClips>("forge.skeletalClips");
