// Static Mesh: component schema.
//
// A placed model (architecture §4.4: a static mesh placement is an actor).
// Schema only for now (plan 2b, user decision 2026-11-12): World Builder and
// the Forge WebGL importer write it; the renderer draws it from Faz 3 and
// physics builds its collider from Faz 6.

import { assetRef, bool, defineComponent, type ComponentData } from "../../core/index.ts";

export const StaticMesh = defineComponent(
  "forge.staticMesh",
  1,
  {
    mesh: assetRef({
      assetType: "forge.model",
      hint: "Gösterilen model asset'i.",
    }),
    collision: bool({
      default: true,
      hint: "Oyunda çarpışır. Kapalıysa içinden geçilir.",
    }),
  },
  {
    label: "Static Mesh",
    hint: "Yerleştirilmiş model.",
    spatial: true,
  },
);

export type StaticMeshData = ComponentData<typeof StaticMesh>;
