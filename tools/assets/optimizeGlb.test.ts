import { NodeIO, type Document } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
import sharp from "sharp";
import { describe, expect, test } from "vitest";
import { DEFAULT_GLB_OPTIMIZE, optimizeGlb } from "./optimizeGlb.ts";
import { texturedGlb } from "./testGlb.ts";

async function read(bytes: Uint8Array): Promise<Document> {
  await MeshoptDecoder.ready;
  return new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder }).readBinary(bytes);
}

describe("GLB optimisation", () => {
  test("textures resized to the limit and re-encoded as WebP, geometry meshopt-compressed, normal maps kept by default", async () => {
    const source = await texturedGlb();
    const { bytes, report } = await optimizeGlb(source, { ...DEFAULT_GLB_OPTIMIZE, maxTextureSize: 512 });
    const out = await read(bytes);
    const textures = out.getRoot().listTextures();
    expect(textures).toHaveLength(2);
    for (const texture of textures) {
      expect(texture.getMimeType()).toBe("image/webp");
      const meta = await sharp(Buffer.from(texture.getImage()!)).metadata();
      expect(Math.max(meta.width!, meta.height!)).toBeLessThanOrEqual(512);
    }
    expect(out.getRoot().listExtensionsUsed().map((extension) => extension.extensionName)).toEqual(expect.arrayContaining(["EXT_texture_webp", "EXT_meshopt_compression"]));
    // (Noise does not shrink as WebP; the sizes are not compared.)
    expect(report).toMatchObject({ bytesBefore: source.byteLength, textures: 2, normalMapsDropped: 0 });
  });

  test("normal maps dropped when asked; stripping keeps the materials in count and order without textures; off leaves the bytes", async () => {
    const source = await texturedGlb();
    const dropped = await read((await optimizeGlb(source, { ...DEFAULT_GLB_OPTIMIZE, keepNormals: false })).bytes);
    expect(dropped.getRoot().listMaterials()[0]!.getNormalTexture()).toBeNull();
    expect(dropped.getRoot().listTextures()).toHaveLength(1);

    const stripped = await optimizeGlb(source, { ...DEFAULT_GLB_OPTIMIZE, stripTextures: true });
    const materials = (await read(stripped.bytes)).getRoot().listMaterials();
    expect(materials.map((material) => material.getName())).toEqual(["paint", "plain"]);
    expect((await read(stripped.bytes)).getRoot().listTextures()).toHaveLength(0);
    expect(stripped.report.texturesStripped).toBe(2);

    const off = await optimizeGlb(source, { ...DEFAULT_GLB_OPTIMIZE, enabled: false });
    expect(off.bytes).toBe(source);
  });
});
