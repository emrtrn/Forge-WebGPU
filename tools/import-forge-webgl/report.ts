// The import report (plan 2b importer): per level what was converted and what
// waits for which phase, then the assets by type, licence rule and phase.
// Markdown, so it can be kept beside the reference project.

import { CONVERTED_MODEL_SIDECARS, MODEL_SIDECAR_PHASES } from "./assetPlan.ts";
import type { ImportRunResult } from "./importRun.ts";

const count = <T>(items: Iterable<T>, key: (item: T) => string): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  return new Map([...counts].sort(([a], [b]) => a.localeCompare(b)));
};
const list = (counts: ReadonlyMap<string, number>): string =>
  counts.size === 0 ? "—" : [...counts].map(([key, value]) => `${key} ${value}`).join(", ");

export function formatImportReport(result: ImportRunResult): string {
  const lines: string[] = ["# Forge WebGL import", ""];
  for (const { folder, report, deferredSidecars, sidecars } of result.levels) {
    const c = report.converted;
    lines.push(`## ${report.source} → ${folder}`, "");
    lines.push(`- Converted: ${c.actors} actors (placements ${c.placements}: shapes ${c.placeholders}, meshes ${c.meshes}; `
      + `Player Start ${c.playerStarts}; terrains ${c.terrains}; height fog ${c.heightFog}; lights ${c.lights}; environment ${c.environment}); source cells ${c.sourceCells}.`);
    lines.push(`- Static shadow switch (\`worldSettings.staticObjectsCastShadow\`): ${c.staticCastShadow ? "on" : "off"}, `
      + "written as `castShadow` on every placement that does not say.");
    if (sidecars.length) lines.push(`- Sidecars: ${sidecars.join(", ")}.`);
    if (report.missingAssets.length) {
      lines.push(`- Placements left out (no model in the target): ${report.missingAssets.map((entry) => `${entry.assetId} ${entry.placements}`).join(", ")}.`);
    }
    if (report.duplicateIds) lines.push(`- Duplicate placement ids told apart: ${report.duplicateIds}.`);
    for (const sidecar of deferredSidecars) lines.push(`- Not converted: ${sidecar.path} → phase ${sidecar.phase}.`);
    if (report.notConverted.length) {
      lines.push("", "| Not converted | Count | Phase |", "|---|---|---|");
      for (const entry of report.notConverted) lines.push(`| \`${entry.field}\` | ${entry.count} | ${entry.phase} |`);
    }
    lines.push("");
  }
  const { plan } = result;
  const imported = [...plan.imported.values()];
  lines.push("## Assets", "");
  lines.push(`- Imported: ${imported.length} (${list(count(imported, (entry) => entry.type))}); reused from the project: ${result.reused.length}.`);
  lines.push(`- Licence rules: ${list(count(imported, (entry) => `${entry.rule} (${entry.provenance.license})`))}.`);
  lines.push(`- Waiting for their phase: ${list(count(plan.deferred.values(), (entry) => `${entry.asset.assetType} → ${entry.phase}`))}.`);
  const modelSidecars = [...plan.sidecars];
  const converted = new Map(modelSidecars.filter(([suffix]) => CONVERTED_MODEL_SIDECARS.includes(suffix)));
  const waiting = new Map(modelSidecars.filter(([suffix]) => !CONVERTED_MODEL_SIDECARS.includes(suffix)).map(([suffix, n]) => [`${suffix} → ${MODEL_SIDECAR_PHASES[suffix]}`, n]));
  lines.push(`- Model sidecars converted into the model's import settings: ${list(converted)}; not converted: ${list(waiting)}.`);
  if (result.missingReferences.length) {
    lines.push(`- References to assets the target does not have (left empty): ${result.missingReferences.map((entry) => `${entry.in} ${entry.slot} → ${entry.id}`).join(", ")}.`);
  }
  if (plan.excluded.size) lines.push(`- Excluded: ${[...plan.excluded].map(([id, entry]) => `${id} (${entry.reason})`).join(", ")}.`);
  if (plan.unknownIds.size) lines.push(`- Ids the Forge manifest does not list: ${[...plan.unknownIds].sort().join(", ")}.`);
  lines.push(`- Files: ${result.written.length} written, ${result.removed.length} removed.`, "");
  return lines.join("\n");
}
