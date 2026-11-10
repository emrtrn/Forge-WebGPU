import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vitest";
import { buildAssetIndex } from "../../src/core/index.ts";
import { loadEngineRegistry } from "../assets/engineRegistry.ts";
import { scanContentRoots } from "../assets/scan.ts";
import { checkProject } from "./check.ts";
import { createProject } from "./create.ts";
import { LOCAL_PROJECTS_FILE, projectsToCheck, registerLocalProject } from "./localProjects.ts";

const engineRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const temps: string[] = [];
afterEach(async () => {
  for (const path of temps.splice(0)) await rm(path, { recursive: true, force: true });
});
const temp = async (name: string): Promise<string> => {
  const path = await mkdtemp(join(tmpdir(), `forge-create-${name}-`));
  temps.push(path);
  return path;
};
const json = async (path: string): Promise<Record<string, unknown>> => JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;

describe("create-project", () => {
  test("a new project from the starter: renamed, its level renewed, within the contract", async () => {
    const target = join(await temp("new"), "mygame");
    await createProject({ engineRoot, target, id: "mygame", name: "My Game" });

    expect(await json(join(target, "forge.project.json"))).toMatchObject({ id: "mygame", name: "My Game", sdkVersion: "0.1", startLevel: "content/levels/main" });
    expect(await readFile(join(target, "src/game.ts"), "utf8")).toContain('id: "mygame.main"');

    const starterLevel = await json(join(engineRoot, "samples/starter/content/levels/main/level.json"));
    const level = await json(join(target, "content/levels/main/level.json"));
    expect(level.id).not.toBe(starterLevel.id);
    expect((await json(join(target, "content/levels/main/cells/0_0.json"))).level).toBe(level.id);

    const scan = await scanContentRoots(target, ["content"]);
    const index = buildAssetIndex(scan.files, { strict: true, registry: await loadEngineRegistry(engineRoot) });
    expect(index.issues).toEqual([]);

    const check = await checkProject(target, engineRoot);
    expect(check.problems).toEqual([]);
  }, 60_000);

  test("refuses the engine repository, a folder that is not empty, a bad id", async () => {
    await expect(createProject({ engineRoot, target: join(engineRoot, "samples/mine"), id: "mine" })).rejects.toThrow(/outside the engine/);
    const full = await temp("full");
    await writeFile(join(full, "keep.txt"), "x");
    await expect(createProject({ engineRoot, target: full, id: "mine" })).rejects.toThrow(/not empty/);
    await expect(createProject({ engineRoot, target: join(full, "x"), id: "My.Game" })).rejects.toThrow(/project id/);
  });
});

describe("forge.projects.local.json", () => {
  test("registered projects are checked after the samples, once each", async () => {
    const fakeEngine = await temp("engine");
    await mkdir(join(fakeEngine, "samples/starter"), { recursive: true });
    await registerLocalProject(fakeEngine, "/games/one");
    await registerLocalProject(fakeEngine, "/games/one");
    await registerLocalProject(fakeEngine, "/games/two");
    expect((await json(join(fakeEngine, LOCAL_PROJECTS_FILE))).projects).toEqual([resolve("/games/one"), resolve("/games/two")]);
    expect(await projectsToCheck(fakeEngine)).toEqual([join(fakeEngine, "samples/starter"), resolve("/games/one"), resolve("/games/two")]);
  });
});
