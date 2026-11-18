// Bakes a mesh's impostor atlas (vegetation plan PG3, §6.4 / §6.7): the
// rasterizer (rasterizer.ts) draws every frame of the hemi-octahedral view
// grid (impostorViews.ts) around the meshes' bounding sphere, each frame
// dilated on its own (nothing bleeds across frames) and copied into one
// square atlas per layer and output. Frame (i, j) occupies columns
// i × frameSize.., rows j × frameSize.. (row 0 the top of the image).

import type { Vec3 } from "../vector.ts";
import { dilate, rasterize, type BakeSurface, type RasterLayer } from "./rasterizer.ts";
import { impostorFrameBasis } from "./impostorViews.ts";

export interface ImpostorBakeOptions {
  /** Per side, default 8. */
  views?: number;
  /** Pixels per frame side, default 128. */
  frameSize?: number;
  /** Output layers (e.g. 2: wood, leaves). */
  layers: number;
  /** Default 2. */
  supersample?: number;
  /** Dilation passes per frame, default 4. */
  dilate?: number;
}

export interface ImpostorAtlas {
  /** views × frameSize. */
  size: number;
  views: number;
  frameSize: number;
  /**
   * Bounding sphere of every surface: the AABB's centre and half diagonal, what three's
   * `Box3.getBoundingSphere` gives for the model at run time (the billboard must match the frames).
   */
  center: Vec3;
  radius: number;
  layers: RasterLayer[];
}

export function surfaceSphere(surfaces: readonly BakeSurface[]): { center: Vec3; radius: number } {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const { mesh } of surfaces) for (let i = 0; i < mesh.positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const value = mesh.positions[i + k]!;
      if (value < min[k]!) min[k] = value;
      if (value > max[k]!) max[k] = value;
    }
  }
  if (!(min[0]! <= max[0]!)) return { center: [0, 0, 0], radius: 1 };
  const center: Vec3 = [(min[0]! + max[0]!) / 2, (min[1]! + max[1]!) / 2, (min[2]! + max[2]!) / 2];
  const radius = Math.hypot(max[0]! - min[0]!, max[1]! - min[1]!, max[2]! - min[2]!) / 2;
  return { center, radius: radius || 1 };
}

function blit(target: Uint8Array, size: number, source: Uint8Array, frame: number, x0: number, y0: number): void {
  for (let y = 0; y < frame; y++) {
    target.set(source.subarray(y * frame * 4, (y + 1) * frame * 4), ((y0 + y) * size + x0) * 4);
  }
}

export function bakeImpostorAtlas(surfaces: readonly BakeSurface[], options: ImpostorBakeOptions): ImpostorAtlas {
  const views = Math.max(2, Math.min(32, Math.floor(options.views ?? 8)));
  const frameSize = Math.max(4, Math.floor(options.frameSize ?? 128));
  const size = views * frameSize;
  const { center, radius } = surfaceSphere(surfaces);
  const layers: RasterLayer[] = Array.from({ length: options.layers }, () => ({
    albedo: new Uint8Array(size * size * 4),
    normal: new Uint8Array(size * size * 4),
  }));
  for (let j = 0; j < views; j++) for (let i = 0; i < views; i++) {
    const basis = impostorFrameBasis(views, i, j);
    const frame = rasterize(surfaces, { center, ...basis, halfWidth: radius, halfHeight: radius, halfDepth: radius }, {
      width: frameSize, height: frameSize, layers: options.layers, supersample: options.supersample ?? 2,
    });
    frame.forEach((layer, index) => {
      dilate(layer, frameSize, frameSize, options.dilate ?? 4);
      blit(layers[index]!.albedo, size, layer.albedo, frameSize, i * frameSize, j * frameSize);
      blit(layers[index]!.normal, size, layer.normal, frameSize, i * frameSize, j * frameSize);
    });
  }
  return { size, views, frameSize, center, radius, layers };
}
