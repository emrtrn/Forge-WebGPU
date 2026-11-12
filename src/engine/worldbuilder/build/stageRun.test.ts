import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "vitest";
import type { LayoutPlacement } from "../../legacy/layout.ts";
import { normalizeTerrainSplines } from "../../terrain/terrainSplineData.ts";
import type { TerrainSpline } from "../../terrain/terrainTypes.ts";
import { createWorldRecipe, type WorldRecipe } from "../recipe.ts";
import { normalizeRegionProfile, type RegionProfile } from "../regionProfile.ts";
import { ROUTE_SPACING } from "../route.ts";
import type { StageInput, StageTerrain, WorldStage } from "../stage.ts";
import { roadsStage } from "../stages/roads.ts";
import { applyStageRun, runStage } from "./stageRun.ts";

const WEST = "terrain-west";
const EAST = "terrain-east";

function profile(): RegionProfile {
  return normalizeRegionProfile(JSON.parse(readFileSync("tests/engine/fixtures/neutral.regionprofile.json", "utf8"))).profile!;
}

/** Forge's roads fixture (tests/engine/worldRoads.test.ts). */
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

function terrains(): StageTerrain[] {
  const terrain = (id: string, min: [number, number], max: [number, number], splines: TerrainSpline[] = []): StageTerrain => ({
    id, min, max, locked: false, splines,
    layers: [{ id: "grass", name: "Grass" }, { id: "asphalt", name: "Asphalt" }, { id: "dirt", name: "Dirt" }],
  });
  const manual: TerrainSpline = {
    id: "spline-1", coordinateSpace: "world",
    points: [{ id: "p0", position: [-10, 0, 0], width: 6, falloff: 3 }, { id: "p1", position: [-5, 0, 0], width: 6, falloff: 3 }],
    segments: [{ id: "s0", startPointId: "p0", endPointId: "p1" }],
  };
  return [terrain(WEST, [-100, -100], [0, 100], [manual]), terrain(EAST, [0, -100], [100, 100])];
}

const sampleHeight = (x: number): number | null => (Math.abs(x) <= 100 ? 10 - x * 0.1 : null);

function input(recipeValue: WorldRecipe, placements: Array<{ assetId: string; placements: LayoutPlacement[] }> = []): StageInput {
  return { recipe: recipeValue, layout: { instances: placements }, profile: profile(), sampleHeight, terrains: terrains() };
}

/** A stage that wants the given placements. */
function stageOf(id: string, wanted: Array<{ assetId: string; placement: LayoutPlacement & { id: string } }>): WorldStage {
  return { id, label: id, run: () => ({ placements: wanted, warnings: [] }) };
}

describe("runStage", () => {
  // Forge's "world roads: each road edge becomes a world-space terrain spline with profile
  // width, mesh and paint" (tests/engine/worldRoads.test.ts), dropped with the Stage Runner
  // (option B, D) and rewritten for the run-once runner: the same splines and values; the
  // provenance is `recipe.generatedBy` (stage, edge) without hashes or generator versions.
  test("world roads: each road edge becomes a world-space terrain spline with profile width, mesh and paint", () => {
    const run = runStage(roadsStage, input(recipe()));
    assert.deepEqual(run.errors, []);
    assert.deepEqual(run.warnings, ["track roads have no meshAsset in the region profile; their splines carry no mesh"]);
    assert.deepEqual(run.splines.map(({ spline }) => spline.id), ["wb-road-main", "wb-road-spur"]);
    assert.deepEqual(run.splines.map(({ landscapeId }) => landscapeId), [WEST, WEST]);
    assert.deepEqual(run.placements, []);
    assert.deepEqual(run.blocked, []);

    const main = run.splines[0]!.spline;
    assert.equal(main.coordinateSpace, "world");
    assert.equal(main.name, "main");
    assert.equal(main.smooth, true);
    assert.deepEqual(main.points.map((point) => point.position), [[-80, 18, 0], [-70, 17, 0], [-60, 16, 0]]);
    assert.ok(main.points.every((point) => point.width === 9 && point.falloff === 3), "collector: 7 m + 2 × 1 m shoulder");
    assert.deepEqual(main.segments[0], {
      id: "s0", startPointId: "p0", endPointId: "p1",
      deform: { enabled: true, raiseTerrain: true, lowerTerrain: true, flatten: true },
      paint: { enabled: true, layerId: "asphalt", strength: 1 },
      mesh: { enabled: true, assetId: "mesh:road-asphalt", alignToTerrain: true, deform: true, collision: true },
    });

    const spur = run.splines[1]!.spline;
    assert.deepEqual(spur.points.map((point) => [point.position[0], point.position[2]]).slice(0, 3), [[-60, 0], [-55, 5], [-50, 10]],
      "guide points are kept as vertices; each leg is split into runs of at most ROUTE_SPACING");
    assert.ok(spur.points.every((point, index) => index === 0
      || Math.hypot(point.position[0] - spur.points[index - 1]!.position[0], point.position[2] - spur.points[index - 1]!.position[2]) <= ROUTE_SPACING));
    assert.deepEqual(spur.segments[0]!.paint, { enabled: true, layerId: "dirt", strength: 1 });
    assert.equal(spur.segments[0]!.mesh, undefined);

    assert.deepEqual(run.recipeAfter.generatedBy.splines, {
      "wb-road-main": { stage: "roads", edge: "main" },
      "wb-road-spur": { stage: "roads", edge: "spur" },
    });
    assert.deepEqual(run.recipeAfter.generatedBy.placements, {});
    assert.deepEqual(run.recipeAfter.generation.stages, ["roads"]);
    assert.deepEqual(normalizeTerrainSplines([main]), [main], "stage output is save-canonical");
  });

  test("placements are validated, rounded as the save rounds them, and recorded; an id already in the level is not written", () => {
    const wanted = [
      { assetId: "shape:cube", placement: { id: "a", role: "prop.bench", position: [1.23456, 2, 3] as [number, number, number], rotation: [0, 12.34, 0] as [number, number, number], scale: 1.23456 } },
      { assetId: "shape:cube", placement: { id: "taken", position: [0, 0, 0] as [number, number, number] } },
    ];
    const level = [{ assetId: "mesh-x", placements: [{ id: "taken", position: [9, 9, 9] as [number, number, number] }] }];
    const run = runStage(stageOf("benches", wanted), input(recipe(), level));
    assert.deepEqual(run.errors, []);
    assert.deepEqual(run.blocked, ["taken"]);
    assert.deepEqual(run.placements, [{ assetId: "shape:cube", placement: { id: "a", role: "prop.bench", position: [1.235, 2, 3], rotation: [0, 12.3, 0], scale: 1.235 } }]);
    assert.deepEqual(run.recipeAfter.generatedBy.placements, { a: { stage: "benches" } });
    const layout = { instances: structuredClone(level) };
    applyStageRun(layout, run);
    assert.deepEqual(layout.instances.map((group) => [group.assetId, group.placements.map((placement) => placement.id)]), [["mesh-x", ["taken"]], ["shape:cube", ["a"]]]);
  });

  test("bad output is an error, not a partial apply", () => {
    const at: [number, number, number] = [0, 0, 0];
    const errors = (wanted: Parameters<typeof stageOf>[1], id = "bad") => runStage(stageOf(id, wanted), input(recipe())).errors;
    assert.deepEqual(errors([{ assetId: "x", placement: { id: "a b", position: at } }]), ["stage output placements[0]: id must be an id"]);
    assert.deepEqual(errors([{ assetId: "", placement: { id: "a", position: at } }]), ["stage output a: assetId must be a non-empty string"]);
    assert.deepEqual(errors([{ assetId: "x", placement: { id: "a", role: "Bench", position: at } }]), ["stage output a: role must be a semantic role"]);
    assert.deepEqual(errors([{ assetId: "x", placement: { id: "a", position: at } }, { assetId: "x", placement: { id: "a", position: at } }]), ['stage output repeats id "a"']);
    assert.deepEqual(errors([{ assetId: "x", placement: { id: "a", position: [0, Number.NaN, 0] } }]), ["stage output a: position must be three finite numbers"]);
    assert.deepEqual(errors([], "Not A Token"), ['stage id "Not A Token" must be a token']);
  });
});
