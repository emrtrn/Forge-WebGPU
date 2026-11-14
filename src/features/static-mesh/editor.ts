// The static mesh feature in the editor: Forge's Outliner icon and type group,
// and what the Content Browser's assets do in the viewport (plan phase 4 step
// 6f; Forge's asset drop and assignMaterialAt): a model dropped is a static
// mesh resting on the surface; a material dropped on a static mesh goes to the
// model slot under the pointer (slot 0 when the renderer does not say).
import { componentTypeTag } from "../../core/index.ts";
import { defineFeatureEditor } from "../../editor-sdk/index.ts";
import { StaticMesh } from "./schema.ts";

export default defineFeatureEditor({
  feature: "forge.staticMesh",
  components: { "forge.staticMesh": { icon: "mesh", outliner: "mesh" } },
  assets: [
    {
      assetType: "forge.model",
      place: (asset) => ({ icon: "mesh", restOnSurface: true, components: { mesh: { type: componentTypeTag(StaticMesh), mesh: asset.guid } } }),
    },
    {
      assetType: "forge.material",
      assign: {
        component: StaticMesh.name,
        fields: (data, asset, hit) => {
          const materials: (string | null)[] = Array.isArray(data.materials) ? data.materials.map((id) => (typeof id === "string" ? id : null)) : [];
          const slot = hit.slot ?? 0;
          while (materials.length <= slot) materials.push(null);
          materials[slot] = asset.guid;
          return { materials };
        },
      },
    },
  ],
});
