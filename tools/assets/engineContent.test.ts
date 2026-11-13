import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { contentPackProblems, engineContentRoots, listContentPacks, packRequires, packWithRequired, projectIndexRoots } from "./engineContent.ts";

let engine: string;

beforeEach(async () => {
  engine = await mkdtemp(join(tmpdir(), "forge-engine-"));
});

afterEach(async () => {
  await rm(engine, { recursive: true, force: true });
});

describe("content packs", () => {
  test("a pack is a folder under content/packs/; hidden folders and files are not packs", async () => {
    expect(await listContentPacks(engine)).toEqual([]);
    for (const name of ["starter", "test-range", ".trash"]) await mkdir(join(engine, "content/packs", name), { recursive: true });
    await writeFile(join(engine, "content/packs/README.md"), "");
    expect(await listContentPacks(engine)).toEqual(["starter", "test-range"]);
  });

  test("a pack the engine does not have is a problem", async () => {
    expect(await contentPackProblems(engine, ["starter"])).toEqual(['Unknown content pack "starter"; the engine has: none.']);
    await mkdir(join(engine, "content/packs/starter"), { recursive: true });
    expect(await contentPackProblems(engine, ["starter"])).toEqual([]);
    expect(await contentPackProblems(engine, ["starter", "nope"])).toEqual(['Unknown content pack "nope"; the engine has: starter.']);
  });

  test("a pack's forge.pack.json names the packs it requires; a project picking it picks them too", async () => {
    for (const name of ["starter", "worldbuilder", "extra"]) await mkdir(join(engine, "content/packs", name), { recursive: true });
    const manifest = (requires: string[]) => JSON.stringify({ schema: "forge.pack/1", requires });
    await writeFile(join(engine, "content/packs/worldbuilder/forge.pack.json"), manifest(["starter"]));
    await writeFile(join(engine, "content/packs/extra/forge.pack.json"), manifest(["worldbuilder"]));
    expect(await packRequires(engine, "starter")).toEqual([]);
    expect(await packRequires(engine, "worldbuilder")).toEqual(["starter"]);
    expect(await packWithRequired(engine, "extra")).toEqual(["extra", "worldbuilder", "starter"]);
    expect(await contentPackProblems(engine, ["worldbuilder", "starter"])).toEqual([]);
    expect(await contentPackProblems(engine, ["worldbuilder"])).toEqual(['Content pack "worldbuilder" requires "starter"; add it to contentPacks.']);
    await writeFile(join(engine, "content/packs/starter/forge.pack.json"), JSON.stringify({ requires: [] }));
    await expect(packRequires(engine, "starter")).rejects.toThrow(/forge\.pack\/1/);
  });

  test("a project sees its own roots, then the engine's content, then its packs, under engine: labels", () => {
    expect(engineContentRoots(engine, [])).toEqual([{ label: "engine:content/engine", dir: join(engine, "content/engine") }]);
    const roots = projectIndexRoots(engine, "/game", { contentRoots: ["content"], contentPacks: ["starter"] });
    expect(roots.map((root) => root.label)).toEqual(["content", "engine:content/engine", "engine:content/packs/starter"]);
    expect(roots[0]!.dir).toBe(join("/game", "content"));
    expect(roots[2]!.dir).toBe(join(engine, "content/packs/starter"));
  });
});
