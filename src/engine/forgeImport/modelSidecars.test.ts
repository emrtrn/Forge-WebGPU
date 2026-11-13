import { describe, expect, test } from "vitest";
import { convertModelSidecars } from "./modelSidecars.ts";

const GUID = "ast_0123456789abcdef0123456789abcdef";

describe("convertModelSidecars", () => {
  test("slots keep their order; an empty slot is the GLB's own, an unknown one is reported", () => {
    const converted = convertModelSidecars({ materials: { schema: 1, slots: ["white", "", "gone", 7] } }, (id) => (id === "white" ? GUID : null));
    expect(converted.settings.materials).toEqual([GUID, null, null, null]);
    expect(converted.missingMaterials).toEqual(["gone"]);
    expect(convertModelSidecars({ materials: { schema: 1, slots: ["", ""] } }, () => GUID).settings).toEqual({});
  });

  test("UVW follows Forge's normaliser; no map type keeps the model's UVs", () => {
    const box = convertModelSidecars({ uvw: { schema: 1, mapType: "box", position: [1.23456, 0, 0], scale: [-2, 0, 1] } }, () => null);
    expect(box.settings.uvw).toEqual({ mapType: "box", position: [1.2346, 0, 0], rotation: [0, 0, 0], scale: [2, 0.001, 1] });
    expect(convertModelSidecars({ uvw: { schema: 1, mapType: null } }, () => null).settings).toEqual({});
  });

  test("vertex colours: Forge's normaliser drops partial meshes; an empty file gives nothing", () => {
    const vertexColors = {
      schema: 1, type: "vertexColors", target: "asset",
      meshes: [
        { meshName: " Plane ", primitiveIndex: 0, vertexCount: 1, colors: [2, 0.5, -1, 1] },
        { meshName: "Short", primitiveIndex: 0, vertexCount: 2, colors: [1, 1, 1, 1] },
      ],
    };
    expect(convertModelSidecars({ vertexColors }, () => null).settings.vertexColors).toEqual([
      { meshName: "Plane", primitiveIndex: 0, vertexCount: 1, colors: [1, 0.5, 0, 1] },
    ]);
    expect(convertModelSidecars({ vertexColors: { ...vertexColors, meshes: [] } }, () => null).settings).toEqual({});
  });
});
