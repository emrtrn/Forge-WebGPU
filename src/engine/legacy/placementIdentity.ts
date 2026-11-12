// Ported from Forge WebGL engine/scene/placementIdentity.ts (isPlacementId, isSemanticRole, findDuplicatePlacementId) @ forge-webgl-final (04b5fb23); docs/PORT_LOG.md §2.
// TRANSITION (plan 2b): old level model types World Builder's stages still read and
// write until tools/world writes the new level format; only what ported code needs.

export const PLACEMENT_ID_MAX_LENGTH = 128;
export const SEMANTIC_ROLE_MAX_LENGTH = 128;

/** Editor ids look like `plc-<base36>-<base36>`; anything path- and JSON-key-safe is accepted. */
const PLACEMENT_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/;
/** Dotted segments, each starting with a lowercase letter: `prop.sign.speedLimit`. */
const SEMANTIC_ROLE = /^[a-z][A-Za-z0-9_]*(?:\.[a-z][A-Za-z0-9_]*)*$/;

export function isPlacementId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= PLACEMENT_ID_MAX_LENGTH &&
    PLACEMENT_ID.test(value)
  );
}

export function isSemanticRole(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= SEMANTIC_ROLE_MAX_LENGTH &&
    SEMANTIC_ROLE.test(value)
  );
}

/** The first id that appears twice, or null. Ids are unique per layout. */
export function findDuplicatePlacementId(
  instances: ReadonlyArray<{ placements: ReadonlyArray<{ id?: unknown }> }>,
): string | null {
  const seen = new Set<string>();
  for (const group of instances) {
    for (const placement of group.placements) {
      if (typeof placement.id !== "string") continue;
      if (seen.has(placement.id)) return placement.id;
      seen.add(placement.id);
    }
  }
  return null;
}
