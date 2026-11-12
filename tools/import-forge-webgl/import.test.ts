import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { buildAssetIndex } from "../../src/core/index.ts";
import { forgeAssetId, forgeLevelId } from "../../src/engine/forgeImport/ids.ts";
import { createFlatWorldTerrain } from "../../src/engine/terrain/worldTerrainCreate.ts";
import { projectIndexRoots } from "../assets/engineContent.ts";
import { loadEngineRegistry } from "../assets/engineRegistry.ts";
import { scanRoots } from "../assets/scan.ts";
import { createProject } from "../project/create.ts";
import { materialTextureIds } from "./assetPlan.ts";
import { runForgeImport, relabel } from "./importRun.ts";
import { provenanceOf, PROJECT_LICENSE, UNVERIFIED_LICENSE } from "./provenance.ts";
import { formatImportReport } from "./report.ts";

const engineRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const LEVEL = "layouts/Valley.level.json";
let base: string;
let forge: string;
let project: string;

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;
async function put(path: string, content: string | Uint8Array): Promise<void> {
  await mkdir(dirname(join(forge, path)), { recursive: true });
  await writeFile(join(forge, path), content);
}

beforeAll(async () => {
  base = await mkdtemp(join(tmpdir(), "forge-import-"));
  forge = join(base, "public");
  project = join(base, "game");
  await createProject({ engineRoot, target: project, id: "importgame" });
  const asset = (id: string, assetType: string, path: string, license: string, source?: Record<string, unknown>) =>
    ({ id, assetType, path, license, ...(source ? { source } : {}) });
  await put("assets/manifest.json", json({
    version: 1,
    assets: [
      asset("rock", "staticMesh", "assets/meshes/Rock.glb", "Unknown", { origin: "Low Poly Forest Tree Pack", path: "Tree_Pack.blend" }),
      asset("cabin", "staticMesh", "assets/world-builder/structures/wp-cabin.glb", "Project-local pilot greybox"),
      asset("road", "staticMesh", "assets/meshes/Road.glb", "CC0", { origin: "forge" }),
      asset("m-rock", "material", "assets/materials/Rock.material.json", "Unknown"),
      asset("t-rock", "texture", "assets/textures/T_Rock.png", "AI-generated project asset"),
      asset("t-sand", "texture", "assets/textures/T_Sand.png", "CC0-1.0", { origin: "https://polyhaven.com/a/gravelly_sand" }),
      asset("grass", "staticMesh", "assets/kenney-nature-kit/grass.glb", "CC0", { origin: "Kenney" }),
      asset("beep", "sound", "assets/sounds/Beep.wav", "Project-local placeholder; replace before distribution if needed"),
      asset("bt", "behaviorTree", "assets/ai/Patrol.behavior.json", "Unknown"),
    ],
  }));
  for (const path of ["assets/meshes/Rock.glb", "assets/world-builder/structures/wp-cabin.glb", "assets/meshes/Road.glb",
    "assets/textures/T_Rock.png", "assets/textures/T_Sand.png", "assets/sounds/Beep.wav"]) {
    await put(path, new Uint8Array([1, 2, 3, path.length]));
  }
  await put("assets/meshes/Rock.materials.json", json({ schema: 1, slots: ["m-rock"] }));
  await put("assets/meshes/Rock.collision.json", json({ schema: 1 }));
  await put("assets/materials/Rock.material.json", json({ schema: 1, type: "material", baseColorTexture: "t-rock", layerBlend: { layer1: { normalTexture: "t-sand" } } }));

  const { def } = createFlatWorldTerrain({ name: "Valley", tilesX: 2, tilesZ: 1, tileQuads: 64, spacing: 2, baseHeight: 0, heightMin: -10, heightMax: 10 });
  await put("layouts/Valley.landscapes/valley.terrain.json", json(def));
  for (const tile of def.tiles) await put(`layouts/Valley.landscapes/valley.tiles/${tile.key}.tile.bin`, new Uint8Array([7, 7, tile.key.length]));
  await put("layouts/Valley.landscapes/valley.global.bin", new Uint8Array([9, 9]));
  await put(LEVEL, json({
    schema: 1, name: "Valley", loadGroups: [], characters: [],
    worldSettings: { partition: { enabled: true, grids: { main: { cellSize: 128, loadRange: 384 } } }, viewDistance: 2000 },
    worldCells: ["0_0"],
    lights: [{ type: "directional" }],
    heightFog: { mode: "exp", color: "#80bdff", density: 0.001 },
    landscapes: [{ id: "valley", position: [0, 0, 0], dataRef: "layouts/Valley.landscapes/valley.terrain.json", name: "Valley Terrain" }],
    instances: [
      { assetId: "marker:playerStart", placements: [{ position: [1, 2, 3], name: "Player Start" }] },
      { assetId: "shape:cube", placements: [{ id: "house-1", role: "building.house", position: [10, 0, 10], color: "#ff0000" }] },
      { assetId: "grass", placements: [{ position: [3, 0, 3] }] },
      { assetId: "ghost", placements: [{ position: [4, 0, 4] }] },
    ],
  }));
  await put("layouts/Valley.cells/main/0_0.cell.json", json({
    schema: 1, type: "worldCell", grid: "main", key: "0_0",
    instances: [{ assetId: "rock", placements: [{ id: "rock-1", role: "prop.rock", position: [20, 0, 20], fracture: { enabled: false } }] }],
  }));
  await put("layouts/Valley.worldbrief.json", json({
    schema: 1, type: "worldBrief", id: "valley", name: "Valley",
    regionProfile: "layouts/Valley.regionprofile.json",
    reference: { image: "layouts/Valley.reference.png", view: "topDown" },
    models: [{ role: "building.cabin", source: "blender", file: "assets/world-builder/structures/wp-cabin.glb" }],
  }));
  await put("layouts/Valley.regionprofile.json", json({ schemaVersion: 1, id: "valley", label: "Valley", roads: { collector: { meshAsset: "road" } } }));
  await put("layouts/Valley.reference.png", new Uint8Array([5, 5]));
  await put("layouts/Valley.worldrecipe.json", json({
    schemaVersion: 1, recipeId: "valley", seed: 3, regionProfile: "layouts/Valley.regionprofile.json",
    ownership: { placements: { "rock-1": { stage: "scatter", outputHash: "abc" } }, splines: {}, foliageRules: {}, protectedRegions: [] },
  }));
  await put("layouts/Valley.foliage.json", json({ schema: 1, type: "foliage", groups: [] }));
  await put("layouts/Other.level.json", json({ schema: 1, name: "Other", loadGroups: [], characters: [], instances: [] }));
  await put("layouts/Other.worldbrief.json", json({ schema: 1, type: "worldBrief", id: "other", name: "Other", regionProfile: "layouts/Valley.regionprofile.json" }));
});

afterAll(async () => {
  await rm(base, { recursive: true, force: true });
});

const run = (extra: Partial<Parameters<typeof runForgeImport>[0]> = {}) =>
  runForgeImport({ engineRoot, projectRoot: project, forgeRoot: forge, levels: [LEVEL], ...extra });
const read = async (path: string) => JSON.parse(await readFile(join(project, path), "utf8")) as Record<string, unknown>;

describe("provenance table", () => {
  test("rules decide the licence from the path and the manifest; an unknown licence is imported unverified", () => {
    expect(provenanceOf({ path: "assets/kenney-nature-kit/grass.glb", license: "CC0" }).kind).toBe("excluded");
    expect(provenanceOf({ path: "assets/x/a.glb", license: "Unknown", source: { origin: "Quaternius" } }).kind).toBe("excluded");
    expect(provenanceOf({ path: "assets/vehicles/gaz52/gaz-52_base.glb", license: "CC-BY-4.0" })).toMatchObject({
      rule: "gaz52", provenance: { license: "CC-BY-4.0", source: { origin: "Sketchfab", author: "Vebis_V_stolb_GT" } },
    });
    expect(provenanceOf({ path: "assets/t.png", license: "CC0-1.0", source: { origin: "https://polyhaven.com/a/x" } }))
      .toMatchObject({ provenance: { license: "CC0-1.0", source: { origin: "Poly Haven", url: "https://polyhaven.com/a/x" } } });
    expect(provenanceOf({ path: "assets/t.webp", license: "Project-local Imagen candidate A", source: { origin: "ThreeAges" } }))
      .toMatchObject({ rule: "three-ages", provenance: { license: PROJECT_LICENSE } });
    expect(provenanceOf({ path: "assets/t.png", license: "Project-local generated texture", source: { origin: "OpenAI imagegen" } }))
      .toMatchObject({ rule: "ai-generated", provenance: { source: { origin: "ai-generated" } } });
    expect(provenanceOf({ path: "assets/a.wav", license: "Project-local placeholder" })).toMatchObject({ rule: "project-local", provenance: { source: { origin: "authored" } } });
    expect(provenanceOf({ path: "assets/car.glb", license: "CC0", source: { origin: "Forge" } })).toMatchObject({ provenance: { license: "CC0-1.0", source: { origin: "authored" } } });
    expect(provenanceOf({ path: "assets/d/t.png", license: "Unknown" })).toMatchObject({
      rule: "unverified", provenance: { license: UNVERIFIED_LICENSE, source: { origin: "Forge WebGL manifest: no source (license: Unknown)" } },
    });
  });

  test("materials name textures under any *Texture key; relabel swaps exact strings only", () => {
    expect(materialTextureIds({ baseColorTexture: "a", normalTexture: null, layerBlend: { l: { aoTexture: "b" } }, name: "c" })).toEqual(["a", "b"]);
    expect(relabel({ a: "x", b: ["x", "xy"], c: 1 }, new Map([["x", "y"]]))).toEqual({ a: "y", b: ["y", "xy"], c: 1 });
  });
});

describe("import:forge", () => {
  test("a dry run plans and reports without writing", async () => {
    const result = await run({ dryRun: true });
    expect(result.written).toEqual([]);
    expect(await readdir(join(project, "content")).then((names) => names.includes("forge"))).toBe(false);
    const report = formatImportReport(result);
    expect(report).toContain("| `lights` | 1 | 3 |");
    expect(report).toContain("| `instances[].fracture` | 1 | 8 |");
    expect(report).toContain("layouts/Valley.foliage.json → phase 5c");
    expect(report).toContain("grass (no Kenney or Quaternius content");
  });

  test("writes the level, its terrain, sidecars and the assets it uses; the project's index has no issue", async () => {
    const result = await run();
    const [level] = result.levels;
    expect(level!.folder).toBe("content/levels/Valley");
    expect(level!.report.converted).toMatchObject({ placements: 2, placeholders: 1, meshes: 1, playerStarts: 1, terrains: 1, heightFog: 1, sourceCells: 1 });
    expect(level!.report.missingAssets).toEqual([{ assetId: "ghost", placements: 1 }, { assetId: "grass", placements: 1 }]);
    expect([...result.plan.imported.keys()].sort()).toEqual(["cabin", "road", "rock", "t-rock", "t-sand"]);
    expect([...result.plan.deferred.keys()]).toEqual(["m-rock"]);
    expect([...result.plan.unknownIds]).toEqual(["ghost"]);
    expect(Object.fromEntries(result.plan.sidecars)).toEqual({ ".materials.json": 1, ".collision.json": 1 });

    expect((await read("content/levels/Valley/level.json")).id).toBe(forgeLevelId(LEVEL));
    const cell = await read("content/levels/Valley/cells/0_0.json");
    const rock = (cell.actors as Array<{ name: string; components: Record<string, Record<string, unknown>> }>).find((actor) => actor.name === "prop.rock")!;
    expect(rock.components.mesh!.mesh).toBe(forgeAssetId("rock"));
    expect(rock.components.role).toMatchObject({ role: "prop.rock", stage: "scatter" });
    expect(await read("content/forge/meshes/Rock.glb.meta.json")).toMatchObject({
      id: forgeAssetId("rock"), type: "forge.model@1", license: UNVERIFIED_LICENSE, import: {},
      source: { origin: "Forge WebGL manifest: Low Poly Forest Tree Pack, Tree_Pack.blend (license: Unknown)" },
    });
    expect(await read("content/forge/textures/T_Sand.png.meta.json")).toMatchObject({ type: "forge.texture@1", license: "CC0-1.0" });
    expect(await readFile(join(project, "content/levels/Valley/terrain/valley.tiles/1_0.tile.bin"))).toEqual(Buffer.from([7, 7, 3]));

    const brief = (await read("content/levels/Valley/Valley.worldbrief.json")).data as Record<string, unknown>;
    expect(brief.regionProfile).toBe("content/levels/Valley/Valley.regionprofile.json");
    expect(brief.models).toEqual([{ role: "building.cabin", source: "blender", file: "content/forge/world-builder/structures/wp-cabin.glb" }]);
    const profile = (await read("content/levels/Valley/Valley.regionprofile.json")).data as { roads: { collector: { meshAsset: string } } };
    expect(profile.roads.collector.meshAsset).toBe(forgeAssetId("road"));
    const recipe = (await read("content/levels/Valley/Valley.worldrecipe.json")).data as Record<string, unknown>;
    expect(recipe).toMatchObject({ regionProfile: "content/levels/Valley/Valley.regionprofile.json", generatedBy: { placements: {}, splines: {} } });
    expect(recipe.ownership).toBeUndefined();

    const registry = await loadEngineRegistry(engineRoot);
    const manifest = await read("forge.project.json") as unknown as { contentRoots: string[]; contentPacks: string[] };
    const scan = await scanRoots(projectIndexRoots(engineRoot, project, manifest));
    expect(buildAssetIndex(scan.files, { strict: true, registry }).issues).toEqual([]);
  });

  test("a content pack takes assets only, into content/packs/<id>/", async () => {
    const pack = { engineRoot, forgeRoot: forge, pack: "starter" };
    await expect(runForgeImport({ ...pack, levels: [LEVEL] })).rejects.toThrow(/assets only/);
    await expect(runForgeImport({ ...pack, projectRoot: project, levels: [] })).rejects.toThrow(/not both/);
    const dry = await runForgeImport({ ...pack, levels: [], assets: ["beep", "m-rock", "bt"], dryRun: true });
    expect([...dry.plan.imported.keys()].sort()).toEqual(["beep", "t-rock", "t-sand"]);
    expect(dry.plan.deferred.get("bt")?.phase).toBe("- (K12)");
    expect(formatImportReport(dry)).toContain("behaviorTree → - (K12) 1");
  });

  test("a sidecar two levels share is written once, where it lands first", async () => {
    const dry = await run({ levels: [LEVEL, "layouts/Other.level.json"], dryRun: true });
    expect(dry.levels[0]!.sidecars).toContain("content/levels/Valley/Valley.regionprofile.json");
    expect(dry.levels[1]!.sidecars).toEqual(["content/levels/Other/Other.worldbrief.json"]);
  });

  test("a second run needs --force and writes the same bytes", async () => {
    await expect(run()).rejects.toThrow(/pass --force/);
    const before = await readFile(join(project, "content/levels/Valley/cells/0_0.json"), "utf8");
    const again = await run({ force: true });
    expect(again.removed).toEqual([]);
    expect(await readFile(join(project, "content/levels/Valley/cells/0_0.json"), "utf8")).toBe(before);
  });
});
