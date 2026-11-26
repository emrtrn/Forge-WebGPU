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
// - Views as on the GPU path (5.2, R9a step 1): the main camera (meshes cast
//   no shadow), shadow views whose meshes cast, camera views drawn lit; each
//   view's meshes live on its layer only; the instancing itself carries the
//   instance transform into three's shadow material.
// - three counts these draws itself (`uncountedDraws` 0).

import { Color, InstancedBufferAttribute, InstancedMesh, Matrix4, type Material, type Mesh, type WebGPURenderer } from "three/webgpu";
import { instancedDynamicBufferAttribute, varying } from "three/tsl";
import { SCENE_SOURCE_KEY } from "../../engine/perf/sceneCost.ts";
import {
  cullInstanceCounts,
  fadeShown,
  instanceCasterFadeEnd,
  MAX_INSTANCE_LODS,
  measuredDistance,
  NO_CULL_DISTANCE,
} from "../../engine/world/instanceCulling.ts";
import { CASTER_FADE_START } from "../../engine/world/shadowCasters.ts";
import { EXTRA_FLOATS, MATRIX_FLOATS, createGpuInstances } from "./gpuInstances.ts";
import { applyCpuInstanceShading, INSTANCE_SEED_MASK, type CpuInstanceShadingAttributes } from "./instanceShading.ts";
import {
  cloneNodeMaterial, depthOnlyView, drawPasses, reuseView, shadingRole, maskWithFade, MAIN_VIEW_LAYER, MAX_CAMERA_VIEWS, MAX_COVER_VIEWS, MAX_SHADOW_VIEWS,
  ZONE_MASK_WORDS, type GpuBatchDistances, type GpuCullView, type GpuDrivenBatch, type GpuDrivenBatchOptions, type ZoneMode,
} from "./gpuDrivenBatch.ts";

/** `userData` key of a mesh's fade attribute (how much of each drawn instance the band shows). */
export const CPU_FADE_KEY = "forgeCpuFade";

interface LodMesh {
  readonly lod: number;
  readonly mesh: InstancedMesh;
  readonly local: Matrix4;
  readonly shown: InstancedBufferAttribute;
  /** Draws the mesh issues when it has instances (three skips an empty one). */
  readonly passes: number;
  /** The per-instance shading hook's attributes, when the batch has one. */
  readonly shading: CpuInstanceShadingAttributes | null;
}

interface View {
  role: GpuCullView["role"];
  layer: number;
  meshes: LodMesh[];
  materials: Material[];
  built: number;
  counts: number[];
}

export function createCpuDrivenBatch(renderer: WebGPURenderer, options: GpuDrivenBatchOptions): GpuDrivenBatch {
  const lodCount = options.lods.length;
  if (lodCount < 1 || lodCount > MAX_INSTANCE_LODS) throw new Error(`gpu batch ${options.name}: 1 to ${MAX_INSTANCE_LODS} LODs`);
  const instances = createGpuInstances(options.capacity, options.staggeredFade);
  const maxViews = 1 + MAX_SHADOW_VIEWS + MAX_CAMERA_VIEWS + MAX_COVER_VIEWS;
  // The draws three issues: one per material group of each part, two for a two-pass material.
  const partPasses = (part: GpuDrivenBatchOptions["lods"][number][number]): number => {
    const materials = Array.isArray(part.material) ? part.material : [part.material];
    const groups = Array.isArray(part.material) && part.geometry.groups.length > 0
      ? part.geometry.groups.map((group) => materials[group.materialIndex ?? 0]).filter((material) => material !== undefined)
      : [materials[0]!];
    return groups.reduce((passes, material) => passes + drawPasses(material), 0);
  };
  const draws = options.lods.flat().reduce((sum, part) => sum + partPasses(part), 0);
  let lastDraws = 0;
  let distances: GpuBatchDistances = { fadeStart: NO_CULL_DISTANCE, cullEnd: NO_CULL_DISTANCE, lodStarts: [] };
  const views: View[] = [];
  let prepared = 0;
  let zoneMode: ZoneMode = "visible";
  const world = new Matrix4();
  const instance = new Matrix4();

  const releaseView = (view: View): void => {
    for (const { mesh, shown, shading } of view.meshes) {
      mesh.removeFromParent(); mesh.dispose();
      // The mesh's own attributes; mesh.dispose() releases only its instance matrix / colour.
      shown.dispose();
      if (shading) { shading.placement.dispose(); shading.seed.dispose(); for (const column of shading.basis) column.dispose(); }
    }
    for (const material of view.materials) material.dispose();
    view.meshes = []; view.materials = []; view.built = -1;
  };

  const buildView = (view: View, index: number): void => {
    releaseView(view);
    const shadow = depthOnlyView(view.role);
    const capacity = instances.capacity;
    options.lods.forEach((parts, lod) => {
      for (const part of parts) {
        // Each mesh its own fade attribute, so each material its own clone.
        const shown = new InstancedBufferAttribute(new Float32Array(capacity), 1);
        const fade = varying(instancedDynamicBufferAttribute<"float">(shown, "float"), "vForgeCpuFade");
        const shading: CpuInstanceShadingAttributes | null = options.instanceShading
          ? {
            placement: new InstancedBufferAttribute(new Float32Array(capacity * 4), 4),
            seed: new InstancedBufferAttribute(new Float32Array(capacity), 1),
            basis: [0, 1, 2].map(() => new InstancedBufferAttribute(new Float32Array(capacity * 3), 3)) as unknown as CpuInstanceShadingAttributes["basis"],
          }
          : null;
        const clone = (source: Material): Material => {
          const material = cloneNodeMaterial(renderer, source, options.name);
          if (options.instanceShading && shading) applyCpuInstanceShading(options.instanceShading, material, shadingRole(view.role), shading, part.local);
          maskWithFade(material, fade);
          view.materials.push(material);
          return material;
        };
        const material = Array.isArray(part.material) ? part.material.map(clone) : clone(part.material);
        const mesh = new InstancedMesh(part.geometry, material, capacity);
        mesh.name = `${options.name}${view.role === "main" ? "" : ` ${view.role}${index}`}/lod${lod}/${part.name}`;
        mesh.count = 0;
        mesh.frustumCulled = false;
        mesh.castShadow = shadow;
        mesh.receiveShadow = !shadow;
        mesh.matrixAutoUpdate = false;
        mesh.layers.set(view.layer);
        if (!shadow) mesh.renderOrder = options.lodOrder?.[lod] ?? 0;
        if (options.source !== undefined) mesh.userData[SCENE_SOURCE_KEY] = options.source;
        mesh.userData[CPU_FADE_KEY] = shown;
        options.parent.add(mesh);
        view.meshes.push({ lod, mesh, local: part.local.clone(), shown, passes: partPasses(part), shading });
      }
    });
    view.built = instances.generation;
  };

  const batch: GpuDrivenBatch = {
    name: options.name,
    path: "cpu",
    uncountedDraws: 0,
    instances,
    get meshes() { return (views[0]?.meshes ?? []).map((entry) => entry.mesh); },
    get allMeshes(): Mesh[] { return views.flatMap((view) => view.meshes.map((entry) => entry.mesh)); },
    lodCount,
    draws,
    // three counts the twin's triangles itself; the field keeps the interface.
    lodTriangles: options.lods.map(() => 0),
    get views() { return prepared; },
    get viewLayers() { return views.slice(0, prepared).map(view => view.layer); },
    get lastDraws() { return lastDraws; },
    // WebGL2 has no render bundles.
    bundleUpdates: 0,
    get zoneMode() { return zoneMode; },
    setZoneMode(mode) {
      zoneMode = mode;
      if (mode === "hidden") for (const view of views) for (const { mesh } of view.meshes) mesh.visible = false;
    },
    setDistances(next) {
      if (next.lodStarts.length !== lodCount - 1 || (next.shadowLodStarts ?? next.lodStarts).length !== lodCount - 1) throw new Error(`gpu batch ${options.name}: ${lodCount - 1} LOD starts`);
      distances = next;
    },
    get cullBatch() {
      return { center: options.bounds.center, radius: options.bounds.radius, distanceMode: options.distanceMode, cullEnd: Math.min(distances.cullEnd, NO_CULL_DISTANCE), lodStarts: distances.lodStarts };
    },
    get shadowCullBatch() { return { ...batch.cullBatch, lodStarts: distances.shadowLodStarts ?? distances.lodStarts }; },
    get fadeSpread() { return options.staggeredFade ? distances.fadeSpread ?? 0 : 0; },
    prepare(list) {
      instances.flush();
      const matrices = instances.matrices();
      const extras = instances.extraBuffer.array as Float32Array;
      const seedBits = new Uint32Array(extras.buffer, extras.byteOffset, extras.length);
      const cull = batch.cullBatch;
      const fadeStart = Math.min(distances.fadeStart, cull.cullEnd);
      const spread = batch.fadeSpread;
      const fadeOffset = spread > 0 ? (at: number) => instances.fadeRank(at) * spread : undefined;
      const accepted = list.filter((view) => (view.role !== "shadow" || options.castShadow !== false) && (view.role !== "cover" || options.precipitationCover === true)).slice(0, maxViews);
      prepared = accepted.length;
      lastDraws = 0;
      for (let index = 0; index < prepared; index += 1) {
        reuseView(views, index, accepted[index]!);
        const view = views[index] ?? (views[index] = { role: "main", layer: MAIN_VIEW_LAYER, meshes: [], materials: [], built: -1, counts: new Array<number>(lodCount).fill(0) });
        const source = accepted[index]!;
        if (view.built !== instances.generation || view.role !== source.role || view.layer !== source.layer) {
          view.role = source.role; view.layer = source.layer;
          buildView(view, index);
        }
        const result = cullInstanceCounts(matrices, instances.count, depthOnlyView(source.role) ? batch.shadowCullBatch : cull, source, fadeOffset);
        // R9b: the zone masks as the GPU reads them (extras.z, the view's mask).
        const masks = options.zoneMasks?.array as Uint32Array | undefined;
        const base = depthOnlyView(source.role) ? ZONE_MASK_WORDS : 0;
        const lists = masks
          ? result.visible.map((list) => list.filter((at) => { const zone = extras[at * EXTRA_FLOATS + 2]! | 0; return ((masks[base + (zone >>> 5)]! >>> (zone & 31)) & 1) === 1; }))
          : result.visible;
        for (const { lod, mesh, local, shown, passes, shading } of view.meshes) {
          const visible = lists[lod]!;
          visible.forEach((at, slot) => {
            instance.fromArray(matrices, at * MATRIX_FLOATS);
            if (shading) {
              const e = instance.elements;
              shading.placement.setXYZW(slot, e[12]!, e[13]!, e[14]!, Math.max(Math.hypot(e[0]!, e[1]!, e[2]!), Math.hypot(e[4]!, e[5]!, e[6]!), Math.hypot(e[8]!, e[9]!, e[10]!)));
              shading.seed.setX(slot, seedBits[at * EXTRA_FLOATS + 1]! & INSTANCE_SEED_MASK);
              shading.basis.forEach((column, k) => column.setXYZ(slot, e[k * 4]!, e[k * 4 + 1]!, e[k * 4 + 2]!));
            }
            mesh.setMatrixAt(slot, world.multiplyMatrices(instance, local));
            if (options.instanceColors) mesh.setColorAt(slot, new Color().setRGB(options.instanceColors.getX(at), options.instanceColors.getY(at), options.instanceColors.getZ(at)));
            const offset = at * MATRIX_FLOATS;
            const distance = measuredDistance(matrices, offset, cull.distanceMode, source.origin);
            const end = source.casterProfile ? instanceCasterFadeEnd(matrices, offset, cull.radius, source.casterProfile) : 0;
            const shadow = end > 0 ? fadeShown(measuredDistance(matrices, offset, "origin", source.origin), end * CASTER_FADE_START, end) : 1;
            const staggeredDistance = distance + (fadeOffset?.(at) ?? 0);
            shown.setX(slot, fadeShown(staggeredDistance, fadeStart, cull.cullEnd) * extras[at * EXTRA_FLOATS]! * shadow);
          });
          mesh.count = visible.length;
          if (visible.length > 0) lastDraws += passes;
          mesh.visible = zoneMode !== "shadow" || depthOnlyView(view.role);
          mesh.instanceMatrix.needsUpdate = true;
          if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
          shown.needsUpdate = true;
          if (shading) { shading.placement.needsUpdate = true; shading.seed.needsUpdate = true; for (const column of shading.basis) column.needsUpdate = true; }
        }
        view.counts = masks ? lists.map(list => list.length) : [...result.counts];
      }
      for (let index = prepared; index < views.length; index += 1) for (const { mesh } of views[index]!.meshes) mesh.visible = false;
      return [];
    },
    async readCounts(_renderer, view = 0) {
      return [...(views[view]?.counts ?? new Array<number>(lodCount).fill(0))];
    },
    dispose() {
      for (const view of views) releaseView(view);
      views.length = 0;
      instances.dispose();
    },
  };
  return batch;
}
