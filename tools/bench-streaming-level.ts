// npm run bench:streaming-level -- --project <path> --out content/levels/<name>
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isId } from "../src/core/index.ts";
import { openWorldProject } from "./world/worldProject.ts";
import { generateStreamingLevel, writeStreamingLevel } from "./bench/streamingLevel.ts";

try {
  const args = process.argv.slice(2);
  const values = new Map<string, string>();
  const flags = new Set<string>();
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]!;
    if (["--force", "--json"].includes(arg)) flags.add(arg);
    else if (["--project", "--out", "--seed", "--size", "--actors"].includes(arg)) {
      const value = args[++i];
      if (value === undefined || value.startsWith("--")) throw new Error(`${arg} needs a value.`);
      values.set(arg, value);
    } else throw new Error(`Unknown option: ${arg}`);
  }
  const projectPath = values.get("--project");
  const out = values.get("--out");
  if (!projectPath || !out) throw new Error("Usage: bench:streaming-level --project <path> --out content/levels/<name> [--seed N] [--size M] [--actors N] [--force] [--json]");
  const engineRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  // Reuses loadProject + projectIndexRoots + scanRoots + the real schema registry.
  const project = await openWorldProject(engineRoot, resolve(projectPath));
  const models = [...project.index.entries.values()]
    .flatMap((entry) => entry.type === "forge.model" && isId(entry.id, "asset") ? [entry.id] : []).sort();
  if (!models.length) throw new Error(`Project ${project.root} has no forge.model assets in its content roots or selected packs.`);
  const numeric: { seed?: number; size?: number; actors?: number } = {};
  for (const key of ["seed", "size", "actors"] as const) {
    if (values.has(`--${key}`)) numeric[key] = Number(values.get(`--${key}`));
  }
  const level = generateStreamingLevel({ ...numeric, models });
  const folder = await writeStreamingLevel(project.root, out, level, { force: flags.has("--force") });
  const report = { actorCount: level.actorCount, cellCount: level.cells.length, actorsPerOccupiedCell: level.cellCounts, folder };
  if (flags.has("--json")) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`Actors: ${report.actorCount}; cells: ${report.cellCount}`);
    console.log(`Actors per occupied cell: min ${level.cellCounts.min} / median ${level.cellCounts.median} / max ${level.cellCounts.max}`);
    console.log(`Written: ${folder}`);
  }
} catch (error) {
  console.error(`bench:streaming-level: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
}
