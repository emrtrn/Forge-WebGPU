// The height fog feature in the editor: Forge's Outliner icon and type group,
// its Add Actor entry (one per level: clicked, not dragged), and Forge's
// Ground Mist Setup below its Details form (environmentDetails.ts @
// forge-webgl-final; user decision 2026-11-14): height falloff and sun tint
// on, density and base height kept, one undo step. Fit to View Distance comes
// with the view distance (5b).
import { componentTypeTag } from "../../core/index.ts";
import { defineFeatureEditor } from "../../editor-sdk/index.ts";
import { HeightFog } from "./schema.ts";

/** Forge's Ground Mist Setup. */
export const GROUND_MIST = { mode: "exp", heightFalloff: 0.01, startDistance: 10, maxOpacity: 1, sunStrength: 0.25 } as const;

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
      return { element: box };
    },
  },
});
