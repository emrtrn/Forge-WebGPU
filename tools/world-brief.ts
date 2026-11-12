// npm run world:brief -- --project <dir> --brief <level folder>/<name>.worldbrief.json [--force]
//
// Builds the level of a world brief into the brief's folder (plan 2b
// `tools/world`; Forge WebGL tools/world/build-world-brief.mjs). An existing
// level is replaced only with --force.

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { refuseEngineFixture } from "./world/worldCli.ts";
import { runWorldBrief } from "./world/worldBriefRun.ts";

const engineRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const usage = "Usage: npm run world:brief -- --project <dir> --brief <level folder>/<name>.worldbrief.json [--force]";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const option = (name: string): string | undefined => {
    const index = args.indexOf(`--${name}`);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const project = option("project");
  const brief = option("brief");
  if (!project || !brief || args.some((arg) => arg.startsWith("--") && !["--project", "--brief", "--force"].includes(arg))) {
    throw new Error(usage);
  }
  const projectRoot = resolve(project);
  refuseEngineFixture(engineRoot, projectRoot);
  const started = Date.now();
  const result = await runWorldBrief({ engineRoot, projectRoot, brief, force: args.includes("--force") });
  for (const warning of result.build.warnings) console.warn(`[world:brief] ${warning}`);
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`[world:brief] ${result.folder}: ${result.level.level.actors.length} actors (${result.level.counts.placeholders} placeholders), `
    + `${result.written.length} files written, ${result.removed.length} removed, ${seconds} s.`);
  for (const item of result.build.deferred) console.log(`[world:brief] not built yet: ${item}`);
}

main().catch((error: unknown) => {
  console.error(`[world:brief] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
