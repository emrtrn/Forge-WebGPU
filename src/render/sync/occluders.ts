// Occluders of a static batch (plan 5c R9a O2, user decision 2026-11-18):
// with a level's occlusion culling on, the batch's large opaque instances
// (world bounding-sphere radius at least `minRadius`: walls, building shells;
// not props) are copied into a depth-only twin `InstancedMesh` per part,
// under the world's occluder scene (no lights, nothing else: drawing it never
// updates a shadow map or a reflection). The host draws that scene from the
// main camera into a depth target before the frame (the occluder pre-pass),
// builds a Hi-Z from it and culls the GPU-driven batches' instances behind it
// (O3 / O4).
//
// - Automatic, no authoring: radius from the part's geometry and the
//   instance's largest axis scale. Transparent parts never occlude.
// - The twins follow every flush that changed placements (moves included);
//   capacity follows the batch. Geometry is the batch's (not owned here).

import { DoubleSide, InstancedMesh, Matrix4, MeshBasicNodeMaterial, type BufferGeometry, type Material, type Object3D } from "three/webgpu";

let depthOnly: MeshBasicNodeMaterial | null = null;
/** One shared material: depth only, both sides (a wall seen from behind still occludes). */
function occluderMaterial(): MeshBasicNodeMaterial {
  depthOnly ??= new MeshBasicNodeMaterial({ colorWrite: false, side: DoubleSide });
  return depthOnly;
}

export interface OccluderPart {
  readonly geometry: BufferGeometry;
  readonly material: Material | Material[];
  readonly local: Matrix4;
  readonly name: string;
}

export interface Occluders {
  /** Rewrites the twins from the placements' matrices; `minRadius` 0 removes them. */
  update(parts: readonly OccluderPart[], placements: Iterable<Matrix4>, capacity: number, minRadius: number): void;
  /** Instances drawn as occluders now (every part). */
  readonly count: number;
  dispose(): void;
}

/** World bounding-sphere radius from which an instance occludes (m): walls and building shells, not props. */
export const OCCLUDER_MIN_RADIUS = 2;

const opaque = (material: Material | Material[]): boolean =>
  (Array.isArray(material) ? material : [material]).every((one) => !one.transparent);

export function createOccluders(parent: Object3D, name: string): Occluders {
  let meshes: (InstancedMesh | null)[] = [];
  let built: readonly OccluderPart[] | null = null;
  let size = 0;
  let count = 0;
  const world = new Matrix4();
  const drop = (): void => {
    for (const mesh of meshes) { mesh?.removeFromParent(); mesh?.dispose(); }
    meshes = []; built = null; size = 0; count = 0;
  };
  return {
    update(parts, placements, capacity, minRadius) {
      if (!(minRadius > 0)) { if (meshes.length) drop(); return; }
      if (built !== parts || size < capacity) {
        drop();
        built = parts; size = capacity;
        meshes = parts.map((part) => {
          if (!opaque(part.material)) return null;
          const mesh = new InstancedMesh(part.geometry, occluderMaterial(), capacity);
          mesh.name = `${name}/${part.name} occluder`;
          mesh.matrixAutoUpdate = false;
          mesh.castShadow = false; mesh.receiveShadow = false;
          parent.add(mesh);
          return mesh;
        });
      }
      count = 0;
      const list = [...placements];
      parts.forEach((part, index) => {
        const mesh = meshes[index];
        if (!mesh) return;
        if (!part.geometry.boundingSphere) part.geometry.computeBoundingSphere();
        const radius = part.geometry.boundingSphere!.radius;
        let at = 0;
        for (const placement of list) {
          world.multiplyMatrices(placement, part.local);
          if (radius * world.getMaxScaleOnAxis() >= minRadius) mesh.setMatrixAt(at++, world);
        }
        mesh.count = at;
        mesh.visible = at > 0;
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
        count += at;
      });
    },
    get count() { return count; },
    dispose: drop,
  };
}
