import { describe, expect, test } from "vitest";
import { eulerXyzQuaternion } from "../forgeImport/placements.ts";
import { eulerDegreesToQuaternion, quaternionToEulerDegrees } from "./euler.ts";

const close = (actual: readonly number[], expected: readonly number[], digits = 6) =>
  actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index]!, digits));

describe("euler <-> quaternion (three.js XYZ order)", () => {
  test("degrees to quaternion matches the importer's conversion", () => {
    const cases: [number, number, number][] = [[0, 0, 0], [90, 0, 0], [0, 45, 0], [12, -170, 33], [-80, 20, 179]];
    for (const angles of cases) {
      close(eulerDegreesToQuaternion(angles), eulerXyzQuaternion(...angles));
    }
  });

  test("angles away from gimbal lock round-trip", () => {
    for (const angles of [[0, 0, 0], [10, 20, 30], [-45, 60, -120], [170, -30, 5], [0, 89, 0], [-179, 0, 90]] as const) {
      close(quaternionToEulerDegrees(eulerDegreesToQuaternion(angles)), angles, 5);
    }
  });

  test("a quaternion's sign and length do not change the angles; zero reads as no rotation", () => {
    const q = eulerDegreesToQuaternion([15, -40, 70]);
    close(quaternionToEulerDegrees([-q[0], -q[1], -q[2], -q[3]]), [15, -40, 70], 5);
    close(quaternionToEulerDegrees([q[0] * 3, q[1] * 3, q[2] * 3, q[3] * 3]), [15, -40, 70], 5);
    expect(quaternionToEulerDegrees([0, 0, 0, 0])).toEqual([0, 0, 0]);
  });

  test("at gimbal lock the rotation is kept with Z folded into X", () => {
    const locked = quaternionToEulerDegrees(eulerDegreesToQuaternion([30, 90, 0]));
    expect(locked[1]).toBeCloseTo(90, 4);
    expect(locked[2]).toBe(0);
    const [a, b] = [eulerDegreesToQuaternion(locked), eulerDegreesToQuaternion([30, 90, 0])];
    // Same rotation: q and -q are equal, so |a . b| = 1.
    expect(Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3])).toBeCloseTo(1, 6);
  });
});
