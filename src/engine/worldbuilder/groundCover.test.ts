/**
 * Ground covers (RANDOM_WORLD_PLAN step 4, `engine/worldbuilder/groundCover.ts`):
 * the shipped covers are valid, the `forest` cover builds exactly what the
 * pilot's paint built, and each cover paints and plants what it says.
 */
// Ported from Forge WebGL tests/engine/groundCover.test.ts @ forge-webgl-final (04b5fb23): checks unchanged, run by
// Vitest; 3 check(s) of the old world:brief level output left out. docs/PORT_LOG.md §2.
// Boundary (plan 2b): the shipped covers are data documents of the `worldbuilder`
// content pack; `packJson` reads one by its label and gives its content, where
// Forge read `public/<path>`.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { COVERS, randomWorldBrief, type RandomWorldOptions } from "./randomWorld.ts";
import { COVER_MAX_LAYERS, normalizeGroundCover, type GroundCover } from "./groundCover.ts";
import { normalizeWorldBrief } from "./worldBrief.ts";
import { test } from "vitest";

type Check = (label: string, run: () => void) => void;

const OPTIONS: RandomWorldOptions = {
  id: "cover_test",
  name: "Cover Test",
  seed: 21,
  size: "small",
  landform: "hills",
  mountainHeight: "medium",
  settlements: [{ type: "village" }, { type: "hamlet" }],
  roads: "between",
  rivers: 1,
};

/** The content of a pack's data document, by its asset index label. */
function packJson(label: string): any {
  return JSON.parse(readFileSync(label.replace(/^engine:/, ""), "utf8")).data;
}

function loadCover(file: string): GroundCover {
  const { cover, issues } = normalizeGroundCover(packJson(file));
  assert.deepEqual(issues, [], file);
  return cover!;
}

export function registerGroundCoverTests(check: Check): void {
  check("ground cover: every shipped cover is valid; unknown fields and bad layer names are reported", () => {
    for (const file of Object.values(COVERS)) {
      const cover = loadCover(file);
      assert.ok(cover.layers.length <= COVER_MAX_LAYERS);
      assert.ok(cover.layers.some((layer) => layer.id === cover.roles.road), `${file}: the road layer`);
    }
    const forest = packJson(COVERS.forest);
    const issues = (patch: Record<string, unknown>): string => normalizeGroundCover({ ...structuredClone(forest), ...patch }).issues.join();
    assert.match(issues({ colour: "red" }), /colour: is not a ground cover field/);
    assert.match(issues({ roles: { ...forest.roles, open: "lawn" } }), /roles\.open: must name one of the cover's layers/);
    assert.match(issues({ snow: { quantile: 0.7, minAbove: 10, fade: 5, treeGap: 5 } }), /roles\.snow: is needed with snow/);
    assert.match(issues({ layers: Array.from({ length: 9 }, (_, i) => ({ id: `l${i}`, name: "L", color: "#000000" })) }), /must list 1\.\.8 layers/);
  });

  check("ground cover: a brief names its cover file and densities; the brief rejects anything else", () => {
    const raw = randomWorldBrief({ ...OPTIONS, cover: "farmland", densities: { forest: "low", rocks: "medium", fields: "high" } }).brief;
    const { brief } = normalizeWorldBrief(structuredClone(raw));
    assert.deepEqual(brief!.cover, { file: COVERS.farmland, forest: "low", fields: "high" }, "medium is the default and not written");
    assert.equal(randomWorldBrief(OPTIONS).brief.cover, undefined, "no cover asked: none named");
    const issues = normalizeWorldBrief({ ...structuredClone(raw), cover: { file: "x.json", trees: "high", rocks: "lots" } }).issues.join();
    assert.match(issues, /cover\.file: must be a public-root-relative \*\.cover\.json/);
    assert.match(issues, /cover\.trees: is not a cover field/);
    assert.match(issues, /cover\.rocks: must be one of low, medium, high/);
  });
}

registerGroundCoverTests(test as unknown as Parameters<typeof registerGroundCoverTests>[0]);
