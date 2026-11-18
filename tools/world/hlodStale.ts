import {
  HLOD_INDEX_FILE, hlodCellSourceHash, hlodClusterOf, hlodClusterSourceHash, hlodIncludesPlacement, hlodPlacementInZone, hlodZonesOf,
  isHlodShapePlacement, maxAxisScale, normalizeHlodIndex, type HlodPlacement,
} from "../../src/engine/world/hlod.ts";
import { parseCellKey } from "../../src/core/index.ts";
import { shapeBoundingRadius } from "../../src/engine/procgen/shapePrimitives.ts";
import { createHlodAssets } from "./hlodAssets.ts";
import { contentPath, hlodCellsOf, hlodLandmarksOf, loadHlodLevel, type HlodInput } from "./hlodInput.ts";

export interface HlodStaleWarning {
  readonly severity: "warning";
  readonly code: "hlod-stale";
  readonly file: string;
  readonly cell: string;
  readonly message: string;
}

/** Asset bytes are deliberately excluded from sourceHash (Forge's rule).
 * Only levels with an `hlod.json` are checked. Bounds are read only for cells
 * missing from it, to avoid warning about small details. */
export async function hlodStaleness(input: HlodInput): Promise<HlodStaleWarning[]> {
  const warnings: HlodStaleWarning[] = [];
  const byPath = new Map(input.files.map((file) => [contentPath(file), file]));
  let assets: Awaited<ReturnType<typeof createHlodAssets>> | undefined;
  for (const folder of input.index.levels.values()) {
    const path = contentPath({ root: folder.root, path: folder.folder });
    let level;
    try { level = loadHlodLevel(path, input); }
    catch { continue; } // Asset validation reports unreadable level documents.
    const raw = byPath.get(`${path}/${HLOD_INDEX_FILE}`);
    // HLOD is optional: a level that never built one is not stale (and its models are not read).
    if (!raw) continue;
    const index = normalizeHlodIndex(raw.json, { strict: true }).value;
    const zones = hlodZonesOf(level.actors, input.index.resolveClass);
    const entries = new Map((index?.cells ?? []).map((cell) => [cell.key, cell]));
    const cells = hlodCellsOf(level, input);
    const contributes = async (placement: HlodPlacement, landmark = false): Promise<boolean> => {
      const scale = maxAxisScale(placement.matrix);
      if (isHlodShapePlacement(placement)) return !hlodPlacementInZone(placement, zones) &&
        (landmark || hlodIncludesPlacement(shapeBoundingRadius(placement.shape), scale, level.settings.loadRange));
      assets ??= await createHlodAssets(input, () => undefined);
      const asset = await assets.loadAsset(placement.model);
      return !!asset?.parts.length && !hlodPlacementInZone(placement, zones, asset.bounds) &&
        (landmark || hlodIncludesPlacement(asset.radius, scale, level.settings.loadRange));
    };
    const keys = new Set([...cells.keys(), ...entries.keys()]);
    for (const key of keys) {
      const placements = cells.get(key) ?? [];
      const entry = entries.get(key);
      let stale = entry !== undefined && entry.sourceHash !== hlodCellSourceHash(placements, zones?.source);
      if (!entry && placements.length) {
        for (const placement of placements) {
          if (await contributes(placement)) {
            stale = true; break;
          }
        }
      }
      if (stale) warnings.push({ severity: "warning", code: "hlod-stale", file: `${folder.root}/${folder.folder}/${HLOD_INDEX_FILE}`,
        cell: key, message: `Cell ${key} has changed or has no proxy; rebuild with forge hlod.` });
    }
    // Layer 1 (plan 5c R8.2): every cluster's entry must cover exactly its cells' current entries.
    const expected = new Map<string, { key: string; sourceHash: string }[]>();
    for (const cell of index?.cells ?? []) {
      const coord = parseCellKey(cell.key);
      if (!coord) continue;
      const key = hlodClusterOf(coord.x, coord.z);
      expected.set(key, [...(expected.get(key) ?? []), cell]);
    }
    const clusters = new Map((index?.clusters ?? []).map((cluster) => [cluster.key, cluster]));
    for (const key of new Set([...expected.keys(), ...clusters.keys()])) {
      const cells = expected.get(key);
      if (cells && clusters.get(key)?.sourceHash === hlodClusterSourceHash(cells)) continue;
      warnings.push({ severity: "warning", code: "hlod-stale", file: `${folder.root}/${folder.folder}/${HLOD_INDEX_FILE}`,
        cell: `l1_${key}`, message: `Cluster ${key} does not match its cells; rebuild with forge hlod.` });
    }
    // Landmarks (plan 5c R8.4): the proxy's hash covers every landmark placement.
    const landmarks = hlodLandmarksOf(level, input);
    let expectedHash = landmarks.length ? hlodCellSourceHash(landmarks, zones?.source) : null;
    if (zones && !index?.landmarks && expectedHash !== null) {
      let hasLandmark = false;
      for (const placement of landmarks) {
        if (await contributes(placement, true)) { hasLandmark = true; break; }
      }
      if (!hasLandmark) expectedHash = null;
    }
    if ((index?.landmarks?.sourceHash ?? null) !== expectedHash) {
      warnings.push({ severity: "warning", code: "hlod-stale", file: `${folder.root}/${folder.folder}/${HLOD_INDEX_FILE}`,
        cell: "landmarks", message: "Landmarks have changed; rebuild with forge hlod." });
    }
  }
  return warnings;
}

export const hlodWarningLine = (warning: HlodStaleWarning): string =>
  `${warning.severity} ${warning.code} ${warning.file} ${warning.cell}: ${warning.message}`;
