// GLB optimisation on import (plan phase 4 step 6e; INV-H22; Forge WebGL's
// tools/optimize-mesh-glb.mjs and strip-embedded-textures.mjs @
// forge-webgl-final; user decisions 2026-11-14: on the server, on by
// default, the settings in the model's meta `import.optimize`, Reimport uses
// them again; normal maps kept unless asked; KTX2 later, with KTX-Software).
//
// The chain, in Forge's order where it applies:
//   1. strip      (optional) every texture off the materials, the materials
//                 kept in count and order: the model's slots draw with project
//                 materials (`import.materials`), so the GLB's pixels are
//                 loaded and never shown (strip-embedded-textures.mjs).
//   2. drop normal maps (optional; Forge dropped them by default for
//                 generator output, here they are kept unless asked).
//   3. resize + WebP  colour and data textures to at most `maxTextureSize`
//                 on the longer edge, re-encoded as WebP (EXT_texture_webp,
//                 three's GLTFLoader reads it). Forge went to KTX2 here; that
//                 needs KTX-Software and comes later.
//   4. meshopt    geometry (EXT_meshopt_compression; the renderer installs
//                 MeshoptDecoder).
// dedup + prune run first, so shared data is written once; materials are never
// merged (a model's slots are its unique materials in order, `import.materials`
// is indexed by them: Forge kept them for the same reason). The result keeps
// the file's name (sidecar-free here, but a reimport must not change paths).

import { NodeIO, PropertyType, type Document, type Texture } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, meshopt, prune, textureCompress } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";

import type { GlbOptimizeSettings } from "./glbOptimizeSettings.ts";

export { DEFAULT_GLB_OPTIMIZE, type GlbOptimizeSettings } from "./glbOptimizeSettings.ts";

export interface GlbOptimizeReport {
  readonly bytesBefore: number;
  readonly bytesAfter: number;
  readonly textures: number;
  readonly normalMapsDropped: number;
  readonly texturesStripped: number;
}

let io: NodeIO | null = null;
async function nodeIO(): Promise<NodeIO> {
  if (io) return io;
  await MeshoptDecoder.ready;
  await MeshoptEncoder.ready;
  io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });
  return io;
}

function detachTextures(document: Document, keep: (slot: string) => boolean): number {
  let removed = 0;
  for (const material of document.getRoot().listMaterials()) {
    const slots: [string, () => Texture | null, (texture: null) => void][] = [
      ["baseColor", () => material.getBaseColorTexture(), (t) => material.setBaseColorTexture(t)],
      ["normal", () => material.getNormalTexture(), (t) => material.setNormalTexture(t)],
      ["occlusion", () => material.getOcclusionTexture(), (t) => material.setOcclusionTexture(t)],
      ["metallicRoughness", () => material.getMetallicRoughnessTexture(), (t) => material.setMetallicRoughnessTexture(t)],
      ["emissive", () => material.getEmissiveTexture(), (t) => material.setEmissiveTexture(t)],
    ];
    for (const [slot, get, set] of slots) {
      if (get() !== null && !keep(slot)) {
        set(null);
        removed += 1;
      }
    }
  }
  return removed;
}

/** Optimises a GLB (binary glTF); a disabled setting returns the bytes as they are. */
export async function optimizeGlb(bytes: Uint8Array, settings: GlbOptimizeSettings): Promise<{ readonly bytes: Uint8Array; readonly report: GlbOptimizeReport }> {
  const before = bytes.byteLength;
  if (!settings.enabled) return { bytes, report: { bytesBefore: before, bytesAfter: before, textures: 0, normalMapsDropped: 0, texturesStripped: 0 } };
  const reader = await nodeIO();
  const document = await reader.readBinary(bytes);
  const texturesStripped = settings.stripTextures ? detachTextures(document, () => false) : 0;
  const normalMapsDropped = !settings.stripTextures && !settings.keepNormals ? detachTextures(document, (slot) => slot !== "normal") : 0;
  await document.transform(dedup({ propertyTypes: [PropertyType.ACCESSOR, PropertyType.MESH, PropertyType.TEXTURE] }), prune());
  const textures = document.getRoot().listTextures().length;
  const size = Math.max(1, Math.round(settings.maxTextureSize));
  if (textures > 0) {
    await document.transform(textureCompress({ encoder: sharp, targetFormat: "webp", resize: [size, size] }));
  }
  if (settings.meshopt) await document.transform(meshopt({ encoder: MeshoptEncoder, level: "medium" }));
  const out = await reader.writeBinary(document);
  return { bytes: out, report: { bytesBefore: before, bytesAfter: out.byteLength, textures, normalMapsDropped, texturesStripped } };
}
