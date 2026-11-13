// Texture: binary asset type.
//
// An image file (png, jpg, webp, ktx2). Version 2 (phase 3 step 4) brings the
// import settings: anisotropic filtering and mipmaps. The colour space is not
// the texture's: the material slot that uses it decides (base colour and
// emissive sRGB, the rest linear), as in Forge WebGL, so one image can serve
// both. Version 1 had no settings; its files migrate to the defaults.

import { bool, defineAssetType, num } from "../../core/index.ts";

/** Forge WebGL's default anisotropy cap (render-three/textureConfig.ts). */
export const DEFAULT_TEXTURE_ANISOTROPY = 8;

export const TextureAssetType = defineAssetType(
  "forge.texture",
  2,
  {
    extensions: ["png", "jpg", "webp", "ktx2"],
    importFields: {
      anisotropy: num({
        min: 1,
        max: 16,
        step: 1,
        default: DEFAULT_TEXTURE_ANISOTROPY,
        hint: "Eğik açıda keskinlik (anizotropik filtre örnek sayısı). GPU'nun sınırına çekilir.",
      }),
      mipmaps: bool({
        default: true,
        label: "Mipmaps",
        hint: "Uzakta titremeyi önleyen küçültülmüş kopyalar. UI ya da piksel sanatında kapatılabilir.",
      }),
    },
  },
  {
    label: "Texture",
    hint: "Doku görseli. Renk uzayını onu kullanan materyal slotu belirler.",
    migrations: { 1: (data) => ({ ...data }) },
  },
);
