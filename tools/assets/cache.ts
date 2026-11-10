// The GUID -> path cache (architecture §4.6, decision A10).
//
// The asset index is derived data: identity lives next to every asset, so the
// cache is never committed and is rebuilt when it is missing or unreadable.
// It sits at `<project>/.forge-cache/asset-index.json`, the same place in the
// engine repo and in a game project; `.forge-cache/` is git-ignored.
//
// The cache is a cold read for consumers that need GUID -> path or "who uses
// this" without scanning (dev server start, build). It carries no file stamps
// yet: a consumer that must be current rebuilds it. Incremental rebuilds wait
// for the 50,000-actor measurement.

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { isJsonObject, type AssetEntry, type AssetIndex } from "../../src/core/index.ts";

export const ASSET_INDEX_CACHE_SCHEMA = "forge.assetIndexCache/1";
export const CACHE_DIRECTORY = ".forge-cache";
export const ASSET_INDEX_CACHE_FILE = "asset-index.json";

export interface CachedReference {
  /** GUID of the referring asset. */
  readonly from: string;
  /** `<root>/<path>` of the file the reference is written in. */
  readonly file: string;
  /** Where in that file. */
  readonly path: string;
}

export interface AssetIndexCache {
  readonly schema: typeof ASSET_INDEX_CACHE_SCHEMA;
  readonly roots: readonly string[];
  /** GUID -> location, sorted by GUID. */
  readonly assets: Readonly<Record<string, Omit<AssetEntry, "id">>>;
  /** Target GUID -> the references that point at it (the reverse index). */
  readonly references: Readonly<Record<string, readonly CachedReference[]>>;
}

export function assetIndexCachePath(projectRoot: string): string {
  return join(projectRoot, CACHE_DIRECTORY, ASSET_INDEX_CACHE_FILE);
}

export function toAssetIndexCache(index: AssetIndex, roots: readonly string[]): AssetIndexCache {
  const assets: Record<string, Omit<AssetEntry, "id">> = {};
  for (const id of [...index.entries.keys()].sort()) {
    const { id: _, ...location } = index.entries.get(id) as AssetEntry;
    assets[id] = location;
  }
  const references: Record<string, CachedReference[]> = {};
  for (const target of [...new Set(index.references.map((reference) => reference.target))].sort()) {
    references[target] = index.referrersOf(target).map(({ from, file, path }) => ({ from, file, path }));
  }
  return { schema: ASSET_INDEX_CACHE_SCHEMA, roots: [...roots], assets, references };
}

/** Writes through a temporary file and a rename, so a reader never sees half a cache. */
export async function writeAssetIndexCache(projectRoot: string, cache: AssetIndexCache): Promise<string> {
  const path = assetIndexCachePath(projectRoot);
  await mkdir(join(projectRoot, CACHE_DIRECTORY), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
  await rename(temporary, path);
  return path;
}

/** Null when there is no cache, or it is unreadable or of another format: rebuild it then. */
export async function readAssetIndexCache(projectRoot: string): Promise<AssetIndexCache | null> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(assetIndexCachePath(projectRoot), "utf8"));
  } catch {
    return null;
  }
  if (
    !isJsonObject(parsed) ||
    parsed.schema !== ASSET_INDEX_CACHE_SCHEMA ||
    !Array.isArray(parsed.roots) ||
    !isJsonObject(parsed.assets) ||
    !isJsonObject(parsed.references)
  ) {
    return null;
  }
  return parsed as unknown as AssetIndexCache;
}
