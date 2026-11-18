// Zones in the editor (plan 5c R9b Z5): Outliner icons in the Volumes group
// and Add Actor entries for a Zone Volume and a Portal. Their Details come from
// the schema; the gizmo moves, turns and scales them (a zone's box and a
// portal's opening grow with the actor's scale). Generate Zones is in World
// Settings (`editor/world/zones.ts`); the boxes are drawn by `editorRender.ts`.
import { componentTypeTag } from "../../core/index.ts";
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
});
