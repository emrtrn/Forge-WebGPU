// Exponential Height Fog: runtime subsystem.
//
// Fog is a singleton component: at most one per level. The subsystem keeps
// track of it as actors come and go and publishes `HeightFogState`, which the
// render binding (phase 3) reads every frame. Gameplay code may change the
// component's fields at runtime; the state hands out the live component, not
// a copy.

import { createServiceKey, defineSubsystem, type ActorId } from "../../core/index.ts";
import { HeightFog, type HeightFogData } from "./schema.ts";

export interface HeightFogState {
  /** The level's fog component, or null when the level has none. */
  readonly fog: HeightFogData | null;
  /** The actor that holds it. */
  readonly actor: ActorId | null;
}

export const HeightFogStateKey = createServiceKey<HeightFogState>("forge.heightFog.state");

export const HeightFogSubsystem = defineSubsystem({
  id: "forge.heightFog",
  // The editor's viewport shows it as the game does (plan phase 4).
  inEditor: true,
  create(ctx) {
    const state: { fog: HeightFogData | null; actor: ActorId | null } = { fog: null, actor: null };
    const refresh = (): void => {
      const entry = ctx.componentsOf(HeightFog.name)[0];
      state.fog = entry ? (entry.component as unknown as HeightFogData) : null;
      state.actor = entry ? entry.actor.id : null;
    };
    ctx.services.provide(HeightFogStateKey, state);
    return {
      actorsAdded: refresh,
      actorsRemoved: refresh,
      dispose: () => {
        state.fog = null;
        state.actor = null;
      },
    };
  },
});
