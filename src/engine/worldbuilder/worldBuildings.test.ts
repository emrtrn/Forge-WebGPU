/**
 * World Builder F1, step 12b: building placeholders and pad data (plan v0.4
 * §13.4, §13.5 L6; T40, T21). One coloured `shape:cube` per role-holding lot,
 * fitted into the role's footprint behind the setback, entrance facing the
 * street; a pad per building levelled at the mean ground under it; the host
 * parcel names its placement; a re-run after save + reload is empty.
 */
// Ported from Forge WebGL tests/engine/worldBuildings.test.ts @ forge-webgl-final (04b5fb23): checks unchanged, run by
// Vitest; 2 check(s) not yet portable left out. docs/PORT_LOG.md §2.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { type RoomLayout } from "../legacy/layout.ts";
import { applyPlacementGroupChanges, planStage } from "../testing/worldStagePlan.ts";
import { FOUNDATION, LAND_USE_COLORS, PAD_MARGIN, SLAB_HEIGHT, planBuilding } from "./buildings.ts";
import { sourceDistance } from "./field.ts";
import { type WorldPoint } from "./normalize.ts";
import { mulberry32 } from "./parcels.ts";
import { createWorldRecipe, normalizeWorldRecipe, type ProgramLine, type WorldRecipe } from "./recipe.ts";
import { normalizeRegionProfile, type RegionProfile } from "./regionProfile.ts";
import { type StageInput } from "./stage.ts";
import { buildingsStage } from "./stages/buildings.ts";
import { landUseStage } from "./stages/landUse.ts";
import { parcelsStage } from "./stages/parcels.ts";
import { WALL_FALLOFF } from "./terraces.ts";
import { test } from "vitest";


type Check = (label: string, fn: () => void) => void;

function profile(): RegionProfile {
  const { profile: value } = normalizeRegionProfile(
    JSON.parse(readFileSync("tests/engine/fixtures/neutral.regionprofile.json", "utf8")),
  );
  return value!;
}

/** A strip parcel north of a W–E street: front edge at z = 5 from x0 to x1, `depth` deep. */
function strip(x0: number, x1: number, depth = 30): { polygon: WorldPoint[] } {
  return { polygon: [[x0, 5], [(x0 + x1) / 2, 5], [x1, 5], [x1, 5 + depth], [(x0 + x1) / 2, 5 + depth], [x0, 5 + depth]] };
}

const PROGRAM: ProgramLine[] = [
  { role: "open.square", count: 1, siting: "center", source: "profile" },
  { role: "building.civic.hall", count: 1, siting: "center", source: "profile" },
  { role: "building.commercial.shop", count: 2, siting: "mainRoad", source: "profile" },
];

/** A village with a W–E collector and N–S local street, parcelled and given land uses. */
function village(): { recipe: WorldRecipe; layout: RoomLayout } {
  let recipe = createWorldRecipe("buildings_test", 5);
  recipe.plan.settlements.push({ id: "v1", source: "manual", center: [0, 0], type: "village", population: 36 });
  recipe.plan.roadGraph.nodes.push(
    { id: "w", source: "manual", position: [-300, 0], kind: "end" },
    { id: "e", source: "manual", position: [300, 0], kind: "end" },
    { id: "s", source: "manual", position: [0, -200], kind: "end" },
    { id: "n", source: "manual", position: [0, 200], kind: "end" },
  );
  recipe.plan.roadGraph.edges.push(
    { id: "main", source: "manual", from: "w", to: "e", roadClass: "collector" },
    { id: "cross", source: "manual", from: "s", to: "n", roadClass: "local" },
  );
  recipe.generated.sites.push({ settlement: "v1", center: [0, 0], coreRadius: 90, score: 0.9, dwellings: 12, program: PROGRAM });
  // @ts-expect-error Forge never type-checked its tests: the fixture is Forge's whole level document; the stages' input type keeps only its placement groups (type-only).
  const layout: RoomLayout = { schema: 1, name: "Buildings", loadGroups: [], characters: [], instances: [] };
  for (const stage of [parcelsStage, landUseStage]) {
    const plan = planStage(stage, input(recipe, layout));
    assert.deepEqual(plan.errors, []);
    applyPlacementGroupChanges(layout, plan.groupChanges, "after");
    recipe = plan.recipeAfter;
  }
  return { recipe, layout };
}

function input(recipe: WorldRecipe, layout: RoomLayout, sampleHeight: StageInput["sampleHeight"] = () => 0): StageInput {
  return { recipe, layout, profile: profile(), sampleHeight, terrains: [] };
}

export function registerWorldBuildingTests(check: Check): void {
  check("world buildings: a footprint fits the role behind the setback, entrance facing the street", () => {
    const spec = profile().roles["building.residential.detached"]!;
    const building = planBuilding({
      lot: [strip(0, 20)], landUse: "residential", spec, parcel: profile().parcels.residential,
      random: mulberry32(3), sampleHeight: () => 2,
    })!;
    assert.ok(building.width >= 8 && building.width <= 12, `width ${building.width}`);
    assert.ok(building.depth >= 8 && building.depth <= 11, `depth ${building.depth}`);
    assert.ok(Math.abs(building.center[0] - 10) < 1e-6);
    assert.ok(Math.abs(building.center[1] - (5 + 3 + building.depth / 2)) < 1e-6, "3 m setback behind the front edge");
    assert.equal(Math.abs(building.yawDeg), 180, "+Z faces the street to the south");
    assert.ok([1, 2].includes(building.storeys));
    assert.equal(building.height, building.storeys * 3);
    assert.equal(building.color, "#f2a65a", "the role's placeholder colour");
    assert.deepEqual({ height: building.pad.height, grading: building.grading, base: building.base }, { height: 2, grading: 0, base: 2 - FOUNDATION });
    const xs = building.pad.polygon.map(([x]) => x);
    const zs = building.pad.polygon.map(([, z]) => z);
    assert.ok(Math.abs(Math.max(...xs) - Math.min(...xs) - (building.width + 2 * PAD_MARGIN)) < 1e-3);
    assert.ok(Math.abs(Math.min(...zs) - (5 + 3 - PAD_MARGIN)) < 1e-3, "the pad keeps behind the parcel front");

    const shop = planBuilding({
      lot: [strip(0, 20)], landUse: "commercial", spec: profile().roles["building.commercial.shop"], parcel: profile().parcels.commercial,
      random: mulberry32(3), sampleHeight: () => 0,
    })!;
    assert.ok(Math.min(...shop.pad.polygon.map(([, z]) => z)) >= 5 - 1e-6, "no setback: the pad stops at the parcel front, off the road");
    assert.equal(building.squeezed, false);
  });

  check("world buildings: merged lots, small lots, open roles and slopes", () => {
    const base = profile();
    const school = planBuilding({
      lot: [strip(0, 14), strip(14, 28)], landUse: "civic", spec: { ...base.roles["building.civic.hall"]!, footprint: { width: [22, 24], depth: [10, 12] } },
      parcel: base.parcels.civic, random: mulberry32(1), sampleHeight: () => 0,
    })!;
    assert.ok(school.width >= 22, `a merged lot holds ${school.width} m`);
    assert.ok(Math.abs(school.center[0] - 14) < 1e-6, "centred on the merged frontage");
    assert.equal(school.color, LAND_USE_COLORS.civic);

    const tight = planBuilding({
      lot: [strip(0, 10)], landUse: "residential", spec: base.roles["building.residential.detached"],
      parcel: base.parcels.residential, random: mulberry32(1), sampleHeight: () => 0,
    })!;
    assert.equal(tight.squeezed, true);
    assert.equal(tight.width, 6, "10 m frontage less 2 × 2 m");

    const square = planBuilding({
      lot: [strip(0, 30)], landUse: "open", spec: base.roles["open.square"], parcel: base.parcels.open,
      random: mulberry32(1), sampleHeight: () => 0,
    })!;
    assert.deepEqual({ storeys: square.storeys, height: square.height }, { storeys: 0, height: SLAB_HEIGHT });

    // Ground rising 0.2 m per metre north: the pad is the mean under the footprint, the box stands a foundation below it.
    const slope = (_x: number, z: number) => z * 0.2;
    const sloped = planBuilding({
      lot: [strip(0, 20)], landUse: "residential", spec: base.roles["building.residential.detached"],
      parcel: base.parcels.residential, random: mulberry32(3), sampleHeight: slope,
    })!;
    assert.ok(Math.abs(sloped.pad.height - slope(0, sloped.center[1])) < 0.01, `pad at ${sloped.pad.height}`);
    assert.equal(sloped.base, Number((sloped.pad.height - FOUNDATION).toFixed(2)));
    assert.ok(Math.abs(sloped.grading - 0.2 * sloped.depth / 2) < 0.01);
    assert.equal(planBuilding({ lot: [strip(0, 20)], landUse: "residential", spec: undefined, parcel: undefined, random: mulberry32(1), sampleHeight: () => null }), null);
  });

  check("world buildings: on a steep slope pads get retaining walls and steps, the square terraces; a bake changes nothing", () => {
    const { recipe, layout } = village();
    const steep = (_x: number, z: number) => 100 + z * 0.2;
    const first = planStage(buildingsStage, input(recipe, layout, steep));
    assert.deepEqual(first.errors, []);
    applyPlacementGroupChanges(layout, first.groupChanges, "after");
    const pads = first.recipeAfter.generated.pads;
    const placed = layout.instances.flatMap((group) => group.placements);
    const walls = placed.filter((placement) => placement.role === "structure.retainingWall");
    const steps = placed.filter((placement) => placement.role === "structure.stairs");
    assert.ok(walls.length > 0, "walls hold the cut and fill");
    assert.ok(steps.length > 0, "entrances meeting a height difference get steps");
    assert.equal(walls.length, pads.reduce((sum, pad) => sum + (pad.walls?.length ?? 0), 0), "one placement per wall");
    assert.ok(pads.filter((pad) => pad.walls).every((pad) => pad.falloff === WALL_FALLOFF), "a walled pad blends in short, under its walls");
    // The square (an open lot) splits into terraces that belong to its building.
    const terraces = pads.filter((pad) => pad.building !== undefined);
    assert.ok(terraces.length > 0, "the square terraces");
    const square = pads.find((pad) => pad.id === terraces[0]!.building)!;
    assert.ok(terraces.every((pad) => pad.height !== square.height));
    assert.match(first.warnings.join("\n"), /\d+ retaining walls, \d+ flights of steps, 1 lots on terraces/);
    // The recipe round-trips them.
    const { recipe: saved, issues } = normalizeWorldRecipe(JSON.parse(JSON.stringify(first.recipeAfter)));
    assert.deepEqual(issues, []);
    assert.deepEqual(saved!.generated.pads, pads);

    // A bake flattens each pad and the ground a few metres around it (the falloff), which is
    // exactly where the walls were measured: the stage keeps what it measured.
    const bakedAround = (x: number, z: number) => {
      const near = pads.find((pad) => sourceDistance([x, z], { kind: "polygon", polygon: pad.polygon }) <= 3);
      return near ? near.height : steep(x, z);
    };
    const rerun = planStage(buildingsStage, input(saved!, layout, bakedAround));
    assert.deepEqual({ added: rerun.added, updated: rerun.updated, removed: rerun.removed }, { added: [], updated: [], removed: [] });
    assert.equal(rerun.empty, true);
  });

  check("world buildings: without roles the stage asks for land use; pads must name a settlement", () => {
    const bare = createWorldRecipe("bare", 1);
    bare.plan.settlements.push({ id: "v1", source: "manual", center: [0, 0], type: "village" });
    // @ts-expect-error Forge never type-checked its tests: the fixture is Forge's whole level document; the stages' input type keeps only its placement groups (type-only).
    assert.deepEqual(planStage(buildingsStage, input(bare, { schema: 1, name: "x", loadGroups: [], characters: [], instances: [] })).warnings,
      ["no parcel has a role yet; run Land use first"]);
    const value = JSON.parse(JSON.stringify(bare));
    value.generated.pads = [
      { id: "wb-building-v1.p1", settlement: "v1", polygon: [[0, 0], [4, 0], [4, 4], [0, 4]], height: 2.5 },
      { id: "wb-building-v1.p2", settlement: "gone", polygon: [[0, 0], [4, 0], [4, 4]], height: 1 },
    ];
    const { recipe, issues } = normalizeWorldRecipe(value);
    assert.deepEqual(issues, ["generated.pads[1].settlement: must name a plan settlement"]);
    assert.deepEqual(recipe!.generated.pads, [value.generated.pads[0]]);
  });
}

registerWorldBuildingTests(test as unknown as Parameters<typeof registerWorldBuildingTests>[0]);
