// Engine content and content packs (architecture §4.8, A9).
//
// `content/engine/` holds what the engine needs to open at all (default
// material, gizmos, editor icons, sky defaults); every project sees it.
// `content/packs/<id>/` is a content pack a project picks by id in its
// manifest (`contentPacks: ["starter"]`). Nothing is copied into the game:
// the project's asset index reads these folders from the engine, under
// `engine:` labels, and the editor does not write to them.
//
// A pack id is its folder name; a pack has no manifest of its own yet.

import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { projectContentRoots, type ContentRoot } from "./scan.ts";

export const ENGINE_CONTENT_DIR = "content/engine";
export const CONTENT_PACKS_DIR = "content/packs";
/** Label prefix of the roots that live in the engine repository, not in the project. */
export const ENGINE_LABEL_PREFIX = "engine:";

/** Pack ids: the folders under `content/packs/`, sorted. */
export async function listContentPacks(engineRoot: string): Promise<string[]> {
  try {
    const entries = await readdir(join(engineRoot, CONTENT_PACKS_DIR), { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

/** One line per pack the engine does not have; empty when all are there. */
export async function contentPackProblems(engineRoot: string, packs: readonly string[]): Promise<string[]> {
  if (packs.length === 0) return [];
  const known = await listContentPacks(engineRoot);
  const have = known.length === 0 ? "none" : known.join(", ");
  return packs
    .filter((pack) => !known.includes(pack))
    .map((pack) => `Unknown content pack "${pack}"; the engine has: ${have}.`);
}

/** The engine's content, then the given packs, as read-only roots of a project. */
export function engineContentRoots(engineRoot: string, packs: readonly string[]): ContentRoot[] {
  const root = (path: string): ContentRoot => ({ label: `${ENGINE_LABEL_PREFIX}${path}`, dir: join(engineRoot, path) });
  return [root(ENGINE_CONTENT_DIR), ...packs.map((pack) => root(`${CONTENT_PACKS_DIR}/${pack}`))];
}

/** Everything a project's asset index sees: its own roots, the engine's content, its packs. */
export function projectIndexRoots(
  engineRoot: string,
  projectRoot: string,
  manifest: { readonly contentRoots: readonly string[]; readonly contentPacks: readonly string[] },
): ContentRoot[] {
  return [...projectContentRoots(projectRoot, manifest.contentRoots), ...engineContentRoots(engineRoot, manifest.contentPacks)];
}
