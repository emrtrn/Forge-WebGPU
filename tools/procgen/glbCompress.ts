// Meshopt compression of a generated GLB (EXT_meshopt_compression, quantised
// attributes; the runtime loader decodes it, gltfModels.ts): a tree's LOD0
// shrinks to about 40 %. Deterministic. Every attribute stays, the custom ones
// and UVs no material reads too (the editor's import chain, optimizeGlb.ts,
// prunes those).

import { NodeIO } from "@gltf-transform/core";
import { EXTMeshoptCompression, KHRMeshQuantization } from "@gltf-transform/extensions";
import { meshopt } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";

let io: NodeIO | null = null;

export async function compressGlb(bytes: Uint8Array): Promise<Uint8Array> {
  if (!io) {
    await MeshoptDecoder.ready;
    await MeshoptEncoder.ready;
    io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization]).registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });
  }
  const document = await io.readBinary(bytes);
  document.setLogger({ debug() {}, info() {}, warn() {}, error(text: string) { throw new Error(text); } });
  await document.transform(meshopt({ encoder: MeshoptEncoder, level: "medium" }));
  return io.writeBinary(document);
}
