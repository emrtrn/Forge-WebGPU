// The puddle in the editor (plan phase 5a step 6): its Outliner icon and
// group, its Add Actor entry and, below its Details form (generated from the
// schema, decision 2), the fill's outcome as Forge's Details showed it.
//
// A new puddle starts 5 cm above the point it is dropped on (Forge's
// `height + .05`), so it holds a little water at once. Moving the actor moves
// the seed and the level; the render binding fills again.
import { componentTypeTag } from "../../core/index.ts";
import { defineFeatureEditor } from "../../editor-sdk/index.ts";
import { Puddle, PuddleStatusKey } from "./schema.ts";

/** Forge's start: the dropped point's height plus 5 cm. */
export const PUDDLE_START_OFFSET = 0.05;

export default defineFeatureEditor({
  feature: "forge.puddle",
  components: { "forge.puddle": { icon: "reflection", outliner: "environment" } },
  addActor: [
    {
      key: "forge.puddle",
      label: "Puddle",
      category: "Visual Effects",
      icon: "reflection",
      components: { puddle: { type: componentTypeTag(Puddle) } },
      lift: PUDDLE_START_OFFSET,
    },
  ],
  details: {
    "forge.puddle": (ctx) => {
      const line = ctx.document.createElement("div");
      line.className = "detail-hint";
      line.dataset.testid = "puddle-status";
      let shown = "";
      const refresh = (): void => {
        const target = ctx.target();
        const result = target ? ctx.service(PuddleStatusKey)?.result(target.actor, target.key) : undefined;
        const text = result?.message ?? "Su hazırlanıyor…";
        line.dataset.puddleStatus = result?.status ?? "loading";
        if (text !== shown) line.textContent = shown = text;
      };
      refresh();
      let since = 0;
      ctx.onFrame((dt) => {
        since += dt;
        if (since < 0.25) return;
        since = 0;
        refresh();
      });
      return { element: line };
    },
  },
});
