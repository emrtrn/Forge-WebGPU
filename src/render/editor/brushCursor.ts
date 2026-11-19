// The Landscape brush ring (plan 5d step 2; Forge's landscape-brush-cursor,
// SceneApp.ensureLandscapeBrushCursor @ forge-webgl-final): a closed line in
// the drawing layer, in Forge's yellow (a Line through the first point again:
// the renderer draws no LineLoop). The editor gives the ring's points
// already on the terrain (three-free), so the ring follows slopes; it draws
// over the scene (no depth test), as the brush must show where it lands.

import { BufferAttribute, BufferGeometry, Line, LineBasicNodeMaterial, type Object3D } from "three/webgpu";
import type { Vec3 } from "../../core/index.ts";

/** Forge's cursor colour. */
const BRUSH_COLOR = 0xf2d16b;
/** Points the ring holds at most. */
const MAX_POINTS = 256;
/** Room for the closing point. */
const MAX_VERTICES = MAX_POINTS + 1;

export interface BrushCursor {
  readonly object: Object3D;
  /** Draws the ring through these world points (closed); null hides it. */
  set(points: readonly Vec3[] | null): void;
  dispose(): void;
}

export function createBrushCursor(): BrushCursor {
  const positions = new Float32Array(MAX_VERTICES * 3);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setDrawRange(0, 0);
  const material = new LineBasicNodeMaterial({ color: BRUSH_COLOR, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false });
  const line = new Line(geometry, material);
  line.name = "landscape-brush-cursor";
  line.frustumCulled = false;
  line.renderOrder = 20;
  line.visible = false;
  return {
    object: line,
    set(points) {
      if (!points || points.length < 2) {
        line.visible = false;
        return;
      }
      const count = Math.min(points.length, MAX_POINTS);
      for (let i = 0; i < count; i += 1) positions.set(points[i]!, i * 3);
      positions.set(points[0]!, count * 3);
      (geometry.getAttribute("position") as BufferAttribute).needsUpdate = true;
      geometry.setDrawRange(0, count + 1);
      line.visible = true;
    },
    dispose() {
      line.removeFromParent();
      geometry.dispose();
      material.dispose();
    },
  };
}
