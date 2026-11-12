import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { normalizeGroundCover } from "../groundCover.ts";
import { randomWorldBrief } from "../randomWorld.ts";
import { normalizeRegionProfile } from "../regionProfile.ts";
import { normalizeWorldBrief, type WorldBrief, type WorldBuildStep } from "../worldBrief.ts";
import { buildWorldFromBrief, PLACEHOLDER_ASSET_ID, WORLD_BRIEF_GROUND_STAGES, WORLD_BRIEF_STAGES, type WorldBuild } from "./worldBuild.ts";

/** A pack file by its asset index label; the data document's content. */
function packData(label: string): unknown {
  return (JSON.parse(readFileSync(label.replace(/^engine:/, ""), "utf8")) as { data: unknown }).data;
}

function smallBrief(): WorldBrief {
  const { brief: raw } = randomWorldBrief({
    id: "trial", name: "Trial", seed: 11, size: "small", landform: "hills", mountainHeight: "low",
    settlements: [{ type: "hamlet" }], roads: "exits", rivers: 1, lakes: 0, cover: "meadow", densities: {},
  });
  const { brief, issues } = normalizeWorldBrief(raw);
  expect(issues).toEqual([]);
  return brief!;
}

function build(brief: WorldBrief, assetIdForFile: (file: string) => string | null, onProgress?: (step: WorldBuildStep) => void): WorldBuild {
  return buildWorldFromBrief({
    brief,
    profile: normalizeRegionProfile(packData(brief.regionProfile!)).profile,
    cover: normalizeGroundCover(packData(brief.cover!.file)).cover,
    assetIdForFile,
    ...(onProgress ? { onProgress } : {}),
  });
}

describe("buildWorldFromBrief", () => {
  test("a random world builds from the pack's cover and profile, the same every time", () => {
    const brief = smallBrief();
    const steps: WorldBuildStep[] = [];
    const first = build(brief, () => null, (step) => steps.push(step));
    const again = build(brief, () => null);
    expect(steps).toEqual(["terrain", "paint", "settlements", "roads", "ground", "placements"]);
    expect(JSON.stringify(first.groups)).toBe(JSON.stringify(again.groups));
    expect(JSON.stringify(first.recipe)).toBe(JSON.stringify(again.recipe));
    expect([...first.tileBytes.values()].map((bytes) => bytes.length)).toEqual([...again.tileBytes.values()].map((bytes) => bytes.length));
    expect(Buffer.from(first.globalBytes).equals(Buffer.from(again.globalBytes))).toBe(true);
    expect(first.def.tiles.length).toBe(first.tileBytes.size);
    expect(first.def.layers.map((layer) => layer.id)).toContain("meadow");
  });

  test("every stage runs once, in order, and the recipe records what each placed", () => {
    const result = build(smallBrief(), () => null);
    const order = [...WORLD_BRIEF_STAGES, ...WORLD_BRIEF_GROUND_STAGES].map((stage) => stage.id);
    expect(result.stages.map((run) => run.stageId)).toEqual(order);
    expect(result.recipe.generation.stages).toEqual(order);
    for (const run of result.stages) {
      for (const { placement } of run.placements) expect(result.recipe.generatedBy.placements[placement.id]).toEqual({ stage: run.stageId });
      for (const { spline } of run.splines) expect(result.recipe.generatedBy.splines[spline.id]?.stage).toBe(run.stageId);
    }
    const roads = result.stages.find((run) => run.stageId === "roads")!;
    expect(roads.splines.length).toBeGreaterThan(0);
    expect(result.def.splines!.map((spline) => spline.id)).toEqual(expect.arrayContaining(roads.splines.map(({ spline }) => spline.id)));
  });

  test("a model row without a project asset is a role-coloured placeholder; a row with one keeps its asset", () => {
    const brief = smallBrief();
    const without = build(brief, () => null);
    const rocks = without.groups.find((group) => group.assetId === PLACEHOLDER_ASSET_ID)!.placements.filter((placement) => placement.role === "prop.rock");
    expect(rocks.length).toBeGreaterThan(0);
    expect(rocks.every((rock) => rock.color === "#f5cf3a")).toBe(true);
    expect(without.warnings.some((warning) => warning.startsWith("model rows with no project asset, placed as placeholders: prop.rock"))).toBe(true);

    const rock = "ast_0000000000000000000000000000000a";
    const withModels = build(brief, (file) => (file.includes("Forest_Rock") ? rock : null));
    const placed = withModels.groups.find((group) => group.assetId === rock)!.placements;
    expect(placed.map((placement) => placement.id)).toEqual(rocks.map((placement) => placement.id));
    expect(placed.every((placement) => placement.color === undefined)).toBe(true);
  });

  test("what is not built yet is reported, not dropped", () => {
    const result = build(smallBrief(), () => null);
    expect(result.deferred).toEqual(expect.arrayContaining([
      expect.stringMatching(/^rivers: 1 bed\(s\) carved/),
      expect.stringMatching(/^foliage: /),
      expect.stringMatching(/^light and sky: /),
    ]));
  });
});
