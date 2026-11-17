// Development only (phase 5c step 5.1): the render smoke's GPU-driven batches.
// The page gets foliage instances the smoke generated in Node (Derekavak's
// landscape rules, `tests/smoke/gpuFoliageScene.ts`), draws each type as one
// GPU-driven batch of its model's parts, and compares the GPU's visible count
// with the CPU reference for the same view (`engine/world/instanceCulling.ts`,
// as Phase 1 G7 compared culling). The reference project is not changed.

import { Box3, Group, Sphere } from "three/webgpu";
import { cullInstanceCounts, foliageFadeWindow, NO_CULL_DISTANCE, type InstanceCullResult } from "../../engine/world/instanceCulling.ts";
import type { RenderHost } from "../host/renderHost.ts";
import { modelParts } from "../resources/modelParts.ts";
import { resourceKey } from "../resources/resourceCache.ts";
import type { GpuDrivenBatch } from "./gpuDrivenBatch.ts";

export interface DevGpuType {
  readonly name: string;
  /** `forge.model` GUID. */
  readonly mesh: string;
  readonly cullStart: number;
  readonly cullEnd: number;
  /** 16 column-major floats per instance. */
  readonly matrices: readonly number[];
}

export interface DevGpuInstall {
  /** `gpu` (WebGPU) or `cpu` (the WebGL2 twin). */
  readonly path: "gpu" | "cpu";
  readonly batches: number;
  readonly instances: number;
  readonly parts: number;
  readonly draws: number;
}

export interface DevGpuViewCheck {
  readonly gpu: readonly number[];
  readonly cpu: Pick<InstanceCullResult, "counts" | "certain" | "possible">;
}

export interface DevGpuCheck extends DevGpuViewCheck {
  readonly name: string;
  readonly instances: number;
  /** The shadow views (5.2), cascades in order. */
  readonly shadows: readonly DevGpuViewCheck[];
}

export interface DevGpuDriven {
  install(types: readonly DevGpuType[], cullScale: number, castShadow?: boolean): Promise<DevGpuInstall>;
  /** The last frame's GPU counts beside the CPU reference of the same view. */
  check(): Promise<DevGpuCheck[]>;
  remove(): void;
}

export function createDevGpuDriven(host: () => RenderHost | null): DevGpuDriven {
  let group: Group | null = null;
  let batches: GpuDrivenBatch[] = [];
  let keys: string[] = [];
  const resources = () => host()!.resources("gpuDrivenDev");

  const remove = (): void => {
    const current = host();
    for (const batch of batches) current?.gpuDriven.removeBatch(batch);
    if (current) for (const key of keys) resources().release(key);
    group?.removeFromParent();
    batches = []; keys = []; group = null;
  };

  return {
    async install(types, cullScale, castShadow = true) {
      remove();
      const current = host();
      const scene = current?.world?.scene;
      if (!current || !scene) throw new Error("no world is drawn");
      group = new Group();
      group.name = "gpuDrivenDev";
      scene.add(group);
      const world = resources();
      let parts = 0, instances = 0, draws = 0;
      for (const type of types) {
        keys.push(resourceKey.model(type.mesh));
        const template = await world.model(type.mesh);
        const materials = await Promise.all(template.slots.map(async (own, slot) => {
          const guid = template.slotMaterials[slot] ?? null;
          if (guid === null) return own;
          keys.push(world.materialKey(guid));
          return world.material(guid).catch(() => own);
        }));
        const templateParts = modelParts(template, materials);
        const sphere = new Box3().setFromObject(template.scene).getBoundingSphere(new Sphere());
        const batch = current.gpuDriven.createBatch({
          name: `foliage/${type.name}`, parent: group, lods: [templateParts], source: "foliage",
          bounds: { center: [sphere.center.x, sphere.center.y, sphere.center.z], radius: sphere.radius }, distanceMode: "origin",
          capacity: type.matrices.length / 16, castShadow,
        });
        const window = foliageFadeWindow(type.cullStart, type.cullEnd, cullScale);
        batch.setDistances({ fadeStart: window?.[0] ?? NO_CULL_DISTANCE, cullEnd: window?.[1] ?? NO_CULL_DISTANCE, lodStarts: [] });
        batch.instances.addMany(type.matrices, type.matrices.length / 16);
        batches.push(batch);
        parts += templateParts.length; instances += batch.instances.count; draws += batch.draws;
      }
      return { path: current.gpuDriven.supported ? "gpu" : "cpu", batches: batches.length, instances, parts, draws };
    },
    async check() {
      const current = host();
      const views = current?.gpuDriven.lastViews ?? [];
      if (!current || views.length === 0) throw new Error("no culled frame yet");
      const viewCheck = async (batch: GpuDrivenBatch, index: number): Promise<DevGpuViewCheck> => {
        const cpu = cullInstanceCounts(batch.instances.matrices(), batch.instances.count, batch.cullBatch, views[index]!);
        return { gpu: await batch.readCounts(current.renderer, index), cpu: { counts: cpu.counts, certain: cpu.certain, possible: cpu.possible } };
      };
      return Promise.all(batches.map(async (batch) => {
        const shadows: DevGpuViewCheck[] = [];
        for (let index = 1; index < batch.views; index += 1) shadows.push(await viewCheck(batch, index));
        return { name: batch.name, instances: batch.instances.count, ...(await viewCheck(batch, 0)), shadows };
      }));
    },
    remove,
  };
}
