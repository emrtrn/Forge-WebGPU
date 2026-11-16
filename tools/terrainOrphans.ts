// Ported from Forge WebGL tools/terrainOrphans.ts (collectJsonStrings) @ forge-webgl-final (04b5fb23); docs/PORT_LOG.md §2.
// Ownership is adapted to GUID assets: a terrain need not be placed in a level.
// Its binary companions must have an indexed definition in the same root, and
// a tile must be in that definition's explicit tile list. This module never deletes.

import { isJsonObject, type AssetIndex, type ContentFile } from "../src/core/index.ts";
import { TERRAIN_DEF_SUFFIX, TERRAIN_GLOBAL_SUFFIX, TERRAIN_TILE_SUFFIX } from "../src/engine/terrain/terrainTypes.ts";

/** Every string value in a parsed JSON document; another level can still point at an orphan candidate. */
export function collectJsonStrings(value: unknown, into = new Set<string>()): Set<string> {
  if (typeof value === "string") into.add(value);
  else if (Array.isArray(value)) for (const item of value) collectJsonStrings(item, into);
  else if (value && typeof value === "object") for (const child of Object.values(value)) collectJsonStrings(child, into);
  return into;
}

export interface TerrainOrphan {
  readonly file: string;
  readonly definition: string;
  readonly reason: "missing-definition" | "unlisted-tile";
}

/** Root labels are part of identity; equal relative paths never share ownership. */
export function findOrphanedTerrainParts(files: readonly ContentFile[], index: AssetIndex): TerrainOrphan[] {
  const owners = new Map<string, ReadonlySet<string> | null>();
  const terrainPaths = new Set([...index.entries.values()].filter((entry) => entry.type === "forge.terrain")
    .map((entry) => `${entry.root}/${entry.path}`));
  for (const file of files) {
    const label = `${file.root}/${file.path}`;
    if (!terrainPaths.has(label)) continue;
    const data = isJsonObject(file.json) && isJsonObject(file.json.data) ? file.json.data : null;
    // A malformed list is not an empty terrain. Do not infer unreferenced
    // tiles from data that does not provide a readable list.
    const tiles = data && Array.isArray(data.tiles) && data.tiles.every((tile) => isJsonObject(tile) && typeof tile.key === "string")
      ? collectJsonStrings(data.tiles.map((tile) => (tile as { key: string }).key)) : null;
    owners.set(label, tiles);
  }
  const result: TerrainOrphan[] = [];
  for (const file of files) {
    let stem: string;
    let key: string | null = null;
    if (file.path.endsWith(TERRAIN_GLOBAL_SUFFIX)) {
      stem = file.path.slice(0, -TERRAIN_GLOBAL_SUFFIX.length);
    } else {
      const match = /^(.*)\.tiles\/([^/]+)\.tile\.bin$/.exec(file.path);
      if (!match || !file.path.endsWith(TERRAIN_TILE_SUFFIX)) continue;
      stem = match[1]!;
      key = match[2]!;
    }
    const definition = `${file.root}/${stem}${TERRAIN_DEF_SUFFIX}`;
    const fileLabel = `${file.root}/${file.path}`;
    if (!owners.has(definition)) result.push({ file: fileLabel, definition, reason: "missing-definition" });
    else if (key !== null && owners.get(definition)?.has(key) === false) {
      result.push({ file: fileLabel, definition, reason: "unlisted-tile" });
    }
  }
  return result.sort((a, b) => a.file < b.file ? -1 : a.file > b.file ? 1 : 0);
}

export function terrainOrphanLines(files: readonly ContentFile[], index: AssetIndex): string[] {
  return findOrphanedTerrainParts(files, index).map(({ file, definition, reason }) =>
    `error orphan-terrain-part ${file}: ${reason === "missing-definition" ? "No indexed terrain definition" : "Tile is not listed"} in ${definition}.`);
}
