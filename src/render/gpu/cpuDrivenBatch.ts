// The GPU-driven batch's twin on the WebGL2 test backend (phase 5c step 5,
// user decision 2026-11-17): WebGL2 has no compute atomics and no indirect
// draws, so the same culling runs on the CPU and the result draws instanced.
//
// - The same instance set (`GpuInstances`; its storage buffers are never
//   bound here, only its packed CPU arrays are read), the same template and
//   the same `GpuDrivenBatch` interface: an owner does not know which path
//   it got.
// - Per view, `prepare` culls with the CPU reference itself
//   (`engine/world/instanceCulling.ts`: same planes, bounds, distance mode,
//   cull end and LOD starts as the GPU's compute pass) and writes each LOD's
//   visible instances into one `InstancedMesh` per part of that LOD: the
//   instance matrix × the part's matrix, and how much the fade band shows it
//   (× its own fade) for the material's dither (5b's threshold, as the GPU
//   path's material).
// - three counts these draws itself (`uncountedDraws` 0).
// - Main view only, no shadow, like the GPU path's main view.

import { InstancedBufferAttribute, InstancedMesh, Matrix4, type Material, type WebGPURenderer } from "three/webgpu";
import { instancedDynamicBufferAttribute, varying } from "three/tsl";
import { SCENE_SOURCE_KEY } from "../../engine/perf/sceneCost.ts";
import {
  cullInstanceCounts,
  fadeShown,
  MAX_INSTANCE_LODS,
  measuredDistance,
  NO_CULL_DISTANCE,
} from "../../engine/world/instanceCulling.ts";
import { EXTRA_FLOATS, MATRIX_FLOATS, createGpuInstances } from "./gpuInstances.ts";
import { cloneNodeMaterial, drawPasses, maskWithFade, type GpuBatchDistances, type GpuDrivenBatch, type GpuDrivenBatchOptions } from "./gpuDrivenBatch.ts";

/** `userData` key of a mesh's fade attribute (how much of each drawn instance the band shows). */
export const CPU_FADE_KEY = "forgeCpuFade";

interface LodMesh {
  readonly lod: number;
  readonly mesh: InstancedMesh;
  readonly local: Matrix4;
  readonly shown: InstancedBufferAttribute;
}

export function createCpuDrivenBatch(renderer: WebGPURenderer, options: GpuDrivenBatchOptions): GpuDrivenBatch {
  const lodCount = options.lods.length;
  if (lodCount < 1 || lodCount > MAX_INSTANCE_LODS) throw new Error(`gpu batch ${options.name}: 1 to ${MAX_INSTANCE_LODS} LODs`);
  const instances = createGpuInstances(options.capacity);
  // The draws three issues: one per material group of each part, two for a two-pass material.
  const draws = options.lods.flat().reduce((sum, part) => {
    const materials = Array.isArray(part.material) ? part.material : [part.material];
    const groups = Array.isArray(part.material) && part.geometry.groups.length > 0
      ? part.geometry.groups.map((group) => materials[group.materialIndex ?? 0]).filter((material) => material !== undefined)
      : [materials[0]!];
    return sum + groups.reduce((passes, material) => passes + drawPasses(material), 0);
  }, 0);
  let distances: GpuBatchDistances = { fadeStart: NO_CULL_DISTANCE, cullEnd: NO_CULL_DISTANCE, lodStarts: [] };
  let built = -1;
  let meshes: LodMesh[] = [];
  let materials: Material[] = [];
  let lastCounts: number[] = new Array<number>(lodCount).fill(0);
  const world = new Matrix4();
  const instance = new Matrix4();

  const release = (): void => {
    for (const { mesh } of meshes) { mesh.removeFromParent(); mesh.dispose(); }
    for (const material of materials) material.dispose();
    meshes = []; materials = [];
  };

  const build = (): void => {
    release();
    const capacity = instances.capacity;
    options.lods.forEach((parts, lod) => {
      for (const part of parts) {
        // Each mesh its own fade attribute, so each material its own clone.
        const shown = new InstancedBufferAttribute(new Float32Array(capacity), 1);
        const fade = varying(instancedDynamicBufferAttribute<"float">(shown, "float"), "vForgeCpuFade");
        const clone = (source: Material): Material => {
          const material = cloneNodeMaterial(renderer, source, options.name);
          maskWithFade(material, fade);
          materials.push(material);
          return material;
        };
        const material = Array.isArray(part.material) ? part.material.map(clone) : clone(part.material);
        const mesh = new InstancedMesh(part.geometry, material, capacity);
        mesh.name = `${options.name}/lod${lod}/${part.name}`;
        mesh.count = 0;
        mesh.frustumCulled = false;
        mesh.castShadow = false;
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        if (options.source !== undefined) mesh.userData[SCENE_SOURCE_KEY] = options.source;
        mesh.userData[CPU_FADE_KEY] = shown;
        options.parent.add(mesh);
        meshes.push({ lod, mesh, local: part.local.clone(), shown });
      }
    });
    built = instances.generation;
  };

  const batch: GpuDrivenBatch = {
    name: options.name,
    path: "cpu",
    uncountedDraws: 0,
    instances,
    get meshes() { return meshes.map((entry) => entry.mesh); },
    lodCount,
    draws,
    setDistances(next) {
      if (next.lodStarts.length !== lodCount - 1) throw new Error(`gpu batch ${options.name}: ${lodCount - 1} LOD starts`);
      distances = next;
    },
    get cullBatch() {
      return { center: options.bounds.center, radius: options.bounds.radius, distanceMode: options.distanceMode, cullEnd: Math.min(distances.cullEnd, NO_CULL_DISTANCE), lodStarts: distances.lodStarts };
    },
    prepare(view) {
      if (built !== instances.generation) build();
      instances.flush();
      const matrices = instances.matrices();
      const extras = instances.extraBuffer.array as Float32Array;
      const cull = batch.cullBatch;
      const result = cullInstanceCounts(matrices, instances.count, cull, view);
      const fadeStart = Math.min(distances.fadeStart, cull.cullEnd);
      for (const { lod, mesh, local, shown } of meshes) {
        const visible = result.visible[lod]!;
        visible.forEach((index, slot) => {
          instance.fromArray(matrices, index * MATRIX_FLOATS);
          mesh.setMatrixAt(slot, world.multiplyMatrices(instance, local));
          const distance = measuredDistance(matrices, index * MATRIX_FLOATS, cull.distanceMode, view.origin);
          shown.setX(slot, fadeShown(distance, fadeStart, cull.cullEnd) * extras[index * EXTRA_FLOATS]!);
        });
        mesh.count = visible.length;
        mesh.instanceMatrix.needsUpdate = true;
        shown.needsUpdate = true;
      }
      lastCounts = [...result.counts];
      return [];
    },
    async readCounts() {
      return [...lastCounts];
    },
    dispose() {
      release();
      instances.dispose();
    },
  };
  return batch;
}
