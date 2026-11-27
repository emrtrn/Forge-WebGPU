import { describe, expect, test } from "vitest";
import { type ActorDoc, isId, TerrainAssetType, WorldRecipeAssetType } from "../../../core/index.ts";
import type { LayoutPlacement } from "../../legacy/layout.ts";
import { createFlatWorldTerrain } from "../../terrain/worldTerrainCreate.ts";
import { createWorldRecipe } from "../recipe.ts";
import type { WorldBuild } from "./worldBuild.ts";
import { eulerXyzQuaternion, placementTransform, stableHex, worldFolder, worldLevel } from "./worldLevel.ts";

const LEVEL = "lvl_0123456789abcdef0123456789abcdef";

function buildWith(groups: WorldBuild["groups"], playerStart: WorldBuild["playerStart"] = null): WorldBuild {
  const { def } = createFlatWorldTerrain({ name: "Valley", tilesX: 2, tilesZ: 1, tileQuads: 64, spacing: 2, baseHeight: 0, heightMin: -10, heightMax: 10 });
  const recipe = createWorldRecipe("valley", 3);
  recipe.generatedBy.placements = { "house-1": { stage: "buildings" }, "lamp-1": { stage: "furniture" } };
  recipe.generatedBy.splines = { "road-1": { stage: "roads", edge: "e1" } };
  return { def, recipe, groups, playerStart, foliage: [] } as unknown as WorldBuild;
}

const house: LayoutPlacement = {
  id: "house-1", role: "building.residential.detached", name: "House", position: [300, 4, -20],
  rotation: [0, 90, 0], scale: [20, 12, 16], color: "#F2A65A",
};

describe("worldLevel", () => {
  test("a placeholder becomes a shape actor with its colour, role and the stage that placed it", () => {
    const level = worldLevel(buildWith([{ assetId: "shape:cube", placements: [house] }]), { levelId: LEVEL, terrainId: "valley" });
    const actor = level.level.actors.find((entry) => entry.name === "House")!;
    expect(actor).toMatchObject({ class: null, parent: null, spatiallyLoaded: true });
    expect(actor.transform).toEqual({ p: [300, 4, -20], r: [0, 0.7071068, 0, 0.7071068], s: [20, 12, 16] });
    expect(actor.class === null && actor.components).toEqual({
      shape: {
        type: "forge.shape@2", parent: null, local: { p: [0, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] }, primitive: "cube", color: "#f2a65a", castShadow: true, collision: true,
      },
      role: { type: "forge.worldRole@1", role: "building.residential.detached", stage: "buildings" },
    });
    expect(level.counts).toEqual({ placements: 1, placeholders: 1, meshes: 0 });
  });

  test("Forge's greybox look is written: sky, Sky Light with its background and ambient, the sun; all persistent", () => {
    const level = worldLevel(buildWith([]), { levelId: LEVEL, terrainId: "valley" });
    const look = level.level.actors.slice(1);
    expect(look.map((actor) => actor.name)).toEqual(["Sky Atmosphere", "Sky Light", "Sun"]);
    expect(look.every((actor) => actor.spatiallyLoaded === false)).toBe(true);
    const [sky, skyLight, sun] = look.map((actor) => (actor.class === null ? Object.values(actor.components)[0] : null));
    expect(sky).toMatchObject({ type: "forge.skyAtmosphere@1", rayleigh: 1.4, turbidity: 3, mie: 0.003, exposure: 1 });
    expect(skyLight).toEqual({ type: "forge.skyLight@1", intensity: 0.5, ambientColor: "#ece6da", ambientIntensity: 1.1, backgroundColor: "#a9c9df" });
    expect(sun).toMatchObject({ type: "forge.directionalLight@1", color: "#fff4e6", intensity: 4.2, castShadow: true, atmosphereSun: true });
    expect(look[2]!.transform).toMatchObject({ p: [3, 9, 4], r: eulerXyzQuaternion(-48, 35, 0) });
  });

  test("built into a level, its settings and scene settings actors stay and no look is added; a look only a dark level gets", () => {
    const settings = { cellSize: 64, wind: { directionDeg: 10, strength: 1, gust: 0 }, viewDistance: 900, loadRange: 200, landmarkDistance: 5 };
    const fog = {
      id: `act_${"f".repeat(32)}`, name: "My Fog", class: null, parent: null, spatiallyLoaded: false,
      transform: { p: [0, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] }, components: { fog: { type: "forge.heightFog@1" } },
    } as ActorDoc;
    const names = (look: boolean) => {
      const { level } = worldLevel(buildWith([]), { levelId: LEVEL, terrainId: "valley", keep: { settings, actors: [fog], look } });
      expect(level.settings).toEqual(settings);
      return level.actors.map((actor) => actor.name);
    };
    expect(names(true)).toEqual(["Valley", "My Fog"]);
    expect(names(false)).toEqual(["Valley", "My Fog", "Sky Atmosphere", "Sky Light", "Sun"]);
  });

  test("placements are in an Outliner folder by role; the terrain and the look are at the root", () => {
    const level = worldLevel(buildWith([{ assetId: "shape:cube", placements: [house] }]), { levelId: LEVEL, terrainId: "valley" });
    expect(level.level.actors.filter((actor) => actor.folder !== undefined).map((actor) => [actor.name, actor.folder])).toEqual([["House", "World/Buildings"]]);
    expect([
      worldFolder("open.square", "buildings"), worldFolder("structure.retainingWall", "buildings"), worldFolder("vegetation.tree", ""), worldFolder("prop.rock", ""),
      worldFolder("prop.fence.picket", "fences"), worldFolder("prop.light.street", "furniture"), worldFolder("", ""),
    ]).toEqual(["World/Buildings", "World/Structures", "World/Vegetation", "World/Rocks", "World/Fences", "World/Furniture", "World/Other"]);
  });

  test("a plant group becomes single plants of the family, each with its own stable seed and role", () => {
    const family = `ast_${"e".repeat(32)}`;
    const groups = [{ assetId: `plant:${family}#2`, placements: [{ id: "s1-tree", role: "vegetation.tree", position: [1, 2, 3] as [number, number, number], scale: 1.1 }, { id: "s2-tree", role: "vegetation.tree", position: [4, 2, 3] as [number, number, number] }] }];
    const level = worldLevel(buildWith(groups), { levelId: LEVEL, terrainId: "valley" });
    const [first, second] = level.level.actors.slice(1);
    expect(first!.class === null && first!.components).toMatchObject({
      plant: { type: "forge.plant@1", family, prototype: 2, castShadow: true, seed: expect.any(Number) },
      role: { role: "vegetation.tree", stage: "" },
    });
    expect((first!.class === null && first!.components.plant!.seed)).not.toBe(second!.class === null && second!.components.plant!.seed);
    expect(level.level.actors).toEqual(worldLevel(buildWith(groups), { levelId: LEVEL, terrainId: "valley" }).level.actors);
    expect(level.counts).toEqual({ placements: 2, placeholders: 0, meshes: 0 });
  });

  test("a model group becomes static mesh actors; a hand-placed role has no stage; no role, no role component", () => {
    const mesh = "ast_ffffffffffffffffffffffffffffffff";
    const level = worldLevel(buildWith([{
      assetId: mesh,
      placements: [
        { id: "rock-1", role: "prop.rock", position: [1, 2, 3], rotationYDeg: 180, scale: 2, collision: false },
        { position: [5, 0, 5] },
      ],
    }]), { levelId: LEVEL, terrainId: "valley" });
    const [rock, bare] = level.level.actors.slice(1);
    expect(rock!.class === null && rock!.components).toMatchObject({
      mesh: { type: "forge.staticMesh@2", mesh, castShadow: true, collision: false },
      role: { role: "prop.rock", stage: "" },
    });
    expect(rock!.transform).toEqual({ p: [1, 2, 3], r: [0, 1, 0, 0], s: [2, 2, 2] });
    expect(bare!.class === null && Object.keys(bare!.components)).toEqual(["mesh"]);
    expect(bare!.name).toBe(`${mesh}#1`);
    expect(level.counts).toEqual({ placements: 2, placeholders: 0, meshes: 2 });
  });

  test("the terrain and the Player Start are persistent actors", () => {
    const build = buildWith([], [10, 22, -4]);
    const level = worldLevel(build, { levelId: LEVEL, terrainId: "valley" });
    const [terrain, start] = level.level.actors;
    expect(terrain).toMatchObject({ name: "Valley", spatiallyLoaded: false });
    expect(terrain!.class === null && terrain!.components.terrain).toMatchObject({ type: "forge.terrain@2", data: level.terrain.id, material: null });
    expect(level.terrain.schema).toBe(TerrainAssetType.schema);
    expect(level.terrain.data).toEqual(build.def);
    expect(level.terrainFile).toBe("terrain/valley.terrain.json");
    expect(start).toMatchObject({ name: "Player Start", spatiallyLoaded: false,
      components: { playerStart: { type: "forge.playerStart@1" } }, transform: { p: [10, 22, -4] } });
    expect(level.level.settings).toEqual({ cellSize: 128, wind: { directionDeg: 45, strength: .3, gust: .3 }, viewDistance: 0, loadRange: 384, landmarkDistance: 0 });
  });

  test("the cover's plant rules are landscape foliage on the terrain actor; none, no component", () => {
    const foliageType = "ast_eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" as const;
    const build = { ...buildWith([]), foliage: [{ id: "wood", layerId: "forest", foliageTypeId: foliageType, density: 0.002, minWeight: 0.5, seed: 7 }, {
      id: "oak", layerId: "forest", foliageTypeId: foliageType, density: 0.02, minWeight: 0.3, seed: 8, edgeScale: 0.7, groundRadius: 0.5,
      edge: { fadeIn: 0.3, maxWeight: 1, fadeOut: 0 }, stand: { from: 0, to: 0.25, patch: 60, reach: 400, far: 3000, tint: 0.5, detail: 0.65 },
    }] };
    const [terrain] = worldLevel(build, { levelId: LEVEL, terrainId: "valley" }).level.actors;
    expect(terrain!.class === null && terrain!.components.foliage).toMatchObject({
      type: "forge.landscapeFoliage@1", rules: [{ id: "wood", layer: "forest", foliageType, density: 0.002, minWeight: 0.5, seed: 7, stand: { enabled: false } }, {
        id: "oak", edgeScale: 0.7, groundRadius: 0.5, edge: { fadeIn: 0.3 },
        stand: { enabled: true, from: 0, to: 0.25, patch: 60, reach: 400, far: 3000, tint: 0.5, detail: 0.65 },
      }],
    });
    const [bare] = worldLevel(buildWith([]), { levelId: LEVEL, terrainId: "valley" }).level.actors;
    expect(bare!.class === null && bare!.components.foliage).toBeUndefined();
  });

  test("the written recipe carries no ledger: provenance is on the objects", () => {
    const build = buildWith([]);
    const level = worldLevel(build, { levelId: LEVEL, terrainId: "valley" });
    expect(level.recipe.schema).toBe(WorldRecipeAssetType.schema);
    expect(level.recipe.data.generatedBy).toEqual({ placements: {}, splines: {} });
    expect(build.recipe.generatedBy.splines["road-1"]).toEqual({ stage: "roads", edge: "e1" });
  });

  test("ids come from the level id: the same build gives the same GUIDs, another level others", () => {
    const groups = [{ assetId: "shape:cube", placements: [house, { ...house, id: "lamp-1", name: "Lamp" }] }];
    const a = worldLevel(buildWith(groups), { levelId: LEVEL, terrainId: "valley" });
    const b = worldLevel(buildWith(groups), { levelId: LEVEL, terrainId: "valley" });
    const other = worldLevel(buildWith(groups), { levelId: "lvl_ffffffffffffffffffffffffffffffff", terrainId: "valley" });
    const ids = (level: typeof a) => [...level.level.actors.map((actor) => actor.id), level.terrain.id, level.recipe.id];
    expect(ids(a)).toEqual(ids(b));
    expect(new Set(ids(a)).size).toBe(8);
    expect(ids(a).every((id) => isId(id, "actor") || isId(id, "asset"))).toBe(true);
    expect(ids(other).some((id) => ids(a).includes(id))).toBe(false);
    expect(stableHex("x")).toMatch(/^[0-9a-f]{32}$/);
    expect(stableHex("x")).not.toBe(stableHex("y"));
  });

  test("Euler XYZ degrees give three.js quaternions; an unknown shape group is refused", () => {
    expect(eulerXyzQuaternion(0, 0, 0)).toEqual([0, 0, 0, 1]);
    expect(eulerXyzQuaternion(90, 0, 0)).toEqual([0.7071068, 0, 0, 0.7071068]);
    expect(eulerXyzQuaternion(0, 0, -90)).toEqual([0, 0, -0.7071068, 0.7071068]);
    expect(eulerXyzQuaternion(30, 45, 60)).toEqual([0.3919038, 0.2005621, 0.5319757, 0.7233174]);
    expect(placementTransform({ position: [0, 0, 0], rotation: [0, 10, 0], rotationYDeg: 90 }).r).toEqual(eulerXyzQuaternion(0, 10, 0));
    expect(() => worldLevel(buildWith([{ assetId: "shape:torus", placements: [house] }]), { levelId: LEVEL, terrainId: "valley" })).toThrow(/not a shape primitive/);
  });
});
