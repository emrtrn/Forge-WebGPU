// One drawn World Terrain (plan phase 5a step 2): the residency, culling and
// selection half of Forge WebGL's TerrainRenderer
// (engine/render-three/terrain/terrainRenderer.ts @ forge-webgl-final), its
// rules unchanged. The material is materials/terrain.ts (spike S2's TSL port).
//
// - Tiles: `tiles` is the live map a stream writes (or every tile of a terrain
//   loaded at once). The nearest loaded tiles hold a slot of the slot pool
//   (64), at most 4 new uploads per update; a tile that leaves the wanted set
//   keeps its data cached in its slot until another needs it. An upload sends
//   one texture layer (`addLayerUpdate`), not the array; a neighbour's arrival
//   re-uploads the tiles beside it (normals across the seam). Every other node
//   reads the global map, holes filled from their neighbours.
// - Culling: the four side planes of the view camera and, while the terrain
//   casts shadows, of each shadow-casting directional light (a cascade too), so
//   a ridge off screen still shades the valley in view; padded by 1 % of a leaf
//   plus 0.005 rad of distance, re-selected when a plane turns 0.1 degrees or
//   moves 1 % of a leaf. The view test widens a box to the mirror of the
//   terrain's height range (planar reflections, phase 5a step 6).
// - Selection: Forge's skirt rule (a node standing in from the global map and
//   the slot nodes it touches hang one); the patch grows to the next power of
//   two when a selection needs more nodes.
//
// - Quality (step 3): Forge's hooks, self shadow (`castShadow`, joins the
//   cull) and far tiling (a material rebuild). Normals are half floats, as in
//   Forge (filterable without a float32 feature).
// - The paint layers' textures are two arrays built once (materials/terrain.ts).
//
// - G8 (step 5): `visualSurface` hands the drawn selection to the CPU twin
//   (engine/terrain/terrainVisualHeight.ts); `heightProbe` is the material's
//   height probe for a GPU readback (sync/terrainHeightProbe.ts).
//
// - Edits (5d step 2, Forge's updateTile): `updateTile(key, rect)` re-reads a
//   changed rectangle of a tile from the live map: its slot (and the normals
//   one vertex around it, across a seam into the neighbours' slots), the node
//   height bounds and the far map (heights with holes filled again, normals,
//   weights). Uploads stay whole texture layers (r187 has no sub-rectangle
//   upload); the CPU work is the rectangle's.
//
// Left for later steps: track detail (8).

import * as THREE from "three/webgpu";
import {
  TerrainWorldHeightBounds,
  computeTileNormals,
  updateTerrainGlobalAttributes,
  worldTerrainRenderSource,
  type TerrainGlobalAttributes,
  type TerrainRenderSource,
} from "../../engine/terrain/terrainRenderSource.ts";
import { TerrainLodSelector, terrainResidentTileKeys, type TerrainLodBox, type TerrainLodNode } from "../../engine/terrain/terrainLod.ts";
import { TERRAIN_PATCH_QUADS, TERRAIN_WEIGHT_BLOCKS, type TerrainVertexRect } from "../../engine/terrain/terrainRenderData.ts";
import { invalidateTerrainTileRange } from "../../engine/terrain/terrainHeightQuery.ts";
import { TerrainSlotPool } from "../../engine/terrain/terrainSlotPool.ts";
import { parseTileKey, tileKey, type TerrainTileData, type WorldTerrainDef } from "../../engine/terrain/terrainTypes.ts";
import type { TerrainDrawnNode, TerrainVisualSurface } from "../../engine/terrain/terrainVisualHeight.ts";
import {
  createTerrainLayerTextures,
  createTerrainMaterial,
  createTerrainPatchGeometry,
  setTerrainInstanceCapacity,
  type TerrainFarTint,
  type TerrainLayerTextures,
  type TerrainEditorView,
  type TerrainMaterial,
  type TerrainMaterialInput,
} from "../materials/terrain.ts";
import type { TerrainLayerInput } from "../resources/terrains.ts";
import type { SurfaceCoverInput } from "../materials/surfaceCover.ts";

/** Forge's defaults (terrainRenderer.ts). */
export const TERRAIN_SLOT_CAPACITY = 64;
export const TERRAIN_UPLOADS_PER_FRAME = 4;
/**
 * Angular slack of the frustum cull, in radians of view distance: a node is
 * dropped only when it lies this far past a side plane (plus 1% of a leaf), so
 * a re-select every 0.1° of turn never shows a gap at the screen edge.
 */
const CULL_ANGULAR_PAD = 0.005;
/** cos(0.1°): a side plane turning further than this re-selects. */
const CULL_RESELECT_COS = Math.cos((0.1 * Math.PI) / 180);

/** A light that renders a shadow map through an orthographic camera aimed at its target. */
export interface TerrainShadowCaster {
  readonly castShadow: boolean;
  readonly shadow: { readonly camera: THREE.Camera; updateMatrices(light: THREE.Object3D): void };
  readonly target: THREE.Object3D;
  updateWorldMatrix(updateParents: boolean, updateChildren: boolean): void;
}

/**
 * The shadow-casting directional lights under `root`. A sun with cascades
 * (three's CSMShadowNode) casts through its cascade lights, which sit beside it
 * in the graph; the sun's own shadow camera is left out.
 */
export function terrainShadowCasters(root: THREE.Object3D): TerrainShadowCaster[] {
  const casters: TerrainShadowCaster[] = [];
  root.traverseVisible((object) => {
    const light = object as unknown as Partial<TerrainShadowCaster> & { shadow?: { camera?: THREE.Camera; shadowNode?: { lights?: unknown } } };
    if (!light.castShadow || !light.target || !light.shadow?.camera) return;
    if (!(light.shadow.camera as THREE.OrthographicCamera).isOrthographicCamera) return;
    if (Array.isArray(light.shadow.shadowNode?.lights)) return;
    casters.push(light as TerrainShadowCaster);
  });
  return casters;
}

/**
 * Global map heights for the GPU: a hole (NaN) takes its nearest valid
 * neighbour's height, so triangles reaching into a discarded hole stay level
 * instead of dropping to the datum where the cut is visible (Forge's fillHoles).
 */
export function fillTerrainHoles(heights: Float32Array, width: number, height: number, fallback: number): Float32Array {
  const out = Float32Array.from(heights);
  for (let pass = 0; pass < width + height; pass += 1) {
    let missing = 0;
    const previous = Float32Array.from(out);
    for (let z = 0; z < height; z += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = z * width + x;
        if (!Number.isNaN(previous[index]!)) continue;
        let sum = 0;
        let count = 0;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = x + dx;
          const nz = z + dz;
          if (nx < 0 || nz < 0 || nx >= width || nz >= height) continue;
          const value = previous[nz * width + nx]!;
          if (Number.isNaN(value)) continue;
          sum += value;
          count += 1;
        }
        if (count > 0) out[index] = sum / count;
        else missing += 1;
      }
    }
    if (missing === 0) return out;
  }
  for (let index = 0; index < out.length; index += 1) if (Number.isNaN(out[index]!)) out[index] = fallback;
  return out;
}

function arrayTexture(data: Float32Array | Uint16Array | Uint8Array, size: number, layers: number, format: THREE.PixelFormat, type: THREE.TextureDataType, filter: THREE.MagnificationTextureFilter): THREE.DataArrayTexture {
  const tex = new THREE.DataArrayTexture(data, size, size, layers);
  tex.format = format;
  tex.type = type;
  tex.magFilter = filter;
  tex.minFilter = filter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

export interface TerrainViewOptions {
  readonly def: WorldTerrainDef;
  readonly global: TerrainGlobalAttributes;
  /** The live tile map: every tile, or the ones a stream holds (it writes this map). */
  readonly tiles: ReadonlyMap<string, TerrainTileData>;
  readonly layers: readonly TerrainLayerInput[];
  /** Tile slots on the GPU (default: every tile, at most 64). */
  readonly slotCapacity?: number;
  /** New tile uploads per update (default 4). */
  readonly uploadsPerFrame?: number;
  /** Forge's quality hooks (`terrainSelfShadow`, `terrainFarTiling`); both on by default. */
  readonly selfShadow?: boolean;
  readonly farTiling?: boolean;
  /** An editor terrain: the Landscape view modes are compiled in (`setEditorView`, 5d step 3). */
  readonly editorViews?: boolean;
}

export interface TerrainSelection {
  readonly nodes: number;
  readonly slotNodes: number;
  readonly standIns: number;
}

export class TerrainView {
  private cover: SurfaceCoverInput | null = null;
  private farTint: TerrainFarTint | null = null;
  private editorView: { mode: TerrainEditorView["mode"]; layer: number } = { mode: "lit", layer: -1 };
  setSurfaceCover(input: SurfaceCoverInput | null): void {
    this.cover = input;
    this.terrainMaterial.setSurfaceCover(input);
  }

  /**
   * The far foliage tint (plan 5c F3, Forge's TerrainRenderer.setFarTint): coverage per far map sample into
   * the far map normals' spare alpha, start / end / colour into the material; null clears it.
   */
  setFarTint(tint: (TerrainFarTint & { readonly coverage: Float32Array }) | null): void {
    const texture = this.globalTextures[1]!;
    const { width, height } = texture.image as { width: number; height: number };
    if (tint && tint.coverage.length !== width * height) throw new Error("terrain: far tint does not match the far map");
    const halves = (texture.image as { data: Uint16Array }).data;
    for (let i = 0; i < width * height; i += 1) halves[i * 4 + 3] = THREE.DataUtils.toHalfFloat(tint ? tint.coverage[i]! : 0);
    texture.needsUpdate = true;
    this.farTint = tint ? { start: tint.start, end: tint.end, color: tint.color } : null;
    this.terrainMaterial.setFarTint(this.farTint);
  }
  readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.MeshStandardNodeMaterial>;
  /** World position of terrain-local 0. */
  readonly origin: THREE.Vector3;
  /** The live tiles as a render source (heights relative to the datum, terrain-local frame). */
  readonly source: TerrainRenderSource;
  readonly global: TerrainGlobalAttributes;
  private readonly def: WorldTerrainDef;
  private readonly tileTexels: number;
  private readonly declared: ReadonlySet<string>;
  /** Every declared tile fits in a slot and is loaded at once: residency never changes. */
  private readonly allResident: boolean;
  private readonly uploadsPerFrame: number;
  private readonly heights: Float32Array;
  /** Half floats: normal X / Z per texel (Forge's slot format). */
  private readonly normals: Uint16Array;
  private readonly weights: Uint8Array;
  private readonly normalScratch: Float32Array;
  private readonly heightTex: THREE.DataArrayTexture;
  private readonly normalTex: THREE.DataArrayTexture;
  private readonly weightTex: THREE.DataArrayTexture;
  private readonly globalTextures: readonly THREE.Texture[];
  private readonly bounds: TerrainWorldHeightBounds;
  private readonly selector: TerrainLodSelector;
  private readonly pool: TerrainSlotPool;
  private terrainMaterial: TerrainMaterial;
  /** The far map heights the GPU reads (holes filled). */
  private readonly globalHeights: Float32Array;
  /** The far map has holes (a grid gap): an edit fills them again over the whole map. */
  private readonly globalHoles: boolean;
  private readonly layerTextures: TerrainLayerTextures;
  private readonly materialInput: Omit<TerrainMaterialInput, "farTiling">;
  private farTiling: boolean;
  /** Tiles that hold a slot and want it; the pool may still cache released ones. */
  private readonly active = new Set<string>();
  /** Tiles whose slot holds their current data. */
  private readonly uploaded = new Set<string>();
  private waiting = 0;
  private readonly lastCamera = new THREE.Vector3(Number.NaN, Number.NaN, Number.NaN);
  /** Side planes in selector space: the view camera's, then each shadow caster's; null until the first update. */
  private cullPlanes: THREE.Plane[][] | null = null;
  private readonly cullFrustum = new THREE.Frustum();
  private readonly cullMatrix = new THREE.Matrix4();
  private readonly cameraScratch = new THREE.Vector3();
  private selectionDirty = true;
  private last: TerrainSelection = { nodes: 0, slotNodes: 0, standIns: 0 };

  constructor(options: TerrainViewOptions) {
    const { def, global, tiles } = options;
    this.def = def;
    this.global = global;
    this.origin = new THREE.Vector3(def.origin[0], def.origin[1], def.origin[2]);
    this.source = worldTerrainRenderSource(def, tiles, global);
    const size = def.tileQuads + 1;
    this.tileTexels = size * size;
    this.declared = new Set(def.tiles.map(({ key }) => key));
    const capacity = Math.max(1, Math.min(this.declared.size, options.slotCapacity ?? TERRAIN_SLOT_CAPACITY));
    this.allResident = this.declared.size <= capacity && [...this.declared].every((key) => tiles.has(key));
    this.uploadsPerFrame = options.uploadsPerFrame ?? TERRAIN_UPLOADS_PER_FRAME;
    this.pool = new TerrainSlotPool(capacity);

    this.heights = new Float32Array(this.tileTexels * capacity);
    this.normals = new Uint16Array(this.tileTexels * 2 * capacity);
    this.weights = new Uint8Array(this.tileTexels * 4 * TERRAIN_WEIGHT_BLOCKS * capacity);
    this.normalScratch = new Float32Array(this.tileTexels * 2);
    this.heightTex = arrayTexture(this.heights, size, capacity, THREE.RedFormat, THREE.FloatType, THREE.NearestFilter);
    this.normalTex = arrayTexture(this.normals, size, capacity, THREE.RGFormat, THREE.HalfFloatType, THREE.LinearFilter);
    this.weightTex = arrayTexture(this.weights, size, capacity * TERRAIN_WEIGHT_BLOCKS, THREE.RGBAFormat, THREE.UnsignedByteType, THREE.LinearFilter);

    this.bounds = new TerrainWorldHeightBounds(this.source, TERRAIN_PATCH_QUADS);
    const { map } = global;
    const globalHeights = fillTerrainHoles(map.heights, map.width, map.height, this.bounds.range().min);
    this.globalHeights = globalHeights;
    this.globalHoles = map.heights.some(Number.isNaN);
    const globalHeightTex = new THREE.DataTexture(globalHeights, map.width, map.height, THREE.RedFormat, THREE.FloatType);
    globalHeightTex.magFilter = globalHeightTex.minFilter = THREE.NearestFilter;
    globalHeightTex.needsUpdate = true;
    // Normal X, normal Z, hole flag; alpha spare (Forge keeps the far foliage tint there, 5c).
    const gn = new Uint16Array(map.width * map.height * 4);
    for (let i = 0; i < map.width * map.height; i += 1) {
      gn[i * 4] = THREE.DataUtils.toHalfFloat(global.normals[i * 3]!);
      gn[i * 4 + 1] = THREE.DataUtils.toHalfFloat(global.normals[i * 3 + 1]!);
      gn[i * 4 + 2] = THREE.DataUtils.toHalfFloat(global.normals[i * 3 + 2]!);
      gn[i * 4 + 3] = 0;
    }
    const globalNormalTex = new THREE.DataTexture(gn, map.width, map.height, THREE.RGBAFormat, THREE.HalfFloatType);
    globalNormalTex.magFilter = globalNormalTex.minFilter = THREE.LinearFilter;
    globalNormalTex.needsUpdate = true;
    const globalWeightTex = new THREE.DataArrayTexture(global.weights, map.width, map.height, TERRAIN_WEIGHT_BLOCKS);
    globalWeightTex.format = THREE.RGBAFormat;
    globalWeightTex.type = THREE.UnsignedByteType;
    globalWeightTex.magFilter = globalWeightTex.minFilter = THREE.LinearFilter;
    globalWeightTex.generateMipmaps = false;
    globalWeightTex.needsUpdate = true;
    this.globalTextures = [globalHeightTex, globalNormalTex, globalWeightTex];

    const world = { tileQuads: def.tileQuads, spacing: def.spacing, tilesX: def.tilesX, tilesZ: def.tilesZ, origin: [0, 0, 0] as [number, number, number] };
    this.selector = new TerrainLodSelector(world, (level, ix, iz) => this.bounds.node(level, ix, iz), { patchQuads: TERRAIN_PATCH_QUADS, extent: this.source.extent });
    this.layerTextures = createTerrainLayerTextures(options.layers);
    this.farTiling = options.farTiling ?? true;
    this.materialInput = {
      heights: this.heightTex,
      normals: this.normalTex,
      weights: this.weightTex,
      globalHeights: globalHeightTex,
      globalNormals: globalNormalTex,
      globalWeights: globalWeightTex,
      globalSize: [map.width, map.height],
      globalSpacing: map.stride * def.spacing,
      origin: this.origin,
      spacing: def.spacing,
      tileVertices: size,
      extent: this.source.extent,
      patchQuads: TERRAIN_PATCH_QUADS,
      layers: options.layers,
      layerTextures: this.layerTextures,
      editorViews: options.editorViews === true,
    };
    const material = createTerrainMaterial({ ...this.materialInput, farTiling: this.farTiling });
    this.terrainMaterial = material;
    const leaves = (def.tilesX * def.tilesZ * def.tileQuads * def.tileQuads) / (TERRAIN_PATCH_QUADS * TERRAIN_PATCH_QUADS);
    this.mesh = new THREE.Mesh(createTerrainPatchGeometry(TERRAIN_PATCH_QUADS, Math.min(leaves, 1024)), material.material);
    this.mesh.name = `terrain/${def.name}`;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = options.selfShadow ?? true;
    this.mesh.receiveShadow = true;

    if (this.allResident) for (const key of this.declared) this.makeResident(key);
    // Until the first camera update, draw the whole grid from a far viewpoint.
    const [width, depth] = this.source.extent;
    this.select(new THREE.Vector3(width / 2, Number.MAX_SAFE_INTEGER / 4, depth / 2), false);
  }

  /** Tiles drawn from a slot at full resolution. */
  get residentTileCount(): number {
    return this.uploaded.size;
  }

  /** Loaded tiles that want a slot and have no current upload yet (the last update's count). */
  get pendingUploads(): number {
    return this.waiting;
  }

  /** The last selection's counts. */
  get selection(): TerrainSelection {
    return this.last;
  }

  /** Terrain-local height range (relative to the datum), resident tiles and declared summaries. */
  heightRange(): { min: number; max: number } {
    return this.bounds.range();
  }

  /** The material's height probe (G8): same vertex stage and hole cut, world position per pixel. */
  heightProbe(): THREE.MeshBasicNodeMaterial {
    return this.terrainMaterial.heightProbe();
  }

  /** The drawn surface as the CPU twin reads it: the last selection, its LOD camera, the tiles and the filled far map. */
  visualSurface(): { surface: TerrainVisualSurface; nodes: TerrainDrawnNode[] } {
    const geometry = this.mesh.geometry;
    const a = geometry.getAttribute("terrainNodeA");
    const b = geometry.getAttribute("terrainNodeB");
    const tileSize = this.def.tileQuads * this.def.spacing;
    const nodes: TerrainDrawnNode[] = [];
    for (let i = 0; i < geometry.instanceCount; i += 1) {
      const slot = Math.floor(a.getW(i) + 0.5);
      nodes.push({
        x0: a.getX(i), z0: a.getY(i), size: a.getZ(i),
        tile: slot >= 0 ? { x: Math.round(b.getX(i) / tileSize), z: Math.round(b.getY(i) / tileSize) } : null,
        morph: [b.getZ(i), b.getW(i)],
      });
    }
    const { map } = this.global;
    return {
      nodes,
      surface: {
        tileQuads: this.def.tileQuads, spacing: this.def.spacing, extent: this.source.extent, patchQuads: TERRAIN_PATCH_QUADS,
        tiles: this.source,
        global: { width: map.width, height: map.height, spacing: map.stride * this.def.spacing, heights: this.globalHeights },
        camera: [this.lastCamera.x, this.lastCamera.y, this.lastCamera.z],
      },
    };
  }

  /** Quality hook: cast shadows onto itself; re-selects on the next update (shadow frusta join the cull). */
  setSelfShadow(enabled: boolean): void {
    if (this.mesh.castShadow === enabled) return;
    this.mesh.castShadow = enabled;
    this.selectionDirty = true;
  }

  /** Quality hook: the far tiling break is compiled in or out (a material rebuild, not a per-frame cost). */
  setFarTiling(enabled: boolean): void {
    if (this.farTiling === enabled) return;
    this.farTiling = enabled;
    const previous = this.mesh.material;
    const material = createTerrainMaterial({ ...this.materialInput, farTiling: enabled });
    this.terrainMaterial = material;
    material.setSurfaceCover(this.cover);
    material.setFarTint(this.farTint);
    this.applyEditorView();
    this.mesh.material = material.material;
    previous.dispose();
    this.selectionDirty = true;
  }

  /**
   * The Landscape view mode (Forge's setAppearance): lit, or the height / slope /
   * layer `layer` preview. Only a view built with `editorViews` shows it; the
   * height view spans the terrain's current height range.
   */
  setEditorView(mode: TerrainEditorView["mode"], layer: number): void {
    if (this.editorView.mode === mode && this.editorView.layer === layer) return;
    this.editorView = { mode, layer };
    this.applyEditorView();
  }

  private applyEditorView(): void {
    const { min, max } = this.bounds.range();
    this.terrainMaterial.setEditorView({ ...this.editorView, heightMin: min, heightMax: max });
  }

  /** Streaming changed tile `key`'s residency; the global map never changes (Forge's refreshTile). */
  refreshTile(key: string): void {
    this.bounds.refreshTile(key);
    this.active.delete(key);
    this.uploaded.delete(key);
    this.pool.release(key);
    const { x, z } = parseTileKey(key)!;
    if (this.allResident && this.source.tile(x, z)) this.makeResident(key);
    // A neighbour arriving / leaving changes central differences along the seam.
    for (let dz = -1; dz <= 1; dz += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const neighbour = tileKey(x + dx, z + dz);
        if (neighbour !== key && this.uploaded.has(neighbour)) this.uploadTile(neighbour, this.pool.slotOf(neighbour)!);
      }
    }
    this.selectionDirty = true;
  }

  /**
   * Tile `key`'s data changed inside `rect` (tile-local inclusive vertices; an
   * edit): its slot, the neighbours' normals along the seam, the node bounds and
   * the far map follow (Forge's TerrainRenderer.updateTile).
   */
  updateTile(key: string, rect: TerrainVertexRect): void {
    const coord = parseTileKey(key)!;
    const tile = this.source.tile(coord.x, coord.z);
    if (!tile) return;
    invalidateTerrainTileRange(tile);
    this.bounds.updateTile(key, rect);
    if (this.uploaded.has(key)) this.uploadTile(key, this.pool.slotOf(key)!, rect);
    // The dirty vertices and their one-vertex normal reach, in the adjacent tiles (corner copies of a seam vertex too).
    const last = this.def.tileQuads;
    for (let dz = -1; dz <= 1; dz += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dz === 0) continue;
        const neighbour = tileKey(coord.x + dx, coord.z + dz);
        if (!this.uploaded.has(neighbour)) continue;
        const overlap = (pad: number): TerrainVertexRect | null => {
          const area = {
            x0: Math.max(0, rect.x0 - pad - dx * last), x1: Math.min(last, rect.x1 + pad - dx * last),
            z0: Math.max(0, rect.z0 - pad - dz * last), z1: Math.min(last, rect.z1 + pad - dz * last),
          };
          return area.x0 <= area.x1 && area.z0 <= area.z1 ? area : null;
        };
        const normals = overlap(1);
        if (normals) this.uploadTile(neighbour, this.pool.slotOf(neighbour)!, overlap(0), normals);
      }
    }
    const globalRect = updateTerrainGlobalAttributes(this.global, this.source, key, rect);
    if (globalRect) this.writeGlobalTextures(globalRect);
    if (this.editorView.mode === "height") this.applyEditorView();
    this.selectionDirty = true;
  }

  /**
   * Streams tile slots and re-selects for `camera` (Forge's updateLod): call
   * once a frame before rendering. While the terrain casts shadows, nodes
   * inside the casters' shadow frusta stay selected too. `cull: false` keeps
   * every node in range.
   */
  update(camera: THREE.Camera, casters: readonly TerrainShadowCaster[], cull = true): void {
    this.mesh.updateWorldMatrix(true, false);
    const local = this.mesh.worldToLocal(camera.getWorldPosition(this.cameraScratch)).sub(this.origin);
    const residencyChanged = this.allResident ? false : this.updateResidency(local);
    const threshold = this.selector.settings.leafSize * 0.01;
    let viewChanged: boolean;
    if (cull) {
      viewChanged = this.updateCullPlanes(camera, this.mesh.castShadow ? casters : [], threshold);
    } else {
      viewChanged = this.cullPlanes !== null;
      this.cullPlanes = null;
    }
    if (!residencyChanged && !viewChanged && !this.selectionDirty && local.distanceToSquared(this.lastCamera) < threshold * threshold) return;
    this.select(local, cull);
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.layerTextures.dispose();
    for (const tex of [this.heightTex, this.normalTex, this.weightTex, ...this.globalTextures]) tex.dispose();
  }

  private updateCullPlanes(camera: THREE.Camera, casters: readonly TerrainShadowCaster[], threshold: number): boolean {
    const sets: THREE.Plane[][] = [this.sidePlanes(camera)];
    for (const light of casters) {
      if (!light.castShadow) continue;
      light.updateWorldMatrix(true, false);
      light.target.updateWorldMatrix(true, false);
      light.shadow.updateMatrices(light as unknown as THREE.Object3D);
      sets.push(this.sidePlanes(light.shadow.camera));
    }
    const last = this.cullPlanes;
    let changed = !last || last.length !== sets.length;
    for (let set = 0; set < sets.length && !changed; set += 1) {
      for (let i = 0; i < 4 && !changed; i += 1) {
        const plane = sets[set]![i]!;
        const previous = last![set]![i]!;
        changed = plane.normal.dot(previous.normal) < CULL_RESELECT_COS || Math.abs(plane.constant - previous.constant) > threshold;
      }
    }
    if (changed) this.cullPlanes = sets;
    return changed;
  }

  /** `camera`'s four side planes in selector space. */
  private sidePlanes(camera: THREE.Camera): THREE.Plane[] {
    // Selector space -> clip: projection · view · terrain world · origin offset.
    this.cullMatrix
      .makeTranslation(this.origin.x, this.origin.y, this.origin.z)
      .premultiply(this.mesh.matrixWorld)
      .premultiply(camera.matrixWorldInverse)
      .premultiply(camera.projectionMatrix);
    const planes = this.cullFrustum.setFromProjectionMatrix(this.cullMatrix, camera.coordinateSystem, camera.reversedDepth).planes;
    return planes.slice(0, 4).map((plane) => plane.clone());
  }

  /**
   * Frustum test for one quadtree box, or undefined to keep every node. A box
   * stays when it is inside the view set or any shadow set, dropping only past
   * a padded side plane; in the view test its height span is widened to the
   * mirror of the terrain's whole height range.
   */
  private cullVisibility(cameraLocal: THREE.Vector3, cull: boolean): ((box: TerrainLodBox) => boolean) | undefined {
    const sets = cull ? this.cullPlanes : null;
    if (!sets) return undefined;
    const range = this.bounds.range();
    const mirrorMin = 2 * range.min - range.max;
    const mirrorMax = 2 * range.max - range.min;
    const pad = this.selector.settings.leafSize * 0.01;
    const inside = (planes: readonly THREE.Plane[], box: TerrainLodBox, minY: number, maxY: number, slack: number): boolean => {
      for (const plane of planes) {
        const { x, y, z } = plane.normal;
        // The box corner furthest along the plane normal.
        const distance = x * (x > 0 ? box.maxX : box.minX) + y * (y > 0 ? maxY : minY) + z * (z > 0 ? box.maxZ : box.minZ) + plane.constant;
        if (distance < -slack) return false;
      }
      return true;
    };
    return (box) => {
      const dx = Math.max(box.minX - cameraLocal.x, 0, cameraLocal.x - box.maxX);
      const dz = Math.max(box.minZ - cameraLocal.z, 0, cameraLocal.z - box.maxZ);
      const slack = pad + CULL_ANGULAR_PAD * Math.hypot(dx, dz);
      if (inside(sets[0]!, box, Math.min(box.minY, mirrorMin), Math.max(box.maxY, mirrorMax), slack)) return true;
      for (let set = 1; set < sets.length; set += 1) {
        if (inside(sets[set]!, box, box.minY, box.maxY, slack)) return true;
      }
      return false;
    };
  }

  /**
   * Gives the nearest loaded tiles a slot, at most `uploadsPerFrame` new
   * uploads per call; tiles that left the wanted set release theirs. True if a
   * slot changed.
   */
  private updateResidency(cameraLocal: THREE.Vector3): boolean {
    const world = { tileQuads: this.def.tileQuads, spacing: this.def.spacing, tilesX: this.def.tilesX, tilesZ: this.def.tilesZ, origin: [0, 0, 0] as [number, number, number] };
    const wanted = terrainResidentTileKeys(world, this.selector.settings, [cameraLocal.x, cameraLocal.y, cameraLocal.z])
      .filter((key) => {
        const coord = parseTileKey(key)!;
        return this.declared.has(key) && this.source.tile(coord.x, coord.z) !== undefined;
      })
      .slice(0, this.pool.capacity);
    const wantedSet = new Set(wanted);
    let changed = false;
    for (const key of [...this.active]) {
      if (wantedSet.has(key)) continue;
      this.active.delete(key);
      this.pool.release(key);
    }
    let uploads = 0;
    for (const key of wanted) {
      if (this.active.has(key)) continue;
      if (uploads >= this.uploadsPerFrame) break;
      const before = this.uploaded.has(key);
      if (!this.makeResident(key)) break;
      if (!before) uploads += 1;
      changed = true;
    }
    this.waiting = wanted.filter((key) => !this.active.has(key) || !this.uploaded.has(key)).length;
    return changed;
  }

  /** Acquires a slot for `key` and uploads it unless the slot still holds it. */
  private makeResident(key: string): boolean {
    const coord = parseTileKey(key)!;
    if (!this.source.tile(coord.x, coord.z)) return false;
    const acquired = this.pool.acquire(key);
    if (!acquired) return false;
    if (acquired.evictedKey) this.uploaded.delete(acquired.evictedKey);
    this.active.add(key);
    if (!acquired.cached || !this.uploaded.has(key)) this.uploadTile(key, acquired.slot);
    return true;
  }

  /**
   * Writes tile `key` into its slot (one texture layer each): heights and
   * weights inside `rect` (the whole tile when omitted, none when null), normals
   * inside `normalRect` (default: `rect` and one vertex around it), across seams.
   */
  private uploadTile(key: string, slot: number, rect?: TerrainVertexRect | null, normalRect?: TerrainVertexRect): void {
    const { x, z } = parseTileKey(key)!;
    const tile = this.source.tile(x, z)!;
    const texels = this.tileTexels;
    const size = tile.size;
    const vertices = rect === undefined ? { x0: 0, x1: size - 1, z0: 0, z1: size - 1 } : rect;
    const area = normalRect ?? {
      x0: Math.max(0, vertices!.x0 - 1), x1: Math.min(size - 1, vertices!.x1 + 1),
      z0: Math.max(0, vertices!.z0 - 1), z1: Math.min(size - 1, vertices!.z1 + 1),
    };
    computeTileNormals(this.source, key, this.normalScratch, area);
    const normalBase = slot * texels * 2;
    for (let row = area.z0; row <= area.z1; row += 1) {
      for (let column = area.x0; column <= area.x1; column += 1) {
        const index = (row * size + column) * 2;
        this.normals[normalBase + index] = THREE.DataUtils.toHalfFloat(this.normalScratch[index]!);
        this.normals[normalBase + index + 1] = THREE.DataUtils.toHalfFloat(this.normalScratch[index + 1]!);
      }
    }
    this.normalTex.addLayerUpdate(slot);
    this.normalTex.needsUpdate = true;
    if (vertices) {
      const blockBytes = texels * 4;
      const blocks = Math.ceil(tile.layerCount / 4);
      for (let row = vertices.z0; row <= vertices.z1; row += 1) {
        const start = row * size + vertices.x0;
        const end = row * size + vertices.x1 + 1;
        this.heights.set(tile.heights.subarray(start, end), slot * texels + start);
        for (let block = 0; block < TERRAIN_WEIGHT_BLOCKS; block += 1) {
          const target = (slot * TERRAIN_WEIGHT_BLOCKS + block) * blockBytes;
          if (block < blocks) this.weights.set(tile.weights.subarray(block * blockBytes + start * 4, block * blockBytes + end * 4), target + start * 4);
          else this.weights.fill(0, target + start * 4, target + end * 4);
        }
      }
      this.heightTex.addLayerUpdate(slot);
      for (let block = 0; block < TERRAIN_WEIGHT_BLOCKS; block += 1) this.weightTex.addLayerUpdate(slot * TERRAIN_WEIGHT_BLOCKS + block);
      this.heightTex.needsUpdate = true;
      this.weightTex.needsUpdate = true;
    }
    this.uploaded.add(key);
    this.selectionDirty = true;
  }

  /** The far map's textures inside `rect` (map samples); holes are filled again over the whole map. */
  private writeGlobalTextures(rect: TerrainVertexRect): void {
    const { map, normals } = this.global;
    const [heightTex, normalTex, weightTex] = this.globalTextures as [THREE.DataTexture, THREE.DataTexture, THREE.DataArrayTexture];
    if (this.globalHoles) {
      this.globalHeights.set(fillTerrainHoles(map.heights, map.width, map.height, this.bounds.range().min));
    } else {
      for (let z = rect.z0; z <= rect.z1; z += 1) {
        const start = z * map.width + rect.x0;
        this.globalHeights.set(map.heights.subarray(start, z * map.width + rect.x1 + 1), start);
      }
    }
    const halves = (normalTex.image as { data: Uint16Array }).data;
    for (let z = rect.z0; z <= rect.z1; z += 1) {
      for (let x = rect.x0; x <= rect.x1; x += 1) {
        const sample = z * map.width + x;
        halves[sample * 4] = THREE.DataUtils.toHalfFloat(normals[sample * 3]!);
        halves[sample * 4 + 1] = THREE.DataUtils.toHalfFloat(normals[sample * 3 + 1]!);
        halves[sample * 4 + 2] = THREE.DataUtils.toHalfFloat(normals[sample * 3 + 2]!);
      }
    }
    // The weight array texture reads the far map's own weights (updated in place).
    heightTex.needsUpdate = true;
    normalTex.needsUpdate = true;
    weightTex.needsUpdate = true;
  }

  private select(cameraLocal: THREE.Vector3, cull: boolean): void {
    this.lastCamera.copy(cameraLocal);
    this.selectionDirty = false;
    this.terrainMaterial.setLodCamera(cameraLocal.x, cameraLocal.y, cameraLocal.z);
    const geometry = this.mesh.geometry;
    const tileSize = this.def.tileQuads * this.def.spacing;
    const [width, depth] = this.source.extent;
    const nodes: TerrainLodNode[] = this.selector
      .select([cameraLocal.x, cameraLocal.y, cameraLocal.z], this.cullVisibility(cameraLocal, cull))
      // Nodes wholly past the drawn extent or on a missing tile draw nothing.
      .filter((node) => node.offsetX < width && node.offsetZ < depth && (!node.tileKey || this.declared.has(node.tileKey)));
    if (nodes.length > (geometry.getAttribute("terrainNodeA") as THREE.InstancedBufferAttribute).count) {
      setTerrainInstanceCapacity(geometry, 2 ** Math.ceil(Math.log2(nodes.length)));
    }
    const a = geometry.getAttribute("terrainNodeA") as THREE.InstancedBufferAttribute;
    const b = geometry.getAttribute("terrainNodeB") as THREE.InstancedBufferAttribute;
    const c = geometry.getAttribute("terrainNodeC") as THREE.InstancedBufferAttribute;
    const slots = nodes.map((node) => (node.tileKey && this.uploaded.has(node.tileKey) ? this.pool.slotOf(node.tileKey)! : -1));
    // A node that wants its tile's slot but has none yet stands in from the
    // coarser global map; on an edge it shares with a slot node the two
    // surfaces can part, so both sides hang a skirt.
    const standIns = nodes.filter((node, i) => node.tileKey !== null && slots[i]! < 0);
    const touches = (p: TerrainLodNode, q: TerrainLodNode): boolean =>
      ((p.box.maxX === q.box.minX || q.box.maxX === p.box.minX) && p.box.minZ < q.box.maxZ && q.box.minZ < p.box.maxZ)
      || ((p.box.maxZ === q.box.minZ || q.box.maxZ === p.box.minZ) && p.box.minX < q.box.maxX && q.box.minX < p.box.maxX);
    nodes.forEach((node, i) => {
      const slot = slots[i]!;
      const tile = slot >= 0 ? parseTileKey(node.tileKey!)! : { x: 0, z: 0 };
      const skirt = node.level < 0 || standIns.includes(node) || (slot >= 0 && standIns.some((s) => touches(node, s)));
      a.setXYZW(i, node.offsetX, node.offsetZ, node.size, slot);
      b.setXYZW(i, tile.x * tileSize, tile.z * tileSize, node.morphRange[0], node.morphRange[1]);
      c.setX(i, skirt ? 1 : 0);
    });
    a.needsUpdate = true;
    b.needsUpdate = true;
    c.needsUpdate = true;
    geometry.instanceCount = nodes.length;
    this.last = { nodes: nodes.length, slotNodes: slots.filter((slot) => slot >= 0).length, standIns: standIns.length };
  }
}
