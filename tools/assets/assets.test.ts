// Node side of the asset model, on a temporary copy of tests/fixtures/assets.
// The fixture itself is never written (A9).

import { cp, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { buildAssetIndex, createSchemaRegistry, LevelAssetType, planDelete } from "../../src/core/index.ts";
import { createAssetTestRegistry, MeshRenderer, Texture } from "../../src/core/assets/testKit.ts";
import {
  assetIndexCachePath,
  readAssetIndexCache,
  toAssetIndexCache,
  writeAssetIndexCache,
} from "./cache.ts";
import { loadEngineRegistry, registerExports } from "./engineRegistry.ts";
import { scanContentRoots } from "./scan.ts";
import { defaultContentRoots, verifyAssets } from "./verify.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const fixture = join(repoRoot, "tests/fixtures/assets");

const TEX = "ast_11111111111111111111111111111111";
const MESH = "ast_22222222222222222222222222222222";
const CAR = "ast_33333333333333333333333333333333";

let project: string;

beforeEach(async () => {
  project = await mkdtemp(join(tmpdir(), "forge-assets-"));
  await cp(fixture, project, { recursive: true });
});

afterEach(async () => {
  await rm(project, { recursive: true, force: true });
});

async function index(roots: string[] = ["content"]) {
  const scan = await scanContentRoots(project, roots);
  return buildAssetIndex(scan.files, { strict: true, registry: createAssetTestRegistry() });
}

async function move(from: string, to: string): Promise<void> {
  await mkdir(dirname(join(project, to)), { recursive: true });
  await rename(join(project, from), join(project, to));
}

async function editJson(path: string, edit: (json: Record<string, unknown>) => void): Promise<void> {
  const absolute = join(project, path);
  const json = JSON.parse(await readFile(absolute, "utf8")) as Record<string, unknown>;
  edit(json);
  await writeFile(absolute, JSON.stringify(json));
}

function summary(issues: readonly { severity: string; code: string; file: string; path: string }[]): string[] {
  return issues.map((issue) => `${issue.severity} ${issue.code} ${issue.file} ${issue.path}`.trimEnd());
}

describe("scanContentRoots", () => {
  test("lists files in path order, parses JSON and skips dot entries", async () => {
    await mkdir(join(project, "content/.hidden"), { recursive: true });
    await writeFile(join(project, "content/.hidden/x.png"), "");
    await writeFile(join(project, "content/.DS_Store"), "");
    await writeFile(join(project, "content/broken.json"), "{");
    const scan = await scanContentRoots(project, ["content", "samples/none/content"]);
    expect(scan.roots).toEqual(["content"]);
    expect(scan.missing).toEqual(["samples/none/content"]);
    expect(scan.files.map((file) => file.path)).toEqual([
      "broken.json",
      "classes/car.json",
      "levels/main/cells/0_0.json",
      "levels/main/cells.json",
      "levels/main/level.json",
      "meshes/car.glb",
      "meshes/car.glb.meta.json",
      "textures/paint.png",
      "textures/paint.png.meta.json",
    ]);
    expect(scan.files[0]?.parseError).toBeTypeOf("string");
    expect(scan.files[5]).toEqual({ root: "content", path: "meshes/car.glb" });
    expect(scan.files[6]?.json).toMatchObject({ id: MESH });
  });

  test("roots must not nest or repeat", async () => {
    await expect(scanContentRoots(project, ["content", "content/packs/starter"])).rejects.toThrow(/nest/);
    await expect(scanContentRoots(project, ["content", "content/"])).rejects.toThrow(/twice/);
  });
});

describe("the index on disk", () => {
  test("the fixture is a clean project", async () => {
    const built = await index();
    expect(summary(built.issues)).toEqual([]);
    expect([...built.entries.keys()].sort()).toEqual([CAR, TEX, MESH, "lvl_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"].sort());
    expect(built.referrersOf(MESH).map((reference) => reference.path)).toEqual([
      "components.body.mesh",
      "actors[1].components.mesh.mesh",
    ]);
  });

  test("moving and renaming files on disk breaks no reference", async () => {
    const before = await index();
    await move("content/meshes/car.glb", "content/vehicles/body/car-body.glb");
    await move("content/meshes/car.glb.meta.json", "content/vehicles/body/car-body.glb.meta.json");
    await move("content/classes/car.json", "content/prefabs/reference-car.json");
    await move("content/levels/main", "content/maps/first");
    const after = await index();
    expect(summary(after.issues)).toEqual([]);
    expect(after.entries.get(MESH)?.path).toBe("vehicles/body/car-body.glb");
    expect(after.entries.get(CAR)?.path).toBe("prefabs/reference-car.json");
    const targets = (built: typeof after) =>
      built.references.map((reference) => `${reference.from} ${reference.path} ${reference.target}`).sort();
    expect(targets(after)).toEqual(targets(before));
  });

  test("deleting: the reverse index warns first, a dangling reference fails after", async () => {
    const plan = planDelete(await index(), TEX);
    expect(plan.allowed).toBe(false);
    expect(plan.referrers.map((reference) => reference.file)).toEqual(["content/meshes/car.glb.meta.json"]);
    await rm(join(project, "content/textures"), { recursive: true });
    expect(summary((await index()).issues)).toEqual([
      "error dangling-reference content/meshes/car.glb.meta.json import.textures[0]",
    ]);
  });
});

describe("verifyAssets (the gate)", () => {
  test("passes the fixture and reports what it saw", async () => {
    const result = await verifyAssets(project, { registry: createAssetTestRegistry() });
    expect(result.ok).toBe(true);
    expect(result.lines).toEqual(["4 asset(s), 8 file(s), 1 root(s): content; 0 error(s)."]);
  });

  test("refuses an asset without type, licence or source (D16)", async () => {
    await editJson("content/textures/paint.png.meta.json", (json) => {
      json.license = "Unknown";
    });
    await editJson("content/meshes/car.glb.meta.json", (json) => {
      delete json.type;
      delete json.source;
    });
    const result = await verifyAssets(project, { registry: createAssetTestRegistry() });
    expect(result.ok).toBe(false);
    expect(summary(result.index.issues)).toEqual([
      "error missing-required content/meshes/car.glb.meta.json type",
      "error missing-required content/meshes/car.glb.meta.json source.origin",
      "error invalid-value content/textures/paint.png.meta.json license",
    ]);
    expect(result.lines.at(-1)).toBe("4 asset(s), 8 file(s), 1 root(s): content; 3 error(s).");
  });

  test("refuses a binary without its meta file", async () => {
    await writeFile(join(project, "content/textures/new.png"), "");
    const result = await verifyAssets(project, { registry: createAssetTestRegistry() });
    expect(result.ok).toBe(false);
    expect(result.lines[0]).toMatch(/^error missing-meta content\/textures\/new\.png: /);
  });

  test("default roots: content/ and samples/*/content/; none present passes on nothing", async () => {
    await mkdir(join(project, "samples/starter/content"), { recursive: true });
    await mkdir(join(project, "samples/.git"), { recursive: true });
    expect(defaultContentRoots(project)).toEqual(["content", "samples/starter/content"]);
    await rm(join(project, "content"), { recursive: true });
    await rm(join(project, "samples"), { recursive: true });
    const result = await verifyAssets(project, { registry: createAssetTestRegistry() });
    expect(result.ok).toBe(true);
    expect(result.lines).toEqual(["0 asset(s), 0 file(s), no content root yet; 0 error(s)."]);
  });
});

describe("the cache", () => {
  test("round-trips through .forge-cache/asset-index.json", async () => {
    const cache = toAssetIndexCache(await index(), ["content"]);
    const path = await writeAssetIndexCache(project, cache);
    expect(path).toBe(assetIndexCachePath(project));
    expect(path.replaceAll("\\", "/").endsWith(".forge-cache/asset-index.json")).toBe(true);
    expect(await readAssetIndexCache(project)).toEqual(cache);
    expect(cache.assets[MESH]).toEqual({
      type: "test.mesh",
      storage: "binary",
      root: "content",
      path: "meshes/car.glb",
      meta: "meshes/car.glb.meta.json",
    });
    expect(cache.references[TEX]).toEqual([
      { from: MESH, file: "content/meshes/car.glb.meta.json", path: "import.textures[0]" },
    ]);
    expect(Object.keys(cache.assets)).toEqual(Object.keys(cache.assets).sort());
  });

  test("a missing, corrupt or foreign cache reads as null and is rebuilt", async () => {
    expect(await readAssetIndexCache(project)).toBeNull();
    await mkdir(join(project, ".forge-cache"));
    await writeFile(assetIndexCachePath(project), "{ half");
    expect(await readAssetIndexCache(project)).toBeNull();
    await writeFile(assetIndexCachePath(project), JSON.stringify({ schema: "forge.assetIndexCache/0" }));
    expect(await readAssetIndexCache(project)).toBeNull();
    // A cache directory inside a content root is skipped by the scan.
    await cp(join(project, ".forge-cache"), join(project, "content/.forge-cache"), { recursive: true });
    expect(summary((await index()).issues)).toEqual([]);
  });
});

describe("engine registry", () => {
  test("loads the feature schemas of this repo", async () => {
    const registry = await loadEngineRegistry(repoRoot);
    expect(registry.getComponent("forge.heightFog")).toBeDefined();
    expect(registry.getAssetType("forge.level")?.storage).toBe("document");
  });

  test("registers components and binary asset types, nothing else", () => {
    const registry = createSchemaRegistry();
    // A document type is built in: registering it again would throw.
    registerExports(registry, [{ Texture, MeshRenderer, LevelAssetType, helper: () => 1, value: 3 }]);
    expect(registry.components()).toEqual([MeshRenderer]);
    expect(registry.getAssetType("test.texture")).toBe(Texture);
  });
});
