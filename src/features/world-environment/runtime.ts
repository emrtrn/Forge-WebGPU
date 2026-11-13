// World Environment: runtime subsystem.
//
// The level's singleton becomes the live World Environment (Forge WebGL's
// WorldEnvironmentController, ported as it is): the hour, season, weather and
// surface state started from the level defaults, which gameplay changes
// through the controller (`WorldEnvironmentService`). The component is only
// read: the live state is never written back (WES §4.4). The hour stays where
// it is set; there is no day length (phase 3 decision 8). A timed transition
// (`transitionTo`, plan phase 3 step 7) runs on the world's tick, before
// physics, so the frame drawn after it sees the hour it reached.

import { defineSubsystem } from "../../core/index.ts";
import { normalizeWorldEnvironment, resolveWorldEnvironment, type ResolvedWorldEnvironment } from "../../engine/environment/worldEnvironment.ts";
import { WorldEnvironmentController } from "../../engine/environment/worldEnvironmentController.ts";
import { WorldEnvironmentKey } from "../../engine/environment/worldEnvironmentRuntime.ts";
import { WorldEnvironment, type WorldEnvironmentData } from "./schema.ts";

/** The component in Forge's layout shape, which the ported controller and resolver read. */
export function forgeWorldEnvironment(data: WorldEnvironmentData) {
  return {
    time: { hour: data.hour, dayLengthMinutes: 0 },
    sunPath: { ...data.sunPath },
    night: { ...data.night },
    season: data.season,
    weather: { ...data.weather },
  };
}

export const WorldEnvironmentSubsystem = defineSubsystem({
  id: "forge.worldEnvironment",
  // The editor's viewport shows it as the game does (plan phase 4).
  inEditor: true,
  tickGroups: ["prePhysics"],
  create(ctx) {
    const controller = new WorldEnvironmentController();
    const runtime: { controller: WorldEnvironmentController; environment: ResolvedWorldEnvironment | null } = { controller, environment: null };
    let loaded: unknown = null;
    const refresh = (): void => {
      const component = ctx.componentsOf(WorldEnvironment.name)[0]?.component ?? null;
      if (component === loaded) return;
      loaded = component;
      if (component === null) {
        controller.clear();
        runtime.environment = null;
        return;
      }
      const layout = forgeWorldEnvironment(component as unknown as WorldEnvironmentData);
      controller.load(layout);
      runtime.environment = resolveWorldEnvironment(normalizeWorldEnvironment(layout).environment);
    };
    ctx.services.provide(WorldEnvironmentKey, runtime);
    return {
      actorsAdded: refresh,
      actorsRemoved: refresh,
      tick: (_group, dt) => controller.advance(dt),
      dispose: () => {
        controller.clear();
        runtime.environment = null;
        loaded = null;
      },
    };
  },
});
