import { describe, expect, test } from "vitest";
import { Box3, DirectionalLight, Frustum, Group, Matrix4, PerspectiveCamera, Scene, Vector3, type DataTexture } from "three/webgpu";
import { encodeTerrainGlobalMap, validateTerrainGlobalMap } from "../../engine/terrain/terrainGlobalMapFile.ts";
import { TerrainLodSelector } from "../../engine/terrain/terrainLod.ts";
import {
  TerrainWorldHeightBounds,
  buildTerrainGlobalAttributes,
  terrainSourceQueryDef,
  worldTerrainRenderSource,
} from "../../engine/terrain/terrainRenderSource.ts";
import { createFlatTerrainTile, tileKey, type TerrainTileData, type WorldTerrainDef } from "../../engine/terrain/terrainTypes.ts";
import { createFlatWorldTerrain } from "../../engine/terrain/worldTerrainCreate.ts";
import { terrainVisualSample } from "../../engine/terrain/terrainVisualHeight.ts";
import { terrainHeightAt } from "../../engine/terrain/terrainHeightQuery.ts";
import { fillTerrainHoles, TerrainView, terrainShadowCasters } from "./terrainView.ts";
import { WORLD_ENVIRONMENT_DEFAULTS } from "../../engine/environment/worldEnvironment.ts";

function terrain(tilesX: number, tilesZ: number) {
  const { def, tiles } = createFlatWorldTerrain({ name: "Plain", tilesX, tilesZ, tileQuads: 64, spacing: 2, baseHeight: 0, heightMin: -10, heightMax: 10 });
  const global = buildTerrainGlobalAttributes(worldTerrainRenderSource(def, tiles));
  return { def, tiles: tiles as Map<string, TerrainTileData>, global };
}

const layers = [{ color: "#808080", texture: null, scale: [0.1, 0.1] as const, roughness: 1, flipY: false, normalTexture: null, roughnessTexture: null, detail: null }];

/** A camera at the middle of an 8 x 8 grid (1024 m), low, looking along +X. */
function middleCamera(def: { origin: readonly number[] }): PerspectiveCamera {
  const camera = new PerspectiveCamera(50, 16 / 9, 0.1, 5000);
  camera.position.set(def.origin[0]! + 512, 15, def.origin[2]! + 512);
  camera.lookAt(def.origin[0]! + 1024, 15, def.origin[2]! + 512);
  camera.updateMatrixWorld();
  return camera;
}

describe("terrain view", () => {
  test("WES cover never writes heights, paint or physical layers, nor rebuilds the shader or the G8 probe", () => {
    const { def, tiles, global } = terrain(1, 1);
    const authored = structuredClone({ def, tiles });
    const view = new TerrainView({ def, global, tiles, layers });
    const geometry = view.mesh.geometry;
    const material = view.mesh.material;
    const graph = [material.colorNode, material.roughnessNode, material.normalNode, material.positionNode, material.maskNode];
    const probe = view.heightProbe();
    const version = material.version;
    for (const [snowCoverage, wetness] of [[1, 0], [0, 1], [.5, .7], [0, 0]]) {
      view.setSurfaceCover({ state: { snowCoverage: snowCoverage!, wetness: wetness!, puddleFill: 0, snowDepth: 0 }, settings: WORLD_ENVIRONMENT_DEFAULTS.surface });
    }
    view.setSurfaceCover(null);
    expect(view.mesh.geometry).toBe(geometry);
    expect(view.mesh.material).toBe(material);
    expect(material.version).toBe(version);
    expect([material.colorNode, material.roughnessNode, material.normalNode, material.positionNode, material.maskNode]).toEqual(graph);
    expect(view.heightProbe()).toBe(probe);
    expect({ def, tiles }).toEqual(authored);
    view.dispose();
  });

  test("culls by the camera's side planes; a shadow caster aimed behind it keeps the nodes it shades from", () => {
    const { def, tiles, global } = terrain(8, 8);
    const view = new TerrainView({ def, global, tiles, layers });
    const camera = middleCamera(def);
    view.update(camera, [], false);
    const unculled = view.selection.nodes;
    view.update(camera, []);
    const culled = view.selection.nodes;
    expect(culled).toBeGreaterThan(0);
    expect(culled).toBeLessThan(unculled);

    // A light behind the camera, its orthographic shadow box over the -X half.
    const scene = new Scene();
    const light = new DirectionalLight();
    light.castShadow = true;
    light.position.set(def.origin[0] + 256, 400, def.origin[2] + 512);
    light.target.position.set(def.origin[0] + 256, 0, def.origin[2] + 512);
    Object.assign(light.shadow.camera, { left: -300, right: 300, top: 300, bottom: -300, near: 1, far: 1000 });
    light.shadow.camera.updateProjectionMatrix();
    scene.add(light, light.target);
    const casters = terrainShadowCasters(scene);
    expect(casters).toEqual([light]);
    view.update(camera, casters);
    expect(view.selection.nodes).toBeGreaterThan(culled);
    // A terrain that casts no shadow ignores the casters.
    view.mesh.castShadow = false;
    view.update(camera, casters);
    expect(view.selection.nodes).toBe(culled);
    view.dispose();
  });

  test("quality hooks: self shadow toggles casting and the shadow cull; far tiling rebuilds the material once", () => {
    const { def, tiles, global } = terrain(4, 4);
    const view = new TerrainView({ def, global, tiles, layers, selfShadow: false, farTiling: true });
    expect(view.mesh.castShadow).toBe(false);
    view.setSelfShadow(true);
    expect(view.mesh.castShadow).toBe(true);
    const first = view.mesh.material;
    let disposed = 0;
    first.addEventListener("dispose", () => (disposed += 1));
    view.setFarTiling(true);
    expect(view.mesh.material).toBe(first);
    view.setFarTiling(false);
    expect(view.mesh.material).not.toBe(first);
    expect(disposed).toBe(1);
    view.dispose();
  });

  test("a sun with cascades casts through its cascade lights, not its own shadow camera", () => {
    const scene = new Scene();
    const sun = new DirectionalLight();
    sun.castShadow = true;
    (sun.shadow as unknown as { shadowNode: unknown }).shadowNode = { lights: [] };
    const cascade = new Group() as unknown as Record<string, unknown>;
    Object.assign(cascade, { castShadow: true, target: new Group(), shadow: new DirectionalLight().shadow });
    scene.add(sun, cascade as unknown as Group);
    expect(terrainShadowCasters(scene)).toEqual([cascade]);
    sun.visible = false;
    expect(terrainShadowCasters(scene)).toEqual([cascade]);
  });

  test("residency: the nearest loaded tiles take slots, at most four uploads a frame, and a tile that leaves is refreshed", () => {
    const { def, tiles, global } = terrain(8, 8);
    const live = new Map<string, TerrainTileData>();
    const view = new TerrainView({ def, global, tiles: live, layers });
    const camera = middleCamera(def);
    view.update(camera, []);
    expect([view.residentTileCount, view.pendingUploads]).toEqual([0, 0]);
    for (const key of ["3_3", "4_3", "3_4", "4_4", "2_3", "5_4"]) {
      live.set(key, tiles.get(key)!);
      view.refreshTile(key);
    }
    view.update(camera, []);
    expect([view.residentTileCount, view.pendingUploads]).toEqual([4, 2]);
    view.update(camera, []);
    expect([view.residentTileCount, view.pendingUploads]).toEqual([6, 0]);
    expect(view.selection.slotNodes).toBeGreaterThan(0);
    live.delete("4_4");
    view.refreshTile("4_4");
    view.update(camera, []);
    expect(view.residentTileCount).toBe(5);
    view.dispose();
  });

  test("Forge's hole filling: a hole takes its valid neighbours' mean, spreading inward; nothing valid takes the fallback", () => {
    const heights = Float32Array.from([1, NaN, 3, NaN, NaN, NaN, 5, NaN, 7]);
    expect([...fillTerrainHoles(heights, 3, 3, 0)]).toEqual([1, 2, 3, 3, 4, 5, 5, 6, 7]);
    expect([...fillTerrainHoles(Float32Array.from([NaN, NaN]), 2, 1, -2)]).toEqual([-2, -2]);
  });
});

/** The drawn nodes, read back from the patch's instance attributes. */
function drawnNodes(view: TerrainView) {
  const geometry = view.mesh.geometry;
  const a = geometry.getAttribute("terrainNodeA");
  const b = geometry.getAttribute("terrainNodeB");
  return Array.from({ length: geometry.instanceCount }, (_, i) => ({ x0: a.getX(i), z0: a.getY(i), size: a.getZ(i), slot: a.getW(i), tileX: b.getX(i), tileZ: b.getY(i) }));
}

function random(seed: number): () => number {
  let state = seed;
  return () => ((state = (state * 1664525 + 1013904223) >>> 0) / 0x100000000);
}

/** Forge's world fixture: heights from one function of global vertex coordinates, one tile left out. */
function hillyWorld(tilesX: number, tilesZ: number, q: number, spacing: number, hole: string | null) {
  const def: WorldTerrainDef = {
    schema: 1, type: "worldTerrain", name: "World", tileQuads: q, spacing, tilesX, tilesZ,
    origin: [-10, 2, 5], heightMin: -100, heightMax: 100, collision: true,
    layers: Array.from({ length: 4 }, (_, i) => ({ id: `l${i}`, name: `Layer ${i}`, color: "#ffffff" })), tiles: [],
  };
  const tiles = new Map<string, TerrainTileData>();
  const size = q + 1;
  for (let tz = 0; tz < tilesZ; tz += 1) {
    for (let tx = 0; tx < tilesX; tx += 1) {
      const key = tileKey(tx, tz);
      if (key === hole) continue;
      const heights = new Float32Array(size * size);
      const weights = new Uint8Array(size * size * 4);
      for (let z = 0; z < size; z += 1) {
        for (let x = 0; x < size; x += 1) {
          const gx = tx * q + x;
          const gz = tz * q + z;
          heights[z * size + x] = Math.fround(5 * Math.sin(gx * 0.09) * Math.cos(gz * 0.05) + 0.02 * gx - 0.01 * gz);
          weights.set([gx % 256, gz % 256, (gx + gz) % 256, 7], (z * size + x) * 4);
        }
      }
      tiles.set(key, { x: tx, z: tz, size, heights, layerCount: 4, weights });
      def.tiles.push({ key, minHeight: Math.min(...heights), maxHeight: Math.max(...heights) });
    }
  }
  return { def, tiles };
}

function cameraAt(x: number, y: number, z: number, target?: readonly [number, number, number]): PerspectiveCamera {
  const camera = new PerspectiveCamera(50, 16 / 9, 0.1, 5000);
  camera.position.set(x, y, z);
  if (target) camera.lookAt(target[0], target[1], target[2]);
  camera.updateMatrixWorld();
  return camera;
}

// Rewritten from Forge WebGL @ forge-webgl-final (04b5fb23), R checks of
// terrainWorldRenderer.test / terrainRenderer.test / terrainRender.test (plan
// phase 5a step 4): the global map and the quadtree coverage, on TerrainView.
describe("terrain view: global map and coverage", () => {
  test("decoded global attributes produce identical textures and selection with a missing tile", () => {
    const { def, tiles } = hillyWorld(3, 2, 64, 1.5, tileKey(2, 1));
    const expected = buildTerrainGlobalAttributes(worldTerrainRenderSource(def, tiles));
    const decoded = validateTerrainGlobalMap(def, encodeTerrainGlobalMap(def, expected));
    expect(decoded).toEqual(expected);
    expect(decoded.map.heights.some(Number.isNaN)).toBe(true);
    const computed = new TerrainView({ def, global: expected, tiles, layers });
    const fromFile = new TerrainView({ def, global: decoded, tiles, layers });
    const textures = (view: TerrainView) => (view as unknown as { globalTextures: readonly DataTexture[] }).globalTextures;
    // Precomputed attributes are used directly.
    expect(textures(fromFile)[2]!.image.data).toBe(decoded.weights);
    for (let i = 0; i < 3; i += 1) expect(textures(fromFile)[i]!.image).toEqual(textures(computed)[i]!.image);
    const camera = cameraAt(300, 200, 200, [0, 0, 0]);
    computed.update(camera, []);
    fromFile.update(camera, []);
    expect(drawnNodes(fromFile)).toEqual(drawnNodes(computed));
    computed.dispose();
    fromFile.dispose();
  });

  test("selected nodes tile the authored grid once from any camera; on the surface level 0 is one patch", () => {
    for (const [tilesX, tilesZ, q] of [[1, 1, 256], [3, 2, 64]] as const) {
      const { def, tiles } = hillyWorld(tilesX, tilesZ, q, 1.5, null);
      const view = new TerrainView({ def, global: buildTerrainGlobalAttributes(worldTerrainRenderSource(def, tiles)), tiles, layers });
      const extentX = tilesX * q * 1.5;
      const extentZ = tilesZ * q * 1.5;
      const next = random(5);
      for (let round = 0; round < 25; round += 1) {
        // The view cull keeps a subset; unculled, the same camera's LOD covers it all.
        view.update(cameraAt(def.origin[0] + (next() - 0.5) * extentX * 3, next() * 300, def.origin[2] + (next() - 0.5) * extentZ * 3), [], false);
        const rects = drawnNodes(view).map(({ x0, z0, size }) => [x0, z0, Math.min(x0 + size, extentX), Math.min(z0 + size, extentZ)] as const);
        let area = 0;
        for (const [x0, z0, x1, z1] of rects) {
          expect(x1 > x0 && z1 > z0, "nodes start inside the authored grid").toBe(true);
          area += (x1 - x0) * (z1 - z0);
        }
        expect(Math.abs(area - extentX * extentZ)).toBeLessThan(1e-6 * extentX * extentZ);
        const samples = random(3);
        for (let probe = 0; probe < 200; probe += 1) {
          const px = samples() * extentX;
          const pz = samples() * extentZ;
          const covering = rects.filter(([x0, z0, x1, z1]) => px >= x0 && px < x1 && pz >= z0 && pz < z1).length;
          expect(covering, `point ${px},${pz}`).toBe(1);
        }
      }
      view.update(cameraAt(def.origin[0] + 3, def.origin[1] + 10, def.origin[2] + 5, [def.origin[0] + extentX / 2, 0, def.origin[2] + extentZ / 2]), []);
      expect(Math.min(...drawnNodes(view).map((node) => node.size))).toBe(32 * 1.5);
      view.dispose();
    }
  });

  test("selected nodes cover every tile once and never a missing tile at full resolution", () => {
    const q = 64;
    const spacing = 1.5;
    const { def, tiles } = hillyWorld(3, 2, q, spacing, tileKey(2, 1));
    const view = new TerrainView({ def, global: buildTerrainGlobalAttributes(worldTerrainRenderSource(def, tiles)), tiles, layers });
    const width = 3 * q * spacing;
    const depth = 2 * q * spacing;
    const inHole = (x: number, z: number) => Math.floor(x / (q * spacing)) === 2 && Math.floor(z / (q * spacing)) === 1;
    const next = random(9);
    for (let round = 0; round < 30; round += 1) {
      view.update(cameraAt(def.origin[0] + (next() - 0.25) * width * 1.5, def.origin[1] + next() * 200, def.origin[2] + (next() - 0.25) * depth * 1.5), [], false);
      const list = drawnNodes(view);
      for (let probe = 0; probe < 150; probe += 1) {
        const px = next() * width;
        const pz = next() * depth;
        const covering = list.filter((node) => px >= node.x0 && px < node.x0 + node.size && pz >= node.z0 && pz < node.z0 + node.size);
        if (inHole(px, pz)) {
          expect(covering.length <= 1 && covering.every((node) => node.slot < 0), "a hole is only ever drawn (and discarded) from the global map").toBe(true);
          continue;
        }
        expect(covering.length, `point ${px},${pz}`).toBe(1);
      }
    }
    view.dispose();
  });

  test("LOD: a 2×3 tile extent tiles the footprint with track-detail refinement; a frustum past it selects nothing", () => {
    const def: WorldTerrainDef = {
      schema: 1, type: "worldTerrain", name: "Render", tileQuads: 32, spacing: 1, tilesX: 2, tilesZ: 3,
      origin: [0, 0, 0], heightMin: -64, heightMax: 64, collision: true,
      layers: [{ id: "l0", name: "L0", color: "#808080" }, { id: "l1", name: "L1", color: "#808080" }], tiles: [],
    };
    const tiles = new Map<string, TerrainTileData>();
    for (let z = 0; z < 3; z += 1) for (let x = 0; x < 2; x += 1) {
      tiles.set(tileKey(x, z), createFlatTerrainTile(def, x, z));
      def.tiles.push({ key: tileKey(x, z), minHeight: 0, maxHeight: 0 });
    }
    const source = worldTerrainRenderSource(def, tiles);
    const bounds = new TerrainWorldHeightBounds(source);
    const selector = new TerrainLodSelector(terrainSourceQueryDef(source), (l, x, z) => bounds.node(l, x, z), { extent: source.extent });
    expect([selector.extentX, selector.extentZ]).toEqual([64, 96]);
    for (const camera of [[0, 10, 0], [-200, 50, 300], [31, 2, 47]] as const) {
      for (const detail of [null, { minX: 0, minZ: 0, maxX: 64, maxZ: 96, levels: 2 }]) {
        const nodes = selector.select(camera, undefined, detail);
        let area = 0;
        for (const { box } of nodes) {
          expect(box.minX >= 0 && box.maxX <= 64 && box.minZ >= 0 && box.maxZ <= 96).toBe(true);
          expect(box.maxX > box.minX && box.maxZ > box.minZ).toBe(true);
          area += (box.maxX - box.minX) * (box.maxZ - box.minZ);
        }
        expect(area).toBe(64 * 96);
        if (detail && camera[0] === 0) expect(nodes.some((node) => node.level < 0)).toBe(true);
      }
    }
    for (const extent of [[0, 10], [NaN, 10], [Infinity, 10]] as const) {
      expect(() => new TerrainLodSelector(terrainSourceQueryDef(source), () => ({ min: 0, max: 0 }), { extent })).toThrow(/extent/);
    }
    const camera = new PerspectiveCamera(90, 1, 0.1, 5000);
    camera.position.set(32, 1, 300);
    camera.lookAt(32, 1, 5000);
    camera.updateMatrixWorld(true);
    const frustum = new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const visible = (box: { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number }) =>
      frustum.intersectsBox(new Box3(new Vector3(box.minX, box.minY, box.minZ), new Vector3(box.maxX, box.maxY, box.maxZ)));
    expect(selector.select([32, 1, 300], visible)).toHaveLength(0);
  });
});

// G8 (plan phase 5a step 5): what the view hands to the CPU twin and the GPU readback.
describe("terrain view: G8 hooks", () => {
  test("visualSurface is the drawn selection; near the camera the twin reads the tile's own surface", () => {
    const { def, tiles } = hillyWorld(3, 2, 64, 1.5, null);
    const view = new TerrainView({ def, global: buildTerrainGlobalAttributes(worldTerrainRenderSource(def, tiles)), tiles, layers });
    view.update(cameraAt(def.origin[0] + 100, def.origin[1] + 8, def.origin[2] + 60, [def.origin[0] + 200, 0, def.origin[2] + 60]), [], false);
    const { surface, nodes } = view.visualSurface();
    expect(nodes.map(({ x0, z0, size }) => [x0, z0, size])).toEqual(drawnNodes(view).map(({ x0, z0, size }) => [x0, z0, size]));
    expect(surface.camera).toEqual([100, 8, 60]);
    const query = { tileQuads: def.tileQuads, spacing: def.spacing, tilesX: def.tilesX, tilesZ: def.tilesZ, origin: [0, 0, 0] as [number, number, number] };
    for (const [x, z] of [[100.3, 60.2], [97.9, 55.1], [110.6, 63.7]] as const) {
      const sample = terrainVisualSample(surface, nodes, x, z)!;
      expect(sample.morph).toBe(0);
      expect(sample.node.tile).not.toBeNull();
      expect(sample.height).toBeCloseTo(terrainHeightAt(query, surface.tiles, x, z)!, 4);
    }
    view.dispose();
  });

  test("the height probe is built once per material and goes with it", () => {
    const { def, tiles } = hillyWorld(1, 1, 64, 1.5, null);
    const view = new TerrainView({ def, global: buildTerrainGlobalAttributes(worldTerrainRenderSource(def, tiles)), tiles, layers });
    const probe = view.heightProbe();
    expect(view.heightProbe()).toBe(probe);
    let disposed = 0;
    probe.addEventListener("dispose", () => (disposed += 1));
    view.setFarTiling(false);
    expect(disposed).toBe(1);
    expect(view.heightProbe()).not.toBe(probe);
    view.dispose();
  });
});
