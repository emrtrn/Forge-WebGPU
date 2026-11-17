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

export interface DevGpuCheck {
  readonly name: string;
  readonly instances: number;
  readonly gpu: readonly number[];
  readonly cpu: Pick<InstanceCullResult, "counts" | "certain" | "possible">;
}

export interface DevGpuDriven {
  install(types: readonly DevGpuType[], cullScale: number): Promise<DevGpuInstall>;
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
    async install(types, cullScale) {
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
          capacity: type.matrices.length / 16,
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
      const view = current?.gpuDriven.lastView;
      if (!current || !view) throw new Error("no culled frame yet");
      return Promise.all(batches.map(async (batch) => {
        const cpu = cullInstanceCounts(batch.instances.matrices(), batch.instances.count, batch.cullBatch, view);
        return {
          name: batch.name, instances: batch.instances.count, gpu: await batch.readCounts(current.renderer),
          cpu: { counts: cpu.counts, certain: cpu.certain, possible: cpu.possible },
        };
      }));
    },
    remove,
  };
}
