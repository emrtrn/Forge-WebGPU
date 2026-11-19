// Browser-side probes for R9c. Sample timing and instrumented draw counts
// on different frames so the measurement hooks don't inflate submission time.
import { expect, type Page } from "@playwright/test";
import type { Camera, Object3D } from "three";
import type { RenderHost } from "../../src/render/host/renderHost.ts";

export const CITY_FRAME_MS = 1000 / 60;
interface FrameTiming {
  readonly ran: boolean;
  readonly cpuMs: number;
  readonly gpuMs: number | null;
  readonly submitMs: number | null;
}
interface CityDev {
  host(): RenderHost | null;
  pause(): void;
  resume(): void;
  step(ms: number): Promise<FrameTiming>;
  moveCamera(x: number, y: number, z: number, target: readonly [number, number, number]): void;
  streaming(): {
    cells: { actors: number; active: number; fetching: number; queued: number } | null;
    cache: { entries: number; pending: number; pendingEvict: number; evicted: number } | null;
    hlod: { visible: number; loaded: number };
    gpu: { geometries: number; textures: number } | null;
  };
}

declare global {
  interface Window { __forgeDev: CityDev }
}

export async function requireCityGpu(page: Page, profile: string) {
  const { proof, ratio, quality, fallback } = await page.evaluate(() => {
    const host = window.__forgeDev.host()!;
    const backend = host.renderer.backend as unknown as { device?: { adapterInfo?: { isFallbackAdapter?: boolean } } };
    return { proof: host.proof, ratio: host.renderer.getPixelRatio(), quality: host.quality.level,
      fallback: backend.device?.adapterInfo?.isFallbackAdapter ?? null };
  });
  const adapter = Object.values(proof.adapter ?? {}).join(" ");
  expect(proof.backend, "city backend").toBe("webgpu");
  expect(adapter.trim(), "WebGPU adapter identity").not.toBe("");
  expect(fallback, "WebGPU fallback adapter").not.toBe(true);
  expect(adapter, "Use a hardware WebGPU adapter").not.toMatch(/swiftshader|llvmpipe|lavapipe|software|fallback|\bwarp\b/i);
  expect(proof.timestampQuery, "GPU timestamp queries").toBe(true);
  expect(ratio).toBe(1);
  expect(quality).toBe(profile);
  return { ...proof, fallback };
}

export function distribution(values: readonly (number | null)[]) {
  const sorted = values.filter((value): value is number => value !== null && Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const quantile = (q: number) => sorted[Math.ceil(q * sorted.length) - 1]!;
  return { samples: sorted.length, mean: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
    p95: quantile(.95), p99: quantile(.99), max: sorted.at(-1)! };
}

export async function cityFrames(page: Page, count: number, measureCull = false) {
  const frames = await page.evaluate(async ({ count, ms, measureCull }) => {
    const dev = window.__forgeDev;
    dev.pause();
    const host = dev.host();
    if (!host) throw new Error("The city renderer is missing.");
    const { renderer, gpuDriven } = host;
    const frames: (FrameTiming & { gpuComputeMs: number | null; cullCpuMs: number | null })[] = [];
    const cull = gpuDriven.cull;
    let cullCpuMs: number | null = null;
    if (measureCull) gpuDriven.cull = function (...args) {
      const started = performance.now();
      cull.apply(this, args);
      cullCpuMs = performance.now() - started;
    };
    try {
      for (let index = 0; index < count; index += 1) {
        const before = renderer.info.compute.calls;
        const frame = await dev.step(ms);
        if (!frame.ran) throw new Error("The city did not step a frame.");
        const gpuComputeMs = frame.gpuMs === null ? null : renderer.info.compute.calls === before
          ? 0 : (await renderer.resolveTimestampsAsync("compute")) ?? null;
        frames.push({ ...frame, gpuComputeMs, cullCpuMs });
      }
    } finally {
      if (measureCull) gpuDriven.cull = cull;
    }
    return frames;
  }, { count, ms: CITY_FRAME_MS, measureCull });
  return { cpuMs: distribution(frames.map(f => f.cpuMs)), submitMs: distribution(frames.map(f => f.submitMs)),
    ...(measureCull ? { cullCpuMs: distribution(frames.map(f => f.cullCpuMs)) } : {}),
    gpuRenderMs: distribution(frames.map(f => f.gpuMs)),
    gpuComputeMs: distribution(frames.map(f => f.gpuComputeMs)),
    gpuTotalMs: distribution(frames.map(f => f.gpuMs === null || f.gpuComputeMs === null ? null : f.gpuMs + f.gpuComputeMs)),
  };
}

type ViewKey = "main" | "other" | `shadow-${number}` | `camera-${number}`;
interface DrawObject {
  readonly camera: Camera;
  readonly scene: Object3D;
  readonly object: Object3D & { isBatchedMesh?: boolean };
  getIndirect(): unknown;
  getIndirectOffset(): number | readonly number[];
}
type DrawArgs = [DrawObject, { render: { drawCalls: number; triangles: number } },
  unknown, unknown, unknown, unknown, { instanceCount: number }, ...unknown[]];
interface DrawBackend {
  _draw(...args: DrawArgs): void;
  compute(...args: unknown[]): void;
  addBundle(...args: unknown[]): void;
}

export async function cityDraws(page: Page, measureS12 = false) {
  return page.evaluate(async ({ ms, measureS12 }) => {
    const dev = window.__forgeDev;
    const host = dev.host();
    const world = host?.world;
    if (!host || !world) throw new Error("No city world is drawing.");
    const { renderer, gpuDriven } = host;
    const backend = renderer.backend as unknown as DrawBackend;
    if (typeof backend._draw !== "function" || typeof backend.compute !== "function" || typeof backend.addBundle !== "function") {
      throw new Error("The city probe expects the three r187 WebGPU backend.");
    }
    const cameras = new Map<Camera, ViewKey>([[host.camera, "main"]]);
    const shadows: Camera[] = [];
    world.scene.traverse((object) => {
      const light = object as unknown as { isDirectionalLight?: boolean; castShadow: boolean; shadow?: {
        camera: Camera; shadowNode?: { lights?: readonly { shadow: { camera: Camera } }[] };
      } };
      if (light.isDirectionalLight && light.castShadow && renderer.shadowMap.enabled && light.shadow) {
        const cascadeCameras = light.shadow.shadowNode?.lights?.map(cascade => cascade.shadow.camera);
        if (cascadeCameras?.length) shadows.push(...cascadeCameras);
        else shadows.push(light.shadow.camera);
      }
    });
    [...new Set(shadows)].forEach((camera, index) => cameras.set(camera, `shadow-${index + 1}`));
    let auxiliary = 0;
    const views = new Map<ViewKey, {
      direct: number; indirect: number; directTriangles: number; directInstanceDraws: number;
      meshes: Set<string>; gpuInstances: number; gpuTriangles: number;
    }>();
    const bucket = (key: ViewKey) => {
      const current = views.get(key);
      if (current) return current;
      const next = { direct: 0, indirect: 0, directTriangles: 0, directInstanceDraws: 0,
        meshes: new Set<string>(), gpuInstances: 0, gpuTriangles: 0 };
      views.set(key, next);
      return next;
    };
    for (const key of cameras.values()) bucket(key);

    const draw = backend._draw;
    const compute = backend.compute;
    const addBundle = backend.addBundle;
    let dispatches = 0, bundles = 0;
    const autoReset = renderer.info.autoReset;
    renderer.info.autoReset = false;
    renderer.info.reset();
    backend._draw = function (...args) {
      const [item, info, , , , , params] = args;
      const before = { draws: info.render.drawCalls, triangles: info.render.triangles };
      draw.apply(this, args);
      const key = cameras.get(item.camera) ?? (item.scene === world.scene ? `camera-${++auxiliary}` : "other");
      if (key !== "other") cameras.set(item.camera, key);
      const current = bucket(key);
      const direct = info.render.drawCalls - before.draws;
      const offset = item.getIndirectOffset();
      const indirect = !item.object.isBatchedMesh && item.getIndirect() !== null ? (typeof offset === "number" ? 1 : offset.length) : 0;
      current.direct += direct;
      current.indirect += indirect;
      current.directTriangles += info.render.triangles - before.triangles;
      current.directInstanceDraws += direct * params.instanceCount;
      if (direct || indirect) current.meshes.add(item.object.uuid);
    };
    backend.compute = function (...args) { dispatches += 1; compute.apply(this, args); };
    backend.addBundle = function (...args) { bundles += 1; addBundle.apply(this, args); };
    try {
      if (!(await dev.step(ms)).ran) throw new Error("City draw sample did not step.");
    } finally {
      backend._draw = draw;
      backend.compute = compute;
      backend.addBundle = addBundle;
      renderer.info.autoReset = autoReset;
    }
    // City static and shape batches use the ordinary backend path. A future
    // bundle opt-in needs accounting for cached replay as well as recording.
    if (bundles) throw new Error("The city draw probe does not count render bundles.");

    const inputs = gpuDriven.lastViews;
    const s12Batches = [];
    const s12Cells: { name: string; count: number }[] = [];
    if (measureS12) world.scene.traverse(object => {
      if (object.name.startsWith("s12-cell/") && "count" in object && typeof object.count === "number") {
        s12Cells.push({ name: object.name, count: object.count });
      }
    });
    const referencePath = "/src/engine/world/instanceCulling.ts";
    const reference = measureS12 ? await import(referencePath) as typeof import("../../src/engine/world/instanceCulling.ts") : null;
    for (const batch of gpuDriven.lastBatches) {
      const stages = [];
      const accepted = batch.views === inputs.length ? inputs : inputs.filter(view => view.role !== "shadow");
      for (const [index, input] of accepted.slice(0, batch.views).entries()) {
        if (batch.zoneMode === "shadow" && input.role !== "shadow") continue;
        const key = input.role === "main" ? "main" : [...cameras].find(([camera]) => camera.layers.isEnabled(input.layer))?.[1];
        if (key === undefined) continue; // cull-only camera, no renderer view
        const counts = await batch.readCounts(renderer, index);
        if (reference && batch.name.startsWith("s12/")) {
          const { cullInstanceCounts, NO_CULL_DISTANCE } = reference;
          const matrices = batch.instances.matrices(), count = batch.instances.count;
          const frustum = { ...input, minCasterRadius: 0 };
          const frustumOnly = cullInstanceCounts(matrices, count, { ...batch.cullBatch, cullEnd: NO_CULL_DISTANCE }, frustum);
          const withDistance = cullInstanceCounts(matrices, count, batch.cullBatch, frustum);
          const withCaster = cullInstanceCounts(matrices, count, batch.cullBatch, input);
          stages.push({ view: key, tested: count, afterFrustum: frustumOnly.counts[0], afterDistance: withDistance.counts[0],
            afterCaster: withCaster.counts[0], certain: withCaster.certain[0], possible: withCaster.possible[0], drawn: counts[0] });
        }
        const current = bucket(key);
        current.gpuInstances += counts.reduce((sum, count) => sum + count, 0);
        current.gpuTriangles += counts.reduce((sum, count, lod) => sum + count * batch.lodTriangles[lod]!, 0);
      }
      if (stages.length) s12Batches.push({ name: batch.name, path: batch.path, triangles: batch.lodTriangles[0], stages });
    }
    const perView = Object.fromEntries([...views].map(([key, { meshes, ...view }]) => [key, {
      ...view, draws: view.direct + view.indirect, drawnMeshes: meshes.size,
      triangles: view.directTriangles + view.gpuTriangles,
    }]));
    return {
      perView, draws: Object.values(perView).reduce((sum, view) => sum + view.draws, 0),
      triangles: Object.values(perView).reduce((sum, view) => sum + view.triangles, 0),
      dispatches, gpu: gpuDriven.stats(), zones: world.zones?.stats() ?? null, streaming: dev.streaming(),
      ...(measureS12 ? { s12Batches, s12Cells } : {}),
    };
  }, { ms: CITY_FRAME_MS, measureS12 });
}

export async function citySettle(page: Page, requireActiveCells = true) {
  const start = Date.now();
  const deadline = start + 120_000;
  let quiet = 0;
  while (Date.now() < deadline) {
    const settled = await page.evaluate(async ({ ms, requireActiveCells }) => {
      const dev = window.__forgeDev;
      dev.pause();
      await dev.step(ms);
      const { cache, cells } = dev.streaming();
      const cellsReady = (!requireActiveCells || (cells?.active ?? 0) > 0)
        && (cells?.fetching ?? 0) === 0 && (cells?.queued ?? 0) === 0;
      return cache?.pending === 0 && cellsReady
        && dev.host()?.preparingObjects().length === 0;
    }, { ms: CITY_FRAME_MS, requireActiveCells });
    quiet = settled ? quiet + 1 : 0;
    if (quiet === 3) return Date.now() - start;
    await page.waitForTimeout(100);
  }
  throw new Error("Level cells and render resources did not settle.");
}

export async function cityWalk(page: Page, route: readonly (readonly [number, number, number])[], speed: number) {
  const result = await page.evaluate(({ route, speed }) => new Promise<{ intervals: number[]; durationMs: number }>((resolve) => {
    const dev = window.__forgeDev;
    const segments = route.slice(1).map((to, index) => {
      const from = route[index]!;
      return { from, to, length: Math.hypot(to[0] - from[0], to[2] - from[2]) };
    });
    const intervals: number[] = [];
    let start: number | undefined, previous: number | undefined;
    const step = (now: number) => {
      start ??= now;
      if (previous !== undefined) intervals.push(now - previous);
      previous = now;
      let distance = (now - start) / 1000 * speed;
      for (const { from, to, length } of segments) {
        if (distance <= length) {
          const t = distance / length;
          const x = from[0] + (to[0] - from[0]) * t;
          const z = from[2] + (to[2] - from[2]) * t;
          dev.moveCamera(x, from[1], z, [x + to[0] - from[0], from[1], z + to[2] - from[2]]);
          requestAnimationFrame(step);
          return;
        }
        distance -= length;
      }
      const last = route.at(-1)!;
      const { from, to } = segments.at(-1)!;
      dev.moveCamera(...last, [last[0] + to[0] - from[0], last[1], last[2] + to[2] - from[2]]);
      dev.pause();
      resolve({ intervals, durationMs: now - start });
    };
    dev.resume();
    requestAnimationFrame(step);
  }), { route, speed });
  return { speed, durationMs: result.durationMs, frameMs: distribution(result.intervals) };
}

export async function cityHeap(page: Page) {
  const session = await page.context().newCDPSession(page);
  try {
    await session.send("HeapProfiler.collectGarbage");
    return (await session.send("Runtime.getHeapUsage")).usedSize;
  } finally {
    await session.detach();
  }
}
