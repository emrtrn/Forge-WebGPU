import { expect, test } from "vitest";
import { FOLIAGE_FULL_BANDS, planFoliageRing } from "../world/foliageRing.ts";
import { foliageStandReach, type FoliageStandFields } from "./foliageAsset.ts";
import { normalizeFoliageTypeParams } from "./foliageTypeParams.ts";
import { foliageRuleDensity, generateFoliageBlock, generateFoliageCell, type FoliageRuleParams, type FoliageSurface } from "./proceduralFoliage.ts";

const SIZE = 512;
const TYPE = normalizeFoliageTypeParams({ scaleMin: [0.85, 1, 1], scaleMax: [1.15, 1, 1], alignToNormal: false });
const flat = (weight: (x: number, z: number) => number = () => 1): FoliageSurface => ({
  heightAt: () => 0, normalAt: () => [0, 1, 0], layerWeightAt: (_layer, x, z) => weight(x, z),
  bounds: { minX: 0, maxX: SIZE, minZ: 0, maxZ: SIZE },
});
/** Trees per hectare of a mixed stand: mature and young of one species side by side. */
const SHARES = [45, 35, 40, 25, 35, 20, 12, 50];
const TOTAL = SHARES.reduce((sum, share) => sum + share, 0);
const rules = (patch = 0): FoliageRuleParams[] => SHARES.map((share, index): FoliageRuleParams => {
  const from = SHARES.slice(0, index).reduce((sum, value) => sum + value, 0) / TOTAL;
  return { layerId: "forest", density: TOTAL / 1e4, minWeight: 0.5, seed: 7, stand: { from, to: index === SHARES.length - 1 ? 1 : from + share / TOTAL, patch } };
});
interface Tree { x: number; z: number; scale: number }
function grow(rule: FoliageRuleParams, cellSize: number, surface = flat()): Tree[] {
  const trees: Tree[] = [];
  for (let cellZ = 0; cellZ * cellSize < SIZE; cellZ += 1) for (let cellX = 0; cellX * cellSize < SIZE; cellX += 1) {
    const { count, matrices } = generateFoliageCell(rule, TYPE, surface, { cellX, cellZ, cellSize, keepFraction: 1 });
    for (let i = 0; i < count; i += 1) trees.push({ x: matrices[i * 16 + 12]!, z: matrices[i * 16 + 14]!, scale: matrices[i * 16 + 5]! });
  }
  return trees;
}
const sorted = (trees: readonly Tree[]): string[] => trees.map((tree) => `${tree.x} ${tree.z} ${tree.scale}`).sort();

test("a stand keeps its density, its shares and its spacing", () => {
  for (const patch of [0, 60]) {
    const grown = rules(patch).map((rule) => grow(rule, 64)), all = grown.flat();
    const perHa = (count: number): number => count / (SIZE * SIZE) * 1e4;
    expect(Math.abs(perHa(all.length) / TOTAL - 1)).toBeLessThan(0.02);
    if (patch === 0) grown.forEach((trees, index) => expect(Math.abs(perHa(trees.length) - SHARES[index]!)).toBeLessThan(5));
    const close = all.filter((a, i) => all.some((b, j) => i !== j && Math.abs(a.x - b.x) < 2.5 && Math.hypot(a.x - b.x, a.z - b.z) < 2.5));
    expect(close.length / all.length).toBeLessThan(0.08);
    expect(all.every((a, i) => all.every((b, j) => i === j || Math.hypot(a.x - b.x, a.z - b.z) > 0.8))).toBe(true);
  }
});

test("the layout does not depend on the cell size, and a far block is its cells", () => {
  const rule = rules(60)[2]!, trees = sorted(grow(rule, 32));
  expect(trees.length).toBeGreaterThan(50);
  expect(sorted(grow(rule, 128))).toEqual(trees);
  const block = generateFoliageBlock(rule, TYPE, flat(), { blockX: 0, blockZ: 0, cellSize: 64, cellsPerSide: 8, keepFraction: 1 });
  expect(block.count).toBe(trees.length);
  // Thinning keeps a subset where it stands.
  const thin = generateFoliageBlock(rule, TYPE, flat(), { blockX: 0, blockZ: 0, cellSize: 64, cellsPerSide: 8, keepFraction: 0.5 });
  expect(thin.count).toBeGreaterThan(0);
  expect(thin.count).toBeLessThan(block.count);
});

test("paint ramps thin and shrink a rule toward its edge and move nothing", () => {
  const surface = flat((x) => x / SIZE), base: FoliageRuleParams = { layerId: "forest", density: 0.02, minWeight: 0.25, seed: 3, stand: { from: 0, to: 1, patch: 0 } };
  const hard = grow(base, 64, surface), soft = grow({ ...base, fadeIn: 0.5, edgeScale: 0.4 }, 64, surface), band = grow({ ...base, maxWeight: 0.5, fadeOut: 0.1 }, 64, surface);
  const at = new Map(hard.map((tree) => [`${tree.x} ${tree.z}`, tree]));
  expect(soft.length).toBeLessThan(hard.length);
  for (const tree of soft) expect(tree.scale).toBeLessThanOrEqual(at.get(`${tree.x} ${tree.z}`)!.scale);
  const inside = (trees: readonly Tree[], from: number, to: number): number => trees.filter((tree) => tree.x / SIZE >= from && tree.x / SIZE < to).length;
  expect(inside(soft, 0.25, 0.4)).toBeLessThan(inside(hard, 0.25, 0.4) * 0.5);
  expect(inside(soft, 0.8, 1)).toBe(inside(hard, 0.8, 1));
  expect(inside(band, 0.25, 0.5)).toBe(inside(hard, 0.25, 0.5));
  expect(inside(band, 0.61, 1)).toBe(0);
  // The same ramp on a rule without a stand.
  const { stand: _stand, ...plain } = base;
  expect(grow({ ...plain, fadeIn: 0.5 }, 32, surface).length).toBeLessThan(grow(plain, 32, surface).length);
});

test("a stand's reach: no thinning, its density the rule's share", () => {
  const fields: FoliageStandFields = { enabled: true, from: 0.2, to: 0.5, patch: 0, reach: 400, far: 2500, tint: 0.5, detail: 0.7 };
  expect(foliageStandReach(fields)).toEqual({ cullStart: 340, cullEnd: 400, far: 2500, tint: 0.5, detail: 0.7 });
  expect(foliageStandReach({ ...fields, far: 300 })!.far).toBe(0);
  expect(foliageStandReach({ ...fields, reach: 0 })).toBeNull();
  expect(foliageStandReach({ ...fields, enabled: false })).toBeNull();
  expect(foliageRuleDensity({ density: 0.02, stand: { from: 0.2, to: 0.5, patch: 0 } })).toBeCloseTo(0.006);
  const plan = planFoliageRing({ center: [0, 0], radius: 400, density: 1, bounds: { minX: -600, maxX: 600, minZ: -600, maxZ: 600 }, built: new Map(), cellSize: 64, bands: FOLIAGE_FULL_BANDS });
  expect(plan.build.length).toBeGreaterThan(50);
  expect(plan.build.every((cell) => cell.keepFraction === 1)).toBe(true);
});
