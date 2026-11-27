import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
import type { Vec3 } from "../../src/core/index.ts";
import { triangleMeshPrimitive } from "../../src/engine/physics/triangleMeshCollider.ts";
import type { CollisionTriangleMesh } from "../../src/engine/physics/physicsService.ts";

export function createDiskCollisionGeometry(resolvePath: (id: string) => string) {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
  return async (id: string): Promise<CollisionTriangleMesh[]> => {
    await MeshoptDecoder.ready;
    const doc = await io.read(resolvePath(id));
    const output: CollisionTriangleMesh[] = [];
    const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
    scene?.traverse((node) => {
      for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
        const position = primitive.getAttribute("POSITION");
        if (!position || primitive.getMode() !== 4 || position.getCount() < 3) continue;
        const buffer: number[] = [];
        const vertex: Vec3 = [0, 0, 0];
        for (let i = 0; i < position.getCount(); i += 1) buffer.push(...position.getElement(i, vertex));
        const indices = primitive.getIndices()?.getArray() ?? Uint32Array.from({ length: position.getCount() }, (_, index) => index);
        const mesh = triangleMeshPrimitive(buffer, indices, node.getWorldMatrix());
        output.push({ positions: mesh.vertices!.flat(), indices: mesh.indices! });
      }
    });
    return output;
  };
}
