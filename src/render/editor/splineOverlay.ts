// The Landscape Splines overlay (plan 5d step 5; Forge's
// landscape-spline-overlay, SceneApp.refreshLandscapeSplineOverlay @
// forge-webgl-final): control points as spheres and segments as their resolved
// centrelines, in Forge's colours, over the scene (no depth test). The active
// points and segments are yellow. The editor gives world positions
// (three-free) and picks points in screen space, so nothing here is raycast.

import { BufferAttribute, BufferGeometry, Group, InstancedMesh, LineBasicNodeMaterial, LineSegments, Matrix4, MeshBasicNodeMaterial, SphereGeometry, type Object3D } from "three/webgpu";
import type { Vec3 } from "../../core/index.ts";

export interface SplineOverlayLine {
  readonly start: Vec3;
  readonly end: Vec3;
  readonly active: boolean;
}

export interface SplineOverlayPoint {
  /** `<spline>/<point>`. */
  readonly id: string;
  readonly position: Vec3;
  readonly active: boolean;
}

export interface SplineOverlayView {
  readonly lines: readonly SplineOverlayLine[];
  readonly points: readonly SplineOverlayPoint[];
}

/** Forge: the overlay floats this far above the stored positions (metres). */
export const SPLINE_OVERLAY_LIFT = 0.4;
const MARKER_RADIUS = 0.6;
const COLORS = { point: 0x35c4ff, activePoint: 0xffd23f, line: 0xdfe7ec, activeLine: 0xffd23f };

export interface SplineOverlay {
  readonly object: Object3D;
  set(view: SplineOverlayView | null): void;
  dispose(): void;
}

export function createSplineOverlay(): SplineOverlay {
  const group = new Group();
  group.name = "landscape-spline-overlay";
  const sphere = new SphereGeometry(MARKER_RADIUS, 16, 12);
  const flat = { transparent: true, depthTest: false, depthWrite: false } as const;
  const lineMaterials = [new LineBasicNodeMaterial({ ...flat, color: COLORS.line, opacity: 0.9 }), new LineBasicNodeMaterial({ ...flat, color: COLORS.activeLine })];
  const pointMaterials = [new MeshBasicNodeMaterial({ ...flat, color: COLORS.point, opacity: 0.95 }), new MeshBasicNodeMaterial({ ...flat, color: COLORS.activePoint })];
  const matrix = new Matrix4();
  const clear = (): void => {
    for (const child of [...group.children]) {
      group.remove(child);
      if (child instanceof InstancedMesh) child.dispose();
      else (child as LineSegments).geometry.dispose();
    }
  };
  return {
    object: group,
    set(view) {
      clear();
      if (!view) return;
      for (const active of [false, true]) {
        const lines = view.lines.filter((line) => line.active === active);
        if (lines.length > 0) {
          const positions = new Float32Array(lines.length * 6);
          lines.forEach(({ start, end }, index) => positions.set([start[0], start[1] + SPLINE_OVERLAY_LIFT, start[2], end[0], end[1] + SPLINE_OVERLAY_LIFT, end[2]], index * 6));
          const geometry = new BufferGeometry();
          geometry.setAttribute("position", new BufferAttribute(positions, 3));
          const segments = new LineSegments(geometry, lineMaterials[active ? 1 : 0]);
          segments.renderOrder = active ? 22 : 21;
          segments.frustumCulled = false;
          group.add(segments);
        }
        const points = view.points.filter((point) => point.active === active);
        if (points.length > 0) {
          const markers = new InstancedMesh(sphere, pointMaterials[active ? 1 : 0], points.length);
          points.forEach(({ position }, index) => markers.setMatrixAt(index, matrix.makeTranslation(position[0], position[1] + SPLINE_OVERLAY_LIFT, position[2])));
          markers.renderOrder = active ? 24 : 23;
          markers.frustumCulled = false;
          group.add(markers);
        }
      }
    },
    dispose() {
      clear();
      group.removeFromParent();
      sphere.dispose();
      for (const material of [...lineMaterials, ...pointMaterials]) material.dispose();
    },
  };
}
