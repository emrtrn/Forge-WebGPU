// A GLB for the tests (plan phase 4 step 6e): one triangle with a 2048 px
// colour map and a normal map (noise: prune drops a single-colour texture),
// and a second, plain material. Test-only.

import { Document, NodeIO } from "@gltf-transform/core";
import sharp from "sharp";

export /** A triangle with a 2048 px PNG colour map and a normal map, two materials. */
async function texturedGlb(): Promise<Uint8Array> {
  const document = new Document();
  const buffer = document.createBuffer();
  // Noise: prune turns a single-colour texture into a factor and drops it.
  const noise = (width: number, height: number, seed: number) => {
    const pixels = Buffer.alloc(width * height * 3);
    let state = seed;
    for (let i = 0; i < pixels.length; i += 1) pixels[i] = (state = (state * 1103515245 + 12345) >>> 0) >>> 24;
    return sharp(pixels, { raw: { width, height, channels: 3 } }).png().toBuffer();
  };
  const png = await noise(2048, 1024, 1);
  const flat = await noise(1024, 1024, 2);
  const color = document.createTexture("color").setImage(new Uint8Array(png)).setMimeType("image/png");
  const normal = document.createTexture("normal").setImage(new Uint8Array(flat)).setMimeType("image/png");
  const paint = document.createMaterial("paint").setBaseColorTexture(color).setNormalTexture(normal);
  const plain = document.createMaterial("plain");
  const position = document.createAccessor().setType("VEC3").setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])).setBuffer(buffer);
  const uv = document.createAccessor().setType("VEC2").setArray(new Float32Array([0, 0, 1, 0, 0, 1])).setBuffer(buffer);
  const mesh = document
    .createMesh()
    .addPrimitive(document.createPrimitive().setAttribute("POSITION", position).setAttribute("TEXCOORD_0", uv).setMaterial(paint))
    .addPrimitive(document.createPrimitive().setAttribute("POSITION", position).setMaterial(plain));
  document.createScene().addChild(document.createNode().setMesh(mesh));
  return new NodeIO().writeBinary(document);
}

