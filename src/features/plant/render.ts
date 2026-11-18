// Plant: render binding (vegetation plan PG2, §5.4). A `forge.plant`
// component draws its family's prototype as one instance on the foliage
// path (render/foliage/foliageBatches.ts, GPU-driven; the CPU twin on WebGL2),
// through the world's shared plant drawing (render/plant/plantDrawing.ts):
// the same LOD chain, materials, response to WES, wind and per-instance
// variety (the component's `seed`) as foliage instances of that family, so a
// single tree and a forest of the same family look alike (PV-WES-02). No
// script, tick or material per plant: plants of one family and prototype
// share one batch.
//
// A moved or edited plant is set again under its owner (`<actor>/<key>`); a
// family that cannot be read is left out with a warning.

import { Group, Matrix4, PerspectiveCamera, Vector3, type Camera } from "three/webgpu";
import { normalizeJsonAsset, parseComponentTypeTag, type ActorId, type WorldActor } from "../../core/index.ts";
import { createFoliageBatches, type FoliageBatches, type FoliageTypeDraw } from "../../render/foliage/foliageBatches.ts";
import { plantWorld } from "../../render/plant/plantDrawing.ts";
import { readFamilyPrototype, type PlantFamilyFieldsRead } from "../../render/plant/plantFamilies.ts";
import { defineRenderBinding } from "../../render/sync/renderBinding.ts";
import { componentWorldMatrix } from "../../render/sync/transforms.ts";
import { Plant, PlantFamilyAssetType, type PlantData } from "./schema.ts";

interface Placed {
  readonly keys: string[];
  readonly owners: string[];
  removed: boolean;
  busy: (() => void) | null;
}

const fovOf = (camera: Camera): number => (camera as PerspectiveCamera).isPerspectiveCamera ? (camera as PerspectiveCamera).fov : 60;

export default defineRenderBinding({
  feature: "forge.plant",
  create(ctx) {
    const group = new Group();
    group.name = "plants";
    // GPU-driven meshes sit in template space: never frame a level by them.
    group.userData.framing = false;
    ctx.root.add(group);
    const plants = plantWorld(ctx.world);
    const placed = new Map<ActorId, Placed>();
    const cameraPosition = new Vector3();
    let batches: FoliageBatches | null = null;
    let lastQuality = "";
    const readFamily = (raw: unknown): PlantFamilyFieldsRead | null =>
      (normalizeJsonAsset(PlantFamilyAssetType, raw, { strict: false }).value as unknown as PlantFamilyFieldsRead | null) ?? null;

    const ensureBatches = (): FoliageBatches | null => {
      if (batches || !ctx.gpuDriven) return batches;
      batches = createFoliageBatches({
        gpuDriven: ctx.gpuDriven, resources: ctx.resources, parent: group, source: "plants",
        quality: { cullScale: ctx.quality().foliageCullDistanceScale, verticalFov: 60 }, wind: plants.wind, plants,
      });
      return batches;
    };

    const plantsOf = (actor: WorldActor): Array<[string, PlantData]> =>
      Object.entries(actor.components).flatMap(([key, component]) =>
        parseComponentTypeTag(component.type)?.name === Plant.name ? [[key, component as unknown as PlantData] as [string, PlantData]] : []);

    const add = (actor: WorldActor): void => {
      const list = plantsOf(actor).filter(([, data]) => typeof data.family === "string" && data.family.length > 0);
      if (list.length === 0) return;
      const target = ensureBatches();
      if (!target) return;
      const entry: Placed = { keys: [], owners: [], removed: false, busy: ctx.resources.busy() };
      placed.set(actor.id, entry);
      void Promise.all(list.map(async ([key, data]) => {
        const prototype = await readFamilyPrototype(ctx.resources, data.family as string, data.prototype, entry.keys, readFamily);
        if (!prototype || entry.removed) return;
        const type: FoliageTypeDraw = {
          id: `plant:${data.family}:${Math.floor(data.prototype)}:${data.castShadow ? 1 : 0}`,
          mesh: prototype.mesh, lods: prototype.lods, castShadow: data.castShadow, cullStart: 0, cullEnd: 0,
          sway: prototype.sway, plant: prototype.plant,
        };
        const owner = `${actor.id}/${key}`;
        entry.owners.push(owner);
        target.set(type, owner, componentWorldMatrix(ctx.world, actor, key, new Matrix4()).elements, [data.seed >>> 0]);
      })).then(() => target.ready()).finally(() => {
        entry.busy?.();
        entry.busy = null;
      });
    };

    const remove = (id: ActorId): void => {
      const entry = placed.get(id);
      if (!entry) return;
      placed.delete(id);
      entry.removed = true;
      for (const owner of entry.owners) batches?.remove(owner);
      entry.busy?.();
      entry.busy = null;
      for (const key of entry.keys) ctx.resources.release(key);
    };

    return {
      isActorReady: (id) => !placed.get(id)?.busy,
      actorsAdded(actors) {
        for (const actor of actors) add(actor);
      },
      actorsRemoved(actors) {
        for (const actor of actors) remove(actor.id);
      },
      actorsChanged(changes) {
        for (const { actor } of changes) {
          remove(actor.id);
          add(actor);
        }
      },
      sync(frame) {
        if (frame.camera) frame.camera.getWorldPosition(cameraPosition);
        plants.sync(frame, frame.dt, frame.camera ? cameraPosition : null);
        if (!batches || !frame.camera) return;
        const quality = ctx.quality();
        const fov = fovOf(frame.camera);
        const signature = `${quality.foliageCullDistanceScale}|${fov}`;
        if (signature !== lastQuality) {
          lastQuality = signature;
          batches.setQuality({ cullScale: quality.foliageCullDistanceScale, verticalFov: fov });
        }
      },
      dispose() {
        for (const id of [...placed.keys()]) remove(id);
        batches?.dispose();
        batches = null;
        group.removeFromParent();
      },
    };
  },
});
