import { describe, expect, test } from "vitest";
import { identifyAssets, type ContentFile } from "./identity.ts";
import {
  actorClass,
  asset,
  assetId,
  binary,
  createAssetTestRegistry,
  doc,
  fileSummary,
  level,
  meta,
} from "./testKit.ts";

const TEX = assetId("1");
const MESH = assetId("2");
const CAR = assetId("3");

function identify(files: ContentFile[], strict = true) {
  return identifyAssets(files, { strict, registry: createAssetTestRegistry() });
}

describe("identifyAssets", () => {
  test("indexes binaries through their meta files and documents through their id", () => {
    const result = identify([
      ...asset("textures/paint.png", TEX, "test.texture@1"),
      ...asset("meshes/car.glb", MESH, "test.mesh@1"),
      actorClass("classes/car.json", CAR, {}),
      level("levels/main/level.json", "a", []),
    ]);
    expect(result.issues).toEqual([]);
    expect(result.entries.get(TEX)).toEqual({
      id: TEX,
      type: "test.texture",
      storage: "binary",
      root: "content",
      path: "textures/paint.png",
      meta: "textures/paint.png.meta.json",
    });
    expect(result.entries.get(CAR)).toMatchObject({ type: "forge.actorClass", storage: "document", meta: null });
    expect([...result.entries.values()].map((entry) => entry.type).sort()).toEqual([
      "forge.actorClass",
      "forge.level",
      "test.mesh",
      "test.texture",
    ]);
    expect(result.metas.get(MESH)?.import).toEqual({ textures: [] });
    expect(result.documents.map((document) => document.entry.path)).toEqual([
      "classes/car.json",
      "levels/main/level.json",
    ]);
  });

  test("a binary without a meta file and a meta file without its binary are reported", () => {
    const result = identify([binary("textures/loose.png"), meta("textures/gone.png", TEX, "test.texture@1")]);
    expect(fileSummary(result.issues)).toEqual([
      "error orphan-meta content/textures/gone.png.meta.json",
      "error missing-meta content/textures/loose.png",
    ]);
    expect(result.entries.size).toBe(0);
    expect(fileSummary(identify([binary("x.png")], false).issues)).toEqual(["warning missing-meta content/x.png"]);
  });

  test("the same GUID in two files: the first in path order keeps it", () => {
    const result = identify([
      ...asset("b/paint.png", TEX, "test.texture@1"),
      ...asset("a/paint.png", TEX, "test.texture@1"),
      actorClass("c/car.json", TEX, {}),
    ]);
    expect(result.entries.get(TEX)?.path).toBe("a/paint.png");
    expect(fileSummary(result.issues)).toEqual([
      "error duplicate-id content/b/paint.png.meta.json id",
      "error duplicate-id content/c/car.json id",
    ]);
    expect(result.issues[0]?.message).toContain("content/a/paint.png.meta.json");
  });

  test("the meta type must claim the file's extension", () => {
    const result = identify(asset("meshes/car.png", MESH, "test.mesh@1"));
    expect(fileSummary(result.issues)).toEqual(["error asset-type-mismatch content/meshes/car.png.meta.json type"]);
    expect(result.entries.get(MESH)?.type).toBe("test.mesh");
  });

  test("meta problems are reported under the meta file; a missing licence still indexes the GUID", () => {
    const result = identify(asset("t.png", TEX, "test.texture@1", { license: "Unknown" }));
    expect(fileSummary(result.issues)).toEqual(["error invalid-value content/t.png.meta.json license"]);
    expect(result.entries.has(TEX)).toBe(true);
    const unknownType = identify(asset("t.png", TEX, "test.sound@1"));
    expect(fileSummary(unknownType.issues)).toEqual(["error unknown-asset-type content/t.png.meta.json type"]);
    expect(unknownType.entries.get(TEX)?.type).toBe("test.sound");
  });

  test("JSON that is not an asset, unparsable files and documents without an id", () => {
    const result = identify([
      doc("notes.json", { hello: 1 }),
      doc("list.json", [1, 2]),
      { root: "content", path: "broken.json", parseError: "Unexpected end of JSON input" },
      { root: "content", path: "broken.png.meta.json", parseError: "Unexpected token" },
      binary("broken.png"),
      doc("level.json", { schema: "forge.level/1", id: assetId("9") }),
    ]);
    expect(fileSummary(result.issues)).toEqual([
      "error invalid-document content/broken.json",
      "error invalid-document content/broken.png.meta.json",
      "error invalid-document content/level.json id",
      "error unrecognized-file content/list.json schema",
      "error unrecognized-file content/notes.json schema",
    ]);
    expect(result.entries.size).toBe(0);
  });

  test("several roots: the label carries the root", () => {
    const result = identify([
      { ...binary("t.png"), root: "content/packs/starter" },
      { ...meta("t.png", TEX, "test.texture@1"), root: "content/packs/starter" },
    ]);
    expect(result.issues).toEqual([]);
    expect(result.entries.get(TEX)?.root).toBe("content/packs/starter");
  });
});
