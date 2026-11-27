import { createServiceKey, type Vec3, type Vec4 } from "../../core/index.ts";
import type { AudioBus } from "./audioTypes.ts";

export interface WorldAudioHost {
  clipUrl(id: string): string | null;
  readonly headers?: Readonly<Record<string, string>>;
  listener(): { readonly position: Readonly<Vec3>; readonly rotation: Readonly<Vec4> };
  onGesture(callback: () => void): () => void;
}

export const WorldAudioHostKey = createServiceKey<WorldAudioHost>("forge.audio.host");
export const AudioServiceKey = createServiceKey<AudioBus>("forge.audio");
