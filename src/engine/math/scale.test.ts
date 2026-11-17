import { expect, test } from "vitest";
import { linkedScaleAxis } from "./scale.ts";

test("linked scale preserves nonuniform proportions without mutating the source", () => {
  const original: [number, number, number] = [2, 4, 6];
  expect(linkedScaleAxis(original, 1, 8)).toEqual([4, 8, 12]);
  expect(original).toEqual([2, 4, 6]);
});

test("linked scale supports negative and zero target values", () => {
  expect(linkedScaleAxis([-2, 4, 6], 0, 1)).toEqual([1, -2, -3]);
  expect(linkedScaleAxis([2, 4, 6], 2, 0)).toEqual([0, 0, 0]);
});

test("a zero source axis changes only itself and stays finite", () => {
  expect(linkedScaleAxis([0, 4, 6], 0, 2)).toEqual([2, 4, 6]);
  expect(linkedScaleAxis([0, 0, 0], 1, 1)).toEqual([0, 1, 0]);
});
