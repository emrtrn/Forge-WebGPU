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
// - The instanced statics (static mesh, shape) are occludees too: each part
//   in the frustum counts as an object draw, as today's batch draw (hidden
//   only when all its instances in view are), and as a batch split by world
//   cell (`OcclusionStudyDraws`): what an occlusion pass could save in draws.
// - The result is an upper bound for a current-frame occluder pass: a
//   previous-frame or two-phase design hides at most this much, and a GPU
//   Hi-Z built from a lower-resolution depth hides less.

import { DepthTexture, FloatType, Frustum, Matrix4, RenderTarget, Sphere, StorageBufferAttribute, Vector2, Vector3, type Camera, type InstancedMesh, type Object3D, type WebGPURenderer } from "three/webgpu";
import { Fn, If, instanceIndex, int, ivec2, storage, textureLoad, uint } from "three/tsl";
import { buildHiZ, sphereOccluded } from "../../engine/world/hiZ.ts";
import { cullInstanceCounts, maxAxisScale } from "../../engine/world/instanceCulling.ts";
import { MATRIX_FLOATS } from "./gpuInstances.ts";
import type { RenderHost } from "../host/renderHost.ts";
import { instanceActorsOf } from "../sync/pickTags.ts";

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

/**
 * The instanced statics (static mesh, shape) as occludees (plan 5c R9a, indoor
 * study): what occlusion could save in draws at three granularities.
 */
export interface OcclusionStudyDraws {
  /** Instance parts in the frustum, each counted as its own draw (per-object culling, no instancing). */
  readonly objects: number;
  readonly objectsOccluded: number;
  /** Instanced meshes as drawn today with an instance in the frustum: hidden only when all of those are occluded. */
  readonly batches: number;
  readonly batchesOccluded: number;
  /** The same meshes split by world cell (x / z, `cellSize`): one draw per mesh and cell. */
  readonly cellSize: number;
  readonly cells: number;
  readonly cellsOccluded: number;
  readonly triangles: number;
  readonly trianglesOccluded: number;
}

export interface OcclusionStudy {
  readonly width: number;
  readonly height: number;
  /** CPU time of the Hi-Z build and the tests (ms). */
  readonly cpuMs: number;
  /** Share of the depth image that is sky (nothing drawn on layer 0). */
  readonly skyShare: number;
  readonly batches: readonly OcclusionStudyBatch[];
  readonly statics: OcclusionStudyDraws;
}

export async function occlusionStudy(host: RenderHost, cellSize = 16): Promise<OcclusionStudy> {
  const world = host.world;
  const view = host.gpuDriven.lastView;
  if (!world) throw new Error("occlusion study: no world is drawn");
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
  // GPU-driven batches only after a culled frame (a scene without them has no main view).
  const batches = !view ? [] : host.gpuDriven.lastBatches.map((batch): OcclusionStudyBatch => {
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
  const statics = staticDraws(world.root, camera, (sphere) => sphereOccluded(hiz, viewProjection, [sphere.center.x, sphere.center.y, sphere.center.z], sphere.radius), cellSize);
  return { width, height, cpuMs: performance.now() - started, skyShare: sky / depth.length, batches, statics };
}

/** The drawn instanced statics under `root`, per instance part, against `occluded`. */
function staticDraws(root: Object3D, camera: Camera, occluded: (sphere: Sphere) => boolean, cellSize: number): OcclusionStudyDraws {
  const frustum = new Frustum().setFromProjectionMatrix(
    new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse), camera.coordinateSystem, (camera as Camera & { reversedDepth?: boolean }).reversedDepth);
  const local = new Matrix4(), world = new Matrix4(), sphere = new Sphere();
  let objects = 0, objectsOccluded = 0, batches = 0, batchesOccluded = 0, triangles = 0, trianglesOccluded = 0;
  const cells = new Map<string, boolean>();
  root.updateMatrixWorld(true);
  root.traverseVisible((object) => {
    const mesh = object as InstancedMesh;
    if (!mesh.isInstancedMesh || instanceActorsOf(mesh) === null || !mesh.layers.isEnabled(0)) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    // A LOD source only picks (its draws are the GPU path's, counted above).
    if (!materials.some((material) => material.visible)) return;
    const geometry = mesh.geometry;
    if (!geometry.boundingSphere) geometry.computeBoundingSphere();
    const parts = Math.floor((geometry.index ? geometry.index.count : geometry.attributes.position!.count) / 3);
    let inView = 0, hidden = 0;
    for (let i = 0; i < mesh.count; i += 1) {
      mesh.getMatrixAt(i, local);
      world.multiplyMatrices(mesh.matrixWorld, local);
      sphere.copy(geometry.boundingSphere!).applyMatrix4(world);
      if (!frustum.intersectsSphere(sphere)) continue;
      const behind = occluded(sphere);
      inView += 1; objects += 1; triangles += parts;
      if (behind) { hidden += 1; objectsOccluded += 1; trianglesOccluded += parts; }
      const key = `${mesh.uuid}:${Math.floor(sphere.center.x / cellSize)}:${Math.floor(sphere.center.z / cellSize)}`;
      cells.set(key, (cells.get(key) ?? true) && behind);
    }
    if (inView === 0) return;
    batches += 1;
    if (hidden === inView) batchesOccluded += 1;
  });
  let cellsOccluded = 0;
  for (const all of cells.values()) if (all) cellsOccluded += 1;
  return { objects, objectsOccluded, batches, batchesOccluded, cellSize, cells: cells.size, cellsOccluded, triangles, trianglesOccluded };
}
