// The terrain feature in the editor: Forge's Outliner icon and type group, and
// below its Details form the Landscape section (plan 5d step 2: the sculpt
// tool and brush the viewport uses, and the terrain's tiles).
import { defineFeatureEditor } from "../../editor-sdk/index.ts";
import { createLandscapeDetails } from "../../editor/landscape/landscapePanel.ts";

export default defineFeatureEditor({
  feature: "forge.terrain",
  components: { "forge.terrain": { icon: "terrain", outliner: "terrain" } },
  details: { "forge.terrain": (ctx) => createLandscapeDetails(ctx) },
});
