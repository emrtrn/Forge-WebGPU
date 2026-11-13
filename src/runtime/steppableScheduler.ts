// A frame scheduler that can be paused and stepped by hand (plan phase 3
// step 7: the Sky Light capture measurement). Running, it passes requests to
// the real scheduler (rAF). Paused, the boot's next frame request is held;
// `step(ms)` runs it at a synthetic time `ms` after the previous frame, so a
// measurement drives the world at a fixed rate (60 Hz, say) and reads the GPU
// time of each frame on its own. Only the development page wires it to a
// window hook; boot sees an ordinary FrameScheduler.

import type { FrameScheduler } from "./boot.ts";

export interface SteppableScheduler extends FrameScheduler {
  /** Holds the next frame request instead of scheduling it. */
  pause(): void;
  /** Hands held and future requests back to the real scheduler. */
  resume(): void;
  readonly paused: boolean;
  /** Runs the held frame `ms` after the previous one; false when no frame is held. */
  step(ms: number): boolean;
}

export function createSteppableScheduler(base: FrameScheduler, now: () => number): SteppableScheduler {
  let paused = false;
  let held: ((time: number) => void) | null = null;
  let heldHandle = -1;
  let nextHandle = -1;
  let time: number | null = null;

  return {
    request(frame) {
      if (!paused) {
        return base.request((at) => {
          time = at;
          frame(at);
        });
      }
      held = frame;
      heldHandle = nextHandle;
      nextHandle -= 1;
      return heldHandle;
    },
    cancel(handle) {
      if (handle < 0) {
        if (handle === heldHandle) held = null;
        return;
      }
      base.cancel(handle);
    },
    pause() {
      paused = true;
    },
    resume() {
      if (!paused) return;
      paused = false;
      const frame = held;
      held = null;
      if (frame) base.request(frame);
    },
    get paused() {
      return paused;
    },
    step(ms) {
      const frame = held;
      if (!paused || !frame) return false;
      held = null;
      time = (time ?? now()) + ms;
      frame(time);
      return true;
    },
  };
}
