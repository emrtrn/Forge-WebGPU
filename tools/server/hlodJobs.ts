// One background HLOD worker per project. HTTP polling never starts work.
import { fork } from "node:child_process";
import { resolve } from "node:path";
import type { HlodBuildRequest, HlodBuildStatus } from "../../src/core/level/hlodBuild.ts";
import type { HlodJobRequest, HlodJobResult } from "../world/hlodService.ts";

export interface HlodWork {
  readonly result: Promise<HlodJobResult>;
  cancel(): void;
}
export interface HlodJobs {
  request(request: HlodBuildRequest): HlodBuildStatus;
  status(level: string): HlodBuildStatus;
  dispose(): void;
}

/** A separate process keeps model decoding / simplification off Vite's thread. */
export function startHlodWorker(request: HlodJobRequest, phase: (name: "checking" | "building") => void): HlodWork {
  const child = fork(resolve(request.engineRoot, "tools/world/hlodWorker.ts"), [], {
    cwd: request.engineRoot, execArgv: [], windowsHide: true,
    stdio: ["ignore", "ignore", "pipe", "ipc"],
  });
  let errorText = "";
  child.stderr?.on("data", (bytes: Buffer) => { errorText = (errorText + bytes.toString()).slice(-4096); });
  const result = new Promise<HlodJobResult>((accept, reject) => {
    let settled = false;
    const finish = (error: Error | null, value?: HlodJobResult): void => {
      if (settled) return;
      settled = true;
      if (error) reject(error); else accept(value!);
    };
    child.on("error", (error) => finish(error));
    child.on("message", (message: unknown) => {
      if (!message || typeof message !== "object") return;
      const value = message as { phase?: string; ok?: boolean; result?: HlodJobResult; message?: string };
      if (value.phase === "checking" || value.phase === "building") phase(value.phase);
      else if (value.ok === true && value.result) finish(null, value.result);
      else if (value.ok === false) finish(new Error(value.message ?? "HLOD generation failed"));
    });
    child.on("exit", (code) => finish(new Error(errorText.trim() || `HLOD worker exited before answering (${code ?? "terminated"})`)));
    child.send(request, (error) => { if (error) finish(error); });
  });
  return { result, cancel: () => { if (child.connected) child.disconnect(); } };
}

export function createHlodJobs(options: {
  readonly engineRoot: string;
  readonly project: string;
  readonly run?: typeof startHlodWorker;
}): HlodJobs {
  const states = new Map<string, HlodBuildStatus>();
  const pending = new Map<string, HlodBuildRequest>();
  let active: HlodWork | null = null;
  let disposed = false;
  const initial = (level: string): HlodBuildStatus => ({ level, state: "missing", queued: false, publication: null });
  const status = (level: string): HlodBuildStatus => ({ ...(states.get(level) ?? initial(level)), queued: pending.has(level) });
  const pump = (): void => {
    if (active || disposed) return;
    const next = pending.entries().next().value as [string, HlodBuildRequest] | undefined;
    if (!next) return;
    const [level, request] = next;
    pending.delete(level);
    states.set(level, { ...status(level), state: "checking", queued: false, message: "" });
    let work: HlodWork;
    try {
      work = (options.run ?? startHlodWorker)({ ...request, project: options.project, engineRoot: options.engineRoot }, (state) => {
        if (!disposed) states.set(level, { ...status(level), state });
      });
    } catch (error) {
      states.set(level, { ...status(level), state: "failed", message: error instanceof Error ? error.message : String(error) });
      queueMicrotask(pump);
      return;
    }
    active = work;
    void work.result.then((result) => {
      if (disposed) return;
      if (result.state === "superseded") {
        const queued = pending.get(level);
        pending.set(level, { level, build: request.build || queued?.build === true, force: request.force || queued?.force === true });
        states.set(level, { ...status(level), state: "checking", message: "Sources changed; checking the latest saved scene" });
      } else {
        states.set(level, {
          level, state: result.state, queued: pending.has(level), publication: result.publication,
          ...(result.report ? { report: result.report } : {}),
          ...(result.completedAt ? { completedAt: result.completedAt } : {}),
          ...(result.message ? { message: result.message } : {}),
        });
      }
    }, (error: unknown) => {
      if (!disposed) states.set(level, { ...status(level), state: "failed", message: error instanceof Error ? error.message : String(error) });
    }).finally(() => { active = null; pump(); });
  };
  return {
    request(request) {
      if (disposed) throw new Error("HLOD jobs are disposed");
      const queued = pending.get(request.level);
      pending.set(request.level, { level: request.level, build: request.build || queued?.build === true, force: request.force || queued?.force === true });
      const previous = status(request.level);
      states.set(request.level, { ...previous, state: previous.state === "building" ? "building" : "checking", queued: true, message: "" });
      queueMicrotask(pump);
      return status(request.level);
    },
    status,
    dispose() { disposed = true; pending.clear(); active?.cancel(); active = null; },
  };
}
