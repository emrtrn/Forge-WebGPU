// Common WES/level wind reading for render consumers (plants join in 5c).
import { LevelSettingsKey, type SubsystemContext } from "../../core/index.ts";
import { WorldEnvironmentKey } from "./worldEnvironmentRuntime.ts";
import { resolveLevelWind, type LayoutWind, type ResolvedWind } from "./wind.ts";

export function resolveWorldWind(world: Pick<SubsystemContext, "services" | "componentsOf">): ResolvedWind {
  const state = world.services.get(WorldEnvironmentKey)?.controller.current() ?? null;
  const authored = world.componentsOf("forge.worldEnvironment")[0]?.component.wind as (LayoutWind & { useLevelWind?: boolean }) | undefined;
  const level = world.services.get(LevelSettingsKey)?.current.wind;
  return resolveLevelWind({
    ...(level ? { worldSettings: { wind: level } } : {}),
    ...(authored && authored.useLevelWind === false ? { worldEnvironment: { wind: authored } } : {}),
  }, state);
}
