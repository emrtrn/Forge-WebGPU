// npm run import:forge -- --forge <Forge public/> --project <dir> [--level <public path>]... [--assets id,id,...]
//   [--assets-folder content/forge] [--levels-folder content/levels] [--report <file.md>] [--dry-run] [--force]
//
// Brings Forge WebGL levels and the assets they use into a game project of the
// new format (plan 2b importer; tools/import-forge-webgl). What is not
// converted yet is reported per level with its phase; run it again as phases
// add converters: ids are derived from the source, so it writes the same GUIDs.
// An existing level folder is replaced only with --force.

import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runForgeImport } from "./import-forge-webgl/importRun.ts";
import { formatImportReport } from "./import-forge-webgl/report.ts";
import { refuseEngineFixture } from "./world/worldCli.ts";

const engineRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const usage = "Usage: npm run import:forge -- --forge <Forge public/> --project <dir> [--level <public path>]... "
  + "[--assets id,...] [--assets-folder <dir>] [--levels-folder <dir>] [--report <file.md>] [--dry-run] [--force]";
const VALUED = ["--forge", "--project", "--level", "--assets", "--assets-folder", "--levels-folder", "--report"];
const FLAGS = ["--dry-run", "--force"];

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const values = new Map<string, string[]>();
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (FLAGS.includes(arg)) continue;
    if (!VALUED.includes(arg) || index + 1 >= args.length) throw new Error(usage);
    values.set(arg, [...(values.get(arg) ?? []), args[(index += 1)]!]);
  }
  const one = (name: string): string | undefined => values.get(name)?.at(-1);
  const forge = one("--forge");
  const project = one("--project");
  const levels = values.get("--level") ?? [];
  const assets = (values.get("--assets") ?? []).flatMap((list) => list.split(",")).filter((id) => id !== "");
  if (!forge || !project || (levels.length === 0 && assets.length === 0)) throw new Error(usage);
  const projectRoot = resolve(project);
  refuseEngineFixture(engineRoot, projectRoot);
  const started = Date.now();
  const result = await runForgeImport({
    engineRoot,
    projectRoot,
    forgeRoot: resolve(forge),
    levels,
    assets,
    assetsFolder: one("--assets-folder"),
    levelsFolder: one("--levels-folder"),
    force: args.includes("--force"),
    dryRun: args.includes("--dry-run"),
  });
  const report = formatImportReport(result);
  const target = one("--report");
  if (target) await writeFile(resolve(target), report);
  console.log(report);
  console.log(`[import:forge] ${args.includes("--dry-run") ? "dry run, nothing written" : "done"} in ${((Date.now() - started) / 1000).toFixed(1)} s.`);
}

main().catch((error: unknown) => {
  console.error(`[import:forge] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
