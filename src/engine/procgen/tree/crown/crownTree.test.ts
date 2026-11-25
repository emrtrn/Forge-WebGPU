import assert from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "vitest";
import type { JsonObject } from "../../../../core/index.ts";
import { validateMesh } from "../../mesh.ts";
import { bakeSprayAtlas } from "../../texture/sprayTexture.ts";
import { generateTree, type TreeResult } from "../treeGenerator.ts";
import { treePrototypeRecipe } from "../treeRecipe.ts";
import { CROWN_TRIANGLE_CAPS, normalizeCrownParams, SHRUB_TRIANGLE_CAPS, SPRAY_COVERAGE, type LeafShape } from "./crownParams.ts";
import { buildCrown } from "./crownTree.ts";

const recipe = (name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(new URL(`../../../../../content/packs/starter/procgen/trees/${name}.treerecipe.json`, import.meta.url), "utf8")) as Record<string, unknown>;

function grown(input: Record<string, unknown>, options?: Parameters<typeof generateTree>[1]): Extract<TreeResult, { ok: true }> {
  const result = generateTree(input, options);
  if (!result.ok) assert.fail(result.report.message);
  return result;
}

for (const name of ["Broadleaf", "Maple", "Birch", "Oak", "Poplar", "Pine", "Conifer", "Hazel"]) {
  test(`${name}: every LOD carries a closed crown's leaf area inside its triangle cap`, () => {
    const caps = recipe(name).habit === "shrub" ? SHRUB_TRIANGLE_CAPS : CROWN_TRIANGLE_CAPS;
    for (const seed of [1, 2, 3, 40, 41]) {
      const tree = grown({ ...recipe(name), seed }), { leafArea, referenceArea } = tree.crown;
      assert.equal(tree.lods.length, 3);
      tree.lods.forEach(({ wood, leaves }, lod) => {
        assert.ok(tree.stats[lod]!.triangles <= caps[lod]!, `seed ${seed} LOD${lod}: ${tree.stats[lod]!.triangles} triangles`);
        // PG2-PG3 measured triangles and milliseconds and shipped crowns of 0.08-0.57: the floor is a gate.
        assert.ok(leafArea[lod]! / referenceArea >= 4, `seed ${seed} LOD${lod}: leaf area index ${leafArea[lod]! / referenceArea}`);
        assert.ok(Math.abs(leafArea[lod]! / leafArea[0]! - 1) <= 0.2, `seed ${seed} LOD${lod}: ${leafArea[lod]! / leafArea[0]!} of LOD0's leaf area`);
        assert.ok(leaves);
        for (const mesh of [wood, leaves]) {
          assert.deepStrictEqual(validateMesh(mesh), []);
          const count = mesh.positions.length / 3;
          assert.equal(mesh.attributes.wind.length, count * 4);
          const leaf = mesh.attributes.leaf;
          assert.equal(leaf.length, count * 2);
          assert.ok(leaf.every((value) => value >= 0 && value <= 1));
        }
      });
    }
  });
}

for (const name of ["Broadleaf", "Maple", "Birch", "Oak", "Poplar", "Pine", "Conifer"]) {
  test(`${name}: its young trees hold a leafy crown in every LOD with a fraction of the triangles`, () => {
    const data = recipe(name) as unknown as JsonObject, young = (data.young as { variants: number[] }).variants;
    const mature = grown(treePrototypeRecipe(data, { seed: 1, young: false }));
    assert.ok(young.length > 0);
    for (const seed of [...young, 1, 2, 3, 40, 41]) {
      const tree = grown(treePrototypeRecipe(data, { seed, young: true })), { leafArea, referenceArea } = tree.crown;
      assert.ok(tree.height < mature.height * 0.55 && tree.stats[0]!.triangles < mature.stats[0]!.triangles * 0.75, `${tree.height} m, ${tree.stats[0]!.triangles} triangles`);
      tree.lods.forEach((_, lod) => {
        assert.ok(tree.stats[lod]!.triangles <= CROWN_TRIANGLE_CAPS[lod]!);
        assert.ok(leafArea[lod]! / referenceArea >= 4, `seed ${seed} LOD${lod}: leaf area index ${leafArea[lod]! / referenceArea}`);
        assert.ok(Math.abs(leafArea[lod]! / leafArea[0]! - 1) <= 0.2, `seed ${seed} LOD${lod}: ${leafArea[lod]! / leafArea[0]!} of LOD0's leaf area`);
      });
    }
  });
}

test("the same recipe and seed give the same bytes; another seed another tree", () => {
  const input = { ...recipe("Broadleaf"), seed: 9 };
  assert.deepStrictEqual(grown(input), grown(input));
  assert.notDeepStrictEqual(grown(input).lods[0]!.wood.positions, grown({ ...input, seed: 10 }).lods[0]!.wood.positions);
});

test("a coarse LOD keeps sprays of the finer one, so leaves shed and the crown stands at the same places", () => {
  const tree = grown({ ...recipe("Broadleaf"), seed: 2 });
  const shed = tree.lods.map((lod) => new Set(lod.leaves!.attributes.leaf.filter((_, i) => i % 2 === 0)));
  for (let lod = 1; lod < shed.length; lod++) for (const value of shed[lod]!) assert.ok(shed[lod - 1]!.has(value));
  // Grown cards fill inward: the crown does not swell.
  for (let lod = 1; lod < tree.stats.length; lod++) for (const axis of [0, 1, 2]) {
    const fine = tree.stats[0]!.leaves!.bounds, coarse = tree.stats[lod]!.leaves!.bounds;
    assert.ok(coarse.max[axis]! - coarse.min[axis]! <= (fine.max[axis]! - fine.min[axis]!) * 1.15);
  }
});

test("age, width, fullness and crown start change what they name", () => {
  const broad = (growth: Record<string, number>, extra: Record<string, unknown> = {}) =>
    grown({ ...recipe("Broadleaf"), ...extra, seed: 3, growth: { ...(recipe("Broadleaf").growth as object), ...growth } });
  const mature = broad({});
  const young = broad({ age: 10 });
  assert.ok(young.height < mature.height * 0.65 && young.sprays < mature.sprays);
  assert.ok(young.crown.leafArea[0]! / young.crown.referenceArea >= 4, "a young tree is leafy too");
  assert.ok(broad({ width: 0.35 }).crown.radius < mature.crown.radius * 0.6);
  assert.ok(broad({ fullness: 0.2 }).crown.leafArea[0]! < mature.crown.leafArea[0]! * 0.75);
  const low = broad({}, { crownStart: 0.15 }), high = broad({}, { crownStart: 0.5 });
  assert.ok(high.stats[0]!.leaves!.bounds.min[1] > low.stats[0]!.leaves!.bounds.min[1] + 1.5);
});

test("droop hangs the thin wood, clumping opens the outline, and a shrub's main stems leave the ground apart", () => {
  const broad = (growth: Record<string, number>) => buildCrown(normalizeCrownParams({ ...recipe("Broadleaf"), seed: 5, growth: { ...(recipe("Broadleaf").growth as object), ...growth } }));
  const stemsOf = (tree: ReturnType<typeof buildCrown>) => { assert.ok(!("error" in tree)); return tree.skeleton.stems; };
  /** How far the twigs end below where they start, on average. */
  const fall = (tree: ReturnType<typeof buildCrown>) => {
    const twigs = stemsOf(tree).filter((stem) => stem.level >= 2);
    return twigs.reduce((sum, stem) => sum + stem.points[0]![1] - stem.points.at(-1)![1], 0) / twigs.length;
  };
  assert.ok(fall(broad({ droop: 0.8 })) > fall(broad({})) + 0.2 && fall(broad({ droop: -0.8 })) < fall(broad({})) - 0.05);
  const spread = (tree: ReturnType<typeof buildCrown>) => {
    const reach = stemsOf(tree).map((stem) => Math.hypot(stem.points.at(-1)![0], stem.points.at(-1)![2]));
    return Math.max(...reach);
  };
  assert.ok(spread(broad({ clumping: 1 })) > spread(broad({ clumping: 0 })));
  const shrub = stemsOf(buildCrown(normalizeCrownParams({ ...recipe("Hazel"), seed: 1 }))), main = shrub.filter((stem) => stem.parent < 0);
  assert.equal(main.length, (recipe("Hazel").shrub as { stemCount: number }).stemCount);
  for (const stem of main) {
    assert.ok(Math.abs(stem.points[0]![1]) < 1e-9);
    for (const other of main) if (other !== stem) assert.ok(Math.hypot(stem.points[0]![0] - other.points[0]![0], stem.points[0]![2] - other.points[0]![2]) > 0.02);
  }
});

test("thin wood takes the twig tint, the trunk does not", () => {
  const { wood } = grown({ ...recipe("Birch"), seed: 1 }).lods[0]!, share = wood.attributes.leaf.filter((_, i) => i % 2 === 0);
  assert.equal(share[0], 0);
  assert.ok(share.some((value) => value === 1));
  assert.ok(grown({ ...recipe("Birch"), seed: 1, bark: { twigRadius: 0 } }).lods[0]!.wood.attributes.leaf.every((value, i) => i % 2 === 1 || value === 0));
});

test("the crown is dark inside and open outside, and its normals point out", () => {
  const tree = buildCrown(normalizeCrownParams({ ...recipe("Broadleaf"), seed: 1 }));
  assert.ok(!("error" in tree));
  const { center, radius } = tree.skeleton;
  const core = tree.lightAt(center), east = tree.lightAt([center[0] + radius[0] * 1.02, center[1], center[2]]);
  assert.ok(core.light < 0.6 && east.light > 0.85, `core ${core.light}, outside ${east.light}`);
  assert.ok(east.normal[0] > 0.5);
  assert.ok(tree.lightAt([0, 0.5, 0]).light > 0.5, "the trunk below the crown is not in its core");
});

test("leaf cards shrink in number, not in area, to fit a cap; wood over a cap is reported", () => {
  const input = { ...recipe("Broadleaf"), seed: 1 }, free = grown(input), tight = grown(input, { triangleCaps: [20000, 5000, 800] });
  assert.ok(tight.stats[0]!.triangles <= 20000 && tight.stats[0]!.leaves!.triangles < free.stats[0]!.leaves!.triangles);
  assert.ok(Math.abs(tight.crown.leafArea[0]! / free.crown.leafArea[0]! - 1) < 0.1);
  const over = generateTree(input, { triangleCaps: [1000, 5000, 800] });
  assert.ok(!over.ok && over.report.code === "budget" && over.report.lod === 0);
  assert.match(over.report.message, /wood triangles; cap is 1000$/);
});

test("the wood sways with no step at a joint: a branch starts with its parent's weight and its limb's phase", () => {
  const tree = buildCrown(normalizeCrownParams({ ...recipe("Broadleaf"), seed: 1 }));
  assert.ok(!("error" in tree));
  const { stems } = tree.skeleton;
  for (const [index, stem] of stems.entries()) {
    if (stem.parent < 0) continue;
    assert.ok(stem.parent < index);
    assert.equal(stem.limb, stems[stem.parent]!.parent < 0 ? index : stems[stem.parent]!.limb);
    assert.ok(stems[stem.parent]!.points.some((point) => point.every((value, k) => value === stem.points[0]![k])), "a branch starts on its parent");
  }
});

test("spray tiles cover what the leaf area counts with, whatever the leaf, and stay inside their tile", () => {
  for (const leafShape of ["ovate", "lobed", "palmate", "needle"] as LeafShape[]) {
    const params = normalizeCrownParams({ spray: { leafShape, textureSize: 256, leafLength: leafShape === "needle" ? 0.024 : 0.09, leafWidth: leafShape === "needle" ? 0.1 : 0.65, length: 0.65 } }).spray;
    const atlas = bakeSprayAtlas(params, 5);
    assert.equal(atlas.size, 512);
    for (const coverage of atlas.coverage) assert.ok(Math.abs(coverage - SPRAY_COVERAGE) < 0.05, `${leafShape}: ${coverage}`);
    // Nothing is cut at a tile's outer edge (its twig enters at the left).
    for (let tile = 0; tile < 4; tile++) for (let i = 0; i < 256; i++) {
      const x0 = (tile % 2) * 256, y0 = Math.floor(tile / 2) * 256;
      for (const [x, y] of [[255, i], [i, 0], [i, 255]] as const) assert.ok(atlas.rgba[((y0 + y) * 512 + x0 + x) * 4 + 3]! < 102, `${leafShape} tile ${tile}`);
    }
    assert.deepStrictEqual(atlas.rgba, bakeSprayAtlas(params, 5).rgba);
  }
});
