import { defineFeature, defineSubsystem, type ActorId } from "../../core/index.ts";
import { SkeletalClipsKey } from "../../engine/animation/skeletalClips.ts";
import { SkeletalMesh } from "./schema.ts";

export default defineFeature({
  id: "forge.skeletal",
  components: [SkeletalMesh],
  subsystems: [defineSubsystem({
    id: "forge.skeletalClips",
    create(world) {
      const clips = new Map<ActorId, Map<string, string>>();
      world.services.provide(SkeletalClipsKey, {
        play(actor, component, clip) {
          if (clip === null) {
            const selection = clips.get(actor);
            selection?.delete(component);
            if (selection?.size === 0) clips.delete(actor);
          } else {
            if (!world.actor(actor)) return;
            let selection = clips.get(actor);
            if (!selection) clips.set(actor, selection = new Map());
            selection.set(component, clip);
          }
        },
        current: (actor, component) => clips.get(actor)?.get(component),
      });
      return {
        actorsRemoved(actors) { for (const { id } of actors) clips.delete(id); },
        dispose: () => clips.clear(),
      };
    },
  })],
});
