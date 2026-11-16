// Test-only browser instrumentation; no measurement hooks in the shipped game.
import type { BrowserContext, Page } from "@playwright/test";

export interface CompileTiming { count: number; totalMs: number; maxMs: number }
export interface LoadTiming {
  readyMs: number | null;
  pipelines: Record<string, CompileTiming>;
}

/** Installed before navigation: measure navigation -> settled canvas, and WebGPU API latency. */
export async function installLoadTiming(page: Page | BrowserContext): Promise<void> {
  await page.addInitScript(() => {
    const state: LoadTiming = { readyMs: null, pipelines: {} };
    (window as unknown as { __forgeMeasure: LoadTiming }).__forgeMeasure = state;
    const observer = new MutationObserver(() => {
      if (!document.querySelector("canvas[data-forge-ready='1']")) return;
      state.readyMs = performance.now();
      observer.disconnect();
    });
    observer.observe(document, { attributes: true, attributeFilter: ["data-forge-ready"], subtree: true });
    // Latency at the API boundary, not GPU execution or an isolated shader compiler.
    // Sum of asynchronous calls can overlap and is never presented as load time.
    const ctor = (globalThis as unknown as { GPUDevice?: { prototype: Record<string, unknown> } }).GPUDevice;
    if (!ctor) return;
    for (const name of ["createShaderModule", "createRenderPipeline", "createRenderPipelineAsync", "createComputePipeline", "createComputePipelineAsync"]) {
      const original = ctor.prototype[name];
      if (typeof original !== "function") continue;
      ctor.prototype[name] = function (this: unknown, ...args: unknown[]) {
        const started = performance.now();
        const record = () => {
          const ms = performance.now() - started;
          const timing = state.pipelines[name] ??= { count: 0, totalMs: 0, maxMs: 0 };
          timing.count += 1; timing.totalMs += ms; timing.maxMs = Math.max(timing.maxMs, ms);
        };
        try {
          const result: unknown = original.apply(this, args);
          if (result instanceof Promise) return result.finally(record);
          record();
          return result;
        } catch (error) { record(); throw error; }
      };
    }
  });
}

export async function loadTiming(page: Page): Promise<LoadTiming> {
  return page.evaluate(() => structuredClone((window as unknown as { __forgeMeasure: LoadTiming }).__forgeMeasure));
}

export interface FrameWindow {
  readonly intervals: readonly number[];
  /** Published every 500 ms, GPU entries are rolling timestamp-query means (120 samples). */
  readonly witnesses: readonly Record<string, number | string | boolean | null>[];
  readonly durationMs: number;
  readonly visible: boolean;
}

export async function frameWindow(page: Page, durationMs: number): Promise<FrameWindow> {
  return page.evaluate((duration) => new Promise<FrameWindow>((resolve) => {
    const started = performance.now();
    const intervals: number[] = [];
    const witnesses: Record<string, number | string | boolean | null>[] = [];
    let last: number | null = null;
    let lastWitness: string | null = null;
    let visible = !document.hidden;
    const sample = (now: number) => {
      visible &&= !document.hidden;
      if (last !== null) intervals.push(now - last);
      last = now;
      const value = document.querySelector("canvas")?.getAttribute("data-forge-perf") ?? null;
      if (value !== null && value !== lastWitness) { witnesses.push(JSON.parse(value)); lastWitness = value; }
      if (now - started < duration) requestAnimationFrame(sample);
      else resolve({ intervals, witnesses, durationMs: now - started, visible });
    };
    requestAnimationFrame(sample);
  }), durationMs);
}
