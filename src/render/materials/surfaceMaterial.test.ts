import { describe, expect, test } from "vitest";
import { time } from "three/tsl";
import { CompressedTexture, DoubleSide, FrontSide, MeshBasicNodeMaterial, MeshStandardNodeMaterial, Texture, Vector2, type Node } from "three/webgpu";
import { contributionSignature, createWorldMask } from "./contributions.ts";
import { createSurfaceMaterial, EMISSIVE_INTENSITY_SCALE, surfaceTextureSlots, type SurfaceLayerData, type SurfaceMaterialData } from "./surfaceMaterial.ts";

const LAYER: SurfaceLayerData = {
  baseColor: "#ffffff", baseColorTexture: null, normalTexture: null, roughnessTexture: null, metalnessTexture: null, opacityTexture: null,
  emissiveTexture: null, aoTexture: null, roughness: 0.8, metalness: 0, opacity: 1, emissive: "#000000", emissiveIntensity: 0, aoIntensity: 1, uvTiling: [1, 1],
};

/** `forge.material` defaults (features/material), with changes. */
function material(patch: Partial<SurfaceMaterialData> = {}): SurfaceMaterialData {
  return {
    ...LAYER,
    materialType: "standard", maskTexture: null, ormTexture: null, useBaseColorAlphaForOpacity: false, flipY: true,
    alphaMode: "opaque", alphaTest: 0.5, side: "front",
    normalMotion: { enabled: false, primaryVelocity: [0.012, 0.006], secondaryTiling: [1.37, 1.37], secondaryVelocity: [-0.009, 0.014], strength: 0.65 },
    layerBlend: {
      enabled: false, layer1: LAYER, driver: "constant", amount: 0.5, min: 0, max: 1, contrast: 1, maskTexture: null, vertexColorChannel: "r", invertVertexColor: false,
    },
    ...patch,
  };
}

/** The textures a node graph samples. */
function sampled(node: Node | null): Texture[] {
  const found: Texture[] = [];
  (node as unknown as { traverse(visit: (child: { isTextureNode?: boolean; value?: unknown }) => void): void } | null)?.traverse((child) => {
    if (child.isTextureNode && child.value instanceof Texture && !found.includes(child.value)) found.push(child.value);
  });
  return found;
}

/** Whether a node graph reads the renderer's time (a scrolling sample). */
function readsTime(node: Node | null): boolean {
  let found = false;
  (node as unknown as { traverse(visit: (child: unknown) => void): void } | null)?.traverse((child) => {
    if (child === time) found = true;
  });
  return found;
}

// Forge WebGL's "forge material mapping creates matching Three material types and fields"
// (tools/engine-tests.ts 20655), rewritten for node materials (docs/PORT_LOG.md §2).
describe("forge.material as a node material", () => {
  test("standard and basic materials take Forge's fields", () => {
    const standard = createSurfaceMaterial(
      material({ baseColor: "#123456", roughness: 0.25, metalness: 0.75, opacity: 0.4, alphaMode: "blend", alphaTest: 0.9, side: "double", emissive: "#101010", emissiveIntensity: 2 }),
      new Map(),
    );
    expect(standard).toBeInstanceOf(MeshStandardNodeMaterial);
    const lit = standard as MeshStandardNodeMaterial;
    expect(lit.color.getHexString()).toBe("123456");
    expect([lit.roughness, lit.metalness, lit.opacity]).toEqual([0.25, 0.75, 0.4]);
    expect([lit.transparent, lit.depthWrite, lit.alphaTest, lit.side]).toEqual([true, false, 0, DoubleSide]);
    expect(lit.emissive.getHexString()).toBe("101010");
    expect(lit.emissiveIntensity).toBe(2 * EMISSIVE_INTENSITY_SCALE);
    const basic = createSurfaceMaterial(material({ materialType: "basic" }), new Map());
    expect(basic).toBeInstanceOf(MeshBasicNodeMaterial);
    expect([basic.transparent, basic.side]).toEqual([false, FrontSide]);
  });

  test("each map is sampled in its slot; ORM replaces the separate maps; a cutout uses alpha test", () => {
    const maps = new Map(["baseColorTexture", "normalTexture", "roughnessTexture", "metalnessTexture", "aoTexture", "opacityTexture", "emissiveTexture"].map((slot) => [slot, new Texture()]));
    const lit = createSurfaceMaterial(material({ uvTiling: [3, 4] }), maps) as MeshStandardNodeMaterial;
    expect(sampled(lit.colorNode)).toEqual([maps.get("baseColorTexture")]);
    expect(sampled(lit.normalNode)).toEqual([maps.get("normalTexture")]);
    expect(sampled(lit.roughnessNode)).toEqual([maps.get("roughnessTexture")]);
    expect(sampled(lit.metalnessNode)).toEqual([maps.get("metalnessTexture")]);
    expect(sampled(lit.aoNode)).toEqual([maps.get("aoTexture")]);
    expect(sampled(lit.opacityNode)).toEqual([maps.get("opacityTexture")]);
    expect(sampled(lit.emissiveNode)).toEqual([maps.get("emissiveTexture")]);
    expect(lit.transparent).toBe(true);
    // The textures themselves stay shared: tiling and flip are in the material's UV.
    expect([maps.get("baseColorTexture")!.repeat.x, maps.get("baseColorTexture")!.flipY]).toEqual([1, true]);

    const orm = new Texture();
    const packed = createSurfaceMaterial(material(), new Map([["ormTexture", orm], ["roughnessTexture", new Texture()]])) as MeshStandardNodeMaterial;
    expect([sampled(packed.roughnessNode), sampled(packed.metalnessNode), sampled(packed.aoNode)]).toEqual([[orm], [orm], [orm]]);

    const cutout = createSurfaceMaterial(material({ useBaseColorAlphaForOpacity: true, alphaTest: 0.42 }), new Map([["baseColorTexture", new Texture()]]));
    expect([cutout.alphaTest, cutout.transparent]).toEqual([0.42, false]);
    const plain = createSurfaceMaterial(material(), new Map()) as MeshStandardNodeMaterial;
    expect([plain.aoNode, plain.normalNode]).toEqual([null, null]);
  });

  test("a layer blend samples its layer, its mask at the base UV, and needs a base normal map for its own", () => {
    const layerColor = new Texture();
    const layerNormal = new Texture();
    const mask = new Texture();
    const data = material({
      layerBlend: { ...material().layerBlend, enabled: true, driver: "maskTexture", layer1: { ...LAYER, opacity: 0.5 } },
    });
    const maps = new Map([["layerBlend.layer1.baseColorTexture", layerColor], ["layerBlend.layer1.normalTexture", layerNormal], ["layerBlend.maskTexture", mask]]);
    const blended = createSurfaceMaterial(data, maps) as MeshStandardNodeMaterial;
    expect(sampled(blended.colorNode)).toEqual(expect.arrayContaining([layerColor, mask]));
    expect(blended.normalNode).toBeNull();
    expect(blended.transparent).toBe(true);
    const withBase = createSurfaceMaterial(data, new Map([...maps, ["normalTexture", new Texture()]])) as MeshStandardNodeMaterial;
    expect(sampled(withBase.normalNode)).toEqual(expect.arrayContaining([layerNormal]));
  });

  // Forge WebGL's "forge normal motion patches the normal shader and updates a shared time uniform"
  // (tools/engine-tests.ts 20594), rewritten: the normal node scrolls with the renderer's time.
  test("normal motion scrolls the normal map with time; without it the normal is still", () => {
    const normal = new Texture();
    const moving = createSurfaceMaterial(material({ normalMotion: { ...material().normalMotion, enabled: true } }), new Map([["normalTexture", normal]])) as MeshStandardNodeMaterial;
    expect(sampled(moving.normalNode)).toEqual([normal]);
    expect(readsTime(moving.normalNode)).toBe(true);
    const still = createSurfaceMaterial(material(), new Map([["normalTexture", normal]])) as MeshStandardNodeMaterial;
    expect(readsTime(still.normalNode)).toBe(false);
  });

  // Forge WebGL's "material flipY survives normalize and save, and reaches every texture map"
  // (tools/engine-tests.ts 20504), rewritten: the flip is the material's UV, not the shared texture's upload.
  test("texture slots and colour spaces; flipY does not touch a shared texture", () => {
    const data = material({
      baseColorTexture: "a", normalTexture: "n", emissiveTexture: "e", ormTexture: "o",
      layerBlend: { ...material().layerBlend, enabled: true, maskTexture: "m", layer1: { ...LAYER, baseColorTexture: "lb", aoTexture: "la" } },
    });
    expect(surfaceTextureSlots(data)).toEqual([
      { slot: "baseColorTexture", guid: "a", colorSpace: "srgb" },
      { slot: "normalTexture", guid: "n", colorSpace: "linear" },
      { slot: "emissiveTexture", guid: "e", colorSpace: "srgb" },
      { slot: "ormTexture", guid: "o", colorSpace: "linear" },
      { slot: "layerBlend.layer1.baseColorTexture", guid: "lb", colorSpace: "srgb" },
      { slot: "layerBlend.layer1.aoTexture", guid: "la", colorSpace: "linear" },
      { slot: "layerBlend.maskTexture", guid: "m", colorSpace: "linear" },
    ]);
    // A layer blend that is off brings no textures.
    expect(surfaceTextureSlots(material({ layerBlend: { ...data.layerBlend, enabled: false } }))).toEqual([]);
    const shared = new Texture();
    shared.flipY = false;
    const compressed = new CompressedTexture([], 4, 4);
    createSurfaceMaterial(material({ flipY: true }), new Map([["baseColorTexture", shared], ["normalTexture", compressed]]));
    expect([shared.flipY, compressed.flipY]).toEqual([false, false]);
  });
});

describe("material contributions", () => {
  test("the signature names the contributions in their fixed order; a world mask masks colour and shadow", () => {
    expect(contributionSignature({})).toBe("none");
    const mask = createWorldMask({ texture: new Texture(), span: 512, rangeLow: 0.4, rangeHigh: 0.6 });
    expect(contributionSignature({ worldMask: mask })).toBe("worldMask");
    expect(mask.range.value).toEqual(new Vector2(0.4, 0.6));
    const masked = createSurfaceMaterial(material(), new Map(), { worldMask: mask }) as MeshStandardNodeMaterial;
    expect(masked.maskNode).not.toBeNull();
    expect(masked.maskShadowNode).toBe(masked.maskNode);
    expect((createSurfaceMaterial(material(), new Map()) as MeshStandardNodeMaterial).maskNode).toBeNull();
  });
});
