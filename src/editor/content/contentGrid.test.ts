import { expect, test } from "vitest";
import { gridWindow, revealGridTop } from "./contentGrid.ts";

test("columns as auto-fill gives them, rows in view plus two each side, the whole height", () => {
  // medium: 90 px cards, 8 px gap -> (500 + 8) / 98 = 5 columns; 118 px rows, pitch 126.
  const first = gridWindow(500, 0, 300, 1000, "medium");
  expect(first.columns).toBe(5);
  expect(first.height).toBe(200 * 126 - 8);
  expect([first.first, first.end, first.top]).toEqual([0, 5 * 5, 0]);
  const scrolled = gridWindow(500, 126 * 50, 300, 1000, "medium");
  expect([scrolled.first, scrolled.end, scrolled.top]).toEqual([48 * 5, 55 * 5, 48 * 126]);
  expect(gridWindow(10, 0, 300, 3, "large")).toMatchObject({ columns: 1, end: 3 });
  expect(gridWindow(500, 0, 300, 0, "small")).toMatchObject({ height: 0, first: 0, end: 0 });
});

test("reveal scrolls only when the row is out of view", () => {
  expect(revealGridTop(0, 5, 0, 300, "medium")).toBe(0);
  expect(revealGridTop(50, 5, 0, 300, "medium")).toBe(10 * 126 + 126 - 300);
  expect(revealGridTop(5, 5, 500, 300, "medium")).toBe(126);
});
