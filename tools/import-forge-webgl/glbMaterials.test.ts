import { describe, expect, test } from "vitest";
import { gltfMaterialSlots } from "./glbMaterials.ts";

describe("gltfMaterialSlots", () => {
  test("unique materials in the order the loader meets them: a node's primitives, then its children", () => {
    expect(gltfMaterialSlots({
      scene: 0,
      scenes: [{ nodes: [0, 2] }],
      nodes: [{ mesh: 0, children: [1] }, { mesh: 1 }, { mesh: 2 }],
      meshes: [
        { primitives: [{ material: 3 }, { material: 1 }] },
        { primitives: [{ material: 3 }, {}] },
        { primitives: [{ material: 0 }] },
      ],
    })).toEqual(["3", "1", "default", "0"]);
  });

  test("without scenes the meshes are walked in order", () => {
    expect(gltfMaterialSlots({ meshes: [{ primitives: [{ material: 2 }] }, { primitives: [{ material: 2 }, { material: 0 }] }] })).toEqual(["2", "0"]);
  });
});
