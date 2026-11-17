import { describe, expect, test } from "vitest";
import { BoxGeometry, Group, Matrix4, Mesh, MeshBasicNodeMaterial, type WebGPURenderer } from "three/webgpu";
import { createCpuDrivenBatch } from "../gpu/cpuDrivenBatch.ts";
import type { GpuDrivenBatch } from "../gpu/gpuDrivenBatch.ts";
import type { ModelTemplate, WorldResources } from "../resources/worldResources.ts";
import { createFoliageBatches, type FoliageTypeDraw } from "./foliageBatches.ts";

const at = (x: number): number[] => new Matrix4().makeTranslation(x, 0, 0).toArray();

function harness() {
  const loads = new Map<string, () => void>();
  const released: string[] = [];
  const created: GpuDrivenBatch[] = [];
  const removed: GpuDrivenBatch[] = [];
  const template = (): ModelTemplate => {
    const material = new MeshBasicNodeMaterial();
    const scene = new Group();
    scene.add(new Mesh(new BoxGeometry(2, 2, 2), material));
    return { scene, slots: [material], slotMaterials: [null] };
  };
  const resources = {
    model: (guid: string) => new Promise<ModelTemplate>((resolve) => loads.set(guid, () => resolve(template()))),
    materialKey: (guid: string) => `material:${guid}`,
    material: async () => new MeshBasicNodeMaterial(),
    release: (key: string) => released.push(key),
  } as unknown as WorldResources;
  const parent = new Group();
  const foliage = createFoliageBatches({
    parent, resources, quality: { cullScale: 1, verticalFov: 60 },
    gpuDriven: {
      createBatch: (options) => { const batch = createCpuDrivenBatch({} as WebGPURenderer, options); created.push(batch); return batch; },
      removeBatch: (batch) => { removed.push(batch); batch.dispose(); },
    },
  });
  /** Lets the given models load, then waits for every batch. */
  const finish = async (...guids: string[]) => {
    for (let i = 0; i < 5 && !guids.every((guid) => loads.has(guid)); i += 1) await Promise.resolve();
    for (const guid of guids) loads.get(guid)!();
    await foliage.ready();
  };
  return { foliage, finish, released, created, removed };
}

const GRASS: FoliageTypeDraw = { id: "type-grass", mesh: "model-grass", lods: [], castShadow: true, cullStart: 40, cullEnd: 60 };

describe("foliage on the GPU-driven path (5c R4)", () => {
  test("owners set, replace and remove their instances; instances set while the model loads arrive with the batch", async () => {
    const { foliage, finish, created } = harness();
    foliage.set(GRASS, "cell:0_0", [...at(1), ...at(2)]);
    foliage.set(GRASS, "ring:3", at(3));
    expect(foliage.batches).toEqual([]);
    await finish("model-grass");
    const [batch] = foliage.batches;
    expect(created).toEqual([batch]);
    expect(batch!.instances.count).toBe(3);
    expect(batch!.cullBatch).toMatchObject({ distanceMode: "origin", cullEnd: 60 });

    foliage.set(GRASS, "cell:0_0", at(4));
    expect(batch!.instances.count).toBe(2);
    foliage.set(GRASS, "ring:3", []);
    expect(batch!.instances.count).toBe(1);
    foliage.remove("cell:0_0");
    expect(batch!.instances.count).toBe(0);

    foliage.setQuality({ cullScale: 0.5, verticalFov: 60 });
    expect(batch!.cullBatch.cullEnd).toBe(30);
  });

  test("a changed type is a new batch and its owners move along; dispose releases the models", async () => {
    const { foliage, finish, created, removed, released } = harness();
    foliage.set(GRASS, "cell:0_0", [...at(1), ...at(2)]);
    await finish("model-grass");
    const shadowless = { ...GRASS, castShadow: false, lods: [{ mesh: "model-grass-lod1", screenSize: 0.2 }] };
    foliage.set(shadowless, "cell:1_0", at(5));
    expect(removed).toEqual([created[0]]);
    await Promise.resolve();
    expect(foliage.batches).toEqual([]);
    await finish("model-grass", "model-grass-lod1");
    const [batch] = foliage.batches;
    expect(batch!.lodCount).toBe(2);
    expect(batch!.instances.count).toBe(3);
    batch!.prepare([{ planes: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]), origin: [0, 0, 0] }, { planes: new Float32Array(24).fill(0).map((_, i) => (i % 4 === 3 ? 1 : 0)), origin: [0, 0, 0] }]);
    expect(batch!.views, "castShadow false: no shadow view").toBe(1);
    foliage.dispose();
    expect(released).toEqual(expect.arrayContaining(["model:model-grass", "model:model-grass-lod1"]));
    expect(removed).toContain(batch);
  });
});
