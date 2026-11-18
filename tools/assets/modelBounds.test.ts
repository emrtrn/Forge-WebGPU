import { expect, test } from "vitest";
import { gltfModelBounds } from "./modelBounds.ts";

test("indexes transformed primitive boxes from the default glTF scene", () => {
  expect(gltfModelBounds({
    scene: 1,
    scenes: [{ nodes: [2] }, { nodes: [0] }],
    nodes: [{ translation: [10, 0, 0], children: [1] }, { mesh: 0, scale: [-2, 1, 3] }, { mesh: 0, translation: [100, 0, 0] }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    accessors: [{ min: [1, 0, -1], max: [2, 2, 2] }],
  })).toEqual({ min: [6, 0, -3], max: [8, 2, 6] });
});

test("leaves absent position bounds to the runtime model loader", () => {
  expect(gltfModelBounds({
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    accessors: [{}],
  })).toBeNull();
});
