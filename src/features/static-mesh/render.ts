// Static Mesh: render binding. Each `forge.staticMesh` component shows its
// model asset (GLB with its own materials) through the host's resource cache,
// keyed by the model's GUID: placements clone the loaded scene, so geometry
// and materials are shared. A component without a model, or whose model fails
// to load, draws nothing; the failure is counted by the cache and reported by
// the host. Colour, shadow and material slot overrides arrive with version 2
// of the component (plan phase 3, step 4); instancing with step 8.

import type { Object3D } from "three/webgpu";
import { parseComponentTypeTag, type WorldActor } from "../../core/index.ts";
import { resourceKey } from "../../render/resources/resourceCache.ts";
import { defineRenderBinding } from "../../render/sync/renderBinding.ts";
import { componentWorldMatrix } from "../../render/sync/transforms.ts";
import { StaticMesh, type StaticMeshData } from "./schema.ts";

interface Placed {
  object: Object3D | null;
  removed: boolean;
  readonly key: string;
}

export default defineRenderBinding({
  feature: "forge.staticMesh",
  create(ctx) {
    const placed = new Map<string, Placed>();
    const meshesOf = (actor: WorldActor) =>
      Object.entries(actor.components).filter(([, component]) => parseComponentTypeTag(component.type)?.name === StaticMesh.name);

    const add = (actor: WorldActor, key: string, data: StaticMeshData): void => {
      if (data.mesh === null) return;
      const entry: Placed = { object: null, removed: false, key: resourceKey.model(data.mesh) };
      placed.set(`${actor.id}/${key}`, entry);
      ctx.resources.model(data.mesh).then(
        (model) => {
          if (entry.removed) return;
          const object = model.scene.clone();
          object.name = `${actor.name}/${key}`;
          object.matrixAutoUpdate = false;
          componentWorldMatrix(ctx.world, actor, key, object.matrix);
          object.matrixWorldNeedsUpdate = true;
          entry.object = object;
          ctx.root.add(object);
        },
        () => {
          // Counted by the cache and reported by the host; the placement stays empty.
        },
      );
    };

    const remove = (id: string): void => {
      const entry = placed.get(id);
      if (!entry) return;
      placed.delete(id);
      entry.removed = true;
      entry.object?.removeFromParent();
      ctx.resources.release(entry.key);
    };

    return {
      actorsAdded(actors) {
        for (const actor of actors) {
          for (const [key, component] of meshesOf(actor)) add(actor, key, component as unknown as StaticMeshData);
        }
      },
      actorsRemoved(actors) {
        for (const actor of actors) for (const [key] of meshesOf(actor)) remove(`${actor.id}/${key}`);
      },
      dispose() {
        for (const id of [...placed.keys()]) remove(id);
      },
    };
  },
});
