import { AnimationMixer, Group, LoopOnce, LoopRepeat, Mesh, SkinnedMesh, type Skeleton } from "three/webgpu";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { parseComponentTypeTag, type ActorId, type WorldActor } from "../../core/index.ts";
import { resourceKey } from "../../render/resources/resourceCache.ts";
import { defineRenderBinding } from "../../render/sync/renderBinding.ts";
import { tagActorObject } from "../../render/sync/pickTags.ts";
import { componentWorldMatrix } from "../../render/sync/transforms.ts";
import { SkeletalMesh } from "./schema.ts";

interface SkeletalView {
  readonly actor: ActorId;
  readonly key: string;
  readonly guid: string;
  readonly holder: Group;
  readonly skeletons: Set<Skeleton>;
  mixer: AnimationMixer | null;
  waiting: boolean;
}

export default defineRenderBinding({
  feature: "forge.skeletal",
  create(ctx) {
    const entries = new Map<string, SkeletalView>();
    const id = (actor: ActorId, key: string) => `${actor}/${key}`;
    const add = (actors: readonly WorldActor[]) => {
      for (const actor of actors) for (const [key, component] of Object.entries(actor.components)) {
        if (parseComponentTypeTag(component.type)?.name !== SkeletalMesh.name || typeof component.model !== "string") continue;
        const guid = component.model;
        const holder = new Group();
        holder.name = `${actor.name}/${key}`;
        holder.matrixAutoUpdate = false;
        tagActorObject(holder, actor.id);
        const entry: SkeletalView = { actor: actor.id, key, guid, holder, skeletons: new Set(), mixer: null, waiting: true };
        entries.set(id(actor.id, key), entry);
        ctx.root.add(holder);
        void ctx.resources.model(guid).then(({ scene, animations }) => {
          if (entries.get(id(actor.id, key)) !== entry) return;
          const rig = clone(scene);
          rig.traverse((object) => {
            if (object instanceof Mesh) {
              object.castShadow = component.castShadow === true;
              object.receiveShadow = true;
            }
            if (object instanceof SkinnedMesh) {
              object.frustumCulled = false;
              entry.skeletons.add(object.skeleton);
            }
          });
          holder.add(rig);
          const clip = (component.clip ? animations?.find(({ name }) => name === component.clip) : animations?.[0]);
          if (clip) {
            entry.mixer = new AnimationMixer(rig);
            entry.mixer.timeScale = typeof component.speed === "number" ? component.speed : 1;
            const action = entry.mixer.clipAction(clip);
            const loop = component.loop === true;
            action.setLoop(loop ? LoopRepeat : LoopOnce, loop ? Infinity : 1);
            action.clampWhenFinished = !loop;
            action.play();
          }
          entry.waiting = false;
        }, () => { entry.waiting = false; });
      }
    };
    const remove = (actor: ActorId) => {
      for (const [key, entry] of entries) {
        if (entry.actor !== actor) continue;
        entries.delete(key);
        entry.mixer?.stopAllAction();
        if (entry.mixer) entry.mixer.uncacheRoot(entry.mixer.getRoot());
        for (const skeleton of entry.skeletons) skeleton.dispose();
        entry.holder.removeFromParent();
        ctx.resources.release(resourceKey.model(entry.guid));
      }
    };
    return {
      actorsAdded: add,
      actorsRemoved(actors) { for (const { id: actor } of actors) remove(actor); },
      actorsChanged(changes) {
        for (const { actor, transformOnly } of changes) if (!transformOnly) { remove(actor.id); add([actor]); }
      },
      isActorReady(actor) { return ![...entries.values()].some((entry) => entry.actor === actor && entry.waiting); },
      sync({ dt }) {
        for (const entry of entries.values()) {
          const actor = ctx.world.actor(entry.actor);
          if (!actor) continue;
          componentWorldMatrix(ctx.world, actor, entry.key, entry.holder.matrix);
          entry.holder.matrixWorldNeedsUpdate = true;
          entry.mixer?.update(dt);
        }
      },
      dispose() { for (const { actor } of entries.values()) remove(actor); },
    };
  },
});
