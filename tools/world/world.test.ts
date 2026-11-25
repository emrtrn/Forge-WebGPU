import { access, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { buildAssetIndex, isId, mergeLevelParts, normalizeLevel, normalizeLevelCell } from "../../src/core/index.ts";
import { WORLD_BUILD_STEPS } from "../../src/engine/worldbuilder/worldBrief.ts";
import { projectIndexRoots } from "../assets/engineContent.ts";
import { loadEngineRegistry } from "../assets/engineRegistry.ts";
import { scanRoots } from "../assets/scan.ts";
import { createProject } from "../project/create.ts";
import { validateRandomWorldRequest } from "./randomWorldRequest.ts";
import { runRandomWorld, type RandomWorldRunOptions } from "./randomWorldRun.ts";
import { refuseEngineFixture } from "./worldCli.ts";

const engineRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
let base: string;
let project: string;

const WORLD: RandomWorldRunOptions["world"] = {
  seed: 5, size: "small", landform: "plain", mountainHeight: "low",
  settlements: [{ type: "hamlet" }], roads: "between", rivers: 0, lakes: 0, cover: "steppe", densities: {},
};
const run = (out: string, extra: Partial<RandomWorldRunOptions> = {}) =>
  runRandomWorld({ engineRoot, projectRoot: project, out, world: WORLD, ...extra });
const text = (path: string) => readFile(join(project, path), "utf8");
const exists = (path: string) => access(join(project, path)).then(() => true, () => false);

beforeAll(async () => {
  base = await mkdtemp(join(tmpdir(), "forge-world-"));
  project = join(base, "game");
  await createProject({ engineRoot, target: project, id: "worldgame" });
  const manifestPath = join(project, "forge.project.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { contentPacks: string[] };
  manifest.contentPacks.push("worldbuilder");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
});

afterAll(async () => {
  await rm(base, { recursive: true, force: true });
});

describe("world:random", () => {
  test("writes a level folder the project's asset index reads without an issue", async () => {
    const steps: string[] = [];
    const result = await run("content/levels/plain", { onProgress: (step) => steps.push(step) });
    expect(steps).toEqual([...WORLD_BUILD_STEPS]);
    expect(result.folder).toBe("content/levels/plain");
    expect(result.build.warnings.filter((warning) => warning.startsWith("model rows"))).toEqual([]);
    expect(result.build.foliage.length).toBeGreaterThan(0);
    expect(result.brief).toBe("content/levels/plain/plain.worldbrief.json");
    const names = (await readdir(join(project, "content/levels/plain"))).sort();
    expect(names).toEqual(["cells", "cells.json", "level.json", "plain.worldbrief.json", "plain.worldrecipe.json", "terrain"]);
    expect(await exists("content/levels/plain/terrain/terrain.global.bin")).toBe(true);
    expect((await readdir(join(project, "content/levels/plain/terrain/terrain.tiles"))).length).toBe(result.build.tileBytes.size);

    const registry = await loadEngineRegistry(engineRoot);
    const manifest = JSON.parse(await text("forge.project.json")) as { contentRoots: string[]; contentPacks: string[] };
    const scan = await scanRoots(projectIndexRoots(engineRoot, project, manifest));
    const index = buildAssetIndex(scan.files, { strict: true, registry });
    expect(index.issues).toEqual([]);
    const types = [...index.entries.values()].filter((entry) => entry.path.startsWith("levels/plain/")).map((entry) => entry.type).sort();
    expect(types).toEqual(["forge.level", "forge.terrain", "forge.worldBrief", "forge.worldRecipe"]);
    expect(index.levels.get(result.levelId)?.cells.length).toBeGreaterThan(0);

    // The level reads back whole: every actor of the build, the terrain and the greybox look (sky, Sky Light, sun) in the persistent layer.
    const options = { strict: true, registry, resolveClass: index.resolveClass };
    const persistent = normalizeLevel(JSON.parse(await text("content/levels/plain/level.json")), options).value!;
    const cells = await Promise.all(index.levels.get(result.levelId)!.cells.map(async (key) =>
      normalizeLevelCell(JSON.parse(await text(`content/levels/plain/cells/${key}.json`)), options).value!));
    const merged = mergeLevelParts(persistent, cells, options);
    expect(merged.ok).toBe(true);
    expect(merged.ok && merged.value.level.actors.length).toBe(result.level.level.actors.length);
    expect(persistent.actors.map((actor) => actor.name)).toEqual([result.build.def.name, "Sky Atmosphere", "Sky Light", "Sun"]);
    const recipe = JSON.parse(await text("content/levels/plain/plain.worldrecipe.json")) as { data: { generatedBy: unknown } };
    expect(recipe.data.generatedBy).toEqual({ placements: {}, splines: {} });
  });

  test("an existing level is replaced only with force; the rebuild keeps its ids and bytes", async () => {
    const first = await run("content/levels/again");
    const level = await text("content/levels/again/level.json");
    const brief = await text("content/levels/again/again.worldbrief.json");
    await expect(run("content/levels/again")).rejects.toThrow(/again\.worldbrief\.json exists; rerun with --force/);
    const second = await run("content/levels/again", { force: true });
    expect(second.levelId).toBe(first.levelId);
    expect(await text("content/levels/again/level.json")).toBe(level);
    expect(await text("content/levels/again/again.worldbrief.json")).toBe(brief);

    // Foliage painted on the old terrain and the old actors' HLOD proxies go with it; a file that is not the build's stays.
    await mkdir(join(project, "content/levels/again/foliage"), { recursive: true });
    await writeFile(join(project, "content/levels/again/foliage/0_0.bin"), "x");
    await mkdir(join(project, "content/levels/again/hlod"), { recursive: true });
    await writeFile(join(project, "content/levels/again/hlod/0_0.glb"), "x");
    await writeFile(join(project, "content/levels/again/notes.txt"), "mine");
    // Fewer cells after a smaller world: the stale cell files go, the index follows.
    await run("content/levels/again", { force: true, world: { ...WORLD, settlements: [] } });
    expect(await exists("content/levels/again/foliage/0_0.bin")).toBe(false);
    expect(await exists("content/levels/again/hlod/0_0.glb")).toBe(false);
    expect(await exists("content/levels/again/notes.txt")).toBe(true);
    await rm(join(project, "content/levels/again/notes.txt"));
    const index = JSON.parse(await text("content/levels/again/cells.json")) as { cells: Record<string, string> };
    expect((await readdir(join(project, "content/levels/again/cells"))).map((name) => name.slice(0, -5)).sort())
      .toEqual(Object.keys(index.cells).sort());
  });

  test("built into a level made by hand, its settings and environment stay and its objects go", async () => {
    const id = (n: number) => `act_${String(n).padStart(32, "0")}`;
    const at = { p: [1, 2, 3], r: [0, 0, 0, 1], s: [1, 1, 1] };
    const actor = (n: number, name: string, components: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
      ({ id: id(n), name, class: null, parent: null, spatiallyLoaded: false, transform: at, components, ...extra });
    const shape = { shape: { type: "forge.shape@2", parent: null, local: { p: [0, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] }, primitive: "cube" } };
    const sun = { light: { type: "forge.directionalLight@1", parent: null, local: { p: [0, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] }, intensity: 9 } };
    const levelId = `lvl_${"7".repeat(32)}`;
    await mkdir(join(project, "content/levels/mine/cells"), { recursive: true });
    await writeFile(join(project, "content/levels/mine/level.json"), JSON.stringify({
      schema: "forge.level/1", id: levelId, settings: { cellSize: 64, viewDistance: 1234 },
      actors: [
        actor(1, "My World", { env: { type: "forge.worldEnvironment@2" } }), actor(2, "Lights", {}), actor(3, "Cube", shape),
        actor(4, "My Fog", { fog: { type: "forge.heightFog@1" } }, { parent: id(2) }),
      ],
    }));
    // A sun left spatially loaded stands in a cell.
    await writeFile(join(project, "content/levels/mine/cells/0_0.json"), JSON.stringify({
      schema: "forge.levelCell/1", level: levelId, cell: "0_0", actors: [actor(5, "My Sun", sun, { spatiallyLoaded: true }), actor(6, "Crate", shape, { spatiallyLoaded: true })],
    }));
    const { levelId: built, level } = await run("content/levels/mine", { force: true });
    expect(built).toBe(levelId);
    expect(level.level.settings).toMatchObject({ cellSize: 64, viewDistance: 1234 });
    expect(level.level.actors.filter((one) => /^act_0{20}/.test(one.id)).map((one) => one.name)).toEqual(["My World", "Lights", "My Fog", "My Sun"]);
    // It has a sun of its own: no greybox look.
    expect(level.level.actors.some((one) => one.name === "Sky Atmosphere" || one.name === "Sun")).toBe(false);
    const fog = level.level.actors.find((one) => one.name === "My Fog")!;
    expect(fog.parent).toBe(id(2));
    expect(level.level.actors.filter((one) => one.folder?.startsWith("World/")).length).toBe(level.counts.placements);
  });

  test("a failed build restores the brief it replaced and removes a new one", async () => {
    await mkdir(join(project, "content/levels/broken"), { recursive: true });
    await writeFile(join(project, "content/levels/broken/level.json"), "not json");
    await writeFile(join(project, "content/levels/broken/broken.worldbrief.json"), "previous brief");
    await expect(run("content/levels/broken", { force: true })).rejects.toThrow(/not JSON/);
    expect(await text("content/levels/broken/broken.worldbrief.json")).toBe("previous brief");
    await rm(join(project, "content/levels/broken/broken.worldbrief.json"));
    await expect(run("content/levels/broken", { force: true })).rejects.toThrow(/not JSON/);
    expect(await exists("content/levels/broken/broken.worldbrief.json")).toBe(false);
    await rm(join(project, "content/levels/broken"), { recursive: true });
  });

  test("a project without the worldbuilder pack is told to pick it; a level folder must be inside a content root", async () => {
    const manifestPath = join(project, "forge.project.json");
    const manifest = await readFile(manifestPath, "utf8");
    await writeFile(manifestPath, manifest.replace(', "worldbuilder"', "").replace(',\n    "worldbuilder"', ""));
    try {
      await expect(run("content/levels/nopack")).rejects.toThrow(/add "worldbuilder" to contentPacks/);
      expect(await exists("content/levels/nopack/nopack.worldbrief.json")).toBe(false);
    } finally {
      await writeFile(manifestPath, manifest);
    }
    await expect(run("src/levels/outside")).rejects.toThrow(/Not under a writable root/);
    await expect(run("../elsewhere")).rejects.toThrow(/inside the project/);
  });

  test("the engine's samples and fixtures are not World Builder targets", () => {
    expect(() => refuseEngineFixture(engineRoot, join(engineRoot, "samples/starter"))).toThrow(/read-only/);
    expect(() => refuseEngineFixture(engineRoot, join(engineRoot, "tests/fixtures/projects/x"))).toThrow(/read-only/);
    expect(() => refuseEngineFixture(engineRoot, project)).not.toThrow();
  });
});

// Forge WebGL's request checks (tests/engine/randomWorldRequest.test.ts) with the
// level folder rule of the new format in place of `assets/…/<Name>.level.json`.
describe("random world request", () => {
  const VALID = {
    out: "content/levels/My World",
    world: {
      seed: 48213, size: "medium", landform: "valley", mountainHeight: "high",
      settlements: [{ type: "village" }, { type: "town" }], roads: "exits", rivers: 2, lakes: 1,
      cover: "alpine", densities: { forest: "low", rocks: "high" },
    },
  };
  const refuses = (change: (body: Record<string, any>) => void, pattern: RegExp): void => {
    const body = structuredClone(VALID) as Record<string, any>;
    change(body);
    expect(() => validateRandomWorldRequest(body)).toThrow(pattern);
  };

  test("Coast and island budgets and the river-mouth limit reject before writing", () => {
    const coast = { ...VALID, world: { ...VALID.world, landform: "coast", size: "small", seaSide: "east" } };
    expect(validateRandomWorldRequest(coast).world.seaSide).toBe("east");
    expect(() => validateRandomWorldRequest({ ...coast, world: { ...coast.world, seaSide: "up" } })).toThrow(/seaSide/);
    expect(() => validateRandomWorldRequest({ ...coast, world: { ...coast.world, size: "large" } })).toThrow(/Ocean terrain budget/);
    const island = { ...VALID, world: { ...VALID.world, landform: "island", size: "small", rivers: 0 } };
    expect(validateRandomWorldRequest(island).world.landform).toBe("island");
    expect(() => validateRandomWorldRequest({ ...island, world: { ...island.world, rivers: 1 } })).toThrow(/river-mouth/);
  });

  test("the window's choices pass unchanged", () => {
    const request = validateRandomWorldRequest(VALID);
    expect(request.out).toBe(VALID.out);
    expect(request.force).toBe(false);
    expect(request.world).toEqual(VALID.world);
    expect(validateRandomWorldRequest({ ...VALID, force: true }).force).toBe(true);
    expect(validateRandomWorldRequest({ ...VALID, out: "content\\levels\\A" }).out).toBe("content/levels/A");
    const bare = validateRandomWorldRequest({ ...VALID, world: { ...VALID.world, rivers: undefined, lakes: undefined, densities: undefined } });
    expect(bare.world.rivers).toBe(0);
    expect(bare.world.densities).toEqual({});
  });

  test("levels are folders inside a content root with plain names", () => {
    for (const out of ["A", "content/../forge.project.json", "/content/A", "C:/x/A", "content//A", "content/A<b>", "content/A ", "content/.A", 5]) {
      refuses((body) => { body.out = out; }, /out/);
    }
  });

  test("only known choices", () => {
    refuses((body) => { body.extra = 1; }, /unknown field/);
    refuses((body) => { body.world.player = true; }, /unknown field/);
    refuses((body) => { body.world.size = "huge"; }, /world\.size/);
    refuses((body) => { body.world.rivers = 4; }, /world\.rivers/);
    refuses((body) => { body.world.seed = -1; }, /world\.seed/);
    refuses((body) => { body.world.settlements = Array.from({ length: 9 }, () => ({ type: "hamlet" })); }, /settlements/);
    refuses((body) => { body.world.settlements = [{ type: "village", population: 9000 }]; }, /unknown field/);
    refuses((body) => { body.world.densities = { forest: "extreme" }; }, /densities\.forest/);
    refuses((body) => { body.force = "yes"; }, /force/);
  });
});

test("brief ids are GUIDs of the data document", async () => {
  const brief = JSON.parse(await text("content/levels/plain/plain.worldbrief.json")) as { schema: string; id: string };
  expect(brief.schema).toBe("forge.worldBrief/1");
  expect(isId(brief.id, "asset")).toBe(true);
});
