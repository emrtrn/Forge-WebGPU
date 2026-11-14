// The shape feature in the editor: Forge's per-primitive Outliner icons and
// its Add Actor shapes (Forge: a shape's base rests on the surface it is
// dropped on).
import { componentTypeTag } from "../../core/index.ts";
import { defineFeatureEditor, type ActorTypeIcon } from "../../editor-sdk/index.ts";
import { Shape, SHAPE_PRIMITIVES } from "./schema.ts";

const ICONS: Readonly<Record<string, ActorTypeIcon>> = { cube: "shapeCube", sphere: "shapeSphere", cylinder: "shapeCylinder", cone: "shapeCone", plane: "shapePlane" };
const LABELS: Readonly<Record<string, string>> = { cube: "Cube", sphere: "Sphere", cylinder: "Cylinder", cone: "Cone", plane: "Plane" };

export default defineFeatureEditor({
  feature: "forge.shape",
  components: { "forge.shape": { icon: (data) => ICONS[String(data.primitive)] ?? "shape", outliner: "mesh" } },
  addActor: SHAPE_PRIMITIVES.map((primitive) => ({
    key: `forge.shape:${primitive}`,
    label: LABELS[primitive]!,
    category: "Shapes",
    icon: ICONS[primitive]!,
    restOnSurface: true,
    components: { shape: { type: componentTypeTag(Shape), primitive } },
  })),
});
