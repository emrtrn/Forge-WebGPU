import { describe, expect, test } from "vitest";
import { createSchemaRegistry } from "../schema/registry.ts";
import { buildAssetIndex } from "./assetIndex.ts";
import {
  DATA_DOCUMENT_TYPES,
  dataDocument,
  dataDocumentReferences,
  dataDocumentPartMatchers,
  GroundCoverAssetType,
  hasDataDocumentName,
  normalizeDataDocument,
  TerrainAssetType,
  WorldBriefAssetType,
} from "./dataDocument.ts";
import { identifyAssets, type ContentFile } from "./identity.ts";
import { assetId, binary, createAssetTestRegistry, ROOT } from "./testKit.ts";

const TERRAIN = assetId("a1");
const BRIEF = assetId("a2");

function json(path: string, value: unknown, root = ROOT): ContentFile {
  return { root, path, json: value };
}

function terrainFiles(folder: string, id = TERRAIN): ContentFile[] {
  return [
    json(`${folder}/valley.terrain.json`, { schema: "forge.terrain/1", id, data: { schema: 1, type: "worldTerrain" } }),
    binary(`${folder}/valley.global.bin`),
    binary(`${folder}/valley.tiles/0_0.tile.bin`),
    binary(`${folder}/valley.tiles/1_0.tile.bin`),
  ];
}

describe("data documents", () => {
  test("every registry knows the terrain and World Builder document types", () => {
    const registry = createSchemaRegistry();
    for (const def of DATA_DOCUMENT_TYPES) {
      expect(registry.documentTypeForSchema(def.schema)).toBe(def);
      expect(def.schema).toBe(`${def.name}/1`);
      expect(def.idKind).toBe("asset");
    }
    expect(DATA_DOCUMENT_TYPES.map((def) => def.dataFile?.suffix)).toEqual([
      ".terrain.json",
      ".worldbrief.json",
      ".worldrecipe.json",
      ".regionprofile.json",
      ".cover.json",
    ]);
  });

  test("a terrain's and a ground cover's paint layer materials are asset references; other values are not", () => {
    const moss = assetId("b1");
    const rock = assetId("b2");
    const data = { layers: [{ id: "a", material: moss }, { id: "b" }, { id: "c", material: "lt-rock" }, "junk", { id: "d", material: rock }] };
    const expected = [
      { path: "data.layers[0].material", target: moss, assetType: "forge.material", via: "field" },
      { path: "data.layers[4].material", target: rock, assetType: "forge.material", via: "field" },
    ];
    expect(dataDocumentReferences(TerrainAssetType, data)).toEqual(expected);
    expect(dataDocumentReferences(GroundCoverAssetType, data)).toEqual(expected);
    expect(dataDocumentReferences(WorldBriefAssetType, data)).toEqual([]);
    expect(dataDocumentReferences(TerrainAssetType, { layers: "none" })).toEqual([]);
  });

  test("the asset index reports a paint layer material that is not there", () => {
    const missing = assetId("b9");
    const files = terrainFiles("content/levels/valley");
    (files[0]!.json as { data: Record<string, unknown> }).data.layers = [{ id: "meadow", material: missing }];
    const index = buildAssetIndex(files, { strict: true, registry: createAssetTestRegistry() });
    expect(index.issues.map((issue) => [issue.code, issue.path])).toEqual([["dangling-reference", "data.layers[0].material"]]);
  });

  test("the envelope keeps data as written and reports what it cannot keep", () => {
    const raw = dataDocument(TerrainAssetType, TERRAIN, { schema: 1, type: "worldTerrain", tiles: [] });
    const ok = normalizeDataDocument(raw, TerrainAssetType, { strict: true });
    expect(ok.ok).toBe(true);
    expect(ok.value).toEqual(raw);
    expect(ok.value?.data).not.toBe(raw.data);

    const extra = normalizeDataDocument({ ...raw, name: "x" }, TerrainAssetType, { strict: true });
    expect(extra.issues.map((issue) => [issue.code, issue.path])).toEqual([["unknown-field", "name"]]);
    expect(extra.value).toEqual(raw);

    for (const [bad, path] of [
      [{ ...raw, schema: "forge.worldBrief/1" }, "schema"],
      [{ ...raw, id: "lvl_1" }, "id"],
      [{ ...raw, data: [] }, "data"],
      [[], ""],
    ] as const) {
      const result = normalizeDataDocument(bad, TerrainAssetType, { strict: true });
      expect(result.value).toBeNull();
      expect(result.issues.map((issue) => [issue.code, issue.path])).toEqual([["invalid-document", path]]);
    }
  });

  test("a document's name carries its suffix; parts are matched beside it", () => {
    expect(hasDataDocumentName(TerrainAssetType, "levels/a/valley.terrain.json")).toBe(true);
    expect(hasDataDocumentName(TerrainAssetType, "levels/a/.terrain.json")).toBe(false);
    expect(hasDataDocumentName(GroundCoverAssetType, "covers/forest.json")).toBe(false);
    const matchers = dataDocumentPartMatchers(TerrainAssetType, "levels/a(1)/valley.terrain.json");
    const matches = (path: string) => matchers.some((matcher) => matcher.test(path));
    expect(matches("levels/a(1)/valley.global.bin")).toBe(true);
    expect(matches("levels/a(1)/valley.tiles/3_4.tile.bin")).toBe(true);
    expect(matches("levels/a(1)/valley.tiles/x/3_4.tile.bin")).toBe(false);
    expect(matches("levels/a(1)/other.global.bin")).toBe(false);
    expect(matches("levels/b/valley.global.bin")).toBe(false);
    expect(dataDocumentPartMatchers(WorldBriefAssetType, "a.worldbrief.json")).toEqual([]);
  });

  test("identity sets a terrain's parts aside; a part with no document still needs a meta file", () => {
    const result = identifyAssets(
      [...terrainFiles("levels/a/terrain"), binary("levels/b/valley.tiles/0_0.tile.bin"), binary("levels/a/terrain/valley.tiles/0_0.tile.bin", "other")],
      { strict: true, registry: createAssetTestRegistry() },
    );
    expect(result.entries.get(TERRAIN)).toMatchObject({ type: "forge.terrain", storage: "document", meta: null });
    expect(result.documentParts.map((file) => file.path)).toEqual([
      "levels/a/terrain/valley.global.bin",
      "levels/a/terrain/valley.tiles/0_0.tile.bin",
      "levels/a/terrain/valley.tiles/1_0.tile.bin",
    ]);
    expect(result.issues.map((issue) => [issue.file, issue.code])).toEqual([
      ["content/levels/b/valley.tiles/0_0.tile.bin", "missing-meta"],
      ["other/levels/a/terrain/valley.tiles/0_0.tile.bin", "missing-meta"],
    ]);
  });

  test("a data document under the wrong name is not an asset; a bad envelope is reported by the index", () => {
    const registry = createAssetTestRegistry();
    const wrongName = identifyAssets([json("briefs/valley.json", { schema: "forge.worldBrief/1", id: BRIEF, data: {} })], {
      strict: true,
      registry,
    });
    expect(wrongName.entries.size).toBe(0);
    expect(wrongName.issues.map((issue) => [issue.code, issue.message])).toEqual([
      ["invalid-document", "A World Brief file is named *.worldbrief.json."],
    ]);

    const index = buildAssetIndex(
      [json("briefs/valley.worldbrief.json", { schema: "forge.worldBrief/1", id: BRIEF, data: {}, notes: "" }), ...terrainFiles("t")],
      { strict: true, registry },
    );
    expect(index.entries.get(BRIEF)?.type).toBe("forge.worldBrief");
    expect(index.issues.map((issue) => [issue.file, issue.code, issue.path])).toEqual([
      ["content/briefs/valley.worldbrief.json", "unknown-field", "notes"],
    ]);
  });
});
