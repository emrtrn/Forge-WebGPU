import { describe, expect, test } from "vitest";
import { DirectionalLight, Group, PerspectiveCamera, Scene } from "three/webgpu";
import { buildTerrainGlobalAttributes, worldTerrainRenderSource } from "../../engine/terrain/terrainRenderSource.ts";
import type { TerrainTileData } from "../../engine/terrain/terrainTypes.ts";
import { createFlatWorldTerrain } from "../../engine/terrain/worldTerrainCreate.ts";
import { fillTerrainHoles, TerrainView, terrainShadowCasters } from "./terrainView.ts";

function terrain(tilesX: number, tilesZ: number) {
  const { def, tiles } = createFlatWorldTerrain({ name: "Plain", tilesX, tilesZ, tileQuads: 64, spacing: 2, baseHeight: 0, heightMin: -10, heightMax: 10 });
  const global = buildTerrainGlobalAttributes(worldTerrainRenderSource(def, tiles));
  return { def, tiles: tiles as Map<string, TerrainTileData>, global };
}

const layers = [{ color: "#808080", texture: null, scale: [0.1, 0.1] as const, roughness: 1, flipY: false }];

/** A camera at the middle of an 8 x 8 grid (1024 m), low, looking along +X. */
function middleCamera(def: { origin: readonly number[] }): PerspectiveCamera {
  const camera = new PerspectiveCamera(50, 16 / 9, 0.1, 5000);
  camera.position.set(def.origin[0]! + 512, 15, def.origin[2]! + 512);
  camera.lookAt(def.origin[0]! + 1024, 15, def.origin[2]! + 512);
  camera.updateMatrixWorld();
  return camera;
}

describe("terrain view", () => {
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
