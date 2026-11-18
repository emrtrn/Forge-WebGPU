// A level's painted foliage as the world sees it (plan 5c F4, decision 4): the
// `foliage.json` index and a reader for its `foliage/<x>_<z>.bin` cells. The
// run time (runtime/projectLevel.ts) or the editor provides it, as HLOD's
// source; the foliage render binding streams the cells around the camera.

import type { LevelFoliageIndex } from "../../core/level/foliage.ts";
import { createServiceKey } from "../../core/world/services.ts";

export interface LevelFoliageSource {
  /** Null: the level has no painted foliage (or its index is unreadable). */
  readonly index: LevelFoliageIndex | null;
  /** The editor bumps this when the level's foliage files change; the binding streams them again. */
  readonly revision?: number;
  /** A level-relative file (`foliageCellFileOf(key)`); null when missing. */
  load(file: string): Promise<ArrayBuffer | null>;
}

export const LevelFoliageSourceKey = createServiceKey<LevelFoliageSource>("forge.levelFoliageSource");
