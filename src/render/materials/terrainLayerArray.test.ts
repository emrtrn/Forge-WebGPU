// Forge WebGL's terrain layer array checks (tests/engine/terrainLayerArray.test.ts
// and the detail atlas check of terrainRender.test.ts @ forge-webgl-final),
// rewritten for three/webgpu: R, plan phase 5a step 3. Sources carry their flip
// (Forge read `texture.flipY`); the roughness packing is new.
import { describe, expect, test } from "vitest";
import { DataTexture, FloatType, LinearMipmapLinearFilter, NoColorSpace, RedFormat, RepeatWrapping, SRGBColorSpace, Texture, type DataArrayTexture } from "three/webgpu";
import {
  createTerrainLayerArray,
  flipTerrainLayerRows,
  packTerrainLayerRoughness,
  readTerrainLayerPixels,
  resampleTerrainLayer,
  TERRAIN_LAYER_ARRAY_MAX_SIZE,
  terrainLayerArraySize,
} from "./terrainLayerArray.ts";

/** RGBA8 data texture whose texel (x, y) is `[x, y, layer, 255 - x]`. */
function gradient(width: number, height: number, layer: number, flipY = false): DataTexture {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) data.set([x, y, layer, 255 - x], (y * width + x) * 4);
  }
  const texture = new DataTexture(data, width, height);
  texture.flipY = flipY;
  texture.anisotropy = 4 + layer;
  texture.needsUpdate = true;
  return texture;
}

const source = (texture: Texture | null) => (texture ? { texture, flipY: texture.flipY } : null);

function layerPixels(array: DataArrayTexture, layer: number): Uint8Array {
  const { width, height } = array.image;
  return (array.image.data as Uint8Array).subarray(layer * width * height * 4, (layer + 1) * width * height * 4);
}

describe("terrain layer array", () => {
  test("shared size is the largest edge, capped", () => {
    expect(terrainLayerArraySize([{ width: 512, height: 512 }, { width: 1254, height: 1254 }, { width: 1024, height: 256 }])).toBe(1254);
    expect(terrainLayerArraySize([{ width: 300, height: 900 }])).toBe(900);
    expect(terrainLayerArraySize([{ width: 8192, height: 4096 }])).toBe(TERRAIN_LAYER_ARRAY_MAX_SIZE);
  });

  test("resampling copies same-size layers and blends tiling layers with wrap", () => {
    const pixels = { width: 2, height: 2, data: new Uint8Array([0, 0, 0, 0, 100, 100, 100, 100, 0, 0, 0, 0, 100, 100, 100, 100]) };
    const same = resampleTerrainLayer(pixels, 2);
    expect([...same]).toEqual([...pixels.data]);
    expect(same).not.toBe(pixels.data);
    // 2 -> 4 with wrap: texel 0 sits between source column 1 (wrapped) and 0.
    const up = resampleTerrainLayer(pixels, 4);
    expect([0, 1, 2, 3].map((x) => up[x * 4])).toEqual([25, 25, 75, 75]);
    // A uniform layer stays uniform at any size (no edge darkening from clamping).
    const flat = { width: 3, height: 5, data: new Uint8Array(3 * 5 * 4).fill(77) };
    expect(resampleTerrainLayer(flat, 7).every((value) => value === 77)).toBe(true);
  });

  test("a flip reverses rows; data textures read without a canvas; unreadable sources give null", () => {
    const rows = { width: 1, height: 3, data: new Uint8Array([1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3]) };
    expect([...flipTerrainLayerRows(rows).data]).toEqual([3, 3, 3, 3, 2, 2, 2, 2, 1, 1, 1, 1]);
    const upright = readTerrainLayerPixels(gradient(2, 3, 0))!;
    expect([...upright.data.subarray(0, 4)]).toEqual([0, 0, 0, 255]);
    const flipped = readTerrainLayerPixels(gradient(2, 3, 0, true))!;
    expect([...flipped.data.subarray(0, 4)]).toEqual([0, 2, 0, 255]);
    // The caller's flip wins over the texture's (textures upload unflipped here).
    expect([...readTerrainLayerPixels(gradient(2, 3, 0), true)!.data.subarray(0, 4)]).toEqual([0, 2, 0, 255]);
    expect(readTerrainLayerPixels(new Texture())).toBeNull();
    expect(readTerrainLayerPixels(new DataTexture(new Float32Array(4), 2, 2, RedFormat, FloatType))).toBeNull();
    const compressed = gradient(2, 2, 0) as DataTexture & { isCompressedTexture?: boolean };
    compressed.isCompressedTexture = true;
    expect(readTerrainLayerPixels(compressed)).toBeNull();
  });

  test("textured layers pack in order, untextured layers keep -1, settings match the layer textures", () => {
    const textures = [gradient(4, 4, 10), null, gradient(2, 2, 20, true), new Texture(), gradient(4, 2, 30)];
    const { texture, index } = createTerrainLayerArray(textures.map(source));
    try {
      expect(index).toEqual([0, -1, 1, -1, 2]);
      expect(texture).not.toBeNull();
      expect([texture!.image.width, texture!.image.height, texture!.image.depth]).toEqual([4, 4, 3]);
      expect([...layerPixels(texture!, 0)]).toEqual([...((textures[0] as DataTexture).image.data as Uint8Array)]);
      expect(layerPixels(texture!, 1).every((value, i) => i % 4 !== 2 || value === 20)).toBe(true);
      expect(layerPixels(texture!, 2).every((value, i) => i % 4 !== 2 || value === 30)).toBe(true);
      expect(texture!.colorSpace).toBe(SRGBColorSpace);
      expect([texture!.wrapS, texture!.wrapT]).toEqual([RepeatWrapping, RepeatWrapping]);
      expect(texture!.minFilter).toBe(LinearMipmapLinearFilter);
      expect(texture!.generateMipmaps).toBe(true);
      expect(texture!.anisotropy).toBe(34);
    } finally {
      texture?.dispose();
    }
    expect(createTerrainLayerArray([null, source(new Texture())])).toEqual({ texture: null, index: [-1, -1] });
    expect(createTerrainLayerArray([source(gradient(2, 2, 1))], true).texture!.colorSpace).toBe(NoColorSpace);
  });

  test("a re-uploaded source texture is decoded again", () => {
    const texture = gradient(1, 1, 5);
    expect(readTerrainLayerPixels(texture)!.data[2]).toBe(5);
    (texture.image.data as Uint8Array)[2] = 9;
    expect(readTerrainLayerPixels(texture)!.data[2]).toBe(5);
    texture.needsUpdate = true;
    expect(readTerrainLayerPixels(texture)!.data[2]).toBe(9);
  });

  test("detail atlas variants become isolated repeatable array slices, including flipped sources", () => {
    for (const flipY of [false, true]) {
      const data = new Uint8Array(4 * 4 * 4);
      for (let y = 0; y < 4; y += 1) {
        for (let x = 0; x < 4; x += 1) data.set([(Math.floor(y / 2) * 2 + Math.floor(x / 2) + 1) * 40, 0, 0, 255], (y * 4 + x) * 4);
      }
      const atlas = new DataTexture(data, 4, 4);
      const base = new DataTexture(new Uint8Array(2 * 2 * 4).fill(128), 2, 2);
      const array = createTerrainLayerArray([{ texture: base, flipY: false }, { texture: atlas, flipY }], true, [1, 2]);
      expect(array.index).toEqual([0, 1]);
      expect([array.texture!.image.depth, array.texture!.image.width]).toEqual([5, 2]);
      const pixels = array.texture!.image.data as Uint8Array;
      const reds = flipY ? [120, 160, 40, 80] : [40, 80, 120, 160];
      reds.forEach((red, variant) => {
        for (let pixel = 0; pixel < 4; pixel += 1) expect(pixels[(variant + 1) * 16 + pixel * 4]).toBe(red);
      });
      array.texture!.dispose();
    }
  });

  test("roughness packs the map's green into the albedo's alpha, or into the base colour without an albedo", () => {
    const albedo = { width: 2, height: 1, data: new Uint8Array([10, 20, 30, 255, 40, 50, 60, 255]) };
    const rough = { width: 2, height: 1, data: new Uint8Array([0, 7, 0, 255, 0, 9, 0, 255]) };
    expect([...packTerrainLayerRoughness(albedo, rough, "#000000").data]).toEqual([10, 20, 30, 7, 40, 50, 60, 9]);
    expect([...albedo.data]).toEqual([10, 20, 30, 255, 40, 50, 60, 255]);
    const filled = packTerrainLayerRoughness(null, { width: 1, height: 1, data: new Uint8Array([0, 128, 0, 255]) }, "#336699");
    expect([...filled.data]).toEqual([0x33, 0x66, 0x99, 128]);
    // A smaller map is resampled to the albedo's size (wrapping, like the canvas draw stretched it).
    const stretched = packTerrainLayerRoughness(albedo, { width: 1, height: 1, data: new Uint8Array([0, 50, 0, 255]) }, "#000000");
    expect([stretched.data[3], stretched.data[7]]).toEqual([50, 50]);
  });
});
