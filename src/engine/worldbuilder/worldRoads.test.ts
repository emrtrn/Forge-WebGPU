/**
 * World Builder F1, step 6: the Stage Runner's spline output and the `roads`
// World Builder option B (user decision 2026-11-12): fixtures and provenance reads use the
// new recipe fields (`ownership.protectedRegions` -> `protectedRegions`, `ownership.splines` /
// `.placements` -> `generatedBy.*`); check bodies and assertions are otherwise Forge's.
 * stage (plan v0.4 §13, decision 19: spline data only). Road edges become
 * World Terrain splines owned through `recipe.generatedBy.splines`, under the
 * same rules as placements: manual / other-stage / protected / locked ids are
 * blocked, hand edits and deletions are kept, and a re-run — also after a
 * save + reload — is empty.
 */
// Ported from Forge WebGL tests/engine/worldRoads.test.ts @ forge-webgl-final (04b5fb23): checks unchanged, run by
// Vitest; 4 check(s) not yet portable left out. docs/PORT_LOG.md §2.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { type RoomLayout } from "../legacy/layout.ts";
import { normalizeTerrainSplines } from "../terrain/terrainSplineData.ts";
import { type TerrainSpline } from "../terrain/terrainTypes.ts";
import { applyPlacementGroupChanges, planStage, type StagePlan, type TerrainSplineChange } from "../testing/worldStagePlan.ts";
import { createWorldRecipe, normalizeWorldRecipe, type WorldRecipe } from "./recipe.ts";
import { normalizeRegionProfile, type RegionProfile } from "./regionProfile.ts";
import { type StageInput, type StageTerrain } from "./stage.ts";
import { roadsStage } from "./stages/roads.ts";
import { test } from "vitest";


type Check = (label: string, fn: () => void) => void;

const WEST = "terrain-west";
const EAST = "terrain-east";

function profile(): RegionProfile {
  const { profile: value } = normalizeRegionProfile(
    JSON.parse(readFileSync("tests/engine/fixtures/neutral.regionprofile.json", "utf8")),
  );
  return value!;
}

function recipe(): WorldRecipe {
  const value = createWorldRecipe("roads_test", 3);
  value.plan.roadGraph.nodes.push(
    { id: "a", source: "manual", position: [-80, 0], kind: "end" },
    { id: "b", source: "manual", position: [-60, 0], kind: "junction" },
    { id: "c", source: "manual", position: [-60, 30], kind: "end" },
  );
  value.plan.roadGraph.edges.push(
    { id: "main", source: "manual", from: "a", to: "b", roadClass: "collector" },
    { id: "spur", source: "manual", from: "b", to: "c", roadClass: "track", guide: [[-50, 10], [-50, 20]] },
  );
  return value;
}

interface World {
  layout: RoomLayout;
  terrains: StageTerrain[];
}

function world(): World {
  const terrain = (id: string, min: [number, number], max: [number, number], splines: TerrainSpline[] = []): StageTerrain => ({
    id, min, max, locked: false, splines,
    layers: [{ id: "grass", name: "Grass" }, { id: "asphalt", name: "Asphalt" }, { id: "dirt", name: "Dirt" }],
  });
  const manual: TerrainSpline = {
    id: "spline-1", coordinateSpace: "world",
    points: [{ id: "p0", position: [-10, 0, 0], width: 6, falloff: 3 }, { id: "p1", position: [-5, 0, 0], width: 6, falloff: 3 }],
    segments: [{ id: "s0", startPointId: "p0", endPointId: "p1" }],
  };
  return {
    // @ts-expect-error Forge never type-checked its tests: the fixture is Forge's whole level document; the stages' input type keeps only its placement groups (type-only).
    layout: { schema: 1, name: "Roads test", loadGroups: [], characters: [], instances: [] },
    terrains: [terrain(WEST, [-100, -100], [0, 100], [manual]), terrain(EAST, [0, -100], [100, 100])],
  };
}

/** Height falls 0.1 m per metre east; nothing outside |x| ≤ 100. */
const sampleHeight = (x: number, _z: number): number | null => (Math.abs(x) <= 100 ? 10 - x * 0.1 : null);

function input(recipeValue: WorldRecipe, state: World, profileValue: RegionProfile | null = profile()): StageInput {
  return { recipe: recipeValue, layout: state.layout, profile: profileValue, sampleHeight, terrains: state.terrains };
}

function applySplines(terrains: StageTerrain[], changes: readonly TerrainSplineChange[], side: "before" | "after"): StageTerrain[] {
  return terrains.map((terrain) => {
    const change = changes.find((entry) => entry.landscapeId === terrain.id);
    return change ? { ...terrain, splines: structuredClone(change[side]) } : terrain;
  });
}

function run(recipeValue: WorldRecipe, state: World, profileValue: RegionProfile | null = profile()) {
  const plan = planStage(roadsStage, input(recipeValue, state, profileValue));
  const layout = structuredClone(state.layout);
  applyPlacementGroupChanges(layout, plan.groupChanges, "after");
  return { plan, state: { layout, terrains: applySplines(state.terrains, plan.splineChanges, "after") }, recipe: plan.recipeAfter };
}

function spline(state: World, terrainId: string, id: string): TerrainSpline {
  const found = state.terrains.find((terrain) => terrain.id === terrainId)!.splines.find((entry) => entry.id === id);
  assert.ok(found, `${terrainId}/${id}`);
  return found!;
}

/** The terrain save + reload of the spline lists, and the recipe save + reload. */
function reload(state: World, recipeValue: WorldRecipe): { state: World; recipe: WorldRecipe } {
  const { recipe: reloaded, issues } = normalizeWorldRecipe(JSON.parse(JSON.stringify(recipeValue)));
  assert.deepEqual(issues, []);
  return {
    recipe: reloaded!,
    state: {
      layout: state.layout,
      terrains: state.terrains.map((terrain) => ({
        ...terrain, splines: normalizeTerrainSplines(JSON.parse(JSON.stringify(terrain.splines))),
      })),
    },
  };
}

function ids(plan: StagePlan) {
  return { added: plan.added, updated: plan.updated, removed: plan.removed, kept: plan.kept, blocked: plan.blocked };
}

export function registerWorldRoadsTests(check: Check): void {

  check("world roads: a re-run is empty, also after the terrain and recipe save + reload (WB-02)", () => {
    const first = run(recipe(), world());
    const again = planStage(roadsStage, input(first.recipe, first.state));
    assert.equal(again.empty, true);
    assert.equal(again.unchanged, 2);

    const reloaded = reload(first.state, first.recipe);
    const afterSave = planStage(roadsStage, input(reloaded.recipe, reloaded.state));
    assert.equal(afterSave.empty, true);
    assert.deepEqual(afterSave.kept, []);
    assert.equal(JSON.stringify(run(recipe(), world()).plan), JSON.stringify(first.plan), "deterministic (WB-01)");
  });

  check("world roads: plan edits update, move between terrains and remove only the stage's splines", () => {
    const first = run(recipe(), world());
    const changed = structuredClone(first.recipe);
    changed.plan.roadGraph.nodes[0]!.position = [20, 0];
    changed.plan.roadGraph.edges = changed.plan.roadGraph.edges.filter((edge) => edge.id === "main");
    const { plan, state, recipe: next } = run(changed, first.state);
    assert.deepEqual(ids(plan), { added: [], updated: ["wb-road-main"], removed: ["wb-road-spur"], kept: [], blocked: [] });
    assert.deepEqual(state.terrains[0]!.splines.map((entry) => entry.id), ["spline-1"]);
    assert.deepEqual(state.terrains[1]!.splines.map((entry) => entry.id), ["wb-road-main"], "the start node moved east");
    assert.deepEqual(plan.splineChanges.map((change) => change.landscapeId), [WEST, EAST]);
    assert.deepEqual(Object.keys(next.generatedBy.splines), ["wb-road-main"]);

    const undone = applySplines(state.terrains, plan.splineChanges, "before");
    assert.deepEqual(undone, first.state.terrains, "applying before restores every touched list exactly");
  });

  check("world roads: missing profile specs, off-terrain ends and bad stage output are reported", () => {
    const value = recipe();
    value.plan.roadGraph.nodes.push(
      { id: "far", source: "manual", position: [300, 0], kind: "end" },
      { id: "farther", source: "manual", position: [400, 0], kind: "end" },
      { id: "edge", source: "manual", position: [95, 0], kind: "end" },
    );
    value.plan.roadGraph.edges.push(
      { id: "lost", source: "manual", from: "far", to: "farther", roadClass: "local" },
      { id: "out", source: "manual", from: "edge", to: "far", roadClass: "local" },
    );
    const { plan, state } = run(value, world(), null);
    assert.deepEqual(plan.errors, []);
    assert.deepEqual(plan.warnings, [
      "no region profile road spec for collector; using 7 m and no mesh",
      "no region profile road spec for track; using 3.5 m and no mesh",
      "road lost has neither end on a World Terrain; skipped",
      "no region profile road spec for local; using 5 m and no mesh",
      "road out leaves the terrain; off-terrain points take the nearest height",
    ]);
    const out = spline(state, EAST, "wb-road-out");
    assert.ok(out.points.slice(1).every((point) => point.position[1] === out.points[1]!.position[1]));
    assert.equal(spline(state, WEST, "wb-road-main").segments[0]!.paint, undefined);

    const broken = planStage({
      // @ts-expect-error Forge never type-checked its tests: Forge stages carried a generator version, cut with the re-run surface (type-only).
      id: "broken", label: "Broken", version: 1,
      run: () => ({
        placements: [], warnings: [],
        splines: [
          { landscapeId: "nowhere", spline: { id: "a", coordinateSpace: "world", points: [], segments: [] } },
          { landscapeId: WEST, spline: { id: "b", coordinateSpace: "world", points: [{ id: "p", position: [0, 0, 0], width: 0, falloff: 0 }], segments: [] } },
          { landscapeId: WEST, spline: { id: "has space", coordinateSpace: "world", points: [], segments: [] } },
        ],
      }),
    }, input(recipe(), world()));
    assert.deepEqual(broken.errors, [
      'stage output spline a: terrain "nowhere" is not loaded',
      "stage output spline b: invalid landscape.splines[0].points[0].width: 0",
      "stage output splines[2]: id must be an id",
    ]);
  });
}

registerWorldRoadsTests(test as unknown as Parameters<typeof registerWorldRoadsTests>[0]);
