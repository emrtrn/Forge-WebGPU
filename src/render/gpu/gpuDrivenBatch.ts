// One GPU-driven batch (phase 5c step 5.1, decision 5; spike result: one
// GPU-driven path for statics and foliage). A template (its LODs, each a list
// of parts) drawn at every instance of a `GpuInstances` set:
//
// - Per view, three compute dispatches: reset the per-LOD counters; cull one
//   thread per instance (bounding sphere against the six planes, measured
//   distance against the cull end, LOD by distance; the same rules as the CPU
//   reference `engine/world/instanceCulling.ts`) and append its index to its
//   LOD's visible list with an atomic counter; write each draw's
//   `instanceCount` from its LOD's counter. No CPU readback.
// - Every (LOD, part, material group) is one `drawIndexedIndirect`: a mesh
//   whose geometry shares the part's attributes and index, with its own
//   arguments (index count and first index of its group). The vertex stage
//   reads `visible[lod × capacity + instance_index]` and that instance's
//   matrix × the part's matrix replaces the model matrices through an
//   override context (the material's own position / normal nodes still run
//   in model space, as for an ordinary mesh).
// - The fade band dithers in the material (5b's screen-door threshold,
//   `detailFade.ts`), times the instance's own fade (extras.x).
// - Main view only (5.1): the meshes do not cast shadows. The cascades get
//   their own views and meshes on their own layers (5.2); the draws go into
//   a `BundleGroup` (5.3). Nothing here records per-frame CPU state into the
//   meshes: what changes per frame is uniforms and GPU buffers.
// - The instance buffers growing replaces the compute nodes, materials and
//   meshes (`GpuInstances.generation`); nothing else does.
// - WebGPU only: the WebGL2 fallback has no compute atomics or indirect
//   draws; `gpuDriven.ts` does not build batches there.

import {
  BufferGeometry,
  IndirectStorageBufferAttribute,
  Matrix4,
  Mesh,
  StorageBufferAttribute,
  Uint32BufferAttribute,
  Vector2,
  Vector3,
  Vector4,
  type ComputeNode,
  type Material,
  type Node,
  type NodeMaterial,
  type Object3D,
  type WebGPURenderer,
} from "three/webgpu";
import {
  Fn,
  If,
  Return,
  atomicAdd,
  atomicStore,
  bool,
  cameraViewMatrix,
  distance,
  dot,
  float,
  instanceIndex,
  length,
  mat3,
  max,
  modelNormalMatrix,
  modelPosition,
  modelViewPosition,
  modelWorldMatrix,
  modelWorldMatrixInverse,
  overrideNodes,
  select,
  smoothstep,
  storage,
  uint,
  uniform,
  uniformArray,
  varying,
  vec4,
  velocity,
} from "three/tsl";
import type { Vec3 } from "../../core/schema/fields.ts";
import { SCENE_SOURCE_KEY } from "../../engine/perf/sceneCost.ts";
import {
  MAX_INSTANCE_LODS,
  NO_CULL_DISTANCE,
  type InstanceCullBatch,
  type InstanceCullView,
  type InstanceDistanceMode,
} from "../../engine/world/instanceCulling.ts";
import { detailFadeDither } from "../materials/detailFade.ts";
import { createGpuInstances, type GpuInstances } from "./gpuInstances.ts";

/** u32 arguments of one `drawIndexedIndirect`: index count, instance count, first index, base vertex, first instance. */
const ARGS = 5;
const WORKGROUP = 64;

export interface GpuBatchPart {
  readonly geometry: BufferGeometry;
  readonly material: Material | Material[];
  /** The part's matrix in the template. */
  readonly local: Matrix4;
  readonly name: string;
}

export interface GpuDrivenBatchOptions {
  readonly name: string;
  readonly parent: Object3D;
  /** LOD 0 first; each LOD the template's parts at that detail. */
  readonly lods: readonly (readonly GpuBatchPart[])[];
  /** The template's bounding sphere, template space (every LOD inside it). */
  readonly bounds: { readonly center: Readonly<Vec3>; readonly radius: number };
  readonly distanceMode: InstanceDistanceMode;
  /** The `?debug` scene-cost bucket (`SCENE_SOURCE_KEY`). */
  readonly source?: string;
  readonly capacity?: number;
}

/** The fade band and LOD starts, in measured distance (the owner applies the quality scales). */
export interface GpuBatchDistances {
  readonly fadeStart: number;
  /** Culled from here; {@link NO_CULL_DISTANCE} never. */
  readonly cullEnd: number;
  readonly lodStarts: readonly number[];
}

export interface GpuDrivenBatch {
  readonly name: string;
  readonly instances: GpuInstances;
  /** One per indirect draw of the main view, under `parent`. */
  readonly meshes: readonly Mesh[];
  readonly lodCount: number;
  /** Indirect draws a view issues (the meshes): renderer.info does not see them inside a bundle. */
  readonly draws: number;
  setDistances(distances: GpuBatchDistances): void;
  /** The CPU reference's view of this batch (bounds, distances) as the GPU culls it. */
  readonly cullBatch: InstanceCullBatch;
  /** Uploads instance changes and this view's uniforms; returns the dispatches, in order. */
  prepare(view: InstanceCullView): readonly ComputeNode[];
  /** The last cull's visible count per LOD, read back (tests, measurements). */
  readCounts(renderer: WebGPURenderer): Promise<number[]>;
  dispose(): void;
}

interface Draw {
  readonly lod: number;
  readonly part: GpuBatchPart;
  readonly material: Material;
  readonly start: number;
  readonly count: number;
}

/** The part's draws: one per material group, or the whole index for a single material. */
function partDraws(lod: number, part: GpuBatchPart): Draw[] {
  const index = part.geometry.getIndex();
  const total = index ? index.count : part.geometry.getAttribute("position").count;
  const materials = Array.isArray(part.material) ? part.material : [part.material];
  if (!Array.isArray(part.material) || part.geometry.groups.length === 0) return [{ lod, part, material: materials[0]!, start: 0, count: total }];
  return part.geometry.groups.flatMap((group) => {
    const material = materials[group.materialIndex ?? 0];
    const count = Math.min(group.count, total - group.start);
    return material && count > 0 ? [{ lod, part, material, start: group.start, count }] : [];
  });
}

/** The part's geometry for an indirect draw: its attributes and index, no groups (one material a draw). */
function indirectGeometry(source: BufferGeometry): BufferGeometry {
  const geometry = new BufferGeometry();
  for (const [name, attribute] of Object.entries(source.attributes)) geometry.setAttribute(name, attribute);
  let index = source.getIndex();
  if (!index) {
    const count = source.getAttribute("position").count;
    index = new Uint32BufferAttribute(Uint32Array.from({ length: count }, (_, i) => i), 1);
  }
  geometry.setIndex(index);
  return geometry;
}

export function createGpuDrivenBatch(renderer: WebGPURenderer, options: GpuDrivenBatchOptions): GpuDrivenBatch {
  const lodCount = options.lods.length;
  if (lodCount < 1 || lodCount > MAX_INSTANCE_LODS) throw new Error(`gpu batch ${options.name}: 1 to ${MAX_INSTANCE_LODS} LODs`);
  const instances = createGpuInstances(options.capacity);
  const draws = options.lods.flatMap((parts, lod) => parts.flatMap((part) => partDraws(lod, part)));
  const argsArray = new Uint32Array(draws.length * ARGS);
  draws.forEach((draw, index) => { argsArray[index * ARGS] = draw.count; argsArray[index * ARGS + 2] = draw.start; });
  const argsBuffer = new IndirectStorageBufferAttribute(argsArray, 1);
  const drawLodBuffer = new StorageBufferAttribute(Uint32Array.from(draws.map((draw) => draw.lod)), 1);
  const counterBuffer = new StorageBufferAttribute(new Uint32Array(lodCount), 1);

  // Per-view uniforms, shared by the compute pass and the materials.
  const count = uniform(0, "uint");
  const planes = uniformArray(Array.from({ length: 6 }, () => new Vector4(0, 0, 0, 1)), "vec4");
  const origin = uniform(new Vector3());
  const cullEnd = uniform(NO_CULL_DISTANCE);
  const lodStarts = uniform(new Vector4(NO_CULL_DISTANCE, NO_CULL_DISTANCE, NO_CULL_DISTANCE, NO_CULL_DISTANCE));
  const bounds = uniform(new Vector4(...options.bounds.center, options.bounds.radius));
  const fade = uniform(new Vector2(NO_CULL_DISTANCE * 0.5, NO_CULL_DISTANCE));
  const scaled = options.distanceMode === "scaled";
  let distances: GpuBatchDistances = { fadeStart: NO_CULL_DISTANCE, cullEnd: NO_CULL_DISTANCE, lodStarts: [] };

  let built = -1;
  let visibleBuffer: StorageBufferAttribute | null = null;
  let dispatches: ComputeNode[] = [];
  let meshes: Mesh[] = [];
  let materials: Material[] = [];

  const nodeMaterialOf = (source: Material): NodeMaterial => {
    const node = (source as NodeMaterial).isNodeMaterial ? source : renderer.library.fromMaterial(source);
    if (!node) throw new Error(`gpu batch ${options.name}: no node material for ${source.type}`);
    return node.clone() as NodeMaterial;
  };

  const release = (): void => {
    for (const mesh of meshes) { mesh.removeFromParent(); mesh.geometry.dispose(); }
    for (const material of materials) material.dispose();
    for (const node of dispatches) node.dispose();
    visibleBuffer?.dispose();
    meshes = []; materials = []; dispatches = []; visibleBuffer = null;
  };

  /** (Re)binds everything that reads the instance buffers. */
  const build = (): void => {
    release();
    const capacity = instances.capacity;
    visibleBuffer = new StorageBufferAttribute(new Uint32Array(capacity * lodCount), 1);
    const matrixRead = storage(instances.matrixBuffer, "mat4", capacity).toReadOnly();
    const extraRead = storage(instances.extraBuffer, "vec4", capacity).toReadOnly();
    const visibleRead = storage(visibleBuffer, "uint", capacity * lodCount).toReadOnly();
    const measure = (matrix: Node<"mat4">): { origin: Node<"vec3">; scale: Node<"float">; measured: Node<"float"> } => {
      const scale = max(max(length(matrix.mul(vec4(1, 0, 0, 0)).xyz), length(matrix.mul(vec4(0, 1, 0, 0)).xyz)), length(matrix.mul(vec4(0, 0, 1, 0)).xyz));
      const at = matrix.mul(vec4(0, 0, 0, 1)).xyz;
      const raw = distance(at, origin);
      return { origin: at, scale, measured: scaled ? raw.div(max(scale, 1e-6)) : raw };
    };

    const counters = storage(counterBuffer, "uint", lodCount).toAtomic();
    const reset = Fn(() => {
      If(instanceIndex.lessThan(uint(lodCount)), () => { atomicStore(counters.element(instanceIndex), uint(0)); });
    })().compute(lodCount, [WORKGROUP]);
    reset.name = `${options.name} reset`;

    const visibleWrite = storage(visibleBuffer, "uint", capacity * lodCount);
    const matrixCull = storage(instances.matrixBuffer, "mat4", capacity).toReadOnly();
    const cull = Fn(() => {
      If(instanceIndex.greaterThanEqual(count), () => { Return(); });
      const matrix = matrixCull.element(instanceIndex).toVar();
      const { scale, measured } = measure(matrix);
      const distanceVar = measured.toVar();
      const center = matrix.mul(vec4(bounds.xyz, 1)).xyz.toVar();
      const reach = bounds.w.mul(scale).negate().toVar();
      let inside: Node<"bool"> = bool(true);
      for (let plane = 0; plane < 6; plane += 1) {
        const p = planes.element(plane) as unknown as Node<"vec4">;
        inside = inside.and(dot(p.xyz, center).add(p.w).greaterThanEqual(reach));
      }
      If(inside.and(distanceVar.lessThan(cullEnd)), () => {
        let lod: Node<"uint"> = uint(0);
        for (let k = 0; k < lodCount - 1; k += 1) lod = lod.add(select(distanceVar.greaterThanEqual([lodStarts.x, lodStarts.y, lodStarts.z][k]!), uint(1), uint(0)));
        const lodVar = lod.toVar();
        const slot = atomicAdd(counters.element(lodVar), uint(1)).toVar();
        visibleWrite.element(lodVar.mul(uint(capacity)).add(slot)).assign(instanceIndex);
      });
    })().compute(capacity, [WORKGROUP]);
    cull.name = `${options.name} cull`;

    const countersRead = storage(counterBuffer, "uint", lodCount).toReadOnly();
    const drawLod = storage(drawLodBuffer, "uint", draws.length).toReadOnly();
    const args = storage(argsBuffer, "uint", draws.length * ARGS);
    const writeArgs = Fn(() => {
      If(instanceIndex.lessThan(uint(draws.length)), () => {
        args.element(instanceIndex.mul(uint(ARGS)).add(uint(1))).assign(countersRead.element(drawLod.element(instanceIndex)));
      });
    })().compute(draws.length, [WORKGROUP]);
    writeArgs.name = `${options.name} args`;
    dispatches = [reset, cull, writeArgs];

    const sources = new Map<string, NodeMaterial>();
    draws.forEach((draw, index) => {
      const key = `${draw.lod}/${options.lods[draw.lod]!.indexOf(draw.part)}/${draw.material.uuid}`;
      let material = sources.get(key);
      if (!material) {
        material = nodeMaterialOf(draw.material);
        // The vertex's instance: its LOD's visible list at instance_index; the fragment reads it flat.
        const slot = varying(visibleRead.element(uint(draw.lod * capacity).add(instanceIndex)), "vForgeGpuInstance");
        const instanceMatrix = matrixRead.element(slot);
        const world = instanceMatrix.mul(uniform(draw.part.local.clone()));
        const worldPosition = world.mul(vec4(0, 0, 0, 1)).xyz;
        material.contextNode = overrideNodes([
          [modelWorldMatrix, world],
          [modelWorldMatrixInverse, world.inverse()],
          [modelNormalMatrix, mat3(world).inverse().transpose()],
          [modelPosition, worldPosition],
          [modelViewPosition, cameraViewMatrix.mul(vec4(worldPosition, 1)).xyz],
          [velocity.previousModelWorldMatrix, world],
        ]);
        const { measured } = measure(instanceMatrix);
        const shown = varying(float(1).sub(smoothstep(fade.x, fade.y, measured)).mul(extraRead.element(slot).x), "vForgeGpuFade");
        const keeps = detailFadeDither.lessThan(shown);
        material.maskNode = material.maskNode ? bool(material.maskNode as Node<"bool">).and(keeps) : keeps;
        material.maskShadowNode = material.maskShadowNode ? bool(material.maskShadowNode as Node<"bool">).and(keeps) : keeps;
        sources.set(key, material);
        materials.push(material);
      }
      // One geometry object per draw (the indirect offset is the geometry's), sharing the part's buffers.
      const geometry = indirectGeometry(draw.part.geometry);
      geometry.setIndirect(argsBuffer, index * ARGS * 4);
      const mesh = new Mesh(geometry, material);
      mesh.name = `${options.name}/lod${draw.lod}/${draw.part.name}`;
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      if (options.source !== undefined) mesh.userData[SCENE_SOURCE_KEY] = options.source;
      options.parent.add(mesh);
      meshes.push(mesh);
    });
    built = instances.generation;
  };

  const batch: GpuDrivenBatch = {
    name: options.name,
    instances,
    get meshes() { return meshes; },
    lodCount,
    draws: draws.length,
    setDistances(next) {
      if (next.lodStarts.length !== lodCount - 1) throw new Error(`gpu batch ${options.name}: ${lodCount - 1} LOD starts`);
      distances = next;
      const end = Math.min(next.cullEnd, NO_CULL_DISTANCE);
      cullEnd.value = end;
      // A band without width is a hard cut at the end: the compute pass culls there already.
      fade.value.set(Math.min(next.fadeStart, end * 0.999999), end);
      lodStarts.value.set(...([0, 1, 2, 3].map((k) => next.lodStarts[k] ?? NO_CULL_DISTANCE) as [number, number, number, number]));
    },
    get cullBatch() {
      return { center: options.bounds.center, radius: options.bounds.radius, distanceMode: options.distanceMode, cullEnd: Math.min(distances.cullEnd, NO_CULL_DISTANCE), lodStarts: distances.lodStarts };
    },
    prepare(view) {
      if (built !== instances.generation) build();
      instances.flush();
      count.value = instances.count;
      for (let plane = 0; plane < 6; plane += 1) {
        (planes.array[plane] as Vector4).set(view.planes[plane * 4]!, view.planes[plane * 4 + 1]!, view.planes[plane * 4 + 2]!, view.planes[plane * 4 + 3]!);
      }
      origin.value.set(...view.origin);
      return dispatches;
    },
    async readCounts(target) {
      const buffer = await target.getArrayBufferAsync(counterBuffer);
      return Array.from(new Uint32Array(buffer).slice(0, lodCount));
    },
    dispose() {
      release();
      instances.dispose();
      argsBuffer.dispose(); drawLodBuffer.dispose(); counterBuffer.dispose();
    },
  };
  return batch;
}
