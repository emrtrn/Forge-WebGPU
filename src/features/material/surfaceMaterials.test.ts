import { describe, expect, test } from "vitest";
import { createJsonAsset } from "../../core/index.ts";
import { assetUrlsFromIndex } from "../../render/resources/assetUrls.ts";
import { createResourceCache } from "../../render/resources/resourceCache.ts";
import { createSurfaceMaterials } from "../../render/resources/surfaceMaterials.ts";
import { MaterialAssetType } from "./schema.ts";

const MATERIAL = "ast_00000000000000000000000000000010";
const TEXTURE = "ast_00000000000000000000000000000011";

function source(json: unknown, type = "forge.material") {
  const urls = assetUrlsFromIndex(
    { [MATERIAL]: { type, file: "content/m.material.json" }, [TEXTURE]: { type: "forge.texture", file: "content/t.png", import: { anisotropy: 8, mipmaps: true } } },
    (file) => `/read?path=${file}`,
  );
  const warnings: string[] = [];
  const loads: string[] = [];
  const cache = createResourceCache();
  const materials = createSurfaceMaterials({
    urls,
    type: MaterialAssetType,
    textures: { load: async (guid, colorSpace) => { loads.push(`${guid}:${colorSpace}`); throw new Error("no image in Node"); } },
    textureOwner: cache.owner("material textures"),
    strict: true,
    fetchJson: async () => structuredClone(json),
    warn: (message) => warnings.push(message),
  });
  return { materials, warnings, loads, cache };
}

describe("material assets for the renderer", () => {
  test("a material is read by GUID, keyed with its contributions; a texture that fails leaves its slot empty", async () => {
    const doc = createJsonAsset(MaterialAssetType, { baseColor: "#336699", roughness: 0.3, baseColorTexture: TEXTURE }, MATERIAL).value;
    const { materials, warnings, loads, cache } = source(doc);
    expect(materials.key(MATERIAL)).toBe(`material:${MATERIAL}:none`);
    const material = await materials.build(MATERIAL);
    expect(material.name).toBe(MATERIAL);
    expect((material as unknown as { roughness: number }).roughness).toBe(0.3);
    expect(loads).toEqual([`${TEXTURE}:srgb`]);
    expect(warnings).toEqual([`forge render: material ${MATERIAL} draws baseColorTexture without texture ${TEXTURE}`]);
    expect(cache.stats().failed).toBe(1);
  });

  test("an older or lossy file follows the normalisation rules; a GUID that is no material is refused", async () => {
    await expect(source({ schema: "forge.material/1", id: MATERIAL, shiny: true }).materials.build(MATERIAL)).rejects.toThrow(/no such field/);
    await expect(source({}, "forge.texture").materials.build(MATERIAL)).rejects.toThrow(/not a material/);
  });
});
