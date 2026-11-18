// A tree prototype's impostor (vegetation plan PG3, §6.4; PK7 candidate
// "wood / leaf split"): LOD0 baked into the hemi-octahedral atlas
// (bake/impostorAtlas.ts) as two layers, side by side in one pair of
// textures: the left half the wood alone (so a bare winter tree shows every
// branch), the right half the leaves with, in the normal texture's alpha, the
// largest shedding threshold (`_leaf`.x) of every leaf covering the pixel: a
// pixel stays leafy while any of its leaves remains, the same rule the model
// uses per cluster.
//
// albedo: rgb sRGB colour (the material's colour × its texture), a coverage;
// normal: rg octahedral object-space normal, b depth (0 nearest), a threshold
// (leaves) / 0 (wood).

import { bakeImpostorAtlas } from "../bake/impostorAtlas.ts";
import type { BakeSurface, BakeTexture } from "../bake/rasterizer.ts";
import type { Vec3 } from "../vector.ts";
import type { TreeLodMesh } from "./treeMesh.ts";

export interface TreeImpostorSurface {
  readonly texture?: BakeTexture | null;
  /** sRGB 0..1. */
  readonly color: readonly [number, number, number];
  readonly tiling?: readonly [number, number];
  /** The material flips V (flipY): the rasterizer samples v = 0 at the first row. */
  readonly flipY?: boolean;
  readonly alphaTest?: number;
}

export interface TreeImpostor {
  /** Width = 2 × height: wood left, leaves right. */
  readonly width: number;
  readonly height: number;
  readonly views: number;
  readonly frameSize: number;
  readonly albedo: Uint8Array;
  readonly normal: Uint8Array;
  readonly center: Vec3;
  readonly radius: number;
}

const uvsOf = (uvs: Float32Array, surface: TreeImpostorSurface): Float32Array => {
  const [tu, tv] = surface.tiling ?? [1, 1];
  return uvs.map((value, i) => {
    const tiled = value * (i % 2 === 0 ? tu : tv);
    return i % 2 === 1 && surface.flipY ? 1 - tiled : tiled;
  });
};

export function bakeTreeImpostor(
  lod0: TreeLodMesh,
  materials: { wood: TreeImpostorSurface; leaf: TreeImpostorSurface },
  options: { views?: number; frameSize?: number; supersample?: number } = {},
): TreeImpostor {
  const surfaces: BakeSurface[] = [{
    mesh: lod0.wood, uvs: uvsOf(lod0.wood.uvs, materials.wood), texture: materials.wood.texture ?? null,
    color: materials.wood.color, alphaTest: materials.wood.alphaTest ?? 0, layer: 0,
  }];
  if (lod0.leaves) {
    surfaces.push({
      mesh: lod0.leaves, uvs: uvsOf(lod0.leaves.uvs, materials.leaf), texture: materials.leaf.texture ?? null,
      color: materials.leaf.color, alphaTest: materials.leaf.alphaTest ?? 0.5, layer: 1,
      threshold: lod0.leaves.attributes.leaf!.filter((_, i) => i % 2 === 0),
    });
  }
  const atlas = bakeImpostorAtlas(surfaces, { views: options.views ?? 8, frameSize: options.frameSize ?? 128, layers: 2, supersample: options.supersample ?? 2 });
  const { size } = atlas, width = size * 2;
  const albedo = new Uint8Array(width * size * 4), normal = new Uint8Array(width * size * 4);
  atlas.layers.forEach((layer, index) => {
    for (let y = 0; y < size; y++) {
      albedo.set(layer.albedo.subarray(y * size * 4, (y + 1) * size * 4), (y * width + index * size) * 4);
      normal.set(layer.normal.subarray(y * size * 4, (y + 1) * size * 4), (y * width + index * size) * 4);
    }
  });
  return { width, height: size, views: atlas.views, frameSize: atlas.frameSize, albedo, normal, center: atlas.center, radius: atlas.radius };
}
