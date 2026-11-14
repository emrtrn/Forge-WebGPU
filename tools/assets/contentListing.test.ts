import { describe, expect, test } from "vitest";
import { binary, build, doc, levelId, MESH, projectFiles, TEX } from "../../src/core/assets/testKit.ts";
import { buildContentListing } from "./contentListing.ts";
import type { ScanResult } from "./scan.ts";

function scanOf(files: ScanResult["files"], folders: string[] = []): ScanResult {
  return { roots: ["content"], missing: [], files, folders };
}

describe("content listing", () => {
  test("an asset is listed by its own file with its GUID and type; meta files and level parts are not", () => {
    const files = projectFiles();
    const folders = ["content/textures", "content/empty", "content/levels", "content/levels/main", "content/levels/main/cells"];
    const listing = buildContentListing(scanOf(files, folders), build(files), () => true);
    expect(listing.roots).toEqual([{ label: "content", writable: true }]);
    // A level's cells folder is the inside of the level.
    expect(listing.folders).toEqual(["content/textures", "content/empty", "content/levels", "content/levels/main"]);
    expect(listing.files.map((file) => file.file)).toEqual([
      "content/textures/paint.png",
      "content/meshes/car.glb",
      "content/meshes/wheel.glb",
      "content/classes/car.json",
      "content/levels/main/level.json",
    ]);
    expect(listing.files[0]).toEqual({ file: "content/textures/paint.png", id: TEX, type: "test.texture" });
    expect(listing.files[1]).toMatchObject({ id: MESH, type: "test.mesh" });
    expect(listing.files[4]).toMatchObject({ id: levelId("a"), type: "forge.level" });
    expect(listing.files.every((file) => file.issues === undefined)).toBe(true);
  });

  test("a file that is no asset is listed without a GUID, with its issues; a meta file's issues go on its binary", () => {
    const files = [
      binary("loose.png"),
      doc("notes.json", { hello: 1 }),
      binary("bad.png"),
      doc("bad.png.meta.json", { schema: "forge.assetMeta/1", id: `ast_${"9".repeat(32)}`, type: "test.texture@1", source: { origin: "x" } }),
    ];
    const listing = buildContentListing(scanOf(files), build(files, false), () => false);
    const byFile = new Map(listing.files.map((file) => [file.file, file]));
    expect([...byFile.keys()]).toEqual(["content/loose.png", "content/notes.json", "content/bad.png"]);
    expect(byFile.get("content/loose.png")).toMatchObject({ issues: [{ severity: "warning" }] });
    expect(byFile.get("content/loose.png")!.id).toBeUndefined();
    expect(byFile.get("content/notes.json")!.issues?.length).toBe(1);
    expect(byFile.get("content/bad.png")).toMatchObject({ id: `ast_${"9".repeat(32)}`, issues: [{ message: expect.stringContaining("license") }] });
    expect(listing.roots).toEqual([{ label: "content", writable: false }]);
  });

  test("an issue in a level cell is listed on the level", () => {
    const files = projectFiles().map((file) =>
      file.path === "levels/main/cells/0_0.json" ? { ...file, json: { ...(file.json as object), actors: [{ id: "bad", name: "X", components: {} }] } } : file,
    );
    const listing = buildContentListing(scanOf(files), build(files, false), () => true);
    const level = listing.files.find((file) => file.file === "content/levels/main/level.json");
    expect(level?.issues?.length).toBeGreaterThan(0);
  });
});
