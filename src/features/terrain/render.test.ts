import { describe, expect, test } from "vitest";
import { Group, Mesh, PerspectiveCamera, Scene, type InstancedBufferGeometry } from "three/webgpu";
import type { ComponentEntry, WorldActor } from "../../core/index.ts";
import { worldTerrainRenderSource } from "../../engine/terrain/terrainRenderSource.ts";
import { createFlatWorldTerrain } from "../../engine/terrain/worldTerrainCreate.ts";
import type { TerrainData } from "../../render/resources/terrains.ts";
import type { WorldResources } from "../../render/resources/worldResources.ts";
import type { RenderBindingContext } from "../../render/sync/renderBinding.ts";
import binding from "./render.ts";

const DATA = "ast_00000000000000000000000000000001";

function harness() {
  const { def, tiles } = createFlatWorldTerrain({ name: "Valley", tilesX: 2, tilesZ: 2, tileQuads: 64, spacing: 2, baseHeight: 0, heightMin: -10, heightMax: 10 });
  const terrain: TerrainData = {
    def,
    tiles,
    source: worldTerrainRenderSource(def, tiles),
    layers: [{ color: "#6f9a4a", texture: null, scale: [0.1, 0.1], roughness: 1, flipY: false }],
  };
  const actor = {
    id: "act_00000000000000000000000000000001",
    name: "Valley",
    transform: { p: [0, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] },
    components: { terrain: { type: "forge.terrain@2", parent: null, local: { p: [0, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] }, data: DATA, material: null } },
  } as unknown as WorldActor;
  const released: string[] = [];
  const resources = {
    terrain: async () => terrain,
    release: (key: string) => released.push(key),
  } as unknown as WorldResources;
  const root = new Group();
  const ctx = {
    world: { services: null, actor: () => actor, componentsOf: () => [] as ComponentEntry[] },
    scene: new Scene(),
    root,
    resources,
  } as unknown as RenderBindingContext;
  const instance = binding.create(ctx);
  instance.actorsAdded?.([actor]);
  const camera = new PerspectiveCamera(44, 1, 0.1, 2000);
  return { instance, actor, root, released, camera, def, frame: () => instance.sync?.({ dt: 0, camera }) };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("terrain binding", () => {
  test("draws one instanced patch mesh, its nodes selected from the camera, again only once it moved", async () => {
    const { root, camera, def, frame } = harness();
    await settle();
    const [mesh] = root.children as Mesh[];
    expect(mesh!.name).toBe("Valley/terrain");
    expect([mesh!.castShadow, mesh!.receiveShadow, mesh!.frustumCulled]).toEqual([true, true, false]);
    const geometry = mesh!.geometry as InstancedBufferGeometry;
    expect(geometry.instanceCount).toBe(0);
    camera.position.set(def.origin[0] + 64, 20, def.origin[2] + 64);
    camera.updateMatrixWorld();
    frame();
    const near = geometry.instanceCount;
    expect(near).toBeGreaterThan(0);
    const attribute = geometry.getAttribute("terrainNodeA");
    let changes = 0;
    Object.defineProperty(attribute, "needsUpdate", { set: () => (changes += 1), configurable: true });
    frame();
    expect(changes).toBe(0);
    camera.position.x += 1;
    camera.updateMatrixWorld();
    frame();
    expect(changes).toBe(1);
  });

  test("removing the actor disposes the view and gives the terrain's use back", async () => {
    const { instance, actor, root, released } = harness();
    await settle();
    instance.actorsRemoved?.([actor]);
    expect(root.children).toEqual([]);
    expect(released).toEqual([`terrain:${DATA}`]);
  });
});
