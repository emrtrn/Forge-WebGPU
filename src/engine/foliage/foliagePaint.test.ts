// Adapted from Forge WebGL tools/engine-tests.ts (Foliage paint, fill, reattach, reapply) @ forge-webgl-final.
import assert from "node:assert/strict";
import { test } from "vitest";
import { decodeFoliageCell, encodeFoliageCell } from "../../core/level/foliageCells.ts";
import type { Vec3 } from "../../core/schema/fields.ts";
import { quatFromAxisAngle, rotate, type Quat } from "../math/affine.ts";
import {
  foliageBrushSamples, foliageFillSamplePoints, foliageFillSpacing, foliageInRadius, foliageInvalid, foliageSampleTargetCount, FOLIAGE_FILL_MAX_SAMPLES,
  FoliageSpacing, paintedInstanceFromRoll, placeFoliage, reapplyPaintedInstance, reattachPaintedInstance, type FoliagePaintType, type PaintedFoliageInstance,
} from "./foliagePaint.ts";
import { packFoliage, unpackFoliage } from "./foliagePaintSession.ts";
import { makeFoliageRng } from "./foliageRoll.ts";
import { normalizeFoliageTypeParams } from "./foliageTypeParams.ts";

const type = (fields: Record<string, unknown> = {}, radius = 0.5, density = 1): FoliagePaintType => ({ ...normalizeFoliageTypeParams(fields), radius, density });
const at = (position: Vec3, rotation: Quat = [0, 0, 0, 1], scale = 1, seed = 1): PaintedFoliageInstance => ({ position, rotation, scale, seed });
const near = (a: readonly number[], b: readonly number[], epsilon = 1e-6): void => a.forEach((value, i) => assert.ok(Math.abs(value - b[i]!) < epsilon, `${a} / ${b}`));
const flat = (position: Vec3) => ({ position, normal: [0, 1, 0] as Vec3 });

test("the sample budget scales with area and density; the samples stay in the disk", () => {
  const small = foliageSampleTargetCount(type(), { radius: 1, density: 1 });
  assert.equal(small, Math.round(Math.PI * 1.5));
  assert.equal(foliageSampleTargetCount(type(), { radius: 4, density: 1 }), Math.round(Math.PI * 16 * 1.5));
  assert.equal(foliageSampleTargetCount(type({}, 1, 0), { radius: 4, density: 1 }), 1);
  const samples = foliageBrushSamples(type(), { center: [10, 3, -5], radius: 2, density: 2 }, makeFoliageRng(3));
  assert.equal(samples.length, Math.round(Math.PI * 4 * 3));
  assert.ok(samples.every(([x, z]) => Math.hypot(x - 10, z + 5) <= 2));
  assert.deepEqual(samples, foliageBrushSamples(type(), { center: [10, 3, -5], radius: 2, density: 2 }, makeFoliageRng(3)));
});

test("the spacing grid gives the linear scan's answers", () => {
  const rng = makeFoliageRng(11);
  for (const radius of [0.3, 1, 4]) {
    const spacing = new FoliageSpacing(radius);
    const points: Vec3[] = [];
    for (let i = 0; i < 400; i += 1) {
      const point: Vec3 = [(rng() - 0.5) * 30, rng() * 100, (rng() - 0.5) * 30];
      assert.equal(spacing.overlaps(point), points.some((other) => (other[0] - point[0]) ** 2 + (other[2] - point[2]) ** 2 < radius * radius));
      spacing.add(point);
      points.push(point);
    }
  }
});

test("a roll becomes an instance: lifted along its up, turned about it, tilted to the normal", () => {
  const roll = { position: [0, 0, 0] as Vec3, normal: [0, 1, 0] as Vec3, yawDeg: 0, scale: [1.5, 1.5, 1.5] as Vec3, zOffset: 2, seed: 123 };
  const upright = paintedInstanceFromRoll(type(), roll);
  assert.deepEqual(upright, { position: [0, 2, 0], rotation: [0, 0, 0, 1], scale: 1.5, seed: 123 });
  const slope: Vec3 = [Math.SQRT1_2, Math.SQRT1_2, 0];
  const tilted = paintedInstanceFromRoll(type(), { ...roll, normal: slope, yawDeg: 70 });
  near(rotate([...tilted.rotation] as Quat, [0, 1, 0]), slope);
  near(tilted.position, [Math.SQRT2, Math.SQRT2, 0]);
  const ignoring = paintedInstanceFromRoll(type({ alignToNormal: false }), { ...roll, normal: slope, yawDeg: 70 });
  near(ignoring.rotation, quatFromAxisAngle([0, 1, 0], (70 * Math.PI) / 180));
  near(rotate([...paintedInstanceFromRoll(type(), { ...roll, normal: [0, -1, 0] }).rotation] as Quat, [0, 1, 0]), [0, -1, 0]);
});

test("placing honours the filters, the spacing against painted and fresh instances, and the seed", () => {
  const grass = type({ slopeMax: 30, heightMax: 10 }, 1);
  const hits = [flat([0, 0, 0]), flat([0.5, 0, 0]), null, flat([3, 11, 0]), { position: [5, 0, 0] as Vec3, normal: [1, 0, 0] as Vec3 }, flat([7, 0, 0]), flat([20, 0, 0])];
  const place = (): PaintedFoliageInstance[] => placeFoliage(grass, hits, [at([20.4, 50, 0])], makeFoliageRng(5));
  assert.deepEqual(place().map((instance) => instance.position[0]), [0, 7]);
  assert.deepEqual(place(), place());
});

test("a placed instance is bit-exact after a cell file", () => {
  const placed = placeFoliage(type({ scaleMin: [0.7, 0, 0], scaleMax: [1.3, 0, 0], zOffsetMin: -0.1, zOffsetMax: 0.3 }, 0.1), Array.from({ length: 40 }, (_, i) => ({
    position: [i * 1.1 + 1 / 3, i / 7, -i / 9] as Vec3, normal: [0.2, 0.9, 0.387] as Vec3,
  })), [], makeFoliageRng(9));
  assert.equal(placed.length, 40);
  assert.deepEqual(unpackFoliage(decodeFoliageCell(encodeFoliageCell([packFoliage(placed)]))[0]!), placed);
});

test("fill grids a footprint, jitters within cells, thins by density and widens for a large target", () => {
  const area = { minX: 0, maxX: 4, minZ: 0, maxZ: 4 };
  const full = foliageFillSamplePoints(area, 2, 1, makeFoliageRng(7));
  assert.equal(new Set(full.map(([x, z]) => `${Math.floor(x / 2)},${Math.floor(z / 2)}`)).size, 4);
  assert.equal(foliageFillSamplePoints(area, 2, 0, makeFoliageRng(7)).length, 0);
  assert.equal(foliageFillSamplePoints({ ...area, maxX: 0 }, 2, 1, makeFoliageRng(7)).length, 0);
  assert.equal(foliageFillSamplePoints(area, 0, 1, makeFoliageRng(7)).length, 0);
  const wide = { minX: 0, maxX: 20, minZ: 0, maxZ: 20 };
  assert.ok(foliageFillSamplePoints(wide, 1, 0.25, makeFoliageRng(99)).length < foliageFillSamplePoints(wide, 1, 1, makeFoliageRng(99)).length);
  assert.equal(foliageFillSpacing({ radius: 2 }, area), 2);
  const world = { minX: -1024, maxX: 1024, minZ: -1024, maxZ: 1024 };
  const spacing = foliageFillSpacing({ radius: 0.2 }, world);
  assert.ok((2048 / spacing) ** 2 <= FOLIAGE_FILL_MAX_SAMPLES + 1);
});

test("reattach keeps scale, seed and the painted turn; an aligned instance tilts to the new normal", () => {
  const yaw = quatFromAxisAngle([0, 1, 0], (40 * Math.PI) / 180);
  const painted = at([1, 5, 2], yaw, 2, 9);
  const down = reattachPaintedInstance(painted, type(), flat([1, 0, 2]));
  assert.deepEqual(down.position, [1, 0, 2]);
  near(down.rotation, yaw);
  assert.deepEqual([down.scale, down.seed], [2, 9]);
  const slope: Vec3 = [0.6, 0.8, 0];
  const tilted = reattachPaintedInstance(painted, type(), { position: [1, 0, 2], normal: slope });
  near(rotate([...tilted.rotation] as Quat, [0, 1, 0]), slope);
  // Back to flat ground: the turn it was painted with.
  near(reattachPaintedInstance(tilted, type(), flat([1, 0, 2])).rotation, yaw);
  near(reattachPaintedInstance(painted, type({ alignToNormal: false }), { position: [0, 1, 0], normal: slope }).rotation, yaw);
});

test("reapply rolls scale and turn from the seed and the type now, keeping position, seed and tilt", () => {
  const roller = type({ scaleMin: [1, 1, 1], scaleMax: [3, 3, 3], alignToNormal: false });
  const painted = at([4, 2, -6], quatFromAxisAngle([0, 1, 0], 0.2), 1, 123456);
  const next = reapplyPaintedInstance(painted, roller);
  assert.deepEqual(next, reapplyPaintedInstance(painted, roller));
  assert.deepEqual([next.position, next.seed], [[4, 2, -6], 123456]);
  assert.ok(next.scale >= 1 && next.scale <= 3);
  near([next.rotation[0], next.rotation[2]], [0, 0]);
  const slope: Vec3 = [0.6, 0.8, 0];
  const tilted = reattachPaintedInstance(painted, type(), { position: [0, 0, 0], normal: slope });
  const fixed = reapplyPaintedInstance(tilted, type({ scaleMin: [2, 2, 2], scaleMax: [2, 2, 2], randomYaw: false }));
  assert.equal(fixed.scale, 2);
  near(rotate([...fixed.rotation] as Quat, [0, 1, 0]), slope);
});

test("invalid: no ground, ground too far, ground the type refuses", () => {
  const strict = type({ slopeMax: 30, zOffsetMin: -1, zOffsetMax: 0.2 });
  assert.equal(foliageInvalid(at([0, 0, 0]), strict, null), true);
  assert.equal(foliageInvalid(at([0, 0, 0]), strict, flat([0, 1.4, 0])), false);
  assert.equal(foliageInvalid(at([0, 0, 0]), strict, flat([0, 1.6, 0])), true);
  assert.equal(foliageInvalid(at([0, 0, 0]), strict, { position: [0, 0, 0], normal: [1, 0, 0] }), true);
  assert.equal(foliageInvalid(at([0, 0, 0]), null, { position: [0, 0.4, 0], normal: [1, 0, 0] }), false);
});

test("the radius test is horizontal and inclusive", () => {
  const list = [at([0, 90, 0]), at([1, 0, 0]), at([5, 0, 5])];
  assert.deepEqual(foliageInRadius(list, [0, 0, 0], 1), list.slice(0, 2));
});
