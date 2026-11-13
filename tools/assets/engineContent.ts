// Engine content and content packs (architecture §4.8, A9).
//
// `content/engine/` holds what the engine needs to open at all (default
// material, gizmos, editor icons, sky defaults); every project sees it.
// `content/packs/<id>/` is a content pack a project picks by id in its
// manifest (`contentPacks: ["starter"]`). Nothing is copied into the game:
// the project's asset index reads these folders from the engine, under
// `engine:` labels, and the editor does not write to them.
//
// A pack id is its folder name. A pack may have a manifest,
// `content/packs/<id>/forge.pack.json` (`{ "schema": "forge.pack/1",
// "requires": ["starter"] }`; plan phase 3 step 8, user decision 2026-11-13):
// the packs it refers to. A project that picks it picks those too (`forge
// check`), and the asset gate checks the pack with them. Without a manifest
// a pack requires nothing.

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { PACK_MANIFEST_FILE, projectContentRoots, type ContentRoot } from "./scan.ts";

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

export const PACK_MANIFEST_SCHEMA = "forge.pack/1";

/** The packs a pack requires (its `forge.pack.json`); none without a manifest. A broken manifest throws. */
export async function packRequires(engineRoot: string, pack: string): Promise<string[]> {
  let text: string;
  try {
    text = await readFile(join(engineRoot, CONTENT_PACKS_DIR, pack, PACK_MANIFEST_FILE), "utf8");
  } catch {
    return [];
  }
  const manifest = JSON.parse(text) as { schema?: unknown; requires?: unknown };
  if (manifest.schema !== PACK_MANIFEST_SCHEMA) throw new Error(`content pack ${pack}: ${PACK_MANIFEST_FILE} needs "schema": "${PACK_MANIFEST_SCHEMA}".`);
  const requires = manifest.requires ?? [];
  if (!Array.isArray(requires) || !requires.every((entry) => typeof entry === "string")) {
    throw new Error(`content pack ${pack}: "requires" is a list of pack ids.`);
  }
  return [...requires];
}

/** `pack` and every pack it requires, at any depth, `pack` first. */
export async function packWithRequired(engineRoot: string, pack: string): Promise<string[]> {
  const out: string[] = [];
  const visit = async (id: string): Promise<void> => {
    if (out.includes(id)) return;
    out.push(id);
    for (const required of await packRequires(engineRoot, id)) await visit(required);
  };
  await visit(pack);
  return out;
}

/** One line per pack the engine does not have, or a picked pack's required pack the project does not pick; empty when all is well. */
export async function contentPackProblems(engineRoot: string, packs: readonly string[]): Promise<string[]> {
  if (packs.length === 0) return [];
  const known = await listContentPacks(engineRoot);
  const have = known.length === 0 ? "none" : known.join(", ");
  const problems = packs
    .filter((pack) => !known.includes(pack))
    .map((pack) => `Unknown content pack "${pack}"; the engine has: ${have}.`);
  for (const pack of packs.filter((id) => known.includes(id))) {
    for (const required of await packRequires(engineRoot, pack)) {
      if (!packs.includes(required)) problems.push(`Content pack "${pack}" requires "${required}"; add it to contentPacks.`);
    }
  }
  return problems;
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
