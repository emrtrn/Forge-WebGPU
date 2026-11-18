// Zones in the editor (plan 5c R9b Z5): Outliner icons in the Volumes group
// and Add Actor entries for a Zone Volume and a Portal. Their Details come from
// the schema; the gizmo moves, turns and scales them (a zone's box and a
// portal's opening grow with the actor's scale). Generate Zones is in World
// Settings (`editor/world/zones.ts`); the boxes are drawn by `editorRender.ts`.
import { componentTypeTag } from "../../core/index.ts";
import { PortalSidesKey } from "../../engine/world/zones.ts";
import { defineFeatureEditor } from "../../editor-sdk/index.ts";
import { Portal, Zone } from "./schema.ts";

export default defineFeatureEditor({
  feature: "forge.zone",
  components: {
    "forge.zone": { icon: "volume", outliner: "volume" },
    "forge.portal": { icon: "volume", outliner: "volume" },
  },
  addActor: [
    {
      key: "forge.zone",
      label: "Zone Volume",
      category: "Volumes",
      icon: "volume",
      components: { zone: { type: componentTypeTag(Zone) } },
      // The default box (3 m high) stands on the surface it is dropped on.
      lift: 1.5,
    },
    {
      key: "forge.portal",
      label: "Portal",
      category: "Volumes",
      icon: "volume",
      components: { portal: { type: componentTypeTag(Portal) } },
      // The default opening (2.2 m high) stands on the surface.
      lift: 1.1,
    },
  ],
  details: {
    [Portal.name]: (ctx) => {
      const line = ctx.document.createElement("div");
      line.className = "detail-hint";
      line.dataset.testid = "portal-sides";
      const refresh = (): void => {
        const target = ctx.target();
        const sides = target ? ctx.service(PortalSidesKey)?.portalSides(`${target.actor}/${target.key}`) : null;
        const text = sides ? sides.join(" ↔ ") : "Unlinked";
        if (line.textContent !== text) line.textContent = text;
      };
      refresh();
      ctx.onFrame(refresh);
      return { element: line };
    },
  },
});
