import { HLOD_INDEX_FILE, hlodCellSourceHash, hlodIncludesPlacement, maxAxisScale, normalizeHlodIndex } from "../../src/engine/world/hlod.ts";
import { createHlodAssets } from "./hlodAssets.ts";
import { contentPath, hlodCellsOf, loadHlodLevel, type HlodInput } from "./hlodInput.ts";

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
    const entries = new Map((index?.cells ?? []).map((cell) => [cell.key, cell]));
    const cells = hlodCellsOf(level, input);
    const keys = new Set([...cells.keys(), ...entries.keys()]);
    for (const key of keys) {
      const placements = cells.get(key) ?? [];
      const entry = entries.get(key);
      let stale = entry !== undefined && entry.sourceHash !== hlodCellSourceHash(placements);
      if (!entry && placements.length) {
        assets ??= await createHlodAssets(input, () => undefined);
        for (const placement of placements) {
          const asset = await assets.loadAsset(placement.model);
          if (asset?.parts.length && hlodIncludesPlacement(asset.radius, maxAxisScale(placement.matrix), level.settings.loadRange)) {
            stale = true; break;
          }
        }
      }
      if (stale) warnings.push({ severity: "warning", code: "hlod-stale", file: `${folder.root}/${folder.folder}/${HLOD_INDEX_FILE}`,
        cell: key, message: `Cell ${key} has changed or has no proxy; rebuild with forge hlod.` });
    }
  }
  return warnings;
}

export const hlodWarningLine = (warning: HlodStaleWarning): string =>
  `${warning.severity} ${warning.code} ${warning.file} ${warning.cell}: ${warning.message}`;
