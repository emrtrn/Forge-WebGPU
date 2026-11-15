// A game project's editor sides (INV-A32, architecture §4.3; plan phase 4
// step 10): like the engine's `features/*/editor.ts`, a game's feature
// default-exports `defineFeatureEditor(...)` from an `editor.ts` file (the
// only files, with `src/editor/`, that may import `@forge/editor-sdk`,
// tools/project/check.ts). The game never names them: the dev server finds
// them (the project's own `editor.ts`, every `editor.ts` under `src/`) and
// serves them to the editor as `virtual:forge/game-editors`. The editor is
// dev only, so a build serves an empty list and the game's bundle never
// carries them (verify:dist).

import { readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

export const GAME_EDITORS_ID = "virtual:forge/game-editors";

const EDITOR_FILE = "editor.ts";

/** Whether a project-relative path (forward slashes) is a game editor side. */
export function isGameEditorPath(projectRelative: string): boolean {
  if (projectRelative === EDITOR_FILE) return true;
  if (!projectRelative.startsWith("src/") || !projectRelative.endsWith(`/${EDITOR_FILE}`)) return false;
  return !projectRelative.split("/").some((part) => part.startsWith(".") || part === "node_modules");
}

/** The project's editor sides, project-relative with forward slashes, sorted. */
export async function findGameEditors(projectRoot: string): Promise<string[]> {
  const found: string[] = [];
  const walk = async (folder: string): Promise<void> => {
    let entries;
    try {
      entries = await readdir(folder, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const path = join(folder, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && entry.name === EDITOR_FILE) found.push(relative(projectRoot, path).split("\\").join("/"));
    }
  };
  try {
    const top = await readdir(projectRoot, { withFileTypes: true });
    if (top.some((entry) => entry.isFile() && entry.name === EDITOR_FILE)) found.push(EDITOR_FILE);
  } catch {
    return [];
  }
  await walk(join(projectRoot, "src"));
  return found.filter(isGameEditorPath).sort();
}

/**
 * Source of `virtual:forge/game-editors`: `{ path, editor }` for each file,
 * `editor` its default export (the editor checks it is a feature editor).
 */
export function gameEditorsSource(projectRoot: string | null, files: readonly string[]): string {
  if (projectRoot === null || files.length === 0) return "export default [];\n";
  const lines = files.map((file, index) => `import e${index} from ${JSON.stringify(resolve(projectRoot, file).split("\\").join("/"))};`);
  const entries = files.map((file, index) => `{ path: ${JSON.stringify(file)}, editor: e${index} }`);
  return `${lines.join("\n")}\nexport default [${entries.join(", ")}];\n`;
}
