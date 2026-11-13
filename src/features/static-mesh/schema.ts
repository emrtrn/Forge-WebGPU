// Static Mesh: component schema.
//
// A placed model (architecture §4.4: a static mesh placement is an actor).
// World Builder and the Forge WebGL importer write it; the renderer draws it
// from phase 3 and physics builds its collider from phase 6.
//
// Version 2 (phase 3 step 4): `materials` overrides the model's material per
// slot (empty or null keeps the model's default, `forge.model`'s `materials`,
// else the GLB's own); `color` tints the base colour (textures still apply;
// null keeps the material's colour, Forge's placement `color`); `castShadow`
// (default on, user decision 2026-11-13: Forge's level-wide static shadow
// switch became the component's). Receiving shadows is always on.

import { array, assetRef, bool, color, defineComponent, type ComponentData } from "../../core/index.ts";

export const StaticMesh = defineComponent(
  "forge.staticMesh",
  2,
  {
    mesh: assetRef({
      assetType: "forge.model",
      hint: "Gösterilen model asset'i.",
    }),
    materials: array(assetRef({ assetType: "forge.material", hint: "Bu slotun materyali; boşsa modelin varsayılanı." }), {
      hint: "Slot başına materyal değişikliği (Element 0, 1, …). Boş liste modelin materyallerini kullanır.",
    }),
    color: color({
      default: null,
      hint: "Temel rengi bu renkle değiştirir (dokular kalır). Boşsa materyalin rengi.",
    }),
    castShadow: bool({
      default: true,
      hint: "Gölge düşürür. Gölge almak her zaman açık.",
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
    migrations: { 1: (data) => ({ ...data }) },
  },
);

export type StaticMeshData = ComponentData<typeof StaticMesh>;
