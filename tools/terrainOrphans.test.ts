// Ported from Forge WebGL tests/engine/terrainOrphans.test.ts (A check unchanged);
// new-model ownership checks replace the old level-owned path tests (M).
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { buildAssetIndex, createSchemaRegistry, type ContentFile } from "../src/core/index.ts";
import { verifyAssets } from "./assets/verify.ts";
import { collectJsonStrings, findOrphanedTerrainParts } from "./terrainOrphans.ts";

const check = test;
check("terrain orphans: JSON string collection reaches nested references in other documents", () => {
  const strings = collectJsonStrings({ landscapes: [{ id: "x", dataRef: "p/q.terrain.json", n: 1 }], tags: ["t"] });
  assert.ok(strings.has("p/q.terrain.json"));
  assert.ok(strings.has("t"));
  assert.ok(!strings.has("1"));
});

function registry() {
  return createSchemaRegistry();
}

function definition(root = "content", stem = "terrain/a", tiles: unknown = [{ key: "0_0" }]): ContentFile {
  return { root, path: `${stem}.terrain.json`, json: {
    schema: "forge.terrain/1", id: `ast_${"1".repeat(32)}`, data: { tiles },
  } };
}

test("standalone terrain owns its listed tiles and global map without a level reference", () => {
  const files: ContentFile[] = [definition(),
    { root: "content", path: "terrain/a.tiles/0_0.tile.bin" },
    { root: "content", path: "terrain/a.global.bin" },
  ];
  const index = buildAssetIndex(files, { strict: true, registry: registry() });
  expect(index.ok).toBe(true);
  expect(findOrphanedTerrainParts(files, index)).toEqual([]);
});

test("unlisted tiles and companions without their same-root definition are reported", () => {
  const files: ContentFile[] = [definition(),
    { root: "content", path: "terrain/a.tiles/1_0.tile.bin" },
    { root: "other", path: "terrain/a.tiles/0_0.tile.bin" },
    { root: "content", path: "terrain/gone.global.bin" },
    { root: "content", path: "terrain/gone.tiles/0_0.tile.bin" },
    { root: "content", path: "terrain/a.tiles/note.txt" },
  ];
  const index = buildAssetIndex(files, { strict: true, registry: registry() });
  expect(findOrphanedTerrainParts(files, index)).toEqual([
    { file: "content/terrain/a.tiles/1_0.tile.bin", definition: "content/terrain/a.terrain.json", reason: "unlisted-tile" },
    { file: "content/terrain/gone.global.bin", definition: "content/terrain/gone.terrain.json", reason: "missing-definition" },
    { file: "content/terrain/gone.tiles/0_0.tile.bin", definition: "content/terrain/gone.terrain.json", reason: "missing-definition" },
    { file: "other/terrain/a.tiles/0_0.tile.bin", definition: "other/terrain/a.terrain.json", reason: "missing-definition" },
  ]);
});

test("a missing or malformed tile list is not treated as an intentionally empty terrain", () => {
  for (const tiles of [null, [{ wrong: "0_0" }], "0_0"]) {
    const files = [definition("content", "terrain/a", tiles), { root: "content", path: "terrain/a.tiles/0_0.tile.bin" }];
    expect(findOrphanedTerrainParts(files, buildAssetIndex(files, { strict: true, registry: registry() }))).toEqual([]);
  }
});

test("verify:assets rejects an unlisted tile, reports its path and leaves all bytes intact", async () => {
  const project = await mkdtemp(join(tmpdir(), "forge-orphans-"));
  try {
    const file = definition();
    await mkdir(join(project, "content/terrain/a.tiles"), { recursive: true });
    await writeFile(join(project, "content", file.path), JSON.stringify(file.json));
    const tile = join(project, "content/terrain/a.tiles/0_0.tile.bin");
    await writeFile(tile, "kept");
    const stray = join(project, "content/terrain/a.tiles/1_0.tile.bin");
    await writeFile(stray, "stray");
    const result = await verifyAssets(project, { registry: registry() });
    expect(result.ok).toBe(false);
    expect(result.lines.some((line) => line.includes("orphan-terrain-part content/terrain/a.tiles/1_0.tile.bin"))).toBe(true);
    expect(await readFile(tile, "utf8")).toBe("kept");
    expect(await readFile(stray, "utf8")).toBe("stray");
    expect(JSON.parse(await readFile(join(project, "content", file.path), "utf8"))).toEqual(file.json);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});
