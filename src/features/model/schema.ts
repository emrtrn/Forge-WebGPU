// Model: binary asset type.
//
// A 3D model file (glTF). Schema only for now (plan 2b importer, user decision
// 2026-11-12): version 1 has no import settings, the meta file's `import` is
// `{}`. Import settings (mesh optimisation, embedded texture extraction) come
// in Faz 3 as version 2 with a migration from 1; the renderer loads the model
// from Faz 3.

import { defineAssetType } from "../../core/index.ts";

export const ModelAssetType = defineAssetType(
  "forge.model",
  1,
  { extensions: ["glb", "gltf"] },
  {
    label: "Model",
    hint: "3B model (glTF / GLB). İçe aktarma ayarları Faz 3'te gelir.",
  },
);
