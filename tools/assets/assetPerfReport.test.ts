// Ported from Forge WebGL tools/engine-tests.ts @ forge-webgl-final (04b5fb23): each check is
// copied unchanged and runs as a Vitest test; docs/PORT_LOG.md §2.
import assert from "node:assert/strict";
import { computeGltfGeometry, computeGltfTextures, evaluateGlbThresholds, evaluateTextureThresholds, imageDimensions, jpegDimensions, parseGlb, pngDimensions, topBy, webpDimensions } from "./assetPerfReport.ts";
import { test } from "vitest";

const check = test;

function minimalGlbJson(json: unknown): Uint8Array {
  const encoder = new TextEncoder();
  const jsonBytes = encoder.encode(JSON.stringify(json));
  const paddedJsonLength = Math.ceil(jsonBytes.byteLength / 4) * 4;
  const bytes = new Uint8Array(12 + 8 + paddedJsonLength);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.byteLength, true);
  view.setUint32(12, paddedJsonLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  bytes.set(jsonBytes, 20);
  for (let index = 20 + jsonBytes.byteLength; index < bytes.byteLength; index += 1) {
    bytes[index] = 0x20;
  }
  return bytes;
}

/** Minimal PNG signature + IHDR carrying width/height (for asset-perf tests). */
function pngHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13, false); // IHDR chunk length
  bytes.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
  view.setUint32(16, width, false);
  view.setUint32(20, height, false);
  return bytes;
}

/** Minimal JPEG: SOI + a SOF0 frame header carrying width/height. */
function jpegHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(12);
  bytes[0] = 0xff;
  bytes[1] = 0xd8; // SOI
  bytes[2] = 0xff;
  bytes[3] = 0xc0; // SOF0
  bytes[4] = 0x00;
  bytes[5] = 0x11; // segment length
  bytes[6] = 0x08; // sample precision
  const view = new DataView(bytes.buffer);
  view.setUint16(7, height, false);
  view.setUint16(9, width, false);
  return bytes;
}

/** Minimal RIFF/WEBP VP8X header carrying (width-1)/(height-1) as 24-bit LE. */
function webpVp8xHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(30);
  const ascii = (text: string, offset: number): void => {
    for (let i = 0; i < text.length; i += 1) bytes[offset + i] = text.charCodeAt(i);
  };
  ascii("RIFF", 0);
  ascii("WEBP", 8);
  ascii("VP8X", 12);
  const w = width - 1;
  const h = height - 1;
  bytes[24] = w & 0xff;
  bytes[25] = (w >> 8) & 0xff;
  bytes[26] = (w >> 16) & 0xff;
  bytes[27] = h & 0xff;
  bytes[28] = (h >> 8) & 0xff;
  bytes[29] = (h >> 16) & 0xff;
  return bytes;
}

check("asset perf: parses a GLB container and counts triangles + vertices", () => {
  // Indexed triangle mesh: 3 vertices, 3 indices → 1 triangle.
  const gltf = {
    accessors: [{ count: 3 }, { count: 3 }],
    meshes: [{ primitives: [{ mode: 4, indices: 1, attributes: { POSITION: 0 } }] }],
  };
  const glb = minimalGlbJson(gltf);
  const parsed = parseGlb(glb);
  assert.ok(parsed);
  const geometry = computeGltfGeometry(parsed!.json);
  assert.deepEqual(geometry, { triangles: 1, vertices: 3, primitives: 1 });

  // Non-binary bytes (wrong magic) parse to null, not a throw.
  assert.equal(parseGlb(new Uint8Array([1, 2, 3, 4])), null);

  // Non-indexed primitive falls back to POSITION / 3; non-triangle mode = 0 tris.
  const noIndex = computeGltfGeometry({
    accessors: [{ count: 6 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
  });
  assert.equal(noIndex.triangles, 2);
  const lines = computeGltfGeometry({
    accessors: [{ count: 4 }],
    meshes: [{ primitives: [{ mode: 1, attributes: { POSITION: 0 } }] }],
  });
  assert.deepEqual(lines, { triangles: 0, vertices: 4, primitives: 1 });
});

check("asset perf: decodes PNG / JPEG / WebP dimensions and embedded GLB textures", () => {
  assert.deepEqual(pngDimensions(pngHeader(256, 128)), { width: 256, height: 128 });
  assert.equal(pngDimensions(new Uint8Array([0, 1, 2])), null);
  assert.deepEqual(jpegDimensions(jpegHeader(640, 480)), { width: 640, height: 480 });
  assert.deepEqual(webpDimensions(webpVp8xHeader(1024, 768)), { width: 1024, height: 768 });
  // Dispatcher picks the right parser by signature.
  assert.deepEqual(imageDimensions(pngHeader(64, 64)), { width: 64, height: 64 });
  assert.equal(imageDimensions(new Uint8Array([9, 9, 9, 9])), null);

  // Embedded texture: an image referencing a bufferView into the BIN chunk.
  const png = pngHeader(512, 512);
  const json = {
    images: [{ bufferView: 0, mimeType: "image/png" }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: png.byteLength }],
  };
  const textures = computeGltfTextures(json, png);
  assert.equal(textures.count, 1);
  assert.equal(textures.maxDimension, 512);
});

check("asset perf: thresholds flag oversized assets and topBy ranks descending", () => {
  const overModel = evaluateGlbThresholds({
    path: "big.glb",
    bytes: 6_000_000,
    triangles: 300_000,
    vertices: 150_000,
    textureCount: 1,
    maxTextureDimension: 4096,
  });
  assert.equal(overModel.length, 3); // triangles + bytes + texture
  const okModel = evaluateGlbThresholds({
    path: "small.glb",
    bytes: 1000,
    triangles: 500,
    vertices: 300,
    textureCount: 0,
    maxTextureDimension: 0,
  });
  assert.deepEqual(okModel, []);

  const overTexture = evaluateTextureThresholds({ path: "t.png", bytes: 3_000_000, maxDimension: 4096 });
  assert.equal(overTexture.length, 2);

  const ranked = topBy(
    [
      { path: "a", n: 5 },
      { path: "b", n: 50 },
      { path: "c", n: 20 },
    ],
    (item) => item.n,
    2,
  );
  assert.deepEqual(
    ranked.map((r) => r.path),
    ["b", "c"],
  );
});
