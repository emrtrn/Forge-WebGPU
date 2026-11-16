// The height fog feature in the editor: Forge's Outliner icon and type group,
// its Add Actor entry (one per level: clicked, not dragged), and Forge's
// Ground Mist Setup below its Details form (environmentDetails.ts @
// forge-webgl-final; user decision 2026-11-14): height falloff and sun tint
// on, density and base height kept, one undo step. Below it Forge's View
// Distance section (phase 5b): the fog's opacity at the level's view distance
// at its base height, a warning under 90 % (the terrain ends in a hard edge),
// and Fit to View Distance: exponential, 98 % there, falloff, clear distance
// and opacity cap reset, one undo step.
import { componentTypeTag, LevelSettingsKey } from "../../core/index.ts";
import {
  exponentialFogDensityFor,
  heightFogOpacityAt,
  VIEW_DISTANCE_FOG_OPACITY,
  VIEW_DISTANCE_FOG_WARN_OPACITY,
  type FogOpacitySource,
} from "../../engine/world/viewDistance.ts";
import { defineFeatureEditor } from "../../editor-sdk/index.ts";
import { HeightFog } from "./schema.ts";

/** Forge's Ground Mist Setup. */
export const GROUND_MIST = { mode: "exp", heightFalloff: 0.01, startDistance: 10, maxOpacity: 1, sunStrength: 0.25 } as const;

/** Forge's Fit to View Distance: exponential, VIEW_DISTANCE_FOG_OPACITY opaque at the view distance. */
export function fitFogToViewDistance(viewDistance: number): Record<string, unknown> {
  return { mode: "exp", density: Number(exponentialFogDensityFor(viewDistance).toFixed(6)), heightFalloff: 0, startDistance: 0, maxOpacity: 1 };
}

/** The fog's opacity at the view distance, at its base height (Forge's Details line). */
export function fogOpacityAtViewDistance(fog: Readonly<Record<string, unknown>>, viewDistance: number): number {
  const source: FogOpacitySource = {
    hidden: false,
    mode: fog.mode === "linear" ? "linear" : "exp",
    density: Number(fog.density) || 0,
    start: Number(fog.start) || 0,
    end: Number(fog.end) || 0,
    heightFalloff: Number(fog.heightFalloff) || 0,
    baseHeight: Number(fog.baseHeight) || 0,
    startDistance: Number(fog.startDistance) || 0,
    maxOpacity: typeof fog.maxOpacity === "number" ? fog.maxOpacity : 1,
  };
  return heightFogOpacityAt(source, viewDistance);
}

export default defineFeatureEditor({
  feature: "forge.heightFog",
  components: { "forge.heightFog": { icon: "atmosphere", outliner: "environment" } },
  addActor: [{ key: "forge.heightFog", label: "Exponential Height Fog", category: "Visual Effects", icon: "cloud", components: { fog: { type: componentTypeTag(HeightFog) } } }],
  details: {
    "forge.heightFog": (ctx) => {
      const doc = ctx.document;
      const box = doc.createElement("div");
      box.className = "detail-extension";
      const button = doc.createElement("button");
      button.type = "button";
      button.className = "detail-action-button";
      button.textContent = "Ground Mist Setup";
      button.dataset.testid = "fog-ground-mist";
      button.addEventListener("click", () => ctx.edit("Apply Ground Mist Setup", GROUND_MIST));
      const hint = (text: string): HTMLElement => {
        const line = doc.createElement("div");
        line.className = "detail-hint";
        line.textContent = text;
        return line;
      };
      box.append(
        button,
        hint("Ground Mist enables height falloff and sun tint, keeping density and base height. Adjust Base Height to your terrain."),
        hint("Sun Tint warms the haze towards the Sun and fades below the horizon."),
      );
      const view = doc.createElement("div");
      view.className = "detail-extension";
      view.dataset.testid = "fog-view-distance";
      const viewDistance = (): number => ctx.service(LevelSettingsKey)?.current.viewDistance ?? 0;
      const drawView = (): void => {
        const distance = viewDistance();
        if (distance <= 0) {
          view.replaceChildren(hint("Sisi ona uydurmak için World Settings > Streaming > View Distance değerini ayarlayın."));
          return;
        }
        const opacity = fogOpacityAtViewDistance(ctx.value(), distance);
        const line = hint(`At ${distance} m (base height): ${Math.round(opacity * 100)}% fog`);
        line.dataset.testid = "fog-view-opacity";
        const fit = doc.createElement("button");
        fit.type = "button";
        fit.className = "detail-action-button";
        fit.textContent = "Fit to View Distance";
        fit.dataset.testid = "fog-fit-view";
        fit.addEventListener("click", () => ctx.edit("Fit Fog to View Distance", fitFogToViewDistance(viewDistance())));
        view.replaceChildren(line);
        if (opacity < VIEW_DISTANCE_FOG_WARN_OPACITY) {
          const warning = hint("Arazi uzak düzlemde keskin bir kenarla bitecek.");
          warning.dataset.testid = "fog-view-warning";
          view.append(warning);
        }
        view.append(
          fit,
          hint("Fit resets height falloff, clear distance and maximum opacity to hide the far edge."),
          hint(`Görüş mesafesinde %${Math.round(VIEW_DISTANCE_FOG_OPACITY * 100)} yoğunluğa ulaşan üstel sis.`),
        );
      };
      // The fog's fields and the level's view distance change from other panels: redraw only when what is shown would change
      // (rebuilding every frame would swallow a click on the button).
      const stateKey = (): string => {
        const distance = viewDistance();
        return distance <= 0 ? "none" : `${distance}:${Math.round(fogOpacityAtViewDistance(ctx.value(), distance) * 100)}`;
      };
      let shown = stateKey();
      drawView();
      ctx.onFrame(() => {
        const now = stateKey();
        if (now === shown) return;
        shown = now;
        drawView();
      });
      const element = doc.createElement("div");
      element.append(box, view);
      return { element };
    },
  },
});
