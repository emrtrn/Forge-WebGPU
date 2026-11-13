// Procedural geometry of `forge.shape` (phase 3 decision 11: shapes are not
// assets). Sizes and tessellation are Forge WebGL's (src/scene/shapePrimitives.ts):
// solids have a 0.5 m base size, the plane a 1 m footprint laid flat on XZ;
// the actor's scale sizes them.

import { BoxGeometry, ConeGeometry, CylinderGeometry, PlaneGeometry, SphereGeometry, type BufferGeometry } from "three/webgpu";

export type ShapePrimitive = "cube" | "sphere" | "cylinder" | "cone" | "plane";

/** Forge's SHAPE_PRIMITIVE_SIZE (the schema's SHAPE_BASE_SIZE). */
export const SHAPE_SOLID_SIZE = 0.5;
/** Forge's SHAPE_PLANE_SIZE. */
export const SHAPE_PLANE_SIZE = 1;

export function createShapeGeometry(primitive: ShapePrimitive): BufferGeometry {
  const size = SHAPE_SOLID_SIZE;
  switch (primitive) {
    case "cube":
      return new BoxGeometry(size, size, size);
    case "sphere":
      return new SphereGeometry(size / 2, 32, 16);
    case "cylinder":
      return new CylinderGeometry(size / 2, size / 2, size, 32);
    case "cone":
      return new ConeGeometry(size / 2, size, 32);
    case "plane": {
      // PlaneGeometry faces +Z; lay it on the ground.
      const geometry = new PlaneGeometry(SHAPE_PLANE_SIZE, SHAPE_PLANE_SIZE);
      geometry.rotateX(-Math.PI / 2);
      return geometry;
    }
  }
}
