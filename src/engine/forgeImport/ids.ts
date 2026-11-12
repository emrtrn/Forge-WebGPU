/**
 * Deterministic ids for converted Forge WebGL content (plan 2b importer,
 * architecture §4.4 / §4.6): the same source gives the same GUIDs on every
 * run, so the importer can run again as phases add converters and World
 * Builder can rebuild a level without breaking references to it.
 */
import type { AssetId, LevelId } from "../../core/index.ts";

/** 32 hex digits from text: four FNV-1a hashes of differently salted copies. Stable, not random. */
export function stableHex(text: string): string {
  let hex = "";
  for (let round = 0; round < 4; round += 1) {
    let hash = 0x811c9dc5 ^ Math.imul(round + 1, 0x9e3779b1);
    const salted = `${round}:${text}`;
    for (let index = 0; index < salted.length; index += 1) {
      hash = Math.imul(hash ^ salted.charCodeAt(index), 0x01000193);
    }
    hash ^= hash >>> 15;
    hash = Math.imul(hash, 0x2c1b3c6d);
    hash ^= hash >>> 12;
    hex += (hash >>> 0).toString(16).padStart(8, "0");
  }
  return hex;
}

/** GUID of a Forge manifest asset (`forest-rock-02`): level references are written with it. */
export function forgeAssetId(forgeId: string): AssetId {
  return `ast_${stableHex(`forge-webgl/asset/${forgeId}`)}`;
}

/** GUID of a Forge level, from its public-relative path (`layouts/OpenWorldTest.level.json`). */
export function forgeLevelId(sourcePath: string): LevelId {
  return `lvl_${stableHex(`forge-webgl/level/${sourcePath}`)}`;
}
