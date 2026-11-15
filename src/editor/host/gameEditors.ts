// A game project's editor sides (INV-A32, plan phase 4 step 10): the dev
// server lists the project's `editor.ts` files (`virtual:forge/game-editors`,
// tools/server/gameEditors.ts); each default-exports `defineFeatureEditor`
// from `@forge/editor-sdk` for one of the game module's features. They join
// the engine's own feature editors: Outliner icons and groups, Add Actor
// entries, Details extensions, new asset templates, asset drop rules and
// asset editor extensions work the same for a game.
//
// A file that exports something else, or names a feature the editor does not
// run, stops the editor with the file named, rather than vanishing quietly.

import type { FeatureEditorDef } from "./featureEditor.ts";

/** One file the dev server found. */
export interface GameEditorFile {
  /** Project-relative, forward slashes (`src/beacon/editor.ts`). */
  readonly path: string;
  /** Its default export. */
  readonly editor: unknown;
}

/** The game's feature editors, checked; `features` are the ids the editor runs (engine and game). */
export function collectGameEditors(files: readonly GameEditorFile[], features: readonly { readonly id: string }[]): FeatureEditorDef[] {
  const known = new Set(features.map((feature) => feature.id));
  return files.map(({ path, editor }) => {
    const def = editor as Partial<FeatureEditorDef> | null | undefined;
    if (def === null || typeof def !== "object" || def.kind !== "featureEditor") {
      throw new Error(`${path}: the default export is not defineFeatureEditor(...) from @forge/editor-sdk.`);
    }
    if (!known.has(def.feature!)) {
      throw new Error(`${path}: feature "${def.feature}" is not one of the game module's features.`);
    }
    return def as FeatureEditorDef;
  });
}
