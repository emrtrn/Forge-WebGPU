import { describe, expect, test } from "vitest";
import { normalizeLevelCell } from "../level/cellDocs.ts";
import {
  actorId,
  assetId,
  build,
  CAR,
  createAssetTestRegistry,
  fileSummary,
  level,
  MESH,
  projectFiles,
  TEX,
  WHEEL,
} from "./testKit.ts";

function lines(references: readonly { from: string; path: string; target: string }[]): string[] {
  return references.map((reference) => `${reference.from.slice(0, 5)} ${reference.path} -> ${reference.target.slice(0, 5)}`);
}

describe("buildAssetIndex", () => {
  test("a clean project indexes every asset without issues", () => {
    const index = build(projectFiles());
    expect(fileSummary(index.issues)).toEqual([]);
    expect(index.ok).toBe(true);
    expect(index.entries.size).toBe(5);
  });

  test("the index is the class resolver: a level finds its class by GUID", () => {
    const index = build(projectFiles());
    expect(index.resolveClass(CAR)?.name).toBe("Class");
    expect(index.resolveClass(MESH)).toBeUndefined();
    const raw = projectFiles().find((file) => file.path.endsWith("cells/0_0.json"))?.json;
    const result = normalizeLevelCell(raw, { strict: true, registry: createAssetTestRegistry(), resolveClass: index.resolveClass });
    expect(result.issues).toEqual([]);
    expect(result.value?.actors[0]).toMatchObject({ overrides: { body: { mesh: WHEEL }, driver: { targetSpeed: 18 } } });
  });

  test("references are found by walking the schema, overrides and meta import settings included", () => {
    const index = build(projectFiles());
    expect(lines(index.references)).toEqual([
      `ast_3 components.body.mesh -> ast_2`,
      `lvl_a actors[0].class -> ast_3`,
      `lvl_a actors[0].overrides.body.mesh -> ast_4`,
      `lvl_a actors[1].components.mesh.mesh -> ast_4`,
      `ast_2 import.textures[0] -> ast_1`,
    ]);
    const [classLink] = index.references.filter((reference) => reference.via === "class");
    expect(classLink).toMatchObject({ assetType: "forge.actorClass", file: "content/levels/main/cells/0_0.json" });
    const rendererMesh = index.references.find((reference) => reference.path.endsWith("components.mesh.mesh"));
    expect(rendererMesh?.assetType).toBe("test.mesh");
  });

  test("reverse index: who points at an asset", () => {
    const index = build(projectFiles());
    expect(lines(index.referrersOf(WHEEL))).toEqual([
      `lvl_a actors[0].overrides.body.mesh -> ast_4`,
      `lvl_a actors[1].components.mesh.mesh -> ast_4`,
    ]);
    expect(lines(index.referrersOf(TEX))).toEqual([`ast_2 import.textures[0] -> ast_1`]);
    expect(index.referrersOf(assetId("f"))).toEqual([]);
  });

  test("document normalisation issues are reported with their file", () => {
    const files = projectFiles();
    files.push(level("levels/broken/level.json", "b", [{ id: actorId("3"), spatiallyLoaded: false, bogus: 1 }]));
    const index = build(files);
    expect(fileSummary(index.issues)).toEqual(["error unknown-field content/levels/broken/level.json actors[0].bogus"]);
    expect(index.ok).toBe(false);
  });
});
