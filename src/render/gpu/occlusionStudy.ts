// Development only (plan 5c R9a, occlusion study): how much of the GPU-driven
// batches an occlusion pass could hide in the current frame, before any
// occlusion design is chosen. Not a culling path: nothing is hidden.
//
// - Occluders: the scene drawn again from the main camera on layer 0 only
//   (terrain, instanced statics, every ordinary mesh; no GPU-driven instance:
//   they live on view layers), into a depth target at drawing-buffer size.
//   Reversed depth (near 1, far 0), as the renderer draws.
// - The depth is copied into a storage buffer by a compute pass and read
//   back; the CPU builds a Hi-Z pyramid (`engine/world/hiZ.ts`) and tests the
//   bounding sphere of every instance the main view's frustum / distance /
//   LOD cull keeps (`cullInstanceCounts`), conservatively.
// - The result is an upper bound for a current-frame occluder pass: a
//   previous-frame or two-phase design hides at most this much, and a GPU
//   Hi-Z built from a lower-resolution depth hides less.

import { DepthTexture, FloatType, Matrix4, RenderTarget, StorageBufferAttribute, Vector2, Vector3, type WebGPURenderer } from "three/webgpu";
import { Fn, If, instanceIndex, int, ivec2, storage, textureLoad, uint } from "three/tsl";
import { buildHiZ, sphereOccluded } from "../../engine/world/hiZ.ts";
import { cullInstanceCounts, maxAxisScale } from "../../engine/world/instanceCulling.ts";
import { MATRIX_FLOATS } from "./gpuInstances.ts";
import type { RenderHost } from "../host/renderHost.ts";

export interface OcclusionStudyBatch {
  readonly name: string;
  readonly instances: number;
  /** Kept by the main view's frustum / distance / LOD cull. */
  readonly visible: number;
  /** Of those, certainly behind the occluder depth. */
  readonly occluded: number;
  readonly visibleTriangles: number;
  readonly occludedTriangles: number;
}

export interface OcclusionStudy {
  readonly width: number;
  readonly height: number;
  /** CPU time of the Hi-Z build and the tests (ms). */
  readonly cpuMs: number;
  /** Share of the depth image that is sky (nothing drawn on layer 0). */
  readonly skyShare: number;
  readonly batches: readonly OcclusionStudyBatch[];
}

export async function occlusionStudy(host: RenderHost): Promise<OcclusionStudy> {
  const world = host.world;
  const view = host.gpuDriven.lastView;
  if (!world || !view) throw new Error("occlusion study: no culled frame yet");
  if (!host.gpuDriven.supported) throw new Error("occlusion study: WebGPU only");
  const renderer = host.renderer as WebGPURenderer;
  const camera = host.camera;
  const size = renderer.getDrawingBufferSize(new Vector2());
  const width = Math.max(1, Math.floor(size.x)), height = Math.max(1, Math.floor(size.y));

  const target = new RenderTarget(width, height, { depthTexture: new DepthTexture(width, height, FloatType) });
  const buffer = new StorageBufferAttribute(new Float32Array(width * height), 1);
  const mask = camera.layers.mask;
  const previousTarget = renderer.getRenderTarget(), previousMrt = renderer.getMRT();
  try {
    camera.layers.set(0);
    renderer.setMRT(null);
    renderer.setRenderTarget(target);
    renderer.render(world.scene, camera);
  } finally {
    camera.layers.mask = mask;
    renderer.setRenderTarget(previousTarget);
    renderer.setMRT(previousMrt);
  }
  const out = storage(buffer, "float", width * height);
  const copy = Fn(() => {
    If(instanceIndex.lessThan(uint(width * height)), () => {
      const x = int(instanceIndex.mod(uint(width))), y = int(instanceIndex.div(uint(width)));
      out.element(instanceIndex).assign(textureLoad(target.depthTexture!, ivec2(x, y)).x);
    });
  })().compute(width * height, [64]);
  await renderer.computeAsync(copy);
  const depth = new Float32Array(await renderer.getArrayBufferAsync(buffer));
  copy.dispose(); buffer.dispose(); target.dispose();

  const started = performance.now();
  let sky = 0;
  for (let i = 0; i < depth.length; i += 1) if (depth[i]! <= 0) sky += 1;
  const hiz = buildHiZ(depth, width, height, true);
  camera.updateMatrixWorld();
  const viewProjection = new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).elements;
  const center = new Vector3(), instance = new Matrix4();
  const batches = host.gpuDriven.lastBatches.map((batch): OcclusionStudyBatch => {
    const matrices = batch.instances.matrices();
    const cull = batch.cullBatch;
    const result = cullInstanceCounts(matrices, batch.instances.count, cull, view);
    let visible = 0, occluded = 0, visibleTriangles = 0, occludedTriangles = 0;
    result.visible.forEach((list, lod) => {
      const triangles = batch.lodTriangles[lod] ?? 0;
      for (const at of list) {
        visible += 1; visibleTriangles += triangles;
        instance.fromArray(matrices, at * MATRIX_FLOATS);
        center.set(...cull.center).applyMatrix4(instance);
        const radius = cull.radius * maxAxisScale(matrices, at * MATRIX_FLOATS);
        if (sphereOccluded(hiz, viewProjection, [center.x, center.y, center.z], radius)) { occluded += 1; occludedTriangles += triangles; }
      }
    });
    return { name: batch.name, instances: batch.instances.count, visible, occluded, visibleTriangles, occludedTriangles };
  });
  return { width, height, cpuMs: performance.now() - started, skyShare: sky / depth.length, batches };
}
