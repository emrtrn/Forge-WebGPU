// The three-free matrix and quaternion helpers against their defining
// identities (three.js's formulas; plan phase 4 step 4).
import assert from "node:assert/strict";
import { test } from "vitest";
import { composeMat4, IDENTITY_MAT4, invertMat4, multiplyMat4, multiplyQuat, quatFromAxisAngle, rotate, rotationOf, transformPoint } from "./affine.ts";
import { eulerDegreesToQuaternion } from "./euler.ts";

const near = (actual: readonly number[], expected: readonly number[], what: string): void =>
  actual.forEach((value, index) => assert.ok(Math.abs(value - expected[index]!) < 1e-9, `${what}: ${actual.join(", ")} != ${expected.join(", ")}`));

test("a composed matrix places, turns and scales a point; its inverse undoes it", () => {
  const q = eulerDegreesToQuaternion([20, 35, -50]);
  const m = composeMat4([1, 2, 3], q, [2, 3, 0.5]);
  near(transformPoint(m, [1, 1, 1]), [1, 2, 3].map((value, index) => value + rotate(q, [2, 3, 0.5])[index]!), "point");
  near(multiplyMat4(m, invertMat4(m)!), IDENTITY_MAT4, "m * m^-1");
  assert.equal(invertMat4(composeMat4([0, 0, 0], [0, 0, 0, 1], [0, 1, 1])), null);
});

test("the rotation of a matrix leaves its scale out", () => {
  const q = eulerDegreesToQuaternion([0, 90, 10]);
  const r = rotationOf(composeMat4([4, 5, 6], q, [3, 0.25, 2]));
  // q and -q are the same rotation.
  const sign = Math.sign(r[3]) === Math.sign(q[3]) ? 1 : -1;
  near(r.map((value) => value * sign), q, "rotation");
});

test("quaternions compose right to left and turn about their axis", () => {
  const quarter = quatFromAxisAngle([0, 1, 0], Math.PI / 2);
  near(rotate(quarter, [1, 0, 0]), [0, 0, -1], "+x about Y");
  near(rotate(multiplyQuat(quarter, quarter), [1, 0, 0]), [-1, 0, 0], "half turn");
});
