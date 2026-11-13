import { describe, expect, test } from "vitest";
import { sceneCostTable } from "./debugPanel.ts";

describe("?debug scene cost table", () => {
  test("one row per scene source with its share of the shadow triangles; the text is the table", () => {
    const view = sceneCostTable({
      graph: { objects: 1_250, meshes: 40 },
      shadows: [
        { source: "terrain", meshes: 1, triangles: 300_000 },
        { source: "staticMesh", meshes: 2_000, triangles: 100_000 },
      ],
    });
    expect(view.rows.map((row) => row.cells)).toEqual([
      ["terrain", "1", "300K", "75%"],
      ["staticMesh", "2,000", "100K", "25%"],
    ]);
    expect(view.rows.map((row) => row.share)).toEqual([0.75, 0.25]);
    expect(view.meta).toContain("1,250 nodes");
    expect(view.clipboardText.split("\n")[0]).toBe("Scene cost");
    expect(sceneCostTable({ graph: { objects: 0, meshes: 0 }, shadows: [] }).rows).toEqual([]);
  });
});
