// Texture assets by GUID (architecture §4.9, A6): `texture:<guid>:<srgb|linear>`.
//
// The slot that uses a texture decides its colour space (base colour and
// emissive sRGB, the rest linear; Forge WebGL's rule), so one image may be
// held twice. The texture's import settings (`forge.texture@2`) give its
// anisotropy, capped by the GPU (Forge's default 8, applyDefaultModelTextureAnisotropy
// and configureForgeTexture), and whether it has mipmaps. Images are
// uploaded unflipped: a material flips V in its own UV node (`surfaceMaterial.ts`),
// so the same texture serves materials that flip and ones that do not.
// PNG / JPEG / WebP go through createImageBitmap (the dev server needs its
// request header, which an <img> cannot send); KTX2 through KTX2Loader.

import {
  ImageBitmapLoader,
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
} from "three/webgpu";
import type { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import type { AssetUrls } from "./assetUrls.ts";

/** Forge WebGL's default anisotropy (render-three/textureConfig.ts). */
export const DEFAULT_ANISOTROPY = 8;

export class TextureNotFoundError extends Error {
  constructor(guid: string) {
    super(`Texture ${guid} is not in the asset index.`);
    this.name = "TextureNotFoundError";
  }
}

export interface TextureSource {
  load(guid: string, colorSpace: "srgb" | "linear"): Promise<Texture>;
}

/** The anisotropy a texture asks for, capped by the GPU; at least 1. */
export function textureAnisotropy(requested: unknown, maxAnisotropy: number): number {
  const wanted = typeof requested === "number" && Number.isFinite(requested) ? requested : DEFAULT_ANISOTROPY;
  const max = Number.isFinite(maxAnisotropy) && maxAnisotropy > 0 ? maxAnisotropy : 1;
  return Math.min(Math.max(1, wanted), max);
}

export function createTextureSource(urls: AssetUrls, ktx2: KTX2Loader, maxAnisotropy: () => number): TextureSource {
  const images = new ImageBitmapLoader();
  images.setOptions({ imageOrientation: "none", premultiplyAlpha: "none", colorSpaceConversion: "none" });
  images.setRequestHeader({ ...urls.headers });
  return {
    async load(guid, colorSpace): Promise<Texture> {
      const url = urls.url(guid);
      if (url === null) throw new TextureNotFoundError(guid);
      const settings = urls.importSettings(guid) ?? {};
      const compressed = /\.ktx2$/i.test(url);
      const texture = compressed ? await ktx2.loadAsync(url) : new Texture(await images.loadAsync(url));
      texture.name = guid;
      texture.colorSpace = colorSpace === "srgb" ? SRGBColorSpace : NoColorSpace;
      texture.wrapS = RepeatWrapping;
      texture.wrapT = RepeatWrapping;
      texture.flipY = false;
      texture.anisotropy = textureAnisotropy(settings.anisotropy, maxAnisotropy());
      if (!compressed) {
        const mipmaps = settings.mipmaps !== false;
        texture.generateMipmaps = mipmaps;
        texture.minFilter = mipmaps ? LinearMipmapLinearFilter : LinearFilter;
      }
      texture.needsUpdate = true;
      return texture;
    },
  };
}
