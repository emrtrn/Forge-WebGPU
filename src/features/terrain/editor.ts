// The terrain feature in the editor: Forge's Outliner icon and type group, and
// below its Details form the Landscape section (plan 5d steps 2–3: the sculpt
// and paint tools, the brush and layers the viewport uses, and the terrain's
// tiles; Auto Paint's rules in Paint > Auto Paint). Its Details start with the
// Landscape section, with no name, transform or placement (Forge's layout,
// `details: "tool"`).
import { defineFeatureEditor } from "../../editor-sdk/index.ts";
import { createLandscapeDetails } from "../../editor/landscape/landscapePanel.ts";

export default defineFeatureEditor({
  feature: "forge.terrain",
  components: {
    "forge.terrain": { icon: "terrain", outliner: "terrain", details: "tool" },
    // Its rules are edited in Landscape Mode > Paint > Auto Paint.
    "forge.landscapeAutoPaint": { icon: "terrain", outliner: "terrain", details: "embedded" },
  },
  details: { "forge.terrain": (ctx) => createLandscapeDetails(ctx) },
});
