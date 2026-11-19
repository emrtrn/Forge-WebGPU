import { Group, Matrix4 } from "three/webgpu";
import { createCpuDrivenBatch } from "../../../src/render/gpu/cpuDrivenBatch.ts";
import type { GpuDrivenBatch } from "../../../src/render/gpu/gpuDrivenBatch.ts";
import type {} from "../cityPage.ts";

/** Replay the resident S12 street populations at an exact part-instance budget. */
export async function measureCpuTwin(count: number, warmFrames: number, frames: number) {
  const host = window.__forgeDev.host();
  if (!host || host.proof.backend !== "webgl2") throw new Error("S12 CPU replay requires WebGL2.");
  const { renderer, gpuDriven } = host;
  const sources = gpuDriven.lastBatches.filter(batch => batch.name.startsWith("s12/") && batch.instances.count > 0);
  const liveCount = sources.reduce((sum, batch) => sum + batch.instances.count, 0);
  if (!liveCount || !gpuDriven.lastViews.length) throw new Error("No S12 city candidate was culled on WebGL2.");

  // These objects are detached. The timed section covers the production CPU
  // twin's tests, compaction and attribute writes, without WebGL driver work.
  const views = gpuDriven.lastViews;
  const parent = new Group();
  const batches: GpuDrivenBatch[] = [];
  let sourceOffset = 0, replayOffset = 0;
  try {
    for (const source of sources) {
      sourceOffset += source.instances.count;
      const end = Math.floor(count * sourceOffset / liveCount);
      const population = end - replayOffset;
      replayOffset = end;
      if (!population) continue;

      const mesh = source.meshes[0]!;
      const rule = source.cullBatch;
      const batch = createCpuDrivenBatch(renderer, {
        name: source.name, parent, capacity: population, distanceMode: rule.distanceMode,
        bounds: { center: rule.center, radius: rule.radius },
        lods: [[{ name: mesh.name, geometry: mesh.geometry, material: mesh.material, local: new Matrix4() }]],
        castShadow: source.views === views.length,
      });
      batches.push(batch);
      batch.setDistances({ cullEnd: rule.cullEnd, fadeStart: .8 * rule.cullEnd, lodStarts: [] });
      const matrices = new Float32Array(population * 16);
      const sourceMatrices = source.instances.matrices();
      for (let i = 0; i < population; i += 1) {
        const at = (i % source.instances.count) * 16;
        matrices.set(sourceMatrices.subarray(at, at + 16), i * 16);
      }
      batch.instances.addMany(matrices, population);
    }

    const samples: number[] = [];
    for (let i = 0; i < warmFrames + frames; i += 1) {
      const before = performance.now();
      for (const batch of batches) batch.prepare(views);
      if (i >= warmFrames) samples.push(performance.now() - before);
    }
    const visible = await Promise.all(batches.map(async batch => ({
      name: batch.name, count: batch.instances.count,
      perView: await Promise.all(Array.from({ length: batch.views }, async (_, view) => (await batch.readCounts(renderer, view))[0])),
    })));
    return { liveCount, visible, views: views.map(view => view.role), samples };
  } finally {
    for (const batch of batches) batch.dispose();
  }
}
