// The World Terrain's material (plan phase 3 step 8, decision 1; production
// layers phase 5a step 3): spike S2's TSL port of Forge WebGL's CDLOD terrain
// material (engine/render-three/terrain/terrainMaterial.ts). Vertex: tile slot
// or global map heights (the collider's triangle in a slot, bilinear on the
// global map), morph between LOD levels, skirts on borders of coarser or
// missing neighbours. Fragment (Forge's lit layer shader): the paint layers'
// albedo and normal arrays (terrainLayerArray.ts; one binding each, whatever
// the layer count), roughness packed in the albedo's alpha, layer normals in
// the terrain normal's tangent space, static detail stamps (terrainDetail.ts),
// the quality-gated far tiling break, and the far map's holes cut by
// `maskNode` in every pass.
//
// The textures, the instanced patch and its node attributes are the view's
// (sync/terrainView.ts: tile slots, residency, culling, selection). Puddles
// are phase 5a step 6; shore and caustics phase 7; tracks phase 8; the debug
// views and the far foliage tint come with their tools (5d, 5c).
//
// TSL's typings reject several valid uses here (integer texel coordinates,
// vector element access); the terrain modules take the functions untyped, as
// the spike did. Nothing else in the renderer does.

import * as THREE from "three/webgpu";
import * as TSLTyped from "three/tsl";
import { TERRAIN_RENDER_LAYERS } from "../../engine/terrain/terrainRenderData.ts";
import type { TerrainLayerInput } from "../resources/terrains.ts";
import { terrainStaticDetail, type TerrainDetailParams } from "./terrainDetail.ts";
import { createTerrainLayerArray, packTerrainLayerRoughness, readTerrainLayerPixels, type TerrainLayerSource } from "./terrainLayerArray.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TSL = TSLTyped as unknown as Record<string, any>;
const {
  Fn, attribute, clamp, cross, dFdx, dFdy, distance, dot, float, floor, fract, int, ivec2, length, max, mix, normalize,
  positionLocal, positionView, select, smoothstep, sqrt, texture, textureLoad, transformNormalToView, uniform, vec2, vec3,
  vec4, varyingProperty, mat2,
} = TSL;

const SKIRT_RATIO = 0.05;
const FAR_TILING_START = 25;
const FAR_TILING_END = 100;
const FAR_TILING_SCALE = 0.23;
const FAR_TILING_ANGLE = 0.6;

/** Unit patch with a skirt ring at y = 1 (Forge's createPatchGeometry). */
export function createTerrainPatchGeometry(patchQuads: number, capacity: number): THREE.InstancedBufferGeometry {
  const verts = patchQuads + 1;
  const ring: [number, number][] = [];
  for (let i = 0; i < patchQuads; i += 1) ring.push([i, 0]);
  for (let i = 0; i < patchQuads; i += 1) ring.push([patchQuads, i]);
  for (let i = patchQuads; i > 0; i -= 1) ring.push([i, patchQuads]);
  for (let i = patchQuads; i > 0; i -= 1) ring.push([0, i]);
  const count = verts * verts + ring.length;
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) normals[i * 3 + 1] = 1;
  for (let z = 0; z < verts; z += 1) {
    for (let x = 0; x < verts; x += 1) {
      const index = (z * verts + x) * 3;
      positions[index] = x / patchQuads;
      positions[index + 2] = z / patchQuads;
    }
  }
  ring.forEach(([x, z], index) => positions.set([x / patchQuads, 1, z / patchQuads], (verts * verts + index) * 3));
  const indices = new Uint32Array(patchQuads * patchQuads * 6 + ring.length * 12);
  let cursor = 0;
  for (let z = 0; z < patchQuads; z += 1) {
    for (let x = 0; x < patchQuads; x += 1) {
      const a = z * verts + x;
      const b = a + 1;
      const c = a + verts;
      const d = c + 1;
      indices.set([a, c, b, b, c, d], cursor);
      cursor += 6;
    }
  }
  ring.forEach(([x, z], index) => {
    const [nx, nz] = ring[(index + 1) % ring.length]!;
    const top0 = z * verts + x;
    const top1 = nz * verts + nx;
    const bottom0 = verts * verts + index;
    const bottom1 = verts * verts + ((index + 1) % ring.length);
    indices.set([top0, bottom0, top1, top1, bottom0, bottom1, top0, top1, bottom0, top1, bottom1, bottom0], cursor);
    cursor += 12;
  });
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  setTerrainInstanceCapacity(geometry, capacity);
  geometry.instanceCount = 0;
  return geometry;
}

/** (Re)allocates the per-node attributes (Forge's setInstanceCapacity). */
export function setTerrainInstanceCapacity(geometry: THREE.InstancedBufferGeometry, capacity: number): void {
  for (const [name, size] of [["terrainNodeA", 4], ["terrainNodeB", 4], ["terrainNodeC", 1]] as const) {
    const attr = new THREE.InstancedBufferAttribute(new Float32Array(capacity * size), size);
    attr.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute(name, attr);
  }
}

/**
 * The paint layers' textures as two arrays (Forge's createTerrainMaterials):
 * albedo (sRGB, roughness packed in alpha where the material has a roughness
 * map) and normals (linear: each layer's normal map, then each layer's detail
 * map, a 2 x 2 atlas as four slices). Built once per terrain; a material
 * rebuild (a quality switch) reuses it.
 */
export interface TerrainLayerTextures {
  readonly albedo: THREE.DataArrayTexture | null;
  readonly normals: THREE.DataArrayTexture | null;
  /** Per layer: albedo slice, -1 drawn with its colour. */
  readonly albedoIndex: readonly number[];
  /** Per layer: the albedo's alpha is roughness. */
  readonly roughnessInAlpha: readonly boolean[];
  /** Per layer: normal map slice, -1 for none. */
  readonly normalIndex: readonly number[];
  /** Per layer: detail first slice, -1 for none. */
  readonly detailIndex: readonly number[];
  dispose(): void;
}

export function createTerrainLayerTextures(input: readonly TerrainLayerInput[]): TerrainLayerTextures {
  const layers = input.slice(0, TERRAIN_RENDER_LAYERS);
  const roughnessInAlpha = layers.map(() => false);
  const albedoSources: TerrainLayerSource[] = layers.map((layer, i) => {
    const rough = layer.roughnessTexture ? readTerrainLayerPixels(layer.roughnessTexture, layer.flipY) : null;
    if (!rough) return layer.texture ? { texture: layer.texture, flipY: layer.flipY } : null;
    const albedo = layer.texture ? readTerrainLayerPixels(layer.texture, layer.flipY) : null;
    // A base colour texture that cannot be read keeps the colour, as Forge's packing failed to the layer colour.
    if (layer.texture && !albedo) return null;
    roughnessInAlpha[i] = true;
    return packTerrainLayerRoughness(albedo, rough, layer.color);
  });
  const albedo = createTerrainLayerArray(albedoSources);
  albedo.index.forEach((slice, i) => {
    if (slice < 0) roughnessInAlpha[i] = false;
  });
  const normals = createTerrainLayerArray(
    [
      ...layers.map((layer) => (layer.normalTexture ? { texture: layer.normalTexture, flipY: layer.flipY } : null)),
      ...layers.map((layer) => (layer.detail ? { texture: layer.detail.normalTexture, flipY: layer.flipY } : null)),
    ],
    true,
    [...layers.map(() => 1), ...layers.map((layer) => layer.detail?.atlasSize ?? 1)],
  );
  return {
    albedo: albedo.texture,
    normals: normals.texture,
    albedoIndex: albedo.index,
    roughnessInAlpha,
    normalIndex: layers.map((_, i) => normals.index[i] ?? -1),
    detailIndex: layers.map((_, i) => normals.index[layers.length + i] ?? -1),
    dispose() {
      albedo.texture?.dispose();
      normals.texture?.dispose();
    },
  };
}

export interface TerrainMaterialInput {
  /** Tile slots: heights (R32F, nearest), normals X / Z (RG), paint weights (2 RGBA8 layers per slot). */
  readonly heights: THREE.DataArrayTexture;
  readonly normals: THREE.DataArrayTexture;
  readonly weights: THREE.DataArrayTexture;
  /** The far map: heights (holes filled), normals (RGBA), weights (2 RGBA8 layers). */
  readonly globalHeights: THREE.DataTexture;
  readonly globalNormals: THREE.DataTexture;
  readonly globalWeights: THREE.DataArrayTexture;
  readonly globalSize: readonly [number, number];
  /** Metres between far map samples. */
  readonly globalSpacing: number;
  /** World position of terrain-local 0. */
  readonly origin: THREE.Vector3;
  readonly spacing: number;
  /** Vertices per tile side. */
  readonly tileVertices: number;
  /** Terrain-local X / Z that is drawn. */
  readonly extent: readonly [number, number];
  readonly patchQuads: number;
  readonly layers: readonly TerrainLayerInput[];
  readonly layerTextures: TerrainLayerTextures;
  /** Forge's quality-gated far tiling break (`terrainFarTiling`). */
  readonly farTiling: boolean;
}

export interface TerrainMaterial {
  readonly material: THREE.MeshStandardNodeMaterial;
  /** Sets the terrain-local camera position the morph reads (the view, on each selection). */
  setLodCamera(x: number, y: number, z: number): void;
}

export function createTerrainMaterial(input: TerrainMaterialInput): TerrainMaterial {
  const { heights: heightTex, normals: normalTex, weights: weightTex, globalHeights: globalHeightTex, globalNormals: globalNormalTex, globalWeights: globalWeightTex } = input;

  const uOrigin = uniform(input.origin);
  const uSpacing = uniform(input.spacing);
  const uTileVertices = uniform(input.tileVertices);
  const uExtent = uniform(new THREE.Vector2(input.extent[0], input.extent[1]));
  const uLodCamera = uniform(new THREE.Vector3());
  const uPatchQuads = uniform(input.patchQuads);
  const uSkirtRatio = uniform(SKIRT_RATIO);
  const uGlobalSize = uniform(new THREE.Vector2(input.globalSize[0], input.globalSize[1]));
  const uGlobalSpacing = uniform(input.globalSpacing);

  const nodeA = attribute("terrainNodeA", "vec4");
  const nodeB = attribute("terrainNodeB", "vec4");
  const nodeC = attribute("terrainNodeC", "float");

  const tileTexel = (cell: AnyNode, slot: AnyNode): AnyNode => {
    const last = int(uTileVertices).sub(1);
    return textureLoad(heightTex, clamp(cell, ivec2(0, 0), ivec2(last, last))).depth(slot).r;
  };
  const globalTexel = (cell: AnyNode): AnyNode => {
    const last = ivec2(uGlobalSize).sub(ivec2(1, 1));
    return textureLoad(globalHeightTex, clamp(cell, ivec2(0, 0), last)).r;
  };
  // Tile slots: the collider's triangle (b-c diagonal); global map bilinear.
  const terrainHeight = Fn(([localXZ, tileOrigin, slotF]: [AnyNode, AnyNode, AnyNode]) => {
    const slot = int(max(slotF, float(0)));
    const tg = localXZ.sub(tileOrigin).div(uSpacing);
    const tb = floor(tg);
    const tf = tg.sub(tb);
    const tc = ivec2(tb);
    const ha = tileTexel(tc, slot);
    const hb = tileTexel(tc.add(ivec2(1, 0)), slot);
    const hc = tileTexel(tc.add(ivec2(0, 1)), slot);
    const hd = tileTexel(tc.add(ivec2(1, 1)), slot);
    const lower = ha.add(hb.sub(ha).mul(tf.x)).add(hc.sub(ha).mul(tf.y));
    const upper = hd.add(hc.sub(hd).mul(float(1).sub(tf.x))).add(hb.sub(hd).mul(float(1).sub(tf.y)));
    const tileH = select(tf.x.add(tf.y).lessThanEqual(1), lower, upper);
    const gg = localXZ.div(uGlobalSpacing);
    const gb = floor(gg);
    const gf = gg.sub(gb);
    const gc = ivec2(gb);
    const h00 = globalTexel(gc);
    const h10 = globalTexel(gc.add(ivec2(1, 0)));
    const h01 = globalTexel(gc.add(ivec2(0, 1)));
    const h11 = globalTexel(gc.add(ivec2(1, 1)));
    const globalH = mix(mix(h00, h10, gf.x), mix(h01, h11, gf.x), gf.y);
    return select(slotF.greaterThanEqual(0), tileH, globalH);
  });

  const vLocal = varyingProperty("vec2", "vTerrainLocal");
  const vTile = varyingProperty("vec3", "vTerrainTile"); // slot, tile origin x / z

  const position = Fn(() => {
    const slotF = floor(nodeA.w.add(0.5));
    const grid = positionLocal.xz;
    const edge = uExtent;
    const start = nodeA.xy.add(grid.mul(nodeA.z));
    const h0 = terrainHeight(clamp(start, vec2(0, 0), edge), nodeB.xy, slotF);
    const morph = clamp(distance(vec3(start.x, h0, start.y), uLodCamera).sub(nodeB.z).div(nodeB.w.sub(nodeB.z)), 0, 1);
    // Odd grid vertices slide onto the even (parent) grid as morph -> 1.
    const fracGrid = fract(grid.mul(uPatchQuads).mul(0.5)).mul(2).div(uPatchQuads);
    const localXZ = clamp(start.sub(fracGrid.mul(nodeA.z).mul(morph)), vec2(0, 0), edge).toVar();
    const h = terrainHeight(localXZ, nodeB.xy, slotF).toVar();
    const border = localXZ.x.lessThanEqual(0).or(localXZ.y.lessThanEqual(0)).or(localXZ.x.greaterThanEqual(edge.x)).or(localXZ.y.greaterThanEqual(edge.y));
    const skirt = positionLocal.y.greaterThan(0.5).and(nodeC.greaterThan(0.5)).and(border.not());
    h.assign(select(skirt, h.sub(nodeA.z.mul(uSkirtRatio)), h));
    vLocal.assign(localXZ);
    vTile.assign(vec3(nodeA.w, nodeB.xy));
    return uOrigin.add(vec3(localXZ.x, h, localXZ.y));
  })();

  // Fragment helpers.
  const slotFrag = floor(vTile.x.add(0.5));
  const slotI = int(max(slotFrag, float(0)));
  const tileUv = vLocal.sub(vTile.yz).div(uSpacing).add(0.5).div(uTileVertices);
  const globalUv = vLocal.div(uGlobalSpacing).add(0.5).div(uGlobalSize);
  const useTile = slotFrag.greaterThanEqual(0);
  const nTile = texture(normalTex, tileUv).depth(slotI).rg;
  const globalNormal = texture(globalNormalTex, globalUv);
  const nXZ = select(useTile, nTile, globalNormal.rg);
  const nY = sqrt(max(float(1).sub(dot(nXZ, nXZ)), float(0)));
  const base = vec3(nXZ.x, nY, nXZ.y).normalize();
  const w0 = select(useTile, texture(weightTex, tileUv).depth(slotI.mul(2)), texture(globalWeightTex, globalUv).depth(int(0)));
  const w1 = select(useTile, texture(weightTex, tileUv).depth(slotI.mul(2).add(1)), texture(globalWeightTex, globalUv).depth(int(1)));
  const weightsOf = (i: number): AnyNode => (i < 4 ? w0.element(int(i)) : w1.element(int(i - 4)));

  // The Landscape look (Forge's fragmentColor): each layer's albedo slice or
  // colour, roughness (times the packed alpha), normal map and static detail,
  // weighted by its paint. Every read is unconditional (uniform control flow
  // for derivatives); a layer without a slice compiles no read at all.
  const { layerTextures: textures } = input;
  const P = vLocal;
  const dPx = dFdx(P);
  const dPy = dFdy(P);
  // Far tiling break: past 25 m each painted layer also reads a rotated 0.23x
  // copy and averages the two, whose periods share no multiple.
  const farT = smoothstep(FAR_TILING_START, FAR_TILING_END, length(positionView));
  const farP = mat2(Math.cos(FAR_TILING_ANGLE), Math.sin(FAR_TILING_ANGLE), -Math.sin(FAR_TILING_ANGLE), Math.cos(FAR_TILING_ANGLE)).mul(P).mul(FAR_TILING_SCALE);
  let sum: AnyNode = vec3(0, 0, 0);
  let total: AnyNode = float(0);
  let rough: AnyNode = float(0);
  let normalSum: AnyNode = vec3(0, 0, 0);
  const normalMapped = textures.normals !== null;
  input.layers.slice(0, TERRAIN_RENDER_LAYERS).forEach((layer, i) => {
    const w = weightsOf(i);
    const scale = vec2(layer.scale[0], layer.scale[1]);
    const albedoSlice = textures.albedoIndex[i] ?? -1;
    let color: AnyNode;
    let r: AnyNode = float(layer.roughness);
    if (textures.albedo && albedoSlice >= 0) {
      let sample = texture(textures.albedo, P.mul(scale)).depth(int(albedoSlice));
      if (input.farTiling) {
        const far = texture(textures.albedo, farP.mul(scale)).depth(int(albedoSlice));
        sample = mix(sample, sample.add(far).mul(0.5), farT);
      }
      color = sample.rgb;
      if (textures.roughnessInAlpha[i]) r = r.mul(sample.a);
    } else {
      color = vec3(uniform(new THREE.Color(layer.color)));
    }
    if (normalMapped) {
      const normalSlice = textures.normalIndex[i] ?? -1;
      let n: AnyNode = normalSlice >= 0 ? texture(textures.normals!, P.mul(scale)).depth(int(normalSlice)).xyz.mul(2).sub(1) : vec3(0, 0, 1);
      const detailSlice = textures.detailIndex[i] ?? -1;
      if (layer.detail && detailSlice >= 0) {
        const d = layer.detail;
        const params: TerrainDetailParams = {
          index: detailSlice,
          grid: d.atlasSize,
          uv: d.uvTiling,
          strength: d.strength,
          coverage: d.coverage,
          patchSize: d.patchSize,
          seed: d.seed,
          direction: (d.direction * Math.PI) / 180,
          directionVariation: (d.directionVariation * Math.PI) / 180,
        };
        n = normalize(vec3(n.xy.mul(d.baseNormalStrength), n.z));
        const stamp = terrainStaticDetail(textures.normals!, P, dPx, dPy, scale.mul(vec2(d.uvTiling[0], d.uvTiling[1])), params);
        n = normalize(vec3(n.xy.add(stamp.xy), n.z.mul(stamp.z)));
        r = mix(r, float(d.roughness), stamp.w);
      }
      normalSum = normalSum.add(n.mul(w));
    }
    sum = sum.add(color.mul(w));
    total = total.add(w);
    rough = rough.add(r.mul(w));
  });
  const painted = total.greaterThan(0.0001);
  const fallback = vec3(uniform(new THREE.Color(input.layers[0]?.color ?? "#808080")));
  const albedo = select(painted, sum.div(total), fallback);

  // Layer normals in the terrain normal's tangent space (Forge's normal block).
  let worldNormal: AnyNode = base;
  if (normalMapped) {
    const layerNormal = select(painted, normalize(normalSum.add(vec3(0, 0, 0.00001))), vec3(0, 0, 1));
    const tangent = normalize(vec3(1, 0, 0).sub(base.mul(base.x)).add(vec3(0, 0, 0.000001)));
    const bitangent = normalize(cross(tangent, base));
    worldNormal = normalize(tangent.mul(layerNormal.x).add(bitangent.mul(layerNormal.y)).add(base.mul(max(layerNormal.z, float(0.05)))));
  }

  const material = new THREE.MeshStandardNodeMaterial({ metalness: 0 });
  material.name = "terrain";
  material.positionNode = position;
  material.colorNode = vec4(albedo, 1);
  material.roughnessNode = select(painted, rough.div(total), float(1));
  material.normalNode = transformNormalToView(worldNormal);
  // A hole in the far map (no tile covers the sample) is cut, in every pass.
  material.maskNode = useTile.or(globalNormal.b.lessThan(0.5));
  return {
    material,
    setLodCamera(x, y, z) {
      (uLodCamera.value as THREE.Vector3).set(x, y, z);
    },
  };
}
