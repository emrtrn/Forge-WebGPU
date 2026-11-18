import { access, mkdtemp, readdir, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { buildAssetIndex } from "../../src/core/index.ts";
import { readGlb } from "../../src/engine/procgen/glb.ts";
import { projectIndexRoots } from "../assets/engineContent.ts";
import { loadEngineRegistry } from "../assets/engineRegistry.ts";
import { scanRoots } from "../assets/scan.ts";
import { createProject } from "../project/create.ts";
import { generateFromRecipe } from "./generate.ts";

const engineRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const RECIPE = "content/rocks/boulder.rockrecipe.json";
const RECIPE_ID = "ast_00000000000000000000000000000abc";
let base = "", project = "";

const writeRecipe = (variants: number[]) => writeFile(join(project, RECIPE), `${JSON.stringify({ schema: "forge.rockRecipe/1", id: RECIPE_ID, variants, lods: [2, 1] })}\n`);
const run = (extra: { force?: boolean; dryRun?: boolean } = {}) => generateFromRecipe({ engineRoot, projectRoot: project, recipe: RECIPE, ...extra });
const exists = (path: string) => access(join(project, path)).then(() => true, () => false);

beforeAll(async () => {
  base = await mkdtemp(join(tmpdir(), "forge-generate-"));
  project = join(base, "game");
  await createProject({ engineRoot, target: project, id: "generategame" });
  await mkdir(join(project, "content/rocks"), { recursive: true });
  await writeRecipe([4, 9]);
});

afterAll(async () => {
  await rm(base, { recursive: true, force: true });
});

describe("forge generate (rock)", () => {
  test("writes LOD models, metas and foliage types the project's index reads without an issue", async () => {
    const result = await run();
    expect(result.files.every((file) => file.status === "new")).toBe(true);
    expect((await readdir(join(project, "content/rocks/boulder"))).sort()).toEqual([
      "boulder_4.foliagetype.json", "boulder_4_lod0.glb", "boulder_4_lod0.glb.meta.json", "boulder_4_lod1.glb", "boulder_4_lod1.glb.meta.json",
      "boulder_9.foliagetype.json", "boulder_9_lod0.glb", "boulder_9_lod0.glb.meta.json", "boulder_9_lod1.glb", "boulder_9_lod1.glb.meta.json",
    ]);
    const registry = await loadEngineRegistry(engineRoot);
    const manifest = JSON.parse(await readFile(join(project, "forge.project.json"), "utf8"));
    const index = buildAssetIndex((await scanRoots(projectIndexRoots(engineRoot, project, manifest))).files, { strict: true, registry });
    expect(index.issues).toEqual([]);
    const meta = JSON.parse(await readFile(join(project, "content/rocks/boulder/boulder_4_lod0.glb.meta.json"), "utf8"));
    expect(meta).toMatchObject({ license: "LicenseRef-forge-project", source: { origin: "generated" }, generated: { recipe: RECIPE_ID, generator: "rock", generatorVersion: 1 } });
    expect(meta.import.collision.convex[0].points.length).toBe(96);
    const glb = readGlb(new Uint8Array(await readFile(join(project, "content/rocks/boulder/boulder_4_lod0.glb"))));
    expect(glb.json.accessors[0].count).toBe(162);
    const type = JSON.parse(await readFile(join(project, "content/rocks/boulder/boulder_4.foliagetype.json"), "utf8"));
    expect(type.mesh).toBe(meta.id);
    expect(type.lods).toHaveLength(1);
  });

  test("a second run needs --force and then writes the same bytes and GUIDs", async () => {
    await expect(run()).rejects.toThrow(/--force/);
    const again = await run({ force: true });
    expect(again.files.every((file) => file.status === "unchanged")).toBe(true);
    expect(again.removed).toEqual([]);
  });

  test("a seed dropped from the recipe deletes only the files it owned", async () => {
    await writeFile(join(project, "content/rocks/boulder/notes.txt"), "mine\n");
    await writeRecipe([4]);
    const result = await run({ force: true });
    expect(result.removed).toEqual([
      "content/rocks/boulder/boulder_9.foliagetype.json",
      "content/rocks/boulder/boulder_9_lod0.glb", "content/rocks/boulder/boulder_9_lod0.glb.meta.json",
      "content/rocks/boulder/boulder_9_lod1.glb", "content/rocks/boulder/boulder_9_lod1.glb.meta.json",
    ]);
    expect(await exists("content/rocks/boulder/boulder_9_lod0.glb")).toBe(false);
    expect(await exists("content/rocks/boulder/notes.txt")).toBe(true);
  });
});
