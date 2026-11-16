import { randomUUID } from "node:crypto";
import { mkdir, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { buildAssetIndex } from "../../src/core/index.ts";
import { HLOD_INDEX_FILE, HLOD_DIR } from "../../src/engine/world/hlod.ts";
import { projectIndexRoots } from "../assets/engineContent.ts";
import { loadEngineRegistry } from "../assets/engineRegistry.ts";
import { scanRoots } from "../assets/scan.ts";
import { loadGameSchemas } from "../project/gameSchemas.ts";
import { resolveDevProject } from "../server/devProject.ts";
import { createWritePolicy, resolveWritablePath, type WritePolicy } from "../server/projectPaths.ts";
import { withProjectLock } from "../save/projectLock.ts";
import { buildLevelHlod, validateHlodOptions, type HlodBuildOptions, type HlodBuildResult } from "./hlodBuild.ts";
import { contentPath, diskHlodInput } from "./hlodInput.ts";

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

/** Stage all bytes first; publish the index last. Only obsolete proxy GLBs are removed. */
export async function writeHlodResult(policy: WritePolicy, folder: string, result: HlodBuildResult): Promise<void> {
  const target = (path: string): string => resolveWritablePath(policy, `${folder}/${path}`).absolute;
  const proxyDir = target(HLOD_DIR);
  let previous: string[] = [];
  try { previous = (await readdir(proxyDir)).filter((name) => /\.glb$/i.test(name)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const obsolete = previous.map((name) => `${HLOD_DIR}/${name}`).filter((path) => !result.files.has(path)).map(target);
  const token = randomUUID();
  const staged = [...result.files].map(([path, bytes]) => ({ path, bytes, target: target(path), temp: target(path) + `.${token}.tmp` }));
  try {
    for (const file of staged) { await mkdir(dirname(file.target), { recursive: true }); await writeFile(file.temp, file.bytes); }
    for (const file of staged.filter((file) => file.path !== HLOD_INDEX_FILE)) await rename(file.temp, file.target);
    for (const path of obsolete) await rm(path);
    const index = staged.find((file) => file.path === HLOD_INDEX_FILE)!;
    await rename(index.temp, index.target);
  } finally { for (const file of staged) await rm(file.temp, { force: true }); }
}

export async function runHlod(args: Args, engineRoot: string) {
  const started = performance.now();
  const project = await resolveDevProject(engineRoot, { FORGE_PROJECT_ROOT: resolve(args.project) });
  if (!project.manifest || project.problems.length || project.readOnly) throw new Error(`Project is not writable: ${project.problems.join("; ") || project.root}`);
  const policy = createWritePolicy(project.root, project.manifest.contentRoots);
  const folder = resolveWritablePath(policy, `${args.level}/level.json`).relative.replace(/\/level\.json$/, "");
  const absoluteFolder = dirname(resolveWritablePath(policy, `${folder}/level.json`).absolute);
  // Engine content and packs are never output targets, even when named as a project root.
  if (resolve(project.root).toLowerCase() === resolve(engineRoot).toLowerCase()) throw new Error("Engine content and packs are read-only");
  for (const path of ["content/engine", "content/packs"]) {
    const denied = resolve(engineRoot, path).toLowerCase(), target = absoluteFolder.toLowerCase();
    if (target === denied || target.startsWith(`${denied}\\`) || target.startsWith(`${denied}/`)) throw new Error("Engine content and packs are read-only");
  }
  const build = async () => {
    const registry = await loadEngineRegistry(engineRoot);
    await loadGameSchemas(engineRoot, project.root, project.manifest!.game.module, registry, { readOnly: true });
    const roots = projectIndexRoots(engineRoot, project.root, project.manifest!);
    const scan = await scanRoots(roots);
    const index = buildAssetIndex(scan.files, { strict: true, registry });
    const level = [...index.levels.values()].find((level) => !level.root.startsWith("engine:") && `${level.root}${level.folder ? `/${level.folder}` : ""}` === folder);
    if (!level) throw new Error(`Not a project-owned level folder: ${args.level}`);
    const result = await buildLevelHlod(contentPath({ root: level.root, path: level.folder }), diskHlodInput(scan.files, index, registry, roots), args);
    const built = performance.now();
    // Only publication needs a lock: invalid inputs and dry runs create no files.
    if (!args.dryRun) await withProjectLock(absoluteFolder, () => writeHlodResult(policy, folder, result));
    return { cells: result.index.cells.length, triangles: result.index.cells.reduce((sum, cell) => sum + cell.triangles, 0),
      skippedPlacements: result.skippedPlacements, warnings: result.warnings, dryRun: args.dryRun,
      buildMs: Math.round(built - started), totalMs: Math.round(performance.now() - started) };
  };
  return build();
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
