import { describe, expect, test } from "vitest";
import { isId, TerrainAssetType } from "../../core/index.ts";
import { normalizeWorldTerrain } from "../terrain/terrainDefinition.ts";
import { worldTerrainActorPosition } from "../terrain/worldTerrainActor.ts";
import { createFlatWorldTerrain } from "../terrain/worldTerrainCreate.ts";
import { forgeAssetId, forgeLevelId } from "./ids.ts";
import { importForgeLevel, type ForgeLevelInput } from "./forgeLevel.ts";
import { eulerXyzQuaternion, placementGroupActors } from "./placements.ts";

const PATH = "layouts/Fixture.level.json";
const TERRAIN_REF = "layouts/Fixture.landscapes/valley.terrain.json";
const MODELS = new Set(["rock", "cabin"]);
const meshAsset = (id: string): string | null => (MODELS.has(id) ? forgeAssetId(id) : null);
const MATERIALS = new Set(["mat-moss", "lt-meadow"]);
const materialAsset = (id: string): string | null => (MATERIALS.has(id) ? forgeAssetId(id) : null);
/** The importer's resolvers: models and materials it has, the rock with two material slots. */
const resolvers = { meshAsset, materialAsset, materialSlotCount: (id: string) => (id === "rock" ? 2 : null) };

function terrainJson(): Record<string, unknown> {
  const { def } = createFlatWorldTerrain({ name: "Valley", tilesX: 2, tilesZ: 1, tileQuads: 64, spacing: 2, baseHeight: 0, heightMin: -10, heightMax: 10 });
  return JSON.parse(JSON.stringify(def)) as Record<string, unknown>;
}

function fixture(patch: Record<string, unknown> = {}, cells: ForgeLevelInput["cells"] = []): ForgeLevelInput {
  return {
    path: PATH,
    layout: {
      schema: 1,
      name: "Fixture",
      loadGroups: [],
      characters: [],
      worldSettings: { partition: { enabled: true, grids: { main: { cellSize: 64, loadRange: 256 } } }, backgroundColor: "#a9c9df" },
      lights: [{ type: "directional" }, { type: "ambient" }],
      landscapes: [{ id: "valley", name: "WB Valley", position: [9, 9, 9], dataRef: TERRAIN_REF, material: "lt-meadow" }],
      heightFog: { name: "Fog", hidden: false, mode: "exp", color: "#80bdff", density: 0.000989 },
      instances: [
        { assetId: "marker:playerStart", placements: [{ position: [1, 2, 3], rotationYDeg: 90, name: "Player Start" }] },
        { assetId: "shape:cube", placements: [{ id: "house-1", role: "building.house", position: [10, 0, 10], rotation: [0, 90, 0], scale: [4, 3, 5], color: "#F2A65A" }] },
        { assetId: "rock", placements: [{ position: [5, 0, 5], scale: 2, materialSlot: "mat-moss", fracture: { enabled: false } }, { position: [6, 0, 6], collision: false }] },
        { assetId: "kenney-tree", placements: [{ position: [0, 0, 0] }] },
        { assetId: "cabin", placements: [] },
      ],
      ...patch,
    },
    cells,
    terrains: new Map([[TERRAIN_REF, terrainJson()]]),
  };
}

describe("importForgeLevel", () => {
  test("placements become shape / static mesh / Player Start actors after the terrain, the fog and the lights", () => {
    const { level, report } = importForgeLevel(fixture(), resolvers);
    expect(level.id).toBe(forgeLevelId(PATH));
    expect(level.settings).toEqual({ cellSize: 64 });
    expect(level.actors.map((actor) => actor.name)).toEqual([
      "WB Valley", "Fog", "directional#0", "Player Start", "building.house", "rock#0", "rock#1",
    ]);
    const [, , , start, house, rock, bare] = level.actors;
    expect(start).toMatchObject({ components: {}, transform: { p: [1, 2, 3], r: eulerXyzQuaternion(0, 90, 0) } });
    // The level does not say `staticObjectsCastShadow`: Forge's default (off) goes on every placement.
    expect(house!.class === null && house!.components).toEqual({
      shape: {
        type: "forge.shape@2", parent: null, local: { p: [0, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] }, primitive: "cube", color: "#f2a65a", castShadow: false, collision: true,
      },
      role: { type: "forge.worldRole@1", role: "building.house", stage: "" },
    });
    // One Forge material override goes on each of the model's slots.
    expect(rock!.class === null && rock!.components).toEqual({
      mesh: {
        type: "forge.staticMesh@2", parent: null, local: { p: [0, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] }, mesh: forgeAssetId("rock"),
        materials: [forgeAssetId("mat-moss"), forgeAssetId("mat-moss")], castShadow: false, collision: true,
      },
    });
    expect(rock!.transform.s).toEqual([2, 2, 2]);
    expect(bare!.class === null && bare!.components.mesh).toMatchObject({ collision: false, castShadow: false });
    expect(report.converted).toEqual({
      placements: 3, placeholders: 1, meshes: 2, playerStarts: 1, actors: 7, terrains: 1, heightFog: 1, lights: 1, sourceCells: 0, staticCastShadow: false,
    });
    expect(report.missingAssets).toEqual([{ assetId: "kenney-tree", placements: 1 }]);
  });

  test("the terrain is a persistent actor of a copied definition, placed by the definition", () => {
    const input = fixture();
    const { level, terrains } = importForgeLevel(input, resolvers);
    const [terrain] = terrains;
    expect(terrain).toMatchObject({ file: "terrain/valley.terrain.json", source: TERRAIN_REF, tileKeys: ["0_0", "1_0"] });
    expect(terrain!.document.schema).toBe(TerrainAssetType.schema);
    expect(terrain!.document.data).toEqual(input.terrains.get(TERRAIN_REF));
    const actor = level.actors[0]!;
    expect(actor).toMatchObject({ spatiallyLoaded: false, transform: { p: worldTerrainActorPosition(normalizeWorldTerrain(input.terrains.get(TERRAIN_REF))) } });
    expect(actor.transform.p).not.toEqual([9, 9, 9]);
    expect(actor.class === null && actor.components.terrain).toMatchObject({
      type: "forge.terrain@2", data: terrain!.document.id, material: forgeAssetId("lt-meadow"),
    });
  });

  test("the static shadow switch is resolved per placement; its own castShadow and colour win", () => {
    const { level, report } = importForgeLevel(fixture({
      worldSettings: { staticObjectsCastShadow: true, staticObjectsReceiveShadow: false },
      instances: [
        { assetId: "shape:cube", placements: [{ position: [0, 0, 0] }, { position: [1, 0, 0], castShadow: false }] },
        { assetId: "rock", placements: [{ position: [2, 0, 0], color: "#ABCDEF" }] },
      ],
    }), resolvers);
    const parts = level.actors.slice(3).map((actor) => (actor.class === null ? Object.values(actor.components)[0] : null));
    expect(parts.map((part) => part?.castShadow)).toEqual([true, false, true]);
    expect(parts[2]).toMatchObject({ color: "#abcdef" });
    expect(parts[2]?.materials).toBeUndefined();
    expect(report.converted.staticCastShadow).toBe(true);
    expect(report.notConverted).toContainEqual({
      field: "worldSettings.staticObjectsReceiveShadow", count: 1, phase: "- (gölge almak hep açık, kullanıcı kararı 2026-11-13)",
    });
  });

  test("a material override or landscape material the target lacks is reported, the placement keeps the model's materials", () => {
    const { level, report } = importForgeLevel(fixture({
      landscapes: [{ id: "valley", dataRef: TERRAIN_REF, material: "lt-gone" }],
      instances: [
        { assetId: "rock", placements: [{ position: [0, 0, 0], materialSlot: "mat-gone" }] },
        { assetId: "cabin", placements: [{ position: [0, 0, 0], materialSlot: "mat-moss" }] },
        { assetId: "shape:cube", placements: [{ position: [0, 0, 0], materialSlot: "mat-moss" }] },
      ],
    }), resolvers);
    const meshes = level.actors.filter((actor) => actor.class === null && actor.components.mesh);
    expect(meshes.map((actor) => actor.class === null && actor.components.mesh!.materials)).toEqual([undefined, undefined]);
    expect(level.actors[0]!.class === null && level.actors[0]!.components.terrain).toMatchObject({ material: null });
    expect(report.notConverted).toEqual(expect.arrayContaining([
      { field: "instances[].materialSlot=mat-gone", count: 1, phase: "- (materyal ya da model slotları hedefte yok)" },
      { field: "instances[].materialSlot=mat-moss", count: 2, phase: "- (materyal ya da model slotları hedefte yok)" },
      { field: "landscapes[].material=lt-gone", count: 1, phase: "- (materyal hedefte yok)" },
    ]));
  });

  test("height fog keeps the fields Forge wrote; the component fills the rest with the same defaults", () => {
    const { level } = importForgeLevel(fixture(), { meshAsset });
    const fog = level.actors[1]!;
    expect(fog).toMatchObject({ name: "Fog", spatiallyLoaded: false });
    expect(fog.class === null && fog.components).toEqual({
      fog: { type: "forge.heightFog@1", mode: "exp", color: "#80bdff", density: 0.000989 },
    });
  });

  test("every field not converted is reported with its phase; a field nobody knows with ?", () => {
    const { report } = importForgeLevel(fixture({ mystery: { a: 1 }, puddleWaters: [] }), resolvers);
    expect(report.notConverted).toEqual([
      { field: "instances[].fracture", count: 1, phase: "8" },
      { field: "lights[type=ambient]", count: 1, phase: "?" },
      { field: "mystery", count: 1, phase: "?" },
      { field: "worldSettings.backgroundColor", count: 1, phase: "3" },
    ]);
    const bare = importForgeLevel(fixture({ worldSettings: { partition: { enabled: false } }, lights: [] }), resolvers);
    expect(bare.report.notConverted.map((entry) => entry.field).filter((field) => field.startsWith("worldSettings"))).toEqual([]);
    expect(bare.level.settings).toEqual({ cellSize: 128 });
  });

  test("cell files add their placements; id-less placements of the same group stay apart per cell", () => {
    const cell = (key: string) => ({
      key,
      doc: { schema: 1, type: "worldCell", grid: "main", key, instances: [{ assetId: "rock", placements: [{ position: [0, 0, 0] }] }], actors: [{ classRef: "x" }] },
    });
    const { level, report } = importForgeLevel(fixture({ instances: [] }, [cell("0_0"), cell("1_0")]), { meshAsset });
    const rocks = level.actors.filter((actor) => actor.name === "rock#0");
    expect(rocks).toHaveLength(2);
    expect(new Set(rocks.map((actor) => actor.id)).size).toBe(2);
    expect(report.converted).toMatchObject({ meshes: 2, sourceCells: 2 });
    expect(report.notConverted).toContainEqual({ field: "actors", count: 2, phase: "6" });
  });

  test("ids are derived from the source: a second run gives the same GUIDs; duplicate ids are told apart", () => {
    const a = importForgeLevel(fixture(), { meshAsset });
    const b = importForgeLevel(fixture(), { meshAsset });
    expect(a.level.actors.map((actor) => actor.id)).toEqual(b.level.actors.map((actor) => actor.id));
    expect(a.terrains[0]!.document.id).toBe(b.terrains[0]!.document.id);
    expect(a.level.actors.every((actor) => isId(actor.id, "actor"))).toBe(true);
    expect(a.report.duplicateIds).toBe(0);
    const twice = importForgeLevel(fixture({
      instances: [{ assetId: "shape:cube", placements: [{ id: "same", position: [0, 0, 0] }, { id: "same", position: [1, 0, 0] }] }],
    }), { meshAsset });
    expect(new Set(twice.level.actors.map((actor) => actor.id)).size).toBe(twice.level.actors.length);
    expect(twice.report.duplicateIds).toBe(1);
  });

  test("a marker without a converter is reported, not placed", () => {
    const { level, report } = importForgeLevel(fixture({
      instances: [{ assetId: "marker:spawnPoint", placements: [{ position: [0, 0, 0] }] }],
    }), { meshAsset });
    expect(level.actors.map((actor) => actor.name)).toEqual(["WB Valley", "Fog", "directional#0"]);
    expect(report.notConverted).toContainEqual({ field: "instances[marker:spawnPoint]", count: 1, phase: "6" });
  });

  test("a level file that is not a Forge level, or a terrain that was not read, is refused", () => {
    expect(() => importForgeLevel({ ...fixture(), layout: { schema: 2 } }, { meshAsset })).toThrow(/not a Forge level/);
    expect(() => importForgeLevel({ ...fixture(), terrains: new Map() }, { meshAsset })).toThrow(/was not read/);
  });
});

describe("placementGroupActors", () => {
  test("World Builder's defaults: the group's asset id is the mesh, keys have no prefix", () => {
    const placed = placementGroupActors(
      [{ assetId: "ast_ffffffffffffffffffffffffffffffff", placements: [{ position: [0, 0, 0] }] }],
      { actorId: (key) => `act_${key.length.toString(16).padStart(32, "0")}` },
    );
    expect(placed.actors[0]!.name).toBe("ast_ffffffffffffffffffffffffffffffff#0");
    expect(placed.counts).toEqual({ placements: 1, placeholders: 0, meshes: 1, playerStarts: 0 });
    expect(placed.skipped.size).toBe(0);
  });
});
