// The terrain feature in the editor: Forge's Outliner icon and type group, and
// below its Details form the Landscape section (plan 5d steps 2–3: the sculpt
// and paint tools, the brush and layers the viewport uses, and the terrain's
// tiles); below the Auto Paint rules, Apply Auto Paint (step 3).
import { defineFeatureEditor } from "../../editor-sdk/index.ts";
import { createAutoPaintDetails } from "../../editor/landscape/landscapeAutoPaint.ts";
import { createLandscapeDetails } from "../../editor/landscape/landscapePanel.ts";

export default defineFeatureEditor({
  feature: "forge.terrain",
  components: { "forge.terrain": { icon: "terrain", outliner: "terrain" } },
  details: {
    "forge.terrain": (ctx) => createLandscapeDetails(ctx),
    "forge.landscapeAutoPaint": (ctx) => createAutoPaintDetails(ctx),
  },
});
