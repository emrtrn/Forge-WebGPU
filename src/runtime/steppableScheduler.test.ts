import { describe, expect, test } from "vitest";
import type { FrameScheduler } from "./boot.ts";
import { createSteppableScheduler } from "./steppableScheduler.ts";

function fakeRaf() {
  const queue = new Map<number, (time: number) => void>();
  let next = 1;
  const base: FrameScheduler = {
    request(frame) {
      queue.set(next, frame);
      return next++;
    },
    cancel(handle) {
      queue.delete(handle);
    },
  };
  const flush = (time: number): void => {
    const frames = [...queue.values()];
    queue.clear();
    for (const frame of frames) frame(time);
  };
  return { base, queue, flush };
}

describe("steppable scheduler", () => {
  test("running, it passes frames through; paused, it holds the next request and steps it at a synthetic time", () => {
    const raf = fakeRaf();
    const scheduler = createSteppableScheduler(raf.base, () => 0);
    const times: number[] = [];
    const loop = (time: number): void => {
      times.push(time);
      scheduler.request(loop);
    };
    scheduler.request(loop);
    raf.flush(100);
    expect(times).toEqual([100]);
    scheduler.pause();
    raf.flush(116);
    expect(times).toEqual([100, 116]);
    // The loop's next request is held, not scheduled.
    expect(raf.queue.size).toBe(0);
    expect(scheduler.step(10)).toBe(true);
    expect(scheduler.step(10)).toBe(true);
    expect(times).toEqual([100, 116, 126, 136]);
    scheduler.resume();
    expect(raf.queue.size).toBe(1);
    raf.flush(500);
    expect(times.at(-1)).toBe(500);
  });

  test("step does nothing while running or with no held frame; cancel drops a held frame", () => {
    const raf = fakeRaf();
    const scheduler = createSteppableScheduler(raf.base, () => 1000);
    expect(scheduler.step(16)).toBe(false);
    scheduler.pause();
    expect(scheduler.step(16)).toBe(false);
    let ran = 0;
    const handle = scheduler.request(() => {
      ran += 1;
    });
    expect(handle).toBeLessThan(0);
    scheduler.cancel(handle);
    expect(scheduler.step(16)).toBe(false);
    expect(ran).toBe(0);
    // With no frame seen yet, the synthetic time starts from `now`.
    let at = 0;
    scheduler.request((time) => {
      at = time;
    });
    scheduler.step(16);
    expect(at).toBe(1016);
  });
});
