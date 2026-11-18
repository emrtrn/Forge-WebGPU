import { createHash } from "node:crypto";
import { CELL_INDEX_FILE, LEVEL_FILE, cellFileOf } from "../../src/core/index.ts";
import { fileRevision } from "../assets/revision.ts";
import { contentPath, hlodCellsOf, loadHlodLevel, type HlodInput } from "./hlodInput.ts";
import { validateHlodOptions, type HlodBuildOptions } from "./hlodBuild.ts";
import { hlodZonesOf, isHlodShapePlacement } from "../../src/engine/world/hlod.ts";

/** Bump when the shape generator's output changes: every stamp with it goes stale. */
export const HLOD_SHAPE_GENERATOR = 1;

export type Revisions = Record<string, string | null>;
export const digest = (value: unknown): string => createHash("sha256").update(canonical(value)).digest("hex");
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
export const sameRevisions = (a: Revisions, b: Revisions): boolean => digest(a) === digest(b);

/** Records bytes actually consumed, including failed/missing GLTF resource reads. */
export function trackHlodInput(input: HlodInput) {
  const revisions: Revisions = {};
  let changed = false;
  const tracked: HlodInput = { ...input, io: { async read(path) {
    const bytes = await input.io.read(path);
    const revision = bytes === null ? null : fileRevision(bytes);
    if (Object.hasOwn(revisions, path) && revisions[path] !== revision) changed = true;
    revisions[path] = revision;
    return bytes;
  } } };
  return { input: tracked, revisions, changed: () => changed };
}

export async function dependencyRevisions(input: HlodInput, paths: Iterable<string>): Promise<Revisions> {
  const result: Revisions = {};
  for (const path of [...paths].sort()) {
    const bytes = await input.io.read(path);
    result[path] = bytes === null ? null : fileRevision(bytes);
  }
  return result;
}

/** Full-level effective placements and their GUID resolution, never a whole-project hash.
 * JSON revisions come from the scan which supplied the parsed documents, not a later read.
 * Byte reads add GLTF buffers/images and resources not represented in AssetIndex. */
export async function fingerprintHlod(folder: string, input: HlodInput, options: HlodBuildOptions) {
  const level = loadHlodLevel(folder, input);
  const zoneSource = hlodZonesOf(level.actors, input.index.resolveClass)?.source;
  const cells = [...hlodCellsOf(level, input)].sort(([a], [b]) => a.localeCompare(b));
  const files = new Map(input.files.map((file) => [contentPath(file), file]));
  const dependencies = new Set<string>([`${folder}/${LEVEL_FILE}`, `${folder}/${CELL_INDEX_FILE}`]);
  const cellIndex = files.get(`${folder}/${CELL_INDEX_FILE}`)?.json as { cells?: Record<string, unknown> } | undefined;
  for (const key of Object.keys(cellIndex?.cells ?? {})) dependencies.add(`${folder}/${cellFileOf(key)}`);
  const ids = new Set<string>();
  for (const [, placements] of cells) for (const placement of placements) {
    if (isHlodShapePlacement(placement)) continue; // Primitive and colour are in `cells`, so in the stamp.
    ids.add(placement.model);
    for (const material of placement.materials) if (material) ids.add(material);
  }
  for (const actor of level.actors) if (actor.class) ids.add(actor.class);
  const resolutions: Record<string, unknown> = {};
  // AssetIndex references include slot material and texture references in metas/JSON assets.
  const references = new Map<string, string[]>();
  for (const reference of input.index.references) {
    const list = references.get(reference.from) ?? [];
    list.push(reference.target); references.set(reference.from, list);
  }
  for (const id of ids) {
    const entry = input.index.entries.get(id);
    resolutions[id] = entry ?? null; // Missing GUIDs becoming available invalidate the stamp.
    if (entry) {
      dependencies.add(contentPath(entry));
      if (entry.meta) dependencies.add(contentPath({ root: entry.root, path: entry.meta }));
      for (const target of references.get(id) ?? []) ids.add(target);
    }
  }
  const revisions: Revisions = {};
  for (const path of [...dependencies].sort()) {
    const file = files.get(path);
    if (file?.revision !== undefined) revisions[path] = file.revision;
    else {
      const bytes = await input.io.read(path);
      revisions[path] = bytes === null ? null : fileRevision(bytes);
    }
  }
  return { stamp: digest({ level: level.id, cellSize: level.settings.cellSize, loadRange: level.settings.loadRange,
    cells, resolutions, options: validateHlodOptions(options), shapes: HLOD_SHAPE_GENERATOR,
    ...(zoneSource ? { zones: zoneSource } : {}) }), revisions };
}
