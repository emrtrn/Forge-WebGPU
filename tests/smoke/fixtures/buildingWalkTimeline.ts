type Dev = Window["__forgeDev"];

export function buildingWalkTimeline(dev: Dev) {
  const host = dev.host()!;
  const zones = host.world?.zones;
  const owner = host.world?.resources.owner;
  performance.clearResourceTimings();
  const started = performance.now();
  const events: { name: string; startMs: number; syncMs: number; wallMs?: number }[] = [];
  const frames: { rafMs: number; callbackMs: number; cells: ReturnType<Dev["streamingFrame"]>; submitMs: number }[] = [];
  const gpu: { atMs: number; timing: ReturnType<typeof host.perf.gpu> }[] = [];
  const restore: (() => void)[] = [];

  function timed<R>(name: string, run: () => R): R {
    const startMs = performance.now() - started;
    const result = run();
    const syncMs = performance.now() - started - startMs;
    const event: (typeof events)[number] = { name, startMs, syncMs };
    events.push(event);
    if (result instanceof Promise) {
      // Async wall time includes scheduler and driver waits. Only syncMs is on this call's stack.
      const done = () => { event.wallMs = performance.now() - started - startMs; };
      void result.then(done, done);
    }
    return result;
  }

  function wrap<A extends unknown[], R>(target: object, key: string, name: string) {
    const methods = target as Record<string, ((...args: A) => R) | undefined>;
    const original = methods[key];
    if (!original) return;
    const own = Object.hasOwn(target, key);
    methods[key] = function (this: object, ...args: A): R {
      return timed(name, () => original.apply(this, args));
    };
    restore.push(() => { if (own) methods[key] = original; else delete methods[key]; });
  }

  wrap(host, "frame", "render.frame");
  if (zones) wrap(zones, "refresh", "wp.zoneRefresh");
  if (zones?.residency) wrap(zones.residency, "update", "building.update");
  if (owner) {
    const acquire = owner.acquire;
    owner.acquire = <T>(key: string, load: () => T | Promise<T>) => acquire<T>(key, () => timed(`resource.load:${key}`, load));
    restore.push(() => { owner.acquire = acquire; });
  }
  wrap(host.renderer, "compileAsync", "pipeline.prepare");
  const device = (host.renderer.backend as unknown as { device?: object }).device;
  if (device) for (const name of ["createShaderModule", "createRenderPipeline", "createRenderPipelineAsync", "createComputePipeline", "createComputePipelineAsync"]) {
    wrap(device, name, `pipeline.${name}`);
  }

  return {
    frame(raf: number) {
      const callbackMs = performance.now() - started;
      frames.push({ rafMs: raf - started, callbackMs, cells: dev.streamingFrame(), submitMs: host.renderSubmitMs });
      if (!gpu.length || callbackMs - gpu[gpu.length - 1]!.atMs >= 500) gpu.push({ atMs: callbackMs, timing: host.perf.gpu() });
    },
    finish() {
      restore.reverse().forEach(undo => undo());
      const requests = (performance.getEntriesByType("resource") as PerformanceResourceTiming[])
        .filter(entry => entry.responseEnd >= started)
        .map(entry => ({ name: entry.name, startMs: entry.startTime - started, durationMs: entry.duration }));
      return { startMs: started, frames, events, requests, gpu };
    },
  };
}
