// The shape feature in the editor: Forge's per-primitive Outliner icons.
import { defineFeatureEditor, type ActorTypeIcon } from "../../editor-sdk/index.ts";

const ICONS: Readonly<Record<string, ActorTypeIcon>> = { cube: "shapeCube", sphere: "shapeSphere", cylinder: "shapeCylinder", cone: "shapeCone", plane: "shapePlane" };

export default defineFeatureEditor({
  feature: "forge.shape",
  components: { "forge.shape": { icon: (data) => ICONS[String(data.primitive)] ?? "shape", outliner: "mesh" } },
});
