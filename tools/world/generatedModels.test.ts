// `generated` models in a built world (vegetation plan §7.2, PG5): the starter
// pack's recipes become rock models, single plants and foliage rules; a family
// sheet's answers are kept; a project's own recipe without output is generated
// once, and its output is never touched again.

import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, expect, test } from "vitest";
import { type ActorDoc } from "../../src/core/index.ts";
import { generatedOutputId } from "../../src/engine/procgen/recipeOutput.ts";
import { createProject } from "../project/create.ts";
import { runRandomWorld, type RandomWorldRunOptions } from "./randomWorldRun.ts";
import { runWorldBrief } from "./worldBriefRun.ts";

const engineRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const BROADLEAF = "ast_1cc830feab66656728f8bf965079b68a", ROCK_ANGULAR = "ast_49952fa42490dda70383d99c0f04f762";
const SHEET = "content/nature.familysheet.json";
const WORLD: RandomWorldRunOptions["world"] = {
  seed: 5, size: "small", landform: "mountains", mountainHeight: "medium",
  settlements: [{ type: "hamlet" }, { type: "hamlet" }], roads: "between", rivers: 0, lakes: 0, cover: "meadow", densities: {},
};
let base: string, project: string;
const write = async (path: string, value: unknown) => {
  await mkdir(dirname(join(project, path)), { recursive: true });
  await writeFile(join(project, path), JSON.stringify(value));
};
const run = (out: string) => runRandomWorld({ engineRoot, projectRoot: project, out, world: WORLD });
const componentsOf = (actors: readonly ActorDoc[], type: string) =>
  actors.flatMap((actor) => Object.values(actor.class === null ? actor.components : {}).filter((component) => component.type.startsWith(`${type}@`)));

beforeAll(async () => {
  base = await mkdtemp(join(tmpdir(), "forge-generated-models-"));
  project = join(base, "game");
  await createProject({ engineRoot, target: project, id: "generatedgame" });
  const path = join(project, "forge.project.json");
  const manifest = JSON.parse(await readFile(path, "utf8")) as { contentPacks: string[] };
  manifest.contentPacks.push("worldbuilder");
  await writeFile(path, JSON.stringify(manifest));
});
afterAll(() => rm(base, { recursive: true, force: true }));

test("a random world's nature is generated: no placeholder rock, a single tree per settlement, every plant rule of a family", { timeout: 120_000 }, async () => {
  const { build, level } = await run("content/levels/nature");
  const { actors } = level.level;
  const plants = componentsOf(actors, "forge.plant");
  expect(plants).toHaveLength(2);
  expect(plants.every((plant) => plant.family === generatedOutputId(BROADLEAF, "tree/family"))).toBe(true);
  const rocks = actors.filter((actor) => Object.values(actor.class === null ? actor.components : {}).some((component) => component.role === "prop.rock"));
  expect(rocks.length).toBeGreaterThan(0);
  expect(componentsOf(rocks, "forge.shape")).toEqual([]);
  // Trees, shrubs and grass: three prototypes each.
  expect(build.foliage.map((rule) => rule.id)).toEqual(expect.arrayContaining(["grove-broadleaf", "grove-broadleaf-3", "grove-bush-2", "meadow-grass-3"]));
  expect(build.deferred.filter((line) => /foliage|generated/.test(line))).toEqual([]);
  expect(build.review).toEqual([]);
});

test("a family sheet: a rejected recipe is not built, an unapproved one is and is reported", { timeout: 120_000 }, async () => {
  const entry = (recipe: string, status: string, digest = "") => ({ recipe, status, digest, note: "" });
  await write(SHEET, { schema: "forge.familySheet/1", id: `ast_${"5".repeat(32)}`, entries: [entry(ROCK_ANGULAR, "rejected"), entry(BROADLEAF, "approved", "0".repeat(32))] });
  try {
    const { build, level } = await run("content/levels/reviewed");
    expect(build.deferred).toContain("generated models rejected on a family sheet, placed as placeholders: prop.rock (high): RockAngular; prop.rock (slope): RockAngular");
    expect(build.review).toEqual(expect.arrayContaining(["Broadleaf (changed)", "RockRounded (pending)"]));
    expect(build.review.join()).not.toContain("RockAngular");
    expect(componentsOf(level.level.actors, "forge.plant")).toHaveLength(2);
  } finally {
    await rm(join(project, SHEET));
  }
});

test("a project recipe a brief names is generated when it has no output, and left alone afterwards", { timeout: 180_000 }, async () => {
  const id = `ast_${"6".repeat(32)}`;
  const hazel = JSON.parse(await readFile(join(engineRoot, "content/packs/starter/procgen/trees/Hazel.treerecipe.json"), "utf8")) as object;
  await write("content/plants/Own.treerecipe.json", { ...hazel, id, variants: [4] });
  await run("content/levels/own");
  const path = "content/levels/own/own.worldbrief.json";
  const brief = JSON.parse(await readFile(join(project, path), "utf8")) as { data: { models: { role: string; recipe: string }[]; props: object[] } };
  brief.data.models.find((model) => model.role === "vegetation.tree")!.recipe = id;
  brief.data.props = [{ id: "lone-bush", role: "vegetation.tree", at: [30, 40], rotationDeg: 0, scale: 1, collision: false }];
  await writeFile(join(project, path), JSON.stringify(brief));

  const build = () => runWorldBrief({ engineRoot, projectRoot: project, brief: path, force: true });
  const first = await build();
  const plants = componentsOf(first.level.level.actors, "forge.plant");
  expect(plants).toHaveLength(3);
  expect(plants.every((plant) => plant.family === generatedOutputId(id, "tree/family"))).toBe(true);
  const family = join(project, "content/plants/Own/Own.plantfamily.json");
  // The user's own edit of the family survives the next build.
  const edited = (await readFile(family, "utf8")).replace(/"windFlex": 1\b/, '"windFlex": 0.25');
  await writeFile(family, edited);
  const before = (await stat(family)).mtimeMs;
  const again = await build();
  expect(await readFile(family, "utf8")).toBe(edited);
  expect((await stat(family)).mtimeMs).toBe(before);
  expect(again.level.level.actors).toEqual(first.level.level.actors);

  brief.data.models.find((model) => model.role === "vegetation.tree")!.recipe = `ast_${"9".repeat(32)}`;
  await writeFile(join(project, path), JSON.stringify(brief));
  await expect(build()).rejects.toThrow(/no model recipe in the project: ast_9/);
});

