// Auto Paint's rules as the engine reads them (plan 5d step 3, INV-B05). The
// rules are the actor's `forge.landscapeAutoPaint` component (user decision
// 2026-11-19: saved with the level, an agent writes them with `forge edit
// set`); Landscape Mode > Paint > Auto Paint edits them and applies them once
// (landscapePaintPanel.ts, landscapeLayers.ts). They never repaint by themselves.

import type { LandscapeAutoPaintData } from "../../features/terrain/schema.ts";
import type { TerrainAutoPaintSettings } from "../../engine/terrain/terrainAutoPaint.ts";

/** The component's rules as the engine's settings; an empty base layer is the terrain's first. */
export function landscapeAutoPaintSettings(data: LandscapeAutoPaintData, firstLayer: string): TerrainAutoPaintSettings {
  return {
    baseLayerId: data.baseLayer.trim() || firstLayer,
    seed: data.seed,
    rules: data.rules.map((rule) => ({
      layerId: rule.layer.trim(),
      enabled: rule.enabled,
      strength: rule.strength,
      heightMin: rule.heightMin,
      heightMax: rule.heightMax,
      heightFalloff: rule.heightFalloff,
      slopeMin: rule.slopeMin,
      slopeMax: rule.slopeMax,
      slopeFalloff: rule.slopeFalloff,
      noiseAmount: rule.noiseAmount,
      noiseScale: rule.noiseScale,
    })),
  };
}
