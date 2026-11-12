/**
 * World Builder F1, step 2: the `<Level>.worldrecipe.json` schema (plan v0.4
 * §6.3, §13.4). The normalizer is the single source of field shape; the save
 * validator reuses it and rejects anything the normalizer had to correct.
 */
// Ported from Forge WebGL tests/engine/worldRecipe.test.ts @ forge-webgl-final (04b5fb23): checks unchanged, run by
// Vitest; 6 check(s) not yet portable left out. docs/PORT_LOG.md §2.
import assert from "node:assert/strict";
import { createWorldRecipe, normalizeWorldRecipe } from "./recipe.ts";
import { referenceBounds, referenceToWorld, worldToReference } from "./reference.ts";
import { test } from "vitest";


type Check = (label: string, fn: () => void) => void;

/** Exercises every recipe field. Extend it whenever the schema grows. */
function maximalRecipe(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    recipeId: "mountain_delivery_demo",
    seed: 42017,
    generators: { roads: 1, settlement: 2 },
    reference: { image: "references/valley.png", origin: [-256, -256], size: [512, 512], view: "topDown" },
    regionProfile: "regions/test.regionprofile.json",
    plan: {
      regions: [{ id: "ridge", source: "reference", observed: true, confidence: 0.8, kind: "mountain", polygon: [[0, 0], [100, 0], [50, 80]] }],
      water: [
        { id: "river_01", source: "reference", observed: false, confidence: 0.4, kind: "river", path: [[-200, 0], [200, 10]], width: 9 },
        { id: "lake_01", source: "manual", kind: "lake", polygon: [[10, 10], [30, 10], [20, 30]] },
      ],
      landmarks: [{ id: "depot_01", source: "manual", kind: "logistics.depot", position: [-120, 40], settlement: "village_01" }],
      settlements: [{
        id: "village_01", source: "reference", observed: true, confidence: 0.7,
        center: [312.5, 148.25], radius: 180, boundary: [[250, 100], [380, 100], [380, 200], [250, 200]],
        type: "village", population: 220, economy: ["livestock", "timber"],
        regionProfile: "regions/alpine.regionprofile.json",
        program: { add: [{ role: "building.transport.depot", count: 1, siting: "entrance" }], remove: ["building.civic.school"] },
        seed: 7, protected: true,
      }],
      roadGraph: {
        nodes: [
          { id: "n1", source: "osm", position: [40, 10], kind: "end" },
          { id: "n2", source: "generated", position: [300, 150], kind: "gate", settlement: "village_01" },
        ],
        edges: [{ id: "e1", source: "reference", confidence: 0.6, from: "n1", to: "n2", roadClass: "collector", guide: [[40, 10], [180, 90], [300, 150]] }],
      },
    },
    generated: {
      sites: [{
        settlement: "village_01", center: [318, 152.5], coreRadius: 160,
        core: [[200, 100], [460, 110.5], [450, 210], [190, 190]],
        score: 0.812, dwellings: 74,
        program: [
          { role: "open.square", count: 1, siting: "center", source: "profile" },
          { role: "building.transport.depot", count: 1, siting: "entrance", source: "recipe" },
        ],
      }],
      parcels: [{
        id: "village_01.p1", settlement: "village_01", polygon: [[300, 120], [320, 120], [320, 140], [300, 140]],
        frontage: "e1", landUse: "residential", role: "building.residential.detached", placement: "plc-house-1",
      }, {
        id: "village_01.p2", settlement: "village_01", polygon: [[320, 120], [340, 120], [340, 140], [320, 140]],
        frontage: "e1", landUse: "residential", partOf: "village_01.p1",
      }],
      pads: [
        { id: "plc-house-1", settlement: "village_01", polygon: [[302, 124], [318, 124], [318, 138], [302, 138]], height: 41.25 },
        {
          id: "plc-square-terrace-1", settlement: "village_01", polygon: [[302, 140], [318, 140], [318, 150], [302, 150]], height: 43.5,
          building: "plc-house-1", falloff: 1,
          walls: [{ from: [302, 150.3], to: [318, 150.3], bottom: 43.1, top: 45.2 }],
          stairs: [{ foot: [310, 146.2], head: [310, 140], width: 2.5, low: 41.25, high: 43.5 }],
        },
      ],
    },
    generation: { preserveManualOverrides: false, stages: ["roads", "settlement"] },
    ownership: {
      placements: { "plc-house-1": { stage: "settlement", inputHash: "9f3a", outputHash: "0b7e" } },
      splines: { "road-e1": { stage: "roads", inputHash: "0c", edge: "e1" } },
      foliageRules: { "rule-meadow": { stage: "scatter" } },
      protectedRegions: [{ id: "manual_corner", kind: "manual", min: [0, 0], max: [64, 64] }],
      deletedPlanElements: [{ kind: "water", id: "deleted_creek" }, { kind: "edge", id: "deleted_road" }],
    },
  };
}

function issuesOf(recipe: Record<string, unknown>): string[] {
  return normalizeWorldRecipe(recipe).issues;
}

export function registerWorldRecipeTests(check: Check): void {
  check("world recipe: a reference maps image points to the world, top-left at its origin, down = +Z (WB-13)", () => {
    const reference = { origin: [-200, -100] as [number, number], size: [400, 200] as [number, number] };
    assert.deepEqual(referenceToWorld(reference, [0, 0]), [-200, -100]);
    assert.deepEqual(referenceToWorld(reference, [1, 1]), [200, 100]);
    assert.deepEqual(referenceToWorld(reference, [0.25, 0.5]), [-100, 0]);
    assert.deepEqual(worldToReference(reference, [-100, 0]), [0.25, 0.5]);
    assert.deepEqual(worldToReference(reference, [300, -150]), [1.25, -0.25], "off the image is outside 0..1");
    assert.deepEqual(referenceBounds(reference), { min: [-200, -100], max: [200, 100] });
  });

  check("world recipe: an empty recipe is canonical and issue-free", () => {
    const empty = createWorldRecipe("demo", 3);
    const { recipe, issues } = normalizeWorldRecipe(JSON.parse(JSON.stringify(empty)));
    assert.deepEqual(issues, []);
    assert.deepEqual(recipe, empty);
    assert.deepEqual(normalizeWorldRecipe({ schemaVersion: 1, recipeId: "demo" }).recipe, createWorldRecipe("demo"));
  });

  check("world recipe: plan elements default to manual provenance; coordinates round like layouts", () => {
    const { recipe } = normalizeWorldRecipe({
      schemaVersion: 1, recipeId: "demo",
      plan: { settlements: [{ id: "s", center: [1.23456, -7.0004], type: "hamlet" }] },
    });
    assert.deepEqual(recipe!.plan.settlements[0], { id: "s", source: "manual", center: [1.235, -7], type: "hamlet" });
  });

  check("world recipe: not-a-recipe documents normalize to null", () => {
    assert.equal(normalizeWorldRecipe(null).recipe, null);
    assert.equal(normalizeWorldRecipe({ schemaVersion: 2, recipeId: "demo" }).recipe, null);
    assert.equal(normalizeWorldRecipe({ schemaVersion: 1, recipeId: "has space" }).recipe, null);
  });

}

registerWorldRecipeTests(test as unknown as Parameters<typeof registerWorldRecipeTests>[0]);
