import { describe, expect, test } from "vitest";
import { BufferAttribute, BufferGeometry, Group, Mesh, MeshStandardMaterial, PlaneGeometry, Texture, Vector3 } from "three/webgpu";
import { uvwOf, slotMaterialsOf } from "./gltfModels.ts";
import { applyDefaultModelTextureAnisotropy, applyUvwMapping, ensureVertexNormals, projectUv } from "./modelSetup.ts";
import { DEFAULT_ANISOTROPY, textureAnisotropy } from "./textures.ts";

describe("model setup", () => {
  test("a mesh without normals gets computed ones; one with normals keeps them", () => {
    const bare = new BufferGeometry();
    bare.setAttribute("position", new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 1]), 3));
    const plane = new PlaneGeometry(1, 1);
    const kept = plane.getAttribute("normal");
    const root = new Group().add(new Mesh(bare), new Mesh(plane));
    ensureVertexNormals(root);
    expect(bare.getAttribute("normal")).toBeDefined();
    expect(plane.getAttribute("normal")).toBe(kept);
  });

  test("the GLB's textures rise to the default anisotropy, capped by the GPU", () => {
    const low = new Texture();
    const high = new Texture();
    high.anisotropy = 16;
    const root = new Group().add(new Mesh(new PlaneGeometry(), new MeshStandardMaterial({ map: low, normalMap: high })));
    applyDefaultModelTextureAnisotropy(root, 4);
    expect([low.anisotropy, high.anisotropy]).toEqual([4, 16]);
    applyDefaultModelTextureAnisotropy(root, 16);
    expect(low.anisotropy).toBe(DEFAULT_ANISOTROPY);
    expect([textureAnisotropy(undefined, 16), textureAnisotropy(16, 4), textureAnisotropy(0, 16), textureAnisotropy(8, 0)]).toEqual([8, 4, 1, 1]);
  });

  test("UVW projection: Forge's box rule picks the dominant normal axis; none keeps the UVs", () => {
    expect(projectUv("box", new Vector3(0.2, 0, 0.3), new Vector3(0, 1, 0))).toEqual([0.7, 0.8]);
    expect(projectUv("box", new Vector3(0, 0.1, 0.3), new Vector3(1, 0, 0))).toEqual([0.8, 0.6]);
    expect(projectUv("planar", new Vector3(-0.5, 9, 0.5), new Vector3(0, 0, 1))).toEqual([0, 1]);
    const plane = new PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
    const original = Array.from(plane.getAttribute("uv").array);
    const root = new Group().add(new Mesh(plane, new MeshStandardMaterial({ map: new Texture() })));
    applyUvwMapping(root, uvwOf({}));
    expect(Array.from(plane.getAttribute("uv").array)).toEqual(original);
    applyUvwMapping(root, uvwOf({ uvw: { mapType: "box", position: [0, 0, 0], rotation: [0, 0, 0], scale: [2, 1, 2] } }));
    expect(Array.from(plane.getAttribute("uv").array).map((value) => Math.round(value * 100) / 100)).toEqual([0, 0, 1, 0, 0, 1, 1, 1]);
    const map = ((root.children[0] as Mesh).material as MeshStandardMaterial).map!;
    expect([map.wrapS, map.wrapT]).toEqual([1000, 1000]);
  });

  test("slot defaults come from the import settings; anything not a GUID string keeps the GLB's", () => {
    expect(slotMaterialsOf({ materials: ["ast_x", null, 3] })).toEqual(["ast_x", null, null]);
    expect(slotMaterialsOf(null)).toEqual([]);
  });
});
