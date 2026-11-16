// The scene's authored master gate is independent of the player's quality
// and of every object's castShadow. No component means the backwards-compatible on.
import type { QualitySettings } from "../../engine/perf/qualityProfiles.ts";
import type { RenderWorldView } from "./renderBinding.ts";

export const SHADOW_SETTINGS_COMPONENT = "forge.shadowSettings";

export function sceneShadowsEnabled(world: Pick<RenderWorldView, "componentsOf">): boolean {
  return world.componentsOf(SHADOW_SETTINGS_COMPONENT)[0]?.component.enabled !== false;
}

/** Stable objects between changes: bindings do not get a new quality every frame. */
export function sceneShadowQuality(world: Pick<RenderWorldView, "componentsOf">, quality: () => QualitySettings): () => QualitySettings {
  let previous: QualitySettings | null = null;
  let disabled: QualitySettings | null = null;
  return () => {
    const current = quality();
    if (sceneShadowsEnabled(world) || !current.shadowsEnabled) return current;
    if (previous !== current) { previous = current; disabled = { ...current, shadowsEnabled: false }; }
    return disabled!;
  };
}
