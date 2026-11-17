import { describe, expect, test } from "vitest";
import { decodeFoliageCell, type AssetId, type JsonObject } from "../../core/index.ts";
import { foliageRuleParamsOf, foliageTypeParamsOf, type FoliageTypeAssetFields, type LandscapeFoliageRuleFields } from "../foliage/foliageAsset.ts";
import { normalizeFoliageTypeParams } from "../foliage/foliageTypeParams.ts";
import { convertForgeFoliage, convertForgeFoliageType, convertLandscapeFoliageRule } from "./foliage.ts";
import { eulerXyzQuaternion } from "./placements.ts";

const TYPE = "ast_00000000000000000000000000000001" as AssetId;
const MESH = "ast_00000000000000000000000000000002";
const LEVEL = "lvl_00000000000000000000000000000003" as const;
const typeAsset = (id: string): string | null => (id === "grass" || id === "tree" ? `ast_${id.padEnd(32, "0")}` : null);

/** Forge's rule generation fields: the rule without its identities, `layerId` kept. */
function forgeRuleParams(rule: JsonObject): JsonObject {
  const { id: _id, landscapeId: _landscape, foliageTypeId: _type, ...params } = rule;
  return params;
}

describe("Forge foliage import", () => {
  test("a Foliage Type converts with Forge's normaliser and generates as Forge did", () => {
    const pine = {
      schema: 1, type: "foliageType", name: "Pine", meshAssetId: "lt-pine", radius: 2, density: 0.01,
      scaleMin: [22, 1, 1], scaleMax: [20, 20, 20], randomYaw: true, alignToNormal: false, zOffsetMin: 1, zOffsetMax: -1,
      slopeMin: 50, slopeMax: 10, heightMin: 30, receiveShadow: false, castShadow: false, cullEnd: 900,
      sway: { amplitude: 0.04, frequency: 99 }, farDistance: 3000, farTint: 0.4,
    };
    const { document, missingMesh } = convertForgeFoliageType(pine, TYPE, (id) => (id === "lt-pine" ? MESH : null));
    expect(missingMesh).toBeNull();
    expect(document).toEqual({
      schema: "forge.foliageType/1", id: TYPE, mesh: MESH, radius: 2, density: 0.01, scaleMin: 22, scaleMax: 22,
      randomYaw: true, alignToNormal: false, zOffsetMin: -1, zOffsetMax: 1, slopeMin: 10, slopeMax: 50,
      heightLimit: { enabled: true, min: 30, max: 10000 }, castShadow: false, collision: false, cullStart: 0, cullEnd: 900,
      sway: { enabled: true, source: "height", amplitude: 0.04, height: 1, frequency: 10 },
      far: { distance: 3000, tint: 0.4 }, lods: [], impostor: { albedo: null, normal: null, views: 8 },
    });
    // Generation reads what Forge's own normaliser gives, but for the open height side (±10000 for ±∞).
    expect(foliageTypeParamsOf(document as unknown as FoliageTypeAssetFields)).toEqual({ ...normalizeFoliageTypeParams(pine), heightMax: 10000 });
    const plain = convertForgeFoliageType({ meshAssetId: "gone" }, TYPE, () => null);
    expect(plain.missingMesh).toBe("gone");
    expect(plain.document).toMatchObject({ mesh: null, heightLimit: { enabled: false }, sway: { enabled: false, amplitude: 0.15 } });
    expect(foliageTypeParamsOf(plain.document as unknown as FoliageTypeAssetFields)).toEqual(normalizeFoliageTypeParams({}));
  });

  test("a landscape rule generates with Forge's rule fields", () => {
    const derekavak = { id: "forest-conifer-a", landscapeId: "derekavak", layerId: "forest", foliageTypeId: "tree", density: 0.0025, minWeight: 0.6, seed: 101 };
    const banded = {
      id: "edge", landscapeId: "derekavak", layerId: "meadow", foliageTypeId: "grass", density: 0.02, minWeight: 0.5, seed: 105,
      heightMin: 40, heightMax: 900, heightFalloff: 30, slopeMin: 5, slopeMax: 40, slopeFalloff: 4, noiseAmount: 0.5, noiseScale: 60, edgeScale: 0.6,
    };
    for (const rule of [derekavak, banded]) {
      const converted = convertLandscapeFoliageRule(rule, "ast_x");
      expect(converted).toMatchObject({ id: rule.id, layer: rule.layerId, foliageType: "ast_x" });
      expect(foliageRuleParamsOf(converted as unknown as LandscapeFoliageRuleFields)).toEqual(forgeRuleParams(rule));
    }
    // Forge's clamps and defaults.
    expect(convertLandscapeFoliageRule({ layerId: "a", density: 40, minWeight: -1, seed: 7.9, heightMax: 20, slopeFalloff: 90 }, "ast_x")).toMatchObject({
      density: 10, minWeight: 0, seed: 7, height: { enabled: true, min: -10000, max: 20, falloff: 0 }, slope: { min: 0, max: 90, falloff: 45 },
      noise: { amount: 0, scale: 20 }, edgeScale: 1,
    });
  });

  test("rules go to their landscape; painted groups and their cells become the level part", () => {
    const doc = {
      schema: 1, type: "foliage",
      landscapeRules: [
        { id: "a", landscapeId: "valley", layerId: "forest", foliageTypeId: "tree", density: 0.01 },
        { id: "a", landscapeId: "valley", layerId: "meadow", foliageTypeId: "grass" },
        { id: "far", landscapeId: "elsewhere", layerId: "forest", foliageTypeId: "tree" },
        { id: "gone", landscapeId: "valley", layerId: "forest", foliageTypeId: "ghost" },
        { id: "broken", landscapeId: "valley", foliageTypeId: "tree" },
      ],
      groups: [
        { id: "g1", foliageTypeId: "grass", target: { kind: "landscape", id: "valley" }, instances: [
          { position: [1, 2, 3], rotation: [0, 90, 0], scale: [2, 2, 2], seed: 9 },
          { position: [140, 0, 3], scale: [1, 3, 1], normal: [0, 1, 0] },
          { rotation: [0, 0, 0] },
        ] },
        { id: "g2", foliageTypeId: "tree", target: { kind: "staticMesh", id: "rock" }, instances: [{ position: [5, 0, 5] }] },
        { id: "g3", foliageTypeId: "ghost", target: { kind: "landscape", id: "valley" }, instances: [{ position: [0, 0, 0] }, { position: [1, 0, 0] }] },
      ],
      foliageCells: ["0_0"],
    };
    const cells = [{ key: "0_0", doc: { schema: 1, type: "foliageCell", key: "0_0", groups: [{ id: "g1", instances: [{ position: [4, 0, 4], seed: 3 }] }] } }];
    const options = { levelPath: "layouts/Valley.level.json", levelId: LEVEL, cellSize: 128, landscapes: new Set(["valley"]), foliageTypeAsset: typeAsset };
    const result = convertForgeFoliage({ doc, cells }, options);
    expect(result.rulesByLandscape.get("valley")!.map((rule) => [rule.id, rule.layer])).toEqual([["a", "forest"], ["landscape-foliage-rule-1", "meadow"]]);
    expect(result.report).toEqual({
      rules: 2,
      skippedRules: [{ id: "far", reason: "no landscape elsewhere" }, { id: "gone", reason: "no foliage type ghost in the target" }],
      invalidRules: 1, instances: 4, staticMeshInstances: 1, missingTypes: [{ typeId: "ghost", instances: 2 }],
      invalidInstances: 1, nonUniformScales: 1, normals: 1,
    });

    const part = result.part!;
    expect(part.index).toEqual({
      schema: "forge.levelFoliage/1", level: LEVEL, cellSize: 128, types: [typeAsset("grass"), typeAsset("tree")],
      cells: [{ key: "0_0", counts: [2, 1] }, { key: "1_0", counts: [1, 0] }],
    });
    const [grass, tree] = decodeFoliageCell(part.cells.get("0_0")!, [2, 1]);
    expect([...grass!.positions]).toEqual([1, 2, 3, 4, 0, 4]);
    expect([...grass!.rotations]).toEqual([...Float32Array.from(eulerXyzQuaternion(0, 90, 0)), 0, 0, 0, 1]);
    expect([...grass!.scales]).toEqual([2, 1]);
    expect([...grass!.seeds]).toEqual([9, 3]);
    expect([...tree!.positions]).toEqual([5, 0, 5]);
    // A missing seed comes from the group id and index: the same on every run.
    const [far] = decodeFoliageCell(part.cells.get("1_0")!, [1, 0]);
    const again = convertForgeFoliage({ doc, cells }, options).part!;
    expect(decodeFoliageCell(again.cells.get("1_0")!)[0]!.seeds[0]).toBe(far!.seeds[0]);
    expect(again.cells.get("0_0")).toEqual(part.cells.get("0_0"));
    expect(convertForgeFoliage({ doc: { landscapeRules: [] }, cells: [] }, options).part).toBeNull();
  });
});
