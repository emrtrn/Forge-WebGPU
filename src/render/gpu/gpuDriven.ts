// The host's GPU-driven drawing (phase 5c step 5.1): the batches of every
// world, culled for the main camera once a frame before the frame renders,
// all their dispatches in one compute pass.
//
// Draw counting: three counts no indirect draw in `renderer.info` (and no
// draw inside a render bundle, 5.3); `lastDraws` is the indirect draws the
// last culled frame issues for the main view, which the `?debug` readout and
// the perf witness add to three's count.
//
// WebGPU only (compute atomics, indirect draws): on the WebGL2 test backend
// `supported` is false and `createBatch` returns null; the owner draws
// nothing GPU-driven there (an open question for 5.4 / 5.5, plan 5c step 5).

import { Matrix4, Vector3, WebGPUCoordinateSystem, type Camera, type ComputeNode, type Object3D, type WebGPURenderer } from "three/webgpu";
import { frustumPlanesOf, type InstanceCullView } from "../../engine/world/instanceCulling.ts";
import { createGpuDrivenBatch, type GpuDrivenBatch, type GpuDrivenBatchOptions } from "./gpuDrivenBatch.ts";

export interface GpuDrivenStats {
  readonly batches: number;
  readonly instances: number;
  /** Indirect draws of the main view in the last culled frame. */
  readonly draws: number;
}

export interface GpuDrivenDrawing {
  readonly supported: boolean;
  /** Null where the backend cannot draw GPU-driven (WebGL2). */
  createBatch(options: GpuDrivenBatchOptions): GpuDrivenBatch | null;
  /** Disposes the batch and stops culling it. */
  removeBatch(batch: GpuDrivenBatch): void;
  /** Culls the batches drawn in `scene` for `camera`; before the frame's render. */
  cull(scene: Object3D, camera: Camera): void;
  /** The view of the last cull (the CPU reference's input), null before one. */
  readonly lastView: InstanceCullView | null;
  /** The batches the last cull dispatched. */
  readonly lastBatches: readonly GpuDrivenBatch[];
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

  return {
    supported,
    createBatch(options) {
      if (!supported) return null;
      const batch = createGpuDrivenBatch(renderer, options);
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
      if (batches.size === 0) return;
      // Before the first frame the camera may still hold a WebGL-style projection.
      if ((camera as { coordinateSystem?: number }).coordinateSystem !== WebGPUCoordinateSystem) return;
      camera.updateMatrixWorld();
      viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      camera.getWorldPosition(position);
      const view: InstanceCullView = { planes: frustumPlanesOf(viewProjection.elements), origin: [position.x, position.y, position.z] };
      const dispatches: ComputeNode[] = [];
      for (const [batch, parent] of batches) {
        // An empty batch still dispatches: its arguments go back to zero instances.
        if (!inScene(parent, scene)) continue;
        dispatches.push(...batch.prepare(view));
        lastBatches.push(batch);
        lastDraws += batch.draws;
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
      return { batches: batches.size, instances, draws: lastDraws };
    },
    dispose() {
      for (const batch of batches.keys()) batch.dispose();
      batches.clear();
      lastBatches = [];
    },
  };
}
