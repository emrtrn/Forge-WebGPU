import { describe, expect, test } from "vitest";
import { Group, Mesh, PerspectiveCamera, Scene, type InstancedBufferGeometry } from "three/webgpu";
import type { ComponentEntry, WorldActor } from "../../core/index.ts";
import { buildTerrainGlobalAttributes, worldTerrainRenderSource } from "../../engine/terrain/terrainRenderSource.ts";
import type { TerrainTileData } from "../../engine/terrain/terrainTypes.ts";
import { createFlatWorldTerrain } from "../../engine/terrain/worldTerrainCreate.ts";
import type { TerrainData, TerrainTileReader } from "../../render/resources/terrains.ts";
import type { WorldResources } from "../../render/resources/worldResources.ts";
import type { RenderBindingContext } from "../../render/sync/renderBinding.ts";
import { resolveQualitySettings } from "../../engine/perf/qualityProfiles.ts";
import binding from "./render.ts";

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
    world: { services: null, actor: () => actor, componentsOf: () => [] as ComponentEntry[] },
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
    const { reads, readers, holds, camera, def, frame } = harness({ tilesX: 2, tilesZ: 2, streams: false });
    expect(holds.open).toBe(1);
    await settle();
    camera.position.set(def.origin[0] + 64, 20, def.origin[2] + 64);
    frame();
    expect([reads.length, readers.length, holds.open]).toEqual([0, 0, 0]);
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
