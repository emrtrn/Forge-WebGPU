// The selected foliage instances' cages (plan 5d step 6; Forge WebGL's foliage
// selection overlay): the model's box around each one, as lines over the scene.
// The editor gives the boxes' matrices and extents (three-free).

import { BufferAttribute, BufferGeometry, LineBasicNodeMaterial, LineSegments, type Object3D } from "three/webgpu";
import type { Vec3 } from "../../core/index.ts";
import { transformPoint, type Mat4 } from "../../engine/math/affine.ts";

export interface FoliageCage {
  readonly matrix: Mat4;
  readonly min: Readonly<Vec3>;
  readonly max: Readonly<Vec3>;
}

/** Cages drawn at most; a larger selection shows the first ones. */
export const MAX_FOLIAGE_CAGES = 4000;
const COLOR = 0xffd23f;
/** The box's edges as corner indices (bit 0 x, bit 1 y, bit 2 z). */
const EDGES = [0, 1, 2, 3, 4, 5, 6, 7, 0, 2, 1, 3, 4, 6, 5, 7, 0, 4, 1, 5, 2, 6, 3, 7];

export interface FoliageSelectionOverlay {
  readonly object: Object3D;
  set(cages: readonly FoliageCage[]): void;
  dispose(): void;
}

export function createFoliageSelectionOverlay(): FoliageSelectionOverlay {
  const material = new LineBasicNodeMaterial({ color: COLOR, transparent: true, depthTest: false, depthWrite: false });
  const lines = new LineSegments(new BufferGeometry(), material);
  lines.name = "foliage-selection";
  lines.frustumCulled = false;
  lines.renderOrder = 21;
  lines.visible = false;
  return {
    object: lines,
    set(cages) {
      lines.geometry.dispose();
      const shown = cages.slice(0, MAX_FOLIAGE_CAGES);
      lines.visible = shown.length > 0;
      if (shown.length === 0) return;
      const positions = new Float32Array(shown.length * EDGES.length * 3);
      let at = 0;
      for (const { matrix, min, max } of shown) {
        const corners = Array.from({ length: 8 }, (_, i) => transformPoint(matrix, [i & 1 ? max[0] : min[0], i & 2 ? max[1] : min[1], i & 4 ? max[2] : min[2]]));
        for (const corner of EDGES) {
          positions.set(corners[corner]!, at);
          at += 3;
        }
      }
      const geometry = new BufferGeometry();
      geometry.setAttribute("position", new BufferAttribute(positions, 3));
      lines.geometry = geometry;
    },
    dispose() {
      lines.removeFromParent();
      lines.geometry.dispose();
      material.dispose();
    },
  };
}
