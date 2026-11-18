// Shape: render binding. `forge.shape` components draw instanced (plan phase
// 3 step 8, spike mode (b); render/sync/instanceBatches.ts): one batch per
// primitive, sidedness (a plane is seen from both sides) and shadow switch,
// with the procedural geometry (`shape:<primitive>`) and a white lit material
// from the host's resource cache. Each shape's colour is its instance colour
// over that white, so it draws exactly its colour (Forge's applyInstanceColors
// rule). It casts a shadow when `castShadow` says so (phase 3 step 4); every
// shape receives shadows. Edits (plan phase 4 decision 3): a transform-only
// change moves the actor's instances in their batches (`changeInstances`);
// any other is removed and added again. Cells (plan 5c R9a): with
// `staticCellSize` above 0 a batch holds one world cell's shapes only.

import { Matrix4 } from "three/webgpu";
import { parseComponentTypeTag, type WorldActor } from "../../core/index.ts";
import { resourceKey } from "../../render/resources/resourceCache.ts";
import type { ShapePrimitive } from "../../render/resources/shapes.ts";
import { shapeMaterialKey } from "../../render/resources/worldResources.ts";
import { cellSuffix, placementParts, placementZone, zoneSuffix } from "../../render/sync/batchCells.ts";
import { shapeBoundingRadius } from "../../engine/procgen/shapePrimitives.ts";
import { changeInstances, createInstanceBatch, type InstanceBatch } from "../../render/sync/instanceBatches.ts";
import { defineRenderBinding } from "../../render/sync/renderBinding.ts";
import { componentWorldMatrix } from "../../render/sync/transforms.ts";
import { Shape, type ShapeData } from "./schema.ts";

/** The material every shape batch draws with; the shape's colour is per instance. */
export const SHAPE_BASE_COLOR = "#ffffff";

interface Batch {
  readonly instances: InstanceBatch;
  readonly keys: readonly string[];
  disposed: boolean;
  /** Its zone's registration (R9b); null in no zone. */
  untrack: (() => void) | null;
}

/** Shapes that draw alike: the primitive, its sidedness and the shadow switch. */
export const shapeBatchKey = (data: ShapeData): string => `${data.primitive}|${data.castShadow ? "cast" : "none"}`;

export default defineRenderBinding({
  feature: "forge.shape",
  create(ctx) {
    const batches = new Map<string, Batch>();
    const placed = new Map<string, string>();
    const matrix = new Matrix4();
    const shapesOf = (actor: WorldActor) =>
      Object.entries(actor.components).filter(([, component]) => parseComponentTypeTag(component.type)?.name === Shape.name);

    const batchFor = (key: string, data: ShapeData, zone: string | null): Batch => {
      const existing = batches.get(key);
      if (existing) return existing;
      const primitive = data.primitive as ShapePrimitive;
      const doubleSided = primitive === "plane";
      const batch: Batch = {
        instances: createInstanceBatch({
          name: `shape/${primitive}`, source: "shape", parent: ctx.root, castShadow: data.castShadow,
          ...(ctx.prepare ? { prepare: ctx.prepare } : {}),
          ...(ctx.gpuDriven?.instancedCasters ? { shadowCasters: ctx.gpuDriven.instancedCasters } : {}),
          ...(ctx.triangles ? { triangles: ctx.triangles, ...(ctx.staticPath ? { staticPath: ctx.staticPath } : {}) } : {}),
        }),
        keys: [resourceKey.shape(primitive), shapeMaterialKey(SHAPE_BASE_COLOR, doubleSided)],
        disposed: false,
        untrack: null,
      };
      batches.set(key, batch);
      if (zone !== null && ctx.zones) batch.untrack = ctx.zones.track(zone, batch.instances);
      void Promise.all([ctx.resources.shapeGeometry(primitive), ctx.resources.shapeMaterial(SHAPE_BASE_COLOR, doubleSided)]).then(
        ([geometry, material]) => {
          if (batch.disposed) return;
          batch.instances.setParts([{ geometry, material, local: new Matrix4(), name: primitive }], undefined, shapeBoundingRadius(primitive));
        },
      );
      return batch;
    };

    const disposeBatch = (key: string, batch: Batch): void => {
      batches.delete(key);
      batch.disposed = true;
      batch.untrack?.();
      batch.instances.dispose();
      for (const resource of batch.keys) ctx.resources.release(resource);
    };

    const cellSize = (): number => ctx.staticCellSize?.() ?? 0;
    const add = (actor: WorldActor, key: string, data: ShapeData): void => {
      const id = `${actor.id}/${key}`;
      componentWorldMatrix(ctx.world, actor, key, matrix);
      const zone = placementZone(ctx.zones, matrix);
      const batchKey = shapeBatchKey(data) + cellSuffix(matrix, cellSize()) + zoneSuffix(zone);
      placed.set(id, batchKey);
      batchFor(batchKey, data, zone).instances.set(id, matrix, data.color, actor.id);
    };

    const remove = (id: string): void => {
      const batchKey = placed.get(id);
      if (batchKey === undefined) return;
      placed.delete(id);
      const batch = batches.get(batchKey);
      if (!batch) return;
      batch.instances.delete(id);
      if (batch.instances.size === 0) disposeBatch(batchKey, batch);
    };

    const added = (actors: readonly WorldActor[]): void => {
      for (const actor of actors) {
        for (const [key, component] of shapesOf(actor)) add(actor, key, component as unknown as ShapeData);
      }
    };
    const removed = (actors: readonly WorldActor[]): void => {
      for (const actor of actors) for (const [key] of shapesOf(actor)) remove(`${actor.id}/${key}`);
    };
    const move = (actor: WorldActor): void => {
      for (const [key, component] of shapesOf(actor)) {
        const id = `${actor.id}/${key}`;
        const batchKey = placed.get(id);
        if (batchKey === undefined) continue;
        const data = component as unknown as ShapeData;
        componentWorldMatrix(ctx.world, actor, key, matrix);
        // Into another cell or zone: another batch (R9a cells, R9b zones); within one, in place.
        if (shapeBatchKey(data) + cellSuffix(matrix, cellSize()) + zoneSuffix(placementZone(ctx.zones, matrix)) !== batchKey) { remove(id); add(actor, key, data); continue; }
        batches.get(batchKey)?.instances.move(id, matrix);
      }
    };

    // The zone set changed (a zone or portal edited): placements whose zone changed move batch.
    const unsubscribe = ctx.zones?.onChange(() => {
      for (const [id, batchKey] of [...placed]) {
        const [actorId, key] = placementParts(id);
        const actor = ctx.world.actor(actorId);
        const component = actor?.components[key];
        if (!actor || !component) continue;
        const data = component as unknown as ShapeData;
        componentWorldMatrix(ctx.world, actor, key, matrix);
        if (shapeBatchKey(data) + cellSuffix(matrix, cellSize()) + zoneSuffix(placementZone(ctx.zones, matrix)) !== batchKey) { remove(id); add(actor, key, data); }
      }
    });

    return {
      isActorReady(id) {
        const actor = ctx.world.actor(id);
        return !actor || shapesOf(actor).every(([key]) => batches.get(placed.get(`${id}/${key}`) ?? "")?.instances.ready ?? true);
      },
      actorsAdded: added,
      actorsRemoved: removed,
      actorsChanged(changes) {
        changeInstances(changes, { move, removed, added });
      },
      sync() {
        for (const batch of batches.values()) batch.instances.flush();
      },
      dispose() {
        unsubscribe?.();
        for (const [key, batch] of [...batches]) disposeBatch(key, batch);
        placed.clear();
      },
    };
  },
});
