// A level's painted foliage as the world sees it (plan 5c F4, decision 4): the
// `foliage.json` index and a reader for its `foliage/<x>_<z>.bin` cells. The
// run time (runtime/projectLevel.ts) or the editor provides it, as HLOD's
// source; the foliage render binding streams the cells around the camera.

import type { LevelFoliageIndex } from "../../core/level/foliage.ts";
import type { FoliageInstances } from "../../core/level/foliageCells.ts";
import { createServiceKey } from "../../core/world/services.ts";

/** Cells the editor holds edits of (plan 5d step 6): drawn as they are now, whatever the files say. */
export interface LevelFoliageEdits {
  /** Keys of the edited cells. */
  keys(): Iterable<string>;
  /** What an edited cell holds per type; null for a cell that is not edited. */
  cell(key: string): readonly { readonly type: string; readonly instances: FoliageInstances }[] | null;
  /** An edited cell changed; returns the unsubscribe. */
  onChange(listener: (key: string) => void): () => void;
}

export interface LevelFoliageSource {
  /** Null: the level has no painted foliage (or its index is unreadable). */
  readonly index: LevelFoliageIndex | null;
  /** The editor bumps this when the level's foliage files change; the binding streams them again. */
  readonly revision?: number;
  /** A level-relative file (`foliageCellFileOf(key)`); null when missing. */
  load(file: string): Promise<ArrayBuffer | null>;
  /** The editor's unsaved and saved edits of this session; the game has none. */
  readonly edits?: LevelFoliageEdits;
}

export const LevelFoliageSourceKey = createServiceKey<LevelFoliageSource>("forge.levelFoliageSource");
