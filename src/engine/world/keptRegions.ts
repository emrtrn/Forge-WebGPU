import { createServiceKey } from "../../core/world/services.ts";
import type { WorldCellBounds } from "../../core/grid/worldGrid.ts";

/** Editor authoring holds; runtime has no provider. Terrain and level cells share the rectangles. */
export const KeptRegionsKey = createServiceKey<{ regions(): readonly WorldCellBounds[] }>("forge.keptRegions");
