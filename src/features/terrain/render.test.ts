import { describe, expect, test } from "vitest";
import { BufferAttribute, BufferGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Raycaster, Scene, Vector3, type InstancedBufferGeometry } from "three/webgpu";
import { createServices, type ComponentEntry, type WorldActor } from "../../core/index.ts";
import { buildTerrainGlobalAttributes, worldTerrainRenderSource } from "../../engine/terrain/terrainRenderSource.ts";
import { tileKey, type TerrainTileData, type WorldTerrainDef } from "../../engine/terrain/terrainTypes.ts";
import { createFlatWorldTerrain } from "../../engine/terrain/worldTerrainCreate.ts";
import type { TerrainData, TerrainTileReader } from "../../render/resources/terrains.ts";
import type { WorldResources } from "../../render/resources/worldResources.ts";
import { terrainStreamingProbes } from "../../render/sync/debugTags.ts";
import type { RenderBindingContext } from "../../render/sync/renderBinding.ts";
import { resolveQualitySettings } from "../../engine/perf/qualityProfiles.ts";
import { TerrainView } from "../../render/sync/terrainView.ts";
import binding, { terrainPickSurface } from "./render.ts";

const DATA = "ast_00000000000000000000000000000001";

function harness(options: { tilesX: number; tilesZ: number; streams: boolean }) {
  const { def, tiles } = createFlatWorldTerrain({ name: "Valley", tilesX: options.tilesX, tilesZ: options.tilesZ, tileQuads: 64, spacing: 2, baseHeight: 0, heightMin: -10, heightMax: 10 });
  const reads: string[] = [];
  const readers: { disposed: boolean }[] = [];
  const terrain: TerrainData = {
    def,
    global: buildTerrainGlobalAttributes(worldTerrainRenderSource(def, tiles)),
    tiles: options.streams ? null : tiles,
    layers: [{ color: "#6f9a4a", texture: null, scale: [0.1, 0.1], roughness: 1, flipY: false, normalTexture: null, roughnessTexture: null, detail: null }],
    revisions: { document: null, global: null, tiles: new Map() },
    readTile: async () => { throw new Error("the game binding reads tiles through openTiles"); },
    openTiles(): TerrainTileReader {
      const state = { disposed: false };
      readers.push(state);
      return {
        read: async (key) => {
          reads.push(key);
          return tiles.get(key)!;
        },
        dispose: () => {
          state.disposed = true;
        },
      };
    },
  };
  const actor = {
    id: "act_00000000000000000000000000000001",
    name: "Valley",
    transform: { p: [0, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] },
    components: { terrain: { type: "forge.terrain@2", parent: null, local: { p: [0, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] }, data: DATA, material: null } },
  } as unknown as WorldActor;
  const released: string[] = [];
  const holds = { open: 0, tracked: 0 };
  const resources = {
    terrain: async () => terrain,
    release: (key: string) => released.push(key),
    busy: () => {
      holds.open += 1;
      let open = true;
      return () => {
        if (open) holds.open -= 1;
        open = false;
      };
    },
    track: <T,>(work: Promise<T>) => {
      holds.tracked += 1;
      return work;
    },
  } as unknown as WorldResources;
  const root = new Group();
  const quality = { ...resolveQualitySettings("high") };
  const ctx = {
    world: { services: createServices(), actor: () => actor, componentsOf: () => [] as ComponentEntry[] },
    scene: new Scene(),
    root,
    resources,
    quality: () => quality,
  } as unknown as RenderBindingContext;
  const instance = binding.create(ctx);
  instance.actorsAdded?.([actor]);
  const camera = new PerspectiveCamera(44, 1, 0.1, 4000);
  return { instance, actor, root, released, camera, def, quality, tiles: tiles as Map<string, TerrainTileData>, reads, readers, holds, frame: () => instance.sync?.({ dt: 0, camera }) };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("terrain binding", () => {
  test("draws one instanced patch mesh, its nodes selected from the camera, again only once it moved", async () => {
    const { root, camera, def, frame } = harness({ tilesX: 2, tilesZ: 2, streams: false });
    await settle();
    const [mesh] = root.children as Mesh[];
    expect(mesh!.name).toBe("Valley/terrain");
    expect([mesh!.castShadow, mesh!.receiveShadow, mesh!.frustumCulled]).toEqual([true, true, false]);
    const geometry = mesh!.geometry as InstancedBufferGeometry;
    // Before a camera, the whole grid from far above.
    expect(geometry.instanceCount).toBeGreaterThan(0);
    camera.position.set(def.origin[0] + 64, 20, def.origin[2] + 64);
    camera.lookAt(def.origin[0] + 200, 0, def.origin[2] + 200);
    frame();
    expect(geometry.instanceCount).toBeGreaterThan(0);
    const attribute = geometry.getAttribute("terrainNodeA");
    let changes = 0;
    Object.defineProperty(attribute, "needsUpdate", { set: () => (changes += 1), configurable: true });
    frame();
    expect(changes).toBe(0);
    camera.position.x += 1;
    frame();
    expect(changes).toBe(1);
  });

  test("a terrain loaded at once reads no tile, holds readiness only until its slots are filled", async () => {
    const { root, reads, readers, holds, camera, def, frame } = harness({ tilesX: 2, tilesZ: 2, streams: false });
    expect(holds.open).toBe(1);
    await settle();
    camera.position.set(def.origin[0] + 64, 20, def.origin[2] + 64);
    frame();
    expect([reads.length, readers.length, holds.open]).toEqual([0, 0, 0]);
    // Nothing streams: the `?debug` map stays hidden.
    expect(terrainStreamingProbes(root)).toEqual([]);
  });

  test("a streamed terrain reads the tiles around the camera, fills their slots and lets readiness go", async () => {
    const { root, reads, readers, holds, camera, def, frame, instance, actor, released } = harness({ tilesX: 6, tilesZ: 6, streams: true });
    await settle();
    const [mesh] = root.children as Mesh[];
    expect(readers).toHaveLength(1);
    camera.position.set(def.origin[0] + 64, 30, def.origin[2] + 64);
    camera.lookAt(def.origin[0] + 300, 0, def.origin[2] + 300);
    for (let i = 0; i < 20 && holds.open > 0; i += 1) {
      frame();
      await settle();
    }
    expect(holds.open).toBe(0);
    expect(holds.tracked).toBe(reads.length);
    // Two tiles of range from a corner: not the whole 6 x 6 grid.
    expect(reads.length).toBeGreaterThan(1);
    expect(reads.length).toBeLessThan(36);
    expect(reads).toContain("0_0");
    expect(reads).not.toContain("5_5");
    const geometry = mesh!.geometry as InstancedBufferGeometry;
    const slots = geometry.getAttribute("terrainNodeA");
    let slotNodes = 0;
    for (let i = 0; i < geometry.instanceCount; i += 1) if (slots.getW(i) >= 0) slotNodes += 1;
    expect(slotNodes).toBeGreaterThan(0);
    // The `?debug` map reads the stream from the mesh: its last source is the camera.
    const [probe] = terrainStreamingProbes(root);
    expect(probe!.stream.document.tiles.size).toBeGreaterThan(0);
    expect(probe!.sources()).toEqual([{ position: [camera.position.x, camera.position.z] }]);
    instance.actorsRemoved?.([actor]);
    expect(readers[0]!.disposed).toBe(true);
    expect(root.children).toEqual([]);
    expect(released).toEqual([`terrain:${DATA}`]);
  });

  test("removing the actor disposes the view and gives the terrain's use back", async () => {
    const { instance, actor, root, released, holds } = harness({ tilesX: 2, tilesZ: 2, streams: false });
    await settle();
    instance.actorsRemoved?.([actor]);
    expect(root.children).toEqual([]);
    expect(released).toEqual([`terrain:${DATA}`]);
    expect(holds.open).toBe(0);
  });
});

// Ray equivalence of the terrain's pick surface (plan phase 5a step 4).
// Rewritten from Forge WebGL @ forge-webgl-final (04b5fb23), R checks:
// - terrainRenderer.test "raycasts hit the authored surface, and nothing past its edge";
// - terrainWorldRenderer.test "raycasts hit the same surface as a reference mesh and miss the hole";
// - terrainRender.test "raycasts hit the same points as the legacy chunk mesh under a rotated actor"
//   (a World Terrain is placed by its definition's origin, never rotated: the
//   check runs at an origin off zero) and "padded margins and raycaster far do
//   not produce false picks".
// Forge raycast the drawn mesh; here a terrain is picked from its height field
// (terrainPickSurface), compared against three's raycast of a plain mesh built
// from the same samples.
const pickLayers = [{ color: "#808080", texture: null, scale: [0.1, 0.1] as const, roughness: 1, flipY: false, normalTexture: null, roughnessTexture: null, detail: null }];

type Height = (gx: number, gz: number) => number;

/** Forge's hilly fixture: one function over global vertex coordinates, so seam vertices agree. */
const hills: Height = (gx, gz) => Math.fround(5 * Math.sin(gx * 0.09) * Math.cos(gz * 0.05) + 0.02 * gx - 0.01 * gz);

function terrainOf(tilesX: number, tilesZ: number, q: number, spacing: number, height: Height, hole: string | null = null) {
  const def: WorldTerrainDef = {
    schema: 1, type: "worldTerrain", name: "Hills", tileQuads: q, spacing, tilesX, tilesZ,
    origin: [-10, 2, 5], heightMin: -100, heightMax: 100, collision: true,
    layers: [{ id: "l0", name: "Layer 0", color: "#ffffff" }], tiles: [],
  };
  const tiles = new Map<string, TerrainTileData>();
  const size = q + 1;
  for (let tz = 0; tz < tilesZ; tz += 1) {
    for (let tx = 0; tx < tilesX; tx += 1) {
      const key = tileKey(tx, tz);
      if (key === hole) continue;
      const heights = new Float32Array(size * size);
      for (let z = 0; z < size; z += 1) for (let x = 0; x < size; x += 1) heights[z * size + x] = height(tx * q + x, tz * q + z);
      tiles.set(key, { x: tx, z: tz, size, heights, layerCount: 1, weights: new Uint8Array(size * size * 4) });
      def.tiles.push({ key, minHeight: Math.min(...heights), maxHeight: Math.max(...heights) });
    }
  }
  return { def, tiles };
}

/** The same samples as one plain mesh in world space (Forge's reference), quads of the hole left out. */
function referenceMesh(def: WorldTerrainDef, height: Height, hole: string | null): Mesh {
  const width = def.tilesX * def.tileQuads;
  const depth = def.tilesZ * def.tileQuads;
  const [ox, oy, oz] = def.origin;
  const positions: number[] = [];
  for (let gz = 0; gz <= depth; gz += 1) {
    for (let gx = 0; gx <= width; gx += 1) positions.push(ox + gx * def.spacing, oy + height(gx, gz), oz + gz * def.spacing);
  }
  const indices: number[] = [];
  for (let gz = 0; gz < depth; gz += 1) {
    for (let gx = 0; gx < width; gx += 1) {
      if (tileKey(Math.floor(gx / def.tileQuads), Math.floor(gz / def.tileQuads)) === hole) continue;
      const a = gz * (width + 1) + gx;
      indices.push(a, a + width + 1, a + 1, a + 1, a + width + 1, a + width + 2);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  geometry.setIndex(indices);
  const mesh = new Mesh(geometry, new MeshBasicMaterial());
  mesh.updateMatrixWorld(true);
  return mesh;
}

function pickSurface(def: WorldTerrainDef, all: Map<string, TerrainTileData>, live: Map<string, TerrainTileData> = all) {
  const global = buildTerrainGlobalAttributes(worldTerrainRenderSource(def, all));
  const view = new TerrainView({ def, global, tiles: live, layers: pickLayers });
  return { view, surface: terrainPickSurface({ def } as TerrainData, view) };
}

function random(seed: number): () => number {
  let state = seed;
  return () => ((state = (state * 1664525 + 1013904223) >>> 0) / 0x100000000);
}

describe("terrain pick surface: ray equivalence", () => {
  test("rays hit the authored surface as a reference mesh does, and nothing past its edge", () => {
    for (const [tilesX, tilesZ, q] of [[1, 1, 128], [3, 2, 64]] as const) {
      const { def, tiles } = terrainOf(tilesX, tilesZ, q, 1.25, hills);
      const reference = referenceMesh(def, hills, null);
      const { view, surface } = pickSurface(def, tiles);
      const reach = Math.max(tilesX, tilesZ) * q * 1.25 * 1.5;
      const center = new Vector3(def.origin[0] + (tilesX * q * 1.25) / 2, 0, def.origin[2] + (tilesZ * q * 1.25) / 2);
      const raycaster = new Raycaster();
      const next = random(tilesX + q);
      let hits = 0;
      let misses = 0;
      for (let ray = 0; ray < 200; ray += 1) {
        // Aim past the edges too: those rays must miss both surfaces.
        const target = new Vector3((next() - 0.5) * reach, 0, (next() - 0.5) * reach).add(center);
        const origin = target.clone().add(new Vector3((next() - 0.5) * 80, 40 + next() * 60, (next() - 0.5) * 80));
        const direction = target.clone().sub(origin).normalize();
        raycaster.set(origin, direction);
        const expected = raycaster.intersectObject(reference)[0];
        const actual = surface.raycast(origin, direction, Infinity);
        expect(actual !== null, `ray ${ray} hit mismatch (${tilesX}x${tilesZ})`).toBe(Boolean(expected));
        if (!expected || actual === null) {
          misses += 1;
          continue;
        }
        hits += 1;
        expect(Math.abs(actual - expected.distance), `ray ${ray}`).toBeLessThan(1e-3);
      }
      expect(hits).toBeGreaterThan(50);
      expect(misses).toBeGreaterThan(20);
      view.dispose();
    }
  });

  test("a hole tile is missed; the other tiles hit as the reference mesh", () => {
    const hole = tileKey(2, 1);
    const { def, tiles } = terrainOf(3, 2, 64, 1.5, hills, hole);
    const reference = referenceMesh(def, hills, hole);
    const { view, surface } = pickSurface(def, tiles);
    const raycaster = new Raycaster();
    const next = random(4);
    let hits = 0;
    let misses = 0;
    for (let ray = 0; ray < 250; ray += 1) {
      const target = new Vector3(def.origin[0] + next() * 3 * 64 * 1.5, 0, def.origin[2] + next() * 2 * 64 * 1.5);
      const origin = target.clone().add(new Vector3((next() - 0.5) * 60, 30 + next() * 50, (next() - 0.5) * 60));
      const direction = target.clone().sub(origin).normalize();
      raycaster.set(origin, direction);
      const expected = raycaster.intersectObject(reference)[0];
      const actual = surface.raycast(origin, direction, Infinity);
      expect(actual !== null, `ray ${ray} hit mismatch`).toBe(Boolean(expected));
      if (!expected || actual === null) {
        misses += 1;
        continue;
      }
      hits += 1;
      expect(Math.abs(actual - expected.distance), `ray ${ray}`).toBeLessThan(1e-3);
    }
    expect(hits).toBeGreaterThan(100);
    expect(misses).toBeGreaterThan(10);
    view.dispose();
  });

  test("past the edge and beyond `far` nothing is picked", () => {
    const { def, tiles } = terrainOf(1, 1, 64, 0.5, () => 1);
    const { view, surface } = pickSurface(def, tiles);
    const down = new Vector3(0, -1, 0);
    // 2 m past the +X edge (64 quads x 0.5 m from x = -10), then over the terrain.
    expect(surface.raycast(new Vector3(def.origin[0] + 34, 50, def.origin[2] + 3), down, Infinity)).toBeNull();
    expect(surface.raycast(new Vector3(def.origin[0] + 3, 50, def.origin[2] + 3), down, Infinity)).toBeCloseTo(50 - 3, 5);
    expect(surface.raycast(new Vector3(def.origin[0] + 3, 50, def.origin[2] + 3), down, 10)).toBeNull();
    view.dispose();
  });

  test("a declared tile not loaded is picked from the far map", () => {
    // A plane: the far map's coarser triangles lie on the same surface.
    const plane: Height = (gx, gz) => 0.05 * gx - 0.03 * gz + 4;
    const { def, tiles } = terrainOf(2, 2, 64, 1, plane);
    const live = new Map(tiles);
    live.delete(tileKey(1, 1));
    const { view, surface } = pickSurface(def, tiles, live);
    const reference = referenceMesh(def, plane, null);
    const raycaster = new Raycaster();
    const origin = new Vector3(def.origin[0] + 100, 60, def.origin[2] + 100);
    const direction = new Vector3(0.1, -1, 0.2).normalize();
    raycaster.set(origin, direction);
    const expected = raycaster.intersectObject(reference)[0]!;
    expect(surface.raycast(origin, direction, Infinity)).toBeCloseTo(expected.distance, 3);
    view.dispose();
  });
});
