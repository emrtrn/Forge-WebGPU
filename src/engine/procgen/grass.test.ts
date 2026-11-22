import assert from "node:assert/strict";
import { test } from "vitest";
import { generateGrass } from "./grass.ts";
import { meshBounds } from "./mesh.ts";

const shape = { height: 0.42, width: 0.037, bend: 0.62, bladeCount: 13 };

test("grass seeds change the tuft, stay within both budgets and pin ribbons at the root", () => {
  for (const seed of [1, 2, 3]) {
    const lods = generateGrass(shape, seed);
    assert.deepEqual(lods, generateGrass(shape, seed));
    assert.notDeepEqual(lods[0].mesh.positions, generateGrass(shape, seed + 1)[0].mesh.positions);
    for (const [{ mesh, wind }, vertices, triangles] of [[lods[0], 11, 117], [lods[1], 5, 18]] as const) {
      assert.equal(mesh.indices.length / 3, triangles);
      for (let root = 0; root < mesh.positions.length / 3; root += vertices) {
        assert.equal(mesh.positions[root * 3 + 1], 0);
        assert.equal(mesh.positions[(root + 1) * 3 + 1], 0);
        for (const component of [0, 1, 3]) assert.equal(wind[root * 4 + component], 0);
        assert.equal(wind[(root + vertices - 1) * 4], 1);
      }
    }
    assert.equal(meshBounds(lods[0].mesh).min[1], 0);
  }
});
