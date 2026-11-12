// Ported from Forge WebGL engine/scene/shapes.ts (SHAPE_PRIMITIVE_SIZE, shapeAssetId) @ forge-webgl-final (04b5fb23); docs/PORT_LOG.md §2.
// TRANSITION (plan 2b): old level model types World Builder's stages still read and
// write until tools/world writes the new level format; only what ported code needs.

export const SHAPE_PRIMITIVE_TYPES = [
  "cube",
  "sphere",
  "cylinder",
  "cone",
  "plane",
] as const;

export type ShapePrimitiveType = (typeof SHAPE_PRIMITIVE_TYPES)[number];

const SHAPE_ASSET_PREFIX = "shape:";
/** Base size for solid Add Actor primitives, in world units. */
export const SHAPE_PRIMITIVE_SIZE = 0.5;

/** Encode a primitive type as the synthetic asset id stored in the layout. */
export function shapeAssetId(type: ShapePrimitiveType): string {
  return `${SHAPE_ASSET_PREFIX}${type}`;
}
