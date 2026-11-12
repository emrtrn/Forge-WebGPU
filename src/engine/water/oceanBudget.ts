// Ported from Forge WebGL engine/scene/oceanBudget.ts (OCEAN_LIMITS) @ forge-webgl-final (04b5fb23); docs/PORT_LOG.md §2.
// The ocean budget World Builder sizes islands with; the ocean model itself waits for Faz 7.
/** Three-free native coverage budget shared by authoring and rendering. */
export const OCEAN_LIMITS = { bodies: 1, cells: 1048576, axisCells: 2048 } as const;
