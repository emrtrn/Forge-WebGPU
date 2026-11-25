import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { isId, type AssetId } from "../../../core/index.ts";
import { plantAssetId } from "../../forgeImport/placements.ts";
import { padWeight } from "../../terrain/terrainPads.ts";
import type { GeneratedSources } from "../generatedModels.ts";
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

/** Every recipe named is built: two prototypes each, plants as family prototypes. */
const PLANTS = new Set(["ast_1cc830feab66656728f8bf965079b68a", "ast_93f1a5bbde4c4435a2080582620faf3d", "ast_5322d2eb85d37fe9fdcff8321a57b180", "ast_a839e8dd91327f16890b5cff658bfeed"]);
const GENERATED: GeneratedSources = (recipe) => ({
  recipe, name: "Recipe", state: "built", approval: null,
  placements: [0, 1].map((index) => (PLANTS.has(recipe) ? plantAssetId(recipe, index) : `ast_${"0".repeat(31)}${index + 1}`)),
  foliageTypes: [0, 1].map((index): AssetId => `ast_${"f".repeat(31)}${index + 1}`),
  youngFoliageTypes: [0, 1].map((index): AssetId => `ast_${"e".repeat(31)}${index + 1}`),
});

function build(brief: WorldBrief, generated: GeneratedSources = () => null, onProgress?: (step: WorldBuildStep) => void): WorldBuild {
  return buildWorldFromBrief({
    generated,
    brief,
    profile: normalizeRegionProfile(packData(brief.regionProfile!)).profile,
    cover: normalizeGroundCover(packData(brief.cover!.file)).cover,
    assetIdForFile: () => null,
    ...(onProgress ? { onProgress } : {}),
  });
}

describe("buildWorldFromBrief", () => {
  test("a random world builds from the pack's cover and profile, the same every time", () => {
    const brief = smallBrief();
    const steps: WorldBuildStep[] = [];
    const first = build(brief, GENERATED, (step) => steps.push(step));
    const again = build(brief, GENERATED);
    expect(steps).toEqual(["terrain", "paint", "settlements", "roads", "ground", "placements"]);
    expect(JSON.stringify(first.groups)).toBe(JSON.stringify(again.groups));
    expect(JSON.stringify(first.recipe)).toBe(JSON.stringify(again.recipe));
    expect([...first.tileBytes.values()].map((bytes) => bytes.length)).toEqual([...again.tileBytes.values()].map((bytes) => bytes.length));
    expect(Buffer.from(first.globalBytes).equals(Buffer.from(again.globalBytes))).toBe(true);
    expect(first.def.tiles.length).toBe(first.tileBytes.size);
    expect(first.def.layers.map((layer) => layer.id)).toContain("meadow");
  });

  test("every stage runs once, in order, and the recipe records what each placed", () => {
    const result = build(smallBrief());
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

  test("a generated row without output is a role-coloured placeholder; one with output shares its prototypes", () => {
    const brief = smallBrief();
    const without = build(brief);
    const rocks = without.groups.find((group) => group.assetId === PLACEHOLDER_ASSET_ID)!.placements.filter((placement) => placement.role === "prop.rock");
    expect(rocks.length).toBeGreaterThan(0);
    expect(rocks.every((rock) => rock.color === "#f5cf3a")).toBe(true);
    expect(without.deferred.some((line) => line.startsWith("generated models with no output, placed as placeholders: prop.rock"))).toBe(true);

    const withModels = build(brief, GENERATED);
    const groups = [1, 2].map((digit) => withModels.groups.find((group) => group.assetId === `ast_${"0".repeat(31)}${digit}`)!.placements);
    expect(groups.flat().map((placement) => placement.id).sort()).toEqual(rocks.map((placement) => placement.id).sort());
    expect(groups.every((group) => group.length > 0 && group.every((placement) => placement.color === undefined))).toBe(true);
    const rejected = build(brief, (recipe) => ({ ...GENERATED(recipe)!, state: "rejected", approval: "rejected", placements: [], foliageTypes: [], youngFoliageTypes: [] }));
    expect(rejected.deferred.some((line) => line.startsWith("generated models rejected on a family sheet, placed as placeholders: prop.rock"))).toBe(true);
    expect(rejected.foliage).toEqual([]);
    expect(rejected.review).toEqual([]);
    const pending = build(brief, (recipe) => ({ ...GENERATED(recipe)!, approval: "changed" }));
    expect(pending.review).toContain("Recipe (changed)");
  });

  test("each settlement gets one generated tree near its centre, clear of the buildings and roads", () => {
    const brief = smallBrief();
    const result = build(brief, GENERATED);
    const trees = result.groups.filter((group) => group.assetId.startsWith("plant:")).flatMap((group) => group.placements);
    expect(trees.map((tree) => tree.id)).toEqual(brief.settlements.map((settlement) => `${settlement.id}-tree`));
    for (const tree of trees) {
      const [x, , z] = tree.position;
      expect(result.recipe.generated.pads.every((pad) => padWeight({ polygon: pad.polygon, height: 0, falloff: 3 }, x, z) === 0)).toBe(true);
      const site = result.recipe.generated.sites[0]!;
      expect(Math.hypot(x - site.center[0], z - site.center[1])).toBeLessThan(120);
    }
    // Species share the trees by their ids: the same ones every build, more than one kind over many settlements.
    const many = { ...brief, props: Array.from({ length: 40 }, (_, index) => ({ id: `tree-${index}`, role: "vegetation.tree", at: [index, 0] as [number, number], rotationDeg: 0, scale: 1, collision: true })) } as WorldBrief;
    const kinds = build(many, GENERATED).groups.filter((group) => group.assetId.startsWith("plant:"));
    expect(kinds.length).toBeGreaterThan(5);
    expect(kinds).toEqual(build(many, GENERATED).groups.filter((group) => group.assetId.startsWith("plant:")));
    const bare = { ...brief, models: brief.models.filter((model) => model.role !== "vegetation.tree") };
    expect(build(bare, GENERATED).groups.some((group) => group.assetId.startsWith("plant:"))).toBe(false);
  });

  test("the cover's plants become foliage rules; a plant without a foliage type is reported", () => {
    const brief = smallBrief();
    const cover = normalizeGroundCover(packData(brief.cover!.file)).cover!;
    const result = build(brief, GENERATED);
    const grown = cover.plants.filter((plant) => plant.recipe !== undefined);
    expect(grown.length).toBeGreaterThan(3);
    expect(result.foliage.map((rule) => rule.id)).toEqual(grown.flatMap((plant) => (plant.prototypes === 1 ? [plant.id] : [plant.id, `${plant.id}-2`])));
    for (const rule of result.foliage) {
      const plant = grown.find((entry) => rule.id === entry.id || rule.id === `${entry.id}-2`)!;
      const type = plant.age === "young" ? "e" : "f";
      expect(rule.foliageTypeId.startsWith(`ast_${type.repeat(31)}`)).toBe(true);
      // Its own density, whole or as its share of the stand's.
      expect(rule.stand ? rule.density * (rule.stand.to - rule.stand.from) : rule.density).toBeCloseTo(plant.density / (plant.prototypes === 1 ? 1 : 2), 6);
    }
    // A stand: one seed and density, its shares end to end; the other rules' seeds differ.
    const wood = result.foliage.filter((rule) => rule.seed === cover.stands[0]!.seed);
    expect(wood.length).toBeGreaterThan(6);
    expect(new Set(wood.map((rule) => rule.density)).size).toBe(1);
    expect([wood[0]!.stand!.from, wood.at(-1)!.stand!.to]).toEqual([0, 1]);
    wood.slice(1).forEach((rule, index) => expect(rule.stand!.from).toBe(wood[index]!.stand!.to));
    expect(wood.some((rule) => rule.stand!.far > 0 && rule.stand!.tint > 0)).toBe(true);
    expect(wood.every((rule) => rule.stand!.far > 0 || rule.stand!.tint === 0)).toBe(true);
    const alone = result.foliage.filter((rule) => !rule.stand);
    expect(new Set(alone.map((rule) => rule.seed)).size).toBe(alone.length);
    expect(result.foliage.every((rule) => cover.layers.some((layer) => layer.id === rule.layerId) && isId(rule.foliageTypeId, "asset"))).toBe(true);
    const without = build(brief);
    expect(without.foliage).toEqual([]);
    expect(without.deferred).toContain(`foliage: no foliage type yet for ${cover.plants.map((plant) => plant.id).join(", ")}`);
  });

  test("what is not built yet is reported, not dropped", () => {
    const result = build(smallBrief());
    expect(result.deferred).toEqual(expect.arrayContaining([
      expect.stringMatching(/^rivers: 1 bed\(s\) carved/),
      expect.stringMatching(/^foliage: /),
    ]));
    expect(result.deferred.some((line) => line.startsWith("light and sky"))).toBe(false);
  });
});
