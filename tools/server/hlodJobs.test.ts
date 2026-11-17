import { expect, test } from "vitest";
import { createHlodJobs, type HlodWork } from "./hlodJobs.ts";
import type { HlodJobRequest, HlodJobResult } from "../world/hlodService.ts";

const turn = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
function harness() {
  const calls: { request: HlodJobRequest; finish(value: HlodJobResult): void; fail(error: Error): void; cancelled: boolean; phase(name: "checking" | "building"): void }[] = [];
  const jobs = createHlodJobs({ engineRoot: ".", project: "project", run: (request, phase): HlodWork => {
    let finish!: (value: HlodJobResult) => void, fail!: (error: Error) => void;
    const result = new Promise<HlodJobResult>((resolve, reject) => { finish = resolve; fail = reject; });
    const call = { request, finish, fail, phase, cancelled: false }; calls.push(call);
    return { result, cancel: () => { call.cancelled = true; fail(new Error("cancelled")); } };
  } });
  return { calls, jobs };
}
const current = (publication = "one"): HlodJobResult => ({ state: "current", publication, built: true });

test("one project worker, rapid saves coalesce and polling never adds work", async () => {
  const { jobs, calls } = harness();
  jobs.request({ level: "a", build: true }); await turn();
  calls[0]!.phase("building"); expect(jobs.status("a").state).toBe("building");
  jobs.request({ level: "a", build: false }); jobs.request({ level: "a", build: true, force: true });
  jobs.request({ level: "b", build: true });
  for (let i = 0; i < 20; i++) jobs.status("a");
  expect(calls).toHaveLength(1); expect(jobs.status("a").queued).toBe(true);
  calls[0]!.finish(current()); await turn(); expect(calls).toHaveLength(2);
  expect(calls[1]!.request).toMatchObject({ level: "a", build: true, force: true });
  calls[1]!.finish(current("two")); await turn(); expect(calls).toHaveLength(3);
  expect(calls[2]!.request.level).toBe("b"); calls[2]!.finish(current()); await turn();
  expect(jobs.status("a")).toMatchObject({ state: "current", publication: "two", queued: false }); jobs.dispose();
});

test("superseded input retries latest request; failure stops until explicit retry", async () => {
  const { jobs, calls } = harness();
  jobs.request({ level: "a", build: true }); await turn();
  calls[0]!.finish({ state: "superseded", built: false, publication: null }); await turn();
  expect(calls).toHaveLength(2); calls[1]!.fail(new Error("bad model")); await turn();
  expect(jobs.status("a")).toMatchObject({ state: "failed", message: "bad model", queued: false });
  await turn(); expect(calls).toHaveLength(2);
  jobs.request({ level: "a", build: true, force: true }); await turn();
  calls[2]!.finish(current()); await turn(); expect(jobs.status("a").state).toBe("current"); jobs.dispose();
});

test("disposing cancels the active child and drops queued work", async () => {
  const { jobs, calls } = harness();
  jobs.request({ level: "a", build: true }); await turn(); jobs.request({ level: "b", build: true });
  jobs.dispose(); await turn(); expect(calls).toHaveLength(1); expect(calls[0]!.cancelled).toBe(true);
  expect(() => jobs.request({ level: "b", build: true })).toThrow(/disposed/);
});
