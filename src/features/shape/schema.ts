// Shape: component schema.
//
// A primitive solid: World Builder's placeholders (a role-coloured cube where
// a building, wall or bench will stand) and Add Actor primitives. Forge
// WebGL stored them as placements of the synthetic `shape:<type>` asset with a
// colour; here the primitive and colour are the component's. The primitive's
// base size is 0.5 m (Forge's SHAPE_PRIMITIVE_SIZE): the actor's scale sizes
// it. Schema only for now (plan 2b, user decision 2026-11-12); drawn from
// Faz 3, collider from Faz 6.

import { bool, color, defineComponent, enumOf, type ComponentData } from "../../core/index.ts";

/** Edge length of a primitive at scale 1, metres. */
export const SHAPE_BASE_SIZE = 0.5;

export const SHAPE_PRIMITIVES = ["cube", "sphere", "cylinder", "cone", "plane"] as const;

export const Shape = defineComponent(
  "forge.shape",
  1,
  {
    primitive: enumOf(SHAPE_PRIMITIVES, {
      default: "cube",
      labels: { cube: "Cube", sphere: "Sphere", cylinder: "Cylinder", cone: "Cone", plane: "Plane" },
      hint: "Geometrik biçim. Ölçek 1'de kenarı 0,5 m'dir; boyutu aktörün ölçeği verir.",
    }),
    color: color({
      default: "#c8c8c8",
      hint: "Biçimin rengi. World Builder placeholder'ında rolün rengi.",
    }),
    collision: bool({
      default: true,
      hint: "Oyunda çarpışır. Kapalıysa içinden geçilir.",
    }),
  },
  {
    label: "Shape",
    hint: "Geometrik biçim: placeholder ya da basit katı.",
    spatial: true,
  },
);

export type ShapeData = ComponentData<typeof Shape>;
