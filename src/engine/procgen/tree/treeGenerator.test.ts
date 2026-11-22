import assert from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "vitest";
import { validateMesh } from "../mesh.ts";
import { hashString } from "../random.ts";
import { generateTree } from "./treeGenerator.ts";
import type { TreeResult } from "./treeGenerator.ts";
import { meshTree } from "./treeMesh.ts";
import { normalizeTreeParams, SHRUB_TRIANGLE_CAPS, TREE_PRESETS } from "./treeParams.ts";
import type { TreeParams } from "./treeParams.ts";
import { buildTreeSkeleton } from "./treeSkeleton.ts";
import { recipeTreeStructure, treeOutputVersion } from "./treeGrowth.ts";

test("recipe versions pin historical geometry; growth changes proportions at a fixed seed", () => {
  for (const version of [undefined, 1, 2, 3]) {
    const { params, skeleton } = recipeTreeStructure({ seed: 2, generatorVersion: version, growth: { age: 1 } });
    assert.equal(treeOutputVersion(version), 3);
    assert.deepEqual(skeleton, buildTreeSkeleton(params));
  }
  assert.throws(() => treeOutputVersion(6), /Unsupported/);
  const shape = (age: number, width: number, seed = 7) => {
    const result = recipeTreeStructure({ generatorVersion: 4, seed, growth: { age, width } });
    if ("error" in result.skeleton) assert.fail(result.skeleton.error);
    const stems = result.skeleton.stems;
    const radius = Math.max(...stems.flatMap(stem => stem.points.map(([x, , z]) => Math.hypot(x, z))));
    return { height: result.params.height, diameter: stems[0]!.radii[0]! * 2, stems: stems.length, radius };
  };
  const young = shape(12, 1), mature = shape(60, 1);
  assert.ok(young.height < mature.height && young.stems < mature.stems);
  assert.ok(young.diameter / young.height < mature.diameter / mature.height);
  assert.ok(shape(60, 0.28).radius < mature.radius * 0.6);
  assert.deepEqual(mature, shape(60, 1));
  assert.notEqual(mature.radius, shape(60, 1, 8).radius);
});

function success(result: TreeResult): Extract<TreeResult, { ok: true }> {
  if (!result.ok) assert.fail(result.report.message);
  return result;
}

function skeleton(params: TreeParams) {
  const result = buildTreeSkeleton(params);
  if ("error" in result) assert.fail(result.error);
  return result;
}

test("the starter shrub grows independent ground stems and stays within all three LOD budgets", () => {
  const preset = JSON.parse(readFileSync(new URL("../../../../content/packs/starter/procgen/trees/Hazel.treerecipe.json", import.meta.url), "utf8"));
  const roots = (seed: number, stemCount: number, spread: number) => {
    const { params } = recipeTreeStructure({ ...preset, seed, shrub: { stemCount, spread } });
    const { stems } = skeleton(params);
    for (const [index, stem] of stems.entries()) {
      if (stem.parent < 0) assert.equal(stem.level, 0);
      else assert.ok(stem.parent < index && stems[stem.parent]!.level === stem.level - 1);
    }
    return stems.filter(stem => stem.parent < 0);
  };
  const narrow = roots(1, 6, 0.25), wide = roots(1, 6, 0.78);
  const reach = (stems: typeof wide) => Math.max(...stems.map(stem => {
    const [x, , z] = stem.points.at(-1)!;
    return Math.hypot(x, z);
  }));
  assert.equal(narrow.length, 6);
  assert.equal(roots(1, 5, 0.62).length, 5);
  assert.equal(new Set(wide.map(stem => stem.points[0]!.join())).size, 6);
  assert.ok(wide.every(stem => stem.points[0]![1] < 0 && stem.points[0]![1] > -0.1));
  assert.ok(reach(wide) > 2 * reach(narrow));
  assert.deepStrictEqual(wide, roots(1, 6, 0.78));
  assert.notDeepStrictEqual(wide, roots(2, 6, 0.78));
  for (const seed of [1, 2, 3]) {
    const result = success(generateTree({ ...preset, seed, shrub: { stemCount: 8, spread: 1.2 } }));
    assert.equal(result.lods.length, 3);
    for (const [index, { wood, leaves }] of result.lods.entries()) {
      assert.ok(leaves && result.stats[index]!.triangles <= SHRUB_TRIANGLE_CAPS[index]!);
      assert.deepStrictEqual(validateMesh(wood), []);
      assert.deepStrictEqual(validateMesh(leaves), []);
    }
  }
});

test("normalization uses habit defaults, clamps fields and drops invalid entries", () => {
  const raw = {
    habit: "conifer", seed: -1.2, height: 0, trunkRadius: Infinity, taper: 2, flare: -0.1,
    levels: [null, { count: 99.7, angle: -20, angleVariation: 90, lengthRatio: 0, start: 8, radiusRatio: 0, bend: -2, wobble: 5 }],
    leaves: { perStem: 2.9, size: [undefined, 0.25], cards: 9 },
    lods: [false, { radialSegments: 80, ringsPerMeter: 42, minRadius: 2, leafFraction: -1 }, {}],
  };
  const params = normalizeTreeParams(raw);
  assert.deepStrictEqual(params, {
    ...TREE_PRESETS.conifer,
    seed: 4294967295, height: 1, taper: 1, flare: 0,
    levels: [{ count: 64, angle: 0, angleVariation: 60, lengthRatio: 0.05, start: 1, radiusRatio: 0.1, bend: -1, wobble: 1 }],
    leaves: { perStem: 2, size: [0.5, 0.25], cards: 4, clusters: 12 },
    lods: [{ radialSegments: 32, ringsPerMeter: 16, minRadius: 0.5, leafFraction: 0, clusterCards: false }, TREE_PRESETS.conifer.lods[1]],
  });
  assert.deepStrictEqual(normalizeTreeParams({ levels: [null], lods: [] }), TREE_PRESETS.broadleaf);
  params.lods[1]!.leafFraction = 0;
  assert.ok(TREE_PRESETS.conifer.lods[1]!.leafFraction > 0);
});

test("generation is byte-deterministic across the LOD chain", () => {
  const params = { seed: 301, habit: "conifer" };
  const first = success(generateTree(params)), second = success(generateTree(params));
  assert.deepStrictEqual(first, second);
});

test("two-sided branch-tip material keeps the same fronts and budgets only their triangles", () => {
  const recipe = (leafCards: string) => ({
    seed: 7, levels: [{ count: 5 }], leaves: { perStem: 2, cards: 2 },
    lods: [{ leafCards, leafFraction: 1 }],
  });
  const explicit = success(generateTree(recipe("clusters")));
  const original = explicit.lods[0]!.leaves!;
  const cap = explicit.stats[0]!.wood.triangles + original.indices.length / 6;
  const compact = success(generateTree(recipe("clustersMaterialBackfaces"), { triangleCaps: [cap] }));
  const leaves = compact.lods[0]!.leaves!;
  assert.equal(compact.stats[0]!.triangles, cap);
  assert.equal(leaves.positions.length * 2, original.positions.length);
  assert.deepEqual(compact.lods[0]!.wood, explicit.lods[0]!.wood);
  for (let i = 0; i < leaves.positions.length; i += 12) {
    assert.deepEqual(leaves.positions.slice(i, i + 12), original.positions.slice(2 * i, 2 * i + 12));
  }
  assert.equal(generateTree(recipe("clusters"), { triangleCaps: [cap] }).ok, false);
});

test("changing secondary branch counts preserves the trunk and primary branches", () => {
  const params = normalizeTreeParams({ seed: 770 });
  const first = skeleton(params).stems;
  params.levels[1]!.count += 1;
  const second = skeleton(params).stems;
  assert.ok(second.length > first.length);
  assert.deepStrictEqual(first.filter(stem => stem.level <= 1), second.filter(stem => stem.level <= 1));
});

for (const params of Object.values(TREE_PRESETS)) {
  test(`${params.habit} preset has valid meshes, shape, stable leaf hashes and bounded cost`, () => {
    const start = performance.now();
    const result = success(generateTree(params));
    const elapsed = performance.now() - start;
    assert.ok(elapsed < 1500, `Generation took ${elapsed} ms`);
    assert.equal(result.lods.length, 3);

    for (const [index, { wood, leaves }] of result.lods.entries()) {
      const stats = result.stats[index]!;
      assert.ok(leaves && stats.leaves);
      assert.ok(stats.triangles <= [20000, 5000, 800][index]!);
      const minY = Math.min(stats.wood.bounds.min[1], stats.leaves.bounds.min[1]);
      const maxY = Math.max(stats.wood.bounds.max[1], stats.leaves.bounds.max[1]);
      assert.ok(Math.abs((maxY - minY) / params.height - 1) <= 0.15);
      assert.deepStrictEqual(validateMesh(wood), []);
      assert.deepStrictEqual(validateMesh(leaves), []);
      for (const mesh of [wood, leaves]) {
        assert.equal(mesh.uvs.length, mesh.positions.length / 3 * 2);
        assert.equal(mesh.attributes.wind.length, mesh.positions.length / 3 * 4);
      }
      assert.equal(leaves.attributes.leaf?.length, leaves.positions.length / 3 * 2);

      if (params.habit === "broadleaf") {
        assert.ok(stats.leaves.bounds.min[1] > params.crownStart * params.height);
      } else {
        let widest = 0, widestY = 0;
        for (const mesh of [wood, leaves]) for (let i = 0; i < mesh.positions.length; i += 3) {
          const radius = Math.hypot(mesh.positions[i]!, mesh.positions[i + 2]!);
          if (radius > widest) {
            widest = radius;
            widestY = mesh.positions[i + 1]!;
          }
        }
        assert.ok(widestY < params.height / 2);
      }
    }

    const shedding = result.lods.map(lod => lod.leaves!.attributes.leaf!.filter((_, i) => i % 2 === 0));
    const thresholds = new Set(shedding[0]!);
    assert.ok(thresholds.size > new Set(shedding[1]!).size);
    // Leaf-card LODs keep LOD0's cluster thresholds; a branch-tip card falls at the mean of its twig's clusters.
    for (const [i, coarse] of shedding.slice(1).entries()) {
      if (params.lods[i + 1]!.clusterCards) assert.ok(coarse.every(value => value > 0 && value < 1));
      else assert.ok(coarse.every(value => thresholds.has(value)));
    }
  });
}

test("conifer primary branches form progressively shorter whorls", () => {
  const params = normalizeTreeParams({ habit: "conifer", irregularity: 0 });
  const { stems } = skeleton(params);
  assert.equal(stems[0]!.points.at(-1)![1], params.height);
  const branches = stems.filter(stem => stem.level === 1);
  for (let i = 0; i < branches.length; i += 4) {
    assert.ok(branches.slice(i, i + 4).every(stem => stem.attach === branches[i]!.attach));
    if (i) assert.ok(branches[i]!.length < branches[i - 4]!.length);
  }
});

test("a straight trunk has exact untwisted frames, a duplicated UV seam and increasing wind weight", () => {
  const params = normalizeTreeParams({
    height: 4, trunkRadius: 0.3, flare: 0, irregularity: 0,
    levels: [{ count: 0, bend: 0, wobble: 0 }], leaves: { perStem: 0 },
    lods: [{ radialSegments: 8, ringsPerMeter: 2 }],
  });
  const { wood, leaves } = meshTree(params, skeleton(params), params.lods[0]!);
  assert.equal(leaves, null);
  const stride = 9, rings = 9;
  assert.equal(wood.positions.length / 3, stride * rings + 1);
  const weights = wood.attributes.wind;
  for (let ring = 0; ring < rings; ring++) {
    const first = ring * stride, last = first + stride - 1;
    assert.deepStrictEqual(wood.normals.slice(first * 3, (last + 1) * 3), wood.normals.slice(0, stride * 3));
    assert.deepStrictEqual(wood.positions.slice(first * 3, first * 3 + 3), wood.positions.slice(last * 3, last * 3 + 3));
    assert.equal(wood.uvs[first * 2], 0);
    assert.equal(wood.uvs[last * 2], 1);
    const arc = ring / (rings - 1) * params.height;
    assert.equal(wood.uvs[first * 2 + 1], Math.fround(arc / (2 * Math.PI * params.trunkRadius)));
    if (ring > 0) assert.ok(weights[first * 4]! > weights[(first - stride) * 4]!);
  }
  for (let i = 0; i < weights.length; i += 4) {
    const height = wood.positions[i / 4 * 3 + 1]!;
    assert.equal(weights[i], Math.fround((height / params.height) ** 2));
    assert.equal(weights[i + 1], 0);
    assert.equal(weights[i + 3], 0);
  }
  assert.equal(wood.indices.filter(index => index === stride * rings).length, stride - 1);
});

test("pruned terminal clusters keep their phase and identity at the pruned branch attachment", () => {
  const params = normalizeTreeParams({
    height: 5, irregularity: 0, trunkRadius: 0.4, flare: 0,
    levels: [{ count: 1, radiusRatio: 0.2 }, { count: 1 }],
    leaves: { perStem: 1, cards: 1 },
    lods: [{ minRadius: 0, leafFraction: 1 }, { minRadius: 0.2, leafFraction: 1 }, { minRadius: 0.5 }],
  });
  const tree = skeleton(params);
  const [fine, coarse, empty] = params.lods.map(lod => meshTree(params, tree, lod));
  assert.ok(fine?.leaves && coarse?.leaves && empty);
  assert.equal(empty.wood.indices.length, 0);
  assert.equal(empty.leaves, null);
  const phase = Math.fround(hashString("0") / 4294967296);
  assert.ok(coarse.wood.attributes.wind.every((value, i) => i % 4 !== 2 || value === phase));
  assert.deepStrictEqual(fine.leaves.attributes.leaf, coarse.leaves.attributes.leaf);
  assert.equal(fine.leaves.attributes.wind[2], coarse.leaves.attributes.wind[2]);
  assert.equal(coarse.leaves.attributes.wind[1], 0);
  assert.ok(fine.leaves.attributes.wind[1]! > 0);
  assert.ok(coarse.leaves.attributes.wind.every((value, i) => i % 4 !== 3 || value === 1));

  const { positions, normals, indices, uvs } = coarse.leaves;
  assert.deepStrictEqual(positions.slice(0, 12), positions.slice(12));
  assert.ok(normals.slice(0, 12).every((value, i) => value === -normals[12 + i]!));
  assert.deepStrictEqual([...indices], [0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6]);
  assert.deepStrictEqual([...uvs.slice(0, 8)], [0, 0, 1, 0, 1, 1, 0, 1]);
  const attachment = tree.stems[1]!.points[0]!;
  const center = attachment.map((_, i) => (positions[i]! + positions[i + 6]!) / 2);
  assert.ok(Math.hypot(...center.map((value, i) => value - attachment[i]!)) < 0.1);
});

test("valid very thin branches keep nondegenerate Float32 geometry", () => {
  const level = { count: 2, angle: 70, angleVariation: 0, lengthRatio: 0.05, start: 1, radiusRatio: 0.1 };
  const result = success(generateTree({
    height: 60, taper: 0.01, trunkRadius: 0.02, irregularity: 1, crownStart: 1,
    levels: [level, level, level], lods: [{ minRadius: 0 }],
  }));
  assert.deepStrictEqual(validateMesh(result.lods[0]!.wood), []);
});

test("stem and triangle budgets fail quickly and identify the over-budget level or LOD", () => {
  const start = performance.now();
  const capped = generateTree({ levels: [{ count: 64 }, { count: 64 }, { count: 64 }] });
  assert.ok(!capped.ok && capped.report.code === "skeleton");
  assert.match(capped.report.message, /level 2/);

  const level = { count: 15, angle: 40, lengthRatio: 1 };
  const dense = generateTree({ height: 60, levels: [level, level, level], lods: [{ ringsPerMeter: 16 }] });
  assert.ok(!dense.ok && dense.report.code === "budget");
  assert.equal(dense.report.lod, 0);
  assert.ok(performance.now() - start < 2000);

  const customCap = generateTree(TREE_PRESETS.conifer, { triangleCaps: [20000, 1] });
  assert.ok(!customCap.ok && customCap.report.code === "budget");
  assert.equal(customCap.report.lod, 1);
  assert.match(customCap.report.message, /cap is 1$/);
});
