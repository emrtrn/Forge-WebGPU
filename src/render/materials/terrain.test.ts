// The terrain material's layer textures and bindings (plan phase 5a step 3).
// Rewrites Forge's "the paint layers share one array sampler, as the cascade
// budget counts" (terrainRender.test.ts, R): there the GLSL's sampler lines
// were counted, here the textures the fragment nodes read.
import { describe, expect, test } from "vitest";
import { DataArrayTexture, DataTexture, Texture, Vector3, type Node } from "three/webgpu";
import type { TerrainLayerInput } from "../resources/terrains.ts";
import type { TerrainLayerDetail } from "../resources/surfaceMaterials.ts";
import { createTerrainLayerTextures, createTerrainMaterial, type TerrainLayerTextures } from "./terrain.ts";

function rgba(width: number, height: number, fill: readonly number[]): DataTexture {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i += 1) data.set(fill, i * 4);
  const texture = new DataTexture(data, width, height);
  texture.needsUpdate = true;
  return texture;
}

function layer(overrides: Partial<TerrainLayerInput> = {}): TerrainLayerInput {
  return { color: "#808080", texture: null, scale: [0.1, 0.1], roughness: 0.8, flipY: false, normalTexture: null, roughnessTexture: null, detail: null, ...overrides };
}

const detail = (normalTexture: Texture, atlasSize: 1 | 2): TerrainLayerDetail => ({
  normalTexture, atlasSize, uvTiling: [1, 1], strength: 0.65, coverage: 0.55, baseNormalStrength: 1, patchSize: 6, direction: 0, directionVariation: 12, seed: 1, roughness: 0.4,
});

/** Every texture the material's fragment nodes read (each node once). */
function fragmentTextures(nodes: readonly (Node | null)[]): Set<Texture> {
  const seen = new Set<Node>();
  const textures = new Set<Texture>();
  const visit = (node: Node): void => {
    if (seen.has(node)) return;
    seen.add(node);
    const value = (node as Node & { isTextureNode?: boolean; value?: Texture }).isTextureNode ? (node as unknown as { value: Texture }).value : null;
    if (value) textures.add(value);
    for (const child of node.getChildren()) visit(child as Node);
  };
  for (const node of nodes) if (node) visit(node);
  return textures;
}

function material(layers: readonly TerrainLayerInput[], layerTextures: TerrainLayerTextures, farTiling = true) {
  const slot = (format: number) => {
    const texture = new DataArrayTexture(new Uint8Array(4 * 4 * 4 * 2), 4, 4, 2);
    texture.format = format as never;
    return texture;
  };
  const global = new DataTexture(new Uint8Array(4 * 4 * 4), 4, 4);
  const made = createTerrainMaterial({
    heights: slot(0), normals: slot(0), weights: slot(0),
    globalHeights: global, globalNormals: global, globalWeights: slot(0),
    globalSize: [4, 4], globalSpacing: 8, origin: new Vector3(), spacing: 1, tileVertices: 4, extent: [3, 3], patchQuads: 32,
    layers, layerTextures, farTiling,
  });
  const m = made.material;
  return { material: m, textures: fragmentTextures([m.colorNode, m.roughnessNode, m.normalNode, m.maskNode]) };
}

describe("terrain material", () => {
  test("layer textures: albedo slices in order, roughness packed where a map exists, normals then detail slices", () => {
    const layers = [
      layer({ texture: rgba(2, 2, [200, 10, 10, 255]) }),
      layer(),
      layer({ texture: rgba(2, 2, [10, 200, 10, 255]), roughnessTexture: rgba(2, 2, [0, 64, 0, 255]), normalTexture: rgba(2, 2, [128, 128, 255, 255]) }),
      layer({ roughnessTexture: rgba(1, 1, [0, 32, 0, 255]), color: "#102030", detail: detail(rgba(4, 4, [128, 128, 255, 255]), 2) }),
    ];
    const textures = createTerrainLayerTextures(layers);
    expect(textures.albedoIndex).toEqual([0, -1, 1, 2]);
    expect(textures.roughnessInAlpha).toEqual([false, false, true, true]);
    const albedo = textures.albedo!.image.data as Uint8Array;
    expect(albedo[1 * 16 + 3]).toBe(64);
    // No albedo: the base colour carries the packed roughness.
    expect([...albedo.subarray(2 * 16, 2 * 16 + 4)]).toEqual([0x10, 0x20, 0x30, 32]);
    expect(textures.normalIndex).toEqual([-1, -1, 0, -1]);
    expect(textures.detailIndex).toEqual([-1, -1, -1, 1]);
    // One normal map and a 2 x 2 detail atlas: five slices.
    expect(textures.normals!.image.depth).toBe(5);
    textures.dispose();
  });

  test("the paint layers share one albedo and one normal array binding, whatever the layer count", () => {
    for (const count of [1, 5, 8]) {
      for (const textured of [false, true]) {
        const layers = Array.from({ length: count }, (_, i) =>
          layer(textured ? { texture: rgba(4, 4, [i * 30, 0, 0, 255]), normalTexture: rgba(4, 4, [128, 128, 255, 255]) } : { color: `#${(i + 1).toString(16).repeat(6)}` }),
        );
        const layerTextures = createTerrainLayerTextures(layers);
        const { textures } = material(layers, layerTextures);
        const own = [...textures].filter((texture) => texture === layerTextures.albedo || texture === layerTextures.normals);
        expect(own.length).toBe(textured ? 2 : 0);
        for (const one of layers) expect(textures.has(one.texture as Texture)).toBe(false);
        // Slot normals and weights, global normals (and its hole flag) and weights.
        expect(textures.size - own.length).toBeLessThanOrEqual(4);
        layerTextures.dispose();
      }
    }
  });

  test("far tiling is compiled in or out; holes are cut by the mask", () => {
    const layers = [layer({ texture: rgba(4, 4, [255, 0, 0, 255]) })];
    const layerTextures = createTerrainLayerTextures(layers);
    const reads = (farTiling: boolean): number => {
      const { material: m } = material(layers, layerTextures, farTiling);
      expect(m.maskNode).not.toBeNull();
      let count = 0;
      const seen = new Set<Node>();
      const visit = (node: Node): void => {
        if (seen.has(node)) return;
        seen.add(node);
        if ((node as Node & { isTextureNode?: boolean; value?: Texture }).isTextureNode && (node as unknown as { value: Texture }).value === layerTextures.albedo) count += 1;
        for (const child of node.getChildren()) visit(child as Node);
      };
      visit(m.colorNode!);
      return count;
    };
    // The far copy is a second read of the layer's slice.
    expect(reads(false)).toBeGreaterThan(0);
    expect(reads(true)).toBe(2 * reads(false));
    layerTextures.dispose();
  });
});
