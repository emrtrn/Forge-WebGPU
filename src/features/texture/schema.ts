// Texture: binary asset type.
//
// An image file. Schema only for now (plan 2b importer, user decision
// 2026-11-12): version 1 has no import settings, the meta file's `import` is
// `{}`. Import settings (colour space, mipmaps, compression) come in Faz 3 as
// version 2 with a migration from 1, together with materials.

import { defineAssetType } from "../../core/index.ts";

export const TextureAssetType = defineAssetType(
  "forge.texture",
  1,
  { extensions: ["png", "jpg", "webp", "ktx2"] },
  {
    label: "Texture",
    hint: "Doku görseli. İçe aktarma ayarları (renk uzayı, mipmap, sıkıştırma) Faz 3'te gelir.",
  },
);
