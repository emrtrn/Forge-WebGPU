import { expect, test } from "vitest";
import { ThumbnailQueue } from "./thumbnailQueue.ts";

const job = (key: string, log: string[], fail = false) => ({
  key,
  run: async () => {
    log.push(key);
    if (fail) throw new Error("no");
  },
});

test("one job at a time, first asked first done, each key once (failed or not) until forgotten", async () => {
  const queue = new ThumbnailQueue();
  const log: string[] = [];
  queue.request(job("a", log));
  queue.request(job("b", log, true));
  queue.request(job("a", log));
  expect(queue.size).toBe(2);
  const first = queue.pump();
  expect(queue.busy).toBe(true);
  expect(queue.pump()).toBeNull();
  await first;
  await queue.pump();
  expect(log).toEqual(["a", "b"]);
  queue.request(job("a", log));
  queue.request(job("b", log));
  expect(queue.size).toBe(0);
  queue.forget("b");
  queue.request(job("b", log));
  await queue.pump();
  expect(log).toEqual(["a", "b", "b"]);
  expect(queue.pump()).toBeNull();
});

test("a hold (a file operation in flight) starts nothing until released; idle waits for the running job", async () => {
  const queue = new ThumbnailQueue();
  const log: string[] = [];
  let end!: () => void;
  queue.request({ key: "a", run: () => new Promise<void>((resolve) => (end = () => { log.push("a"); resolve(); })) });
  queue.request(job("b", log));
  void queue.pump();
  const release = queue.hold();
  let idle = false;
  const waited = queue.idle().then(() => (idle = true));
  await Promise.resolve();
  expect(idle).toBe(false);
  end();
  await waited;
  expect(queue.pump()).toBeNull();
  release();
  release(); // a second call does nothing
  await queue.pump();
  expect(log).toEqual(["a", "b"]);
  await queue.idle();
});

test("cards out of view drop their waiting jobs", () => {
  const queue = new ThumbnailQueue();
  const log: string[] = [];
  for (const key of ["a", "b", "c"]) queue.request(job(key, log));
  queue.retain(new Set(["c"]));
  expect(queue.size).toBe(1);
  void queue.pump();
  expect(log).toEqual(["c"]);
});
