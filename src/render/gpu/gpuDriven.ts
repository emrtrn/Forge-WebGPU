// The host's GPU-driven drawing (phase 5c step 5.1): the batches of every
// world, culled for the main camera once a frame before the frame renders,
// all their dispatches in one compute pass.
//
// Draw counting: three counts no indirect draw in `renderer.info` (and no
// draw inside a render bundle, 5.3); `lastDraws` is the draws of the last
// culled frame three did not count, which the `?debug` readout and the perf
// witness add to three's count.
//
// The GPU path needs WebGPU (compute atomics, indirect draws). On the WebGL2
// test backend `supported` is false and `createBatch` builds the CPU twin
// (`cpuDrivenBatch.ts`: the CPU reference culls, instanced meshes draw; user
// decision 2026-11-17), behind the same interface.

import { Matrix4, Vector3, WebGPUCoordinateSystem, type Camera, type ComputeNode, type Object3D, type WebGPURenderer } from "three/webgpu";
import { frustumPlanesOf, type InstanceCullView } from "../../engine/world/instanceCulling.ts";
import { createCpuDrivenBatch } from "./cpuDrivenBatch.ts";
import { createGpuDrivenBatch, type GpuDrivenBatch, type GpuDrivenBatchOptions } from "./gpuDrivenBatch.ts";

export interface GpuDrivenStats {
  readonly batches: number;
  readonly instances: number;
  /** Draws of the main view in the last culled frame (counted by three or not). */
  readonly draws: number;
}

export interface GpuDrivenDrawing {
  /** The GPU path (WebGPU); false: batches are the CPU twin (WebGL2). */
  readonly supported: boolean;
  createBatch(options: GpuDrivenBatchOptions): GpuDrivenBatch;
  /** Disposes the batch and stops culling it. */
  removeBatch(batch: GpuDrivenBatch): void;
  /** Culls the batches drawn in `scene` for `camera`; before the frame's render. */
  cull(scene: Object3D, camera: Camera): void;
  /** The view of the last cull (the CPU reference's input), null before one. */
  readonly lastView: InstanceCullView | null;
  /** The batches the last cull dispatched. */
  readonly lastBatches: readonly GpuDrivenBatch[];
  /** Draws of the last culled frame `renderer.info` did not count. */
  readonly lastDraws: number;
  stats(): GpuDrivenStats;
  dispose(): void;
}

function inScene(object: Object3D, scene: Object3D): boolean {
  for (let at: Object3D | null = object; at; at = at.parent) if (at === scene) return true;
  return false;
}

export function createGpuDriven(renderer: WebGPURenderer): GpuDrivenDrawing {
  const supported = (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend === true;
  const batches = new Map<GpuDrivenBatch, Object3D>();
  const viewProjection = new Matrix4();
  const position = new Vector3();
  let lastView: InstanceCullView | null = null;
  let lastBatches: GpuDrivenBatch[] = [];
  let lastDraws = 0;
  let draws = 0;

  return {
    supported,
    createBatch(options) {
      const batch = supported ? createGpuDrivenBatch(renderer, options) : createCpuDrivenBatch(renderer, options);
      batches.set(batch, options.parent);
      return batch;
    },
    removeBatch(batch) {
      if (!batches.delete(batch)) return;
      batch.dispose();
      lastBatches = lastBatches.filter((entry) => entry !== batch);
    },
    cull(scene, camera) {
      lastBatches = [];
      lastDraws = 0;
      draws = 0;
      if (batches.size === 0) return;
      // Before the first WebGPU frame the camera may still hold a WebGL-style projection.
      const webgpuClip = (camera as { coordinateSystem?: number }).coordinateSystem === WebGPUCoordinateSystem;
      if (supported && !webgpuClip) return;
      camera.updateMatrixWorld();
      viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      camera.getWorldPosition(position);
      const planes = frustumPlanesOf(viewProjection.elements, webgpuClip ? "zeroToOne" : "minusOneToOne");
      const view: InstanceCullView = { planes, origin: [position.x, position.y, position.z] };
      const dispatches: ComputeNode[] = [];
      for (const [batch, parent] of batches) {
        // An empty batch still dispatches: its arguments go back to zero instances.
        if (!inScene(parent, scene)) continue;
        dispatches.push(...batch.prepare(view));
        lastBatches.push(batch);
        lastDraws += batch.uncountedDraws;
        draws += batch.draws;
      }
      lastView = view;
      if (dispatches.length > 0) renderer.compute(dispatches);
    },
    get lastView() { return lastView; },
    get lastBatches() { return lastBatches; },
    get lastDraws() { return lastDraws; },
    stats() {
      let instances = 0;
      for (const batch of batches.keys()) instances += batch.instances.count;
      return { batches: batches.size, instances, draws };
    },
    dispose() {
      for (const batch of batches.keys()) batch.dispose();
      batches.clear();
      lastBatches = [];
    },
  };
}
