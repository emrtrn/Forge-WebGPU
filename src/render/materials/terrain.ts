// The World Terrain's material (plan phase 3 step 8, decision 1): spike S2's
// TSL port of Forge WebGL's CDLOD terrain material
// (engine/render-three/terrain/terrainMaterial.ts), taken from Forge
// `spikes/webgpu/shared/terrain.ts` with its height read-back material left
// out. Vertex: tile slot or global map heights (the collider's triangle in a
// slot, bilinear on the global map), morph between LOD levels, skirts on
// borders of coarser or missing neighbours. Fragment: normals, 8-layer splat,
// far tiling break. Forge `high`: far tiling on.
//
// The textures, the instanced patch and its node attributes are the view's
// (sync/terrainView.ts: tile slots, residency, culling, selection; phase 5a
// step 2). Puddles, detail and production quality are phase 5a; shore and
// caustics phase 7.
//
// TSL's typings reject several valid uses here (integer texel coordinates,
// vector element access); this module takes the functions untyped, as the
// spike did. Nothing else in the renderer does.

import * as THREE from "three/webgpu";
import * as TSLTyped from "three/tsl";
import type { TerrainLayerInput } from "../resources/terrains.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TSL = TSLTyped as unknown as Record<string, any>;
const {
  Fn, attribute, clamp, distance, dot, float, floor, fract, int, ivec2, length, max, mix, positionLocal,
  positionView, select, smoothstep, sqrt, texture, textureLoad, transformNormalToView, uniform, vec2, vec3, vec4,
  varyingProperty, mat2,
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
  const nGlobal = texture(globalNormalTex, globalUv).rg;
  const nXZ = select(useTile, nTile, nGlobal);
  const nY = sqrt(max(float(1).sub(dot(nXZ, nXZ)), float(0)));
  const worldNormal = vec3(nXZ.x, nY, nXZ.y).normalize();
  const w0 = select(useTile, texture(weightTex, tileUv).depth(slotI.mul(2)), texture(globalWeightTex, globalUv).depth(int(0)));
  const w1 = select(useTile, texture(weightTex, tileUv).depth(slotI.mul(2).add(1)), texture(globalWeightTex, globalUv).depth(int(1)));
  const weightsOf = (i: number): AnyNode => (i < 4 ? w0.element(int(i)) : w1.element(int(i - 4)));

  // Far tiling break (Forge high profile: terrainFarTiling on).
  const farT = smoothstep(FAR_TILING_START, FAR_TILING_END, length(positionView));
  const farP = mat2(Math.cos(FAR_TILING_ANGLE), Math.sin(FAR_TILING_ANGLE), -Math.sin(FAR_TILING_ANGLE), Math.cos(FAR_TILING_ANGLE)).mul(vLocal).mul(FAR_TILING_SCALE);
  const flipV = (uv: AnyNode, flip: boolean): AnyNode => (flip ? vec2(uv.x, float(1).sub(uv.y)) : uv);
  let sum: AnyNode = vec3(0, 0, 0);
  let total: AnyNode = float(0);
  let rough: AnyNode = float(0);
  input.layers.forEach((layer, i) => {
    const w = weightsOf(i);
    let color: AnyNode;
    if (layer.texture) {
      const scale = uniform(new THREE.Vector2(layer.scale[0], layer.scale[1]));
      const near = texture(layer.texture, flipV(vLocal.mul(scale), layer.flipY));
      const far = texture(layer.texture, flipV(farP.mul(scale), layer.flipY));
      color = mix(near, near.add(far).mul(0.5), farT).rgb;
    } else {
      color = vec3(uniform(new THREE.Color(layer.color)));
    }
    sum = sum.add(color.mul(w));
    total = total.add(w);
    rough = rough.add(float(layer.roughness).mul(w));
  });
  const fallback = vec3(uniform(new THREE.Color(input.layers[0]?.color ?? "#808080")));
  const albedo = select(total.greaterThan(0.0001), sum.div(total), fallback);

  const material = new THREE.MeshStandardNodeMaterial({ metalness: 0 });
  material.name = "terrain";
  material.positionNode = position;
  material.colorNode = vec4(albedo, 1);
  material.roughnessNode = select(total.greaterThan(0.0001), rough.div(total), float(1));
  material.normalNode = transformNormalToView(worldNormal);
  return {
    material,
    setLodCamera(x, y, z) {
      (uLodCamera.value as THREE.Vector3).set(x, y, z);
    },
  };
}
