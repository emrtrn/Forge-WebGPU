import { expect, test } from "vitest";
import { shapeMesh, type ShapePrimitiveName } from "../../engine/procgen/shapePrimitives.ts";
import { createShapeGeometry, SHAPE_PLANE_SIZE, SHAPE_SOLID_SIZE } from "./shapes.ts";
import * as pure from "../../engine/procgen/shapePrimitives.ts";

// The HLOD builder bakes shapes with the three-free generator (plan 5c R1);
// what it bakes must be what the renderer draws.
const PRIMITIVES: readonly ShapePrimitiveName[] = ["cube", "sphere", "cylinder", "cone", "plane"];

test("three-free shape generator sizes match the renderer's", () => {
  expect(pure.SHAPE_SOLID_SIZE).toBe(SHAPE_SOLID_SIZE);
  expect(pure.SHAPE_PLANE_SIZE).toBe(SHAPE_PLANE_SIZE);
});

test.each(PRIMITIVES)("three-free %s equals the renderer's three geometry", (primitive) => {
  const geometry = createShapeGeometry(primitive);
  const mesh = shapeMesh(primitive);
  const close = (actual: Float32Array, expected: ArrayLike<number>) => {
    expect(actual.length).toBe(expected.length);
    for (let index = 0; index < actual.length; index += 1) expect(Math.abs(actual[index]! - expected[index]!)).toBeLessThan(1e-6);
  };
  close(mesh.positions, geometry.getAttribute("position").array);
  close(mesh.normals, geometry.getAttribute("normal").array);
  expect(Array.from(mesh.indices)).toEqual(Array.from(geometry.getIndex()!.array));
  geometry.dispose();
});
