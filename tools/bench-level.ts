// `npm run bench:level`: the 50.000-actor scale measurement (plan Faz 2a).
// Writes the generated level and `report.json` under .forge-cache/bench/level-scale.
// Exits 1 when a scenario is over its threshold. Not part of the gate.
//
// Options: --actors <n> (default 50000), --runs <n> (default 5), --seed <n>.

import { writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { formatScaleReport, runScaleBench } from "./bench/runScale.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function option(name: string): number | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return undefined;
  const value = Number(process.argv[index + 1]);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`--${name} takes a positive integer.`);
  return value;
}

const outDir = join(repoRoot, ".forge-cache/bench/level-scale");
const actors = option("actors");
const runs = option("runs");
const seed = option("seed");
const report = await runScaleBench({
  outDir,
  ...(actors !== undefined ? { actors } : {}),
  ...(runs !== undefined ? { runs } : {}),
  ...(seed !== undefined ? { seed } : {}),
  log: (line) => console.log(`bench:level: ${line}`),
});
await writeFile(join(outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
for (const line of formatScaleReport(report)) console.log(line);
console.log(`bench:level: report in ${join(outDir, "report.json")}`);
if (!Object.values(report.pass).every(Boolean)) process.exitCode = 1;
