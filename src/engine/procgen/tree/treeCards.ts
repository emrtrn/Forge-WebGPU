// The species' branch-tip card library and leaf atlas (vegetation plan PG3,
// §6.4: 8–16 clusters baked once per species, shared by every prototype).
//
// The leaf texture becomes a 4 × 4 atlas of tiles the size of the leaf card
// texture: tile 0 the single leaf card (LOD0's cards), tiles 1.. the library:
// terminal stems of the first prototype picked at even length quantiles,
// each drawn from the side as LOD0 draws it (its twig in the twig colour, its
// leaf clusters with the leaf card) by the CPU rasterizer (bake/rasterizer.ts).
// Coarse LODs with `clusterCards` show these tiles on crossed cards along
// their own terminal stems (treeMesh.ts `addClusterCard`).
//
// UVs follow the leaf material (flipY: v = 0 the image's bottom row); the
// rasterizer samples v = 0 at the first row, so a baked mesh's v is flipped.

import { dilate, rasterize, type BakeCamera, type BakeSurface, type BakeTexture } from "../bake/rasterizer.ts";
import type { ProcMesh } from "../mesh.ts";
import { cross, dot, sub, unit } from "../vector.ts";
import type { Vec3 } from "../vector.ts";
import { addCluster, addTube, FULL_RECT, terminalStems, TreeMeshBuilder, type ClusterCard, type LeafAtlas, type UvRect } from "./treeMesh.ts";
import type { TreeParams } from "./treeParams.ts";
import { addScaled, createStemSampler, type TreeStem } from "./treeSkeleton.ts";

export const LEAF_ATLAS_GRID = 4;

/** Tile (column, row from the image's top) as a rectangle in the material's UVs. */
export function tileRect(tile: number): UvRect {
  const column = tile % LEAF_ATLAS_GRID, row = Math.floor(tile / LEAF_ATLAS_GRID), step = 1 / LEAF_ATLAS_GRID;
  return [column * step, 1 - (row + 1) * step, (column + 1) * step, 1 - row * step];
}

/** `count` terminal stems at even length quantiles (ties by id), distinct. */
export function selectClusterStems(stems: readonly TreeStem[], count: number): number[] {
  const terminal = terminalStems(stems).sort((a, b) => stems[a]!.length - stems[b]!.length || (stems[a]!.id < stems[b]!.id ? -1 : 1));
  const picked: number[] = [];
  const wanted = Math.min(count, terminal.length);
  for (let k = 0; k < wanted; k++) {
    const index = terminal[Math.min(terminal.length - 1, Math.floor((k + 0.5) / wanted * terminal.length))]!;
    if (!picked.includes(index)) picked.push(index);
  }
  return picked;
}

const flipV = (uvs: Float32Array): Float32Array => uvs.map((value, i) => (i % 2 === 1 ? 1 - value : value));

export interface LeafAtlasResult {
  /** Atlas edge, pixels (4 × the leaf texture). */
  size: number;
  /** RGBA8, sRGB. */
  rgba: Uint8Array;
  atlas: LeafAtlas;
}

/** A library card and what its tile draws (the twig and its leaf clusters as LOD0 draws them). */
export interface ClusterSource {
  readonly card: ClusterCard;
  readonly wood: ProcMesh;
  readonly leaves: ProcMesh & { uvs: Float32Array };
  readonly camera: BakeCamera;
}

/**
 * The species' branch-tip card library from the first prototype's skeleton (`params` its seed): geometry only,
 * no pixels. Tile k + 1 of the atlas belongs to card k.
 */
export function clusterLibrary(params: TreeParams, skeleton: { stems: TreeStem[] }): ClusterSource[] {
  const { stems } = skeleton;
  if (params.leaves.perStem === 0 || stems.length === 0) return [];
  const lod0 = { ...params.lods[0]!, leafFraction: 1, clusterCards: false };
  const trunk = createStemSampler(stems[0]!);
  const crown = trunk((1 + params.crownStart) / 2).point;
  return selectClusterStems(stems, Math.min(params.leaves.clusters, LEAF_ATLAS_GRID * LEAF_ATLAS_GRID - 1)).map((index, k) => {
    const stem = stems[index]!;
    const sample = createStemSampler(stem);
    const wood = new TreeMeshBuilder(), leaves = new TreeMeshBuilder();
    const radius = stem.radii[0]!;
    addTube(wood, params, stem, {
      index,
      segments: Math.max(3, Math.min(lod0.radialSegments, Math.round(lod0.radialSegments * radius / params.trunkRadius))),
      spans: Math.max(1, Math.ceil(stem.length * lod0.ringsPerMeter)),
    }, sample);
    for (let i = 0; i < params.leaves.perStem; i++) {
      addCluster(leaves, params, lod0, stem, `${stem.id}/leaf/${i}`, 0.5 + 0.5 * (i + 0.5) / params.leaves.perStem, sample, crown, undefined, FULL_RECT);
    }
    const woodMesh = wood.build(), leafMesh = leaves.build();
    // The twig's frame: along base → tip (image x), viewed from the side (horizontal when it can be).
    const base = stem.points[0]!, axis = unit(sub(stem.points[stem.points.length - 1]!, base));
    const forward = unit(cross(axis, Math.abs(axis[1]) < 0.95 ? [0, 1, 0] : [1, 0, 0]));
    const up = cross(axis, forward);
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity, d0 = Infinity, d1 = -Infinity;
    for (const mesh of [woodMesh, leafMesh]) for (let v = 0; v < mesh.positions.length; v += 3) {
      const p: Vec3 = [mesh.positions[v]! - base[0], mesh.positions[v + 1]! - base[1], mesh.positions[v + 2]! - base[2]];
      const a = dot(p, axis), b = dot(p, up), d = dot(p, forward);
      a0 = Math.min(a0, a); a1 = Math.max(a1, a); b0 = Math.min(b0, b); b1 = Math.max(b1, b); d0 = Math.min(d0, d); d1 = Math.max(d1, d);
    }
    const center = addScaled(addScaled(addScaled(base, axis, (a0 + a1) / 2), up, (b0 + b1) / 2), forward, (d0 + d1) / 2);
    return {
      card: { rect: tileRect(k + 1), length: stem.length, along: [a0, a1], across: [b0, b1] },
      wood: woodMesh,
      leaves: leafMesh,
      camera: {
        center, right: axis, up, forward,
        halfWidth: Math.max(1e-3, (a1 - a0) / 2), halfHeight: Math.max(1e-3, (b1 - b0) / 2), halfDepth: Math.max(1e-3, (d1 - d0) / 2 + 0.01),
      },
    };
  });
}

/** The atlas of a library without pixels (a tree generated without a leaf atlas still gets its cards). */
export function leafAtlasOf(library: readonly ClusterSource[]): LeafAtlas {
  return { leaf: tileRect(0), clusters: library.map((source) => source.card) };
}

/**
 * Bakes the leaf atlas from the first prototype's skeleton (`params` its seed). `leafTexture` is the single leaf
 * card (engine/procgen/texture/leafTexture.ts), `twigColor` sRGB 0..1.
 */
export function bakeLeafAtlas(
  params: TreeParams, skeleton: { stems: TreeStem[] }, leafTexture: BakeTexture, twigColor: readonly [number, number, number],
  options: { supersample?: number } = {},
): LeafAtlasResult {
  const tile = leafTexture.width, size = tile * LEAF_ATLAS_GRID;
  const rgba = new Uint8Array(size * size * 4);
  const place = (pixels: Uint8Array, index: number): void => {
    const x0 = (index % LEAF_ATLAS_GRID) * tile, y0 = Math.floor(index / LEAF_ATLAS_GRID) * tile;
    for (let y = 0; y < tile; y++) rgba.set(pixels.subarray(y * tile * 4, (y + 1) * tile * 4), ((y0 + y) * size + x0) * 4);
  };
  // Tile 0, dilated so mips of the cut edge do not pull in black.
  const leaf = { albedo: Uint8Array.from(leafTexture.rgba), normal: new Uint8Array(leafTexture.rgba.length) };
  dilate(leaf, tile, tile, 4);
  place(leaf.albedo, 0);
  const library = clusterLibrary(params, skeleton);
  library.forEach((source, k) => {
    const surfaces: BakeSurface[] = [
      { mesh: source.wood, color: twigColor, layer: 0 },
      { mesh: source.leaves, uvs: flipV(source.leaves.uvs), texture: leafTexture, layer: 0 },
    ];
    const [layer] = rasterize(surfaces, source.camera, { width: tile, height: tile, layers: 1, supersample: options.supersample ?? 2 });
    dilate(layer!, tile, tile, 4);
    place(layer!.albedo, k + 1);
  });
  return { size, rgba, atlas: leafAtlasOf(library) };
}
