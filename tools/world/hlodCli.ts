import type { HlodBuildOptions } from "./hlodBuild.ts";
import { validateHlodOptions } from "./hlodBuild.ts";
import { runHlodJob } from "./hlodService.ts";
export { writeHlodResult } from "./hlodPublish.ts";

interface Args extends HlodBuildOptions { project: string; level: string; dryRun: boolean; json: boolean }
export function parseHlodArgs(args: readonly string[]): Args {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  for (let at = 0; at < args.length; at += 1) {
    const name = args[at]!;
    if (values.has(name) || flags.has(name)) throw new Error(`Duplicate option: ${name}`);
    if (name === "--dry-run" || name === "--json") { flags.add(name); continue; }
    if (!["--project", "--level", "--ratio", "--error"].includes(name)) throw new Error(`Unknown option: ${name}`);
    const value = args[++at];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${name}`);
    values.set(name, value);
  }
  const project = values.get("--project"), level = values.get("--level");
  if (!project || !level) throw new Error("Usage: forge hlod --project <path> --level <level folder> [--ratio r] [--error e] [--dry-run] [--json]");
  const options = { ...(values.has("--ratio") ? { ratio: Number(values.get("--ratio")) } : {}),
    ...(values.has("--error") ? { error: Number(values.get("--error")) } : {}) };
  validateHlodOptions(options);
  return { ...options, project, level, dryRun: flags.has("--dry-run"), json: flags.has("--json") };
}

export async function runHlod(args: Args, engineRoot: string) {
  const result = await runHlodJob({ ...args, engineRoot, build: true, force: true });
  if (result.state === "superseded") throw new Error(result.message ?? "HLOD inputs changed during computation; retry the build");
  if (!result.report) throw new Error("HLOD build completed without a report");
  if (result.message && !args.dryRun) console.warn(result.message);
  return { ...result.report, dryRun: args.dryRun };
}
export async function hlodMain(argv: readonly string[], engineRoot: string): Promise<number> {
  try {
    const args = parseHlodArgs(argv);
    const result = await runHlod(args, engineRoot);
    if (args.json) console.log(JSON.stringify(result));
    else {
      console.log(`forge hlod: ${result.cells} cells, ${result.triangles} triangles, ${result.skippedPlacements} skipped placements; ${result.warnings.length} warnings; build ${result.buildMs} ms, total ${result.totalMs} ms${result.dryRun ? " (dry run)" : ""}.`);
      for (const warning of result.warnings) console.warn(`warning ${warning}`);
    }
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (argv.includes("--json")) console.log(JSON.stringify({ error: message }));
    else console.error(`forge hlod: ${message}`);
    return 1;
  }
}
