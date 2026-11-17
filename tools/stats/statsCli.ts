// `npm run forge -- stats --project <path> --level <level folder> [--json] [--top <n>]`
// (plan 5c R5): the level's scene cost report (sceneStats.ts). Reads only:
// a read-only project, engine and pack levels work too.

import { relative } from "node:path";
import { CELL_INDEX_FILE, buildAssetIndex } from "../../src/core/index.ts";
import { HLOD_INDEX_FILE } from "../../src/engine/world/hlod.ts";
import { projectIndexRoots } from "../assets/engineContent.ts";
import { loadEngineRegistry } from "../assets/engineRegistry.ts";
import { scanRoots } from "../assets/scan.ts";
import { loadGameSchemas } from "../project/gameSchemas.ts";
import { resolveDevProject } from "../server/devProject.ts";
import { createHlodAssets } from "../world/hlodAssets.ts";
import { contentPath, diskHlodInput, loadHlodLevel } from "../world/hlodInput.ts";
import { formatSceneStats, readModelInfo, sceneStats, type SceneStats } from "./sceneStats.ts";

interface Args { project: string; level: string; json: boolean; top: number }

export const STATS_USAGE = "Usage: npm run forge -- stats --project <path> --level <level folder> [--json] [--top <n>]";

export function parseStatsArgs(args: readonly string[]): Args {
  let project: string | undefined, level: string | undefined, json = false, top = 10;
  for (let at = 0; at < args.length; at += 1) {
    const word = args[at]!;
    if (word === "--json") json = true;
    else if (word === "--project") project = args[(at += 1)];
    else if (word === "--level") level = args[(at += 1)];
    else if (word === "--top") top = Number(args[(at += 1)]);
    else throw new Error(`Unknown option: ${word}`);
  }
  if (!project || !level || !Number.isInteger(top) || top < 0) throw new Error(STATS_USAGE);
  return { project, level: level.replaceAll("\\", "/").replace(/\/+$/, ""), json, top };
}

export async function runStats(args: Args, engineRoot: string): Promise<SceneStats> {
  const project = await resolveDevProject(engineRoot, { FORGE_PROJECT_ROOT: args.project });
  if (!project.manifest) throw new Error(`Not a project: ${project.problems.join("; ") || project.root}`);
  const registry = await loadEngineRegistry(engineRoot);
  await loadGameSchemas(engineRoot, project.root, project.manifest.game.module, registry, { readOnly: true });
  const roots = projectIndexRoots(engineRoot, project.root, project.manifest);
  const scan = await scanRoots(roots);
  const index = buildAssetIndex(scan.files, { strict: true, registry });
  // The level folder as given (project-relative), or as the asset index labels it (`engine:…`).
  const wanted = args.level;
  const level = [...index.levels.values()].find((entry) => {
    const labelled = `${entry.root}${entry.folder ? `/${entry.folder}` : ""}`;
    const root = roots.find((candidate) => candidate.label === entry.root);
    const onDisk = root ? relative(project.root, root.dir).replaceAll("\\", "/") : null;
    return labelled === wanted || (onDisk !== null && `${onDisk}${entry.folder ? `/${entry.folder}` : ""}` === wanted);
  });
  if (!level) throw new Error(`Not a level folder: ${args.level}`);
  const input = diskHlodInput(scan.files, index, registry, roots);
  const folder = contentPath({ root: level.root, path: level.folder });
  const doc = loadHlodLevel(folder, input);
  const files = new Map(scan.files.map((file) => [contentPath(file), file]));
  const json = (name: string): unknown => files.get(`${folder}/${name}`)?.json ?? null;
  const cellIndex = json(CELL_INDEX_FILE) as { cells?: Record<string, unknown> } | null;
  const { nodeIO } = await createHlodAssets(input, () => undefined);
  return sceneStats({
    folder: args.level, level: doc, cells: Object.keys(cellIndex?.cells ?? {}).length, input,
    model: (id) => readModelInfo((path) => nodeIO.read(path), input, id),
    foliageIndex: json("foliage.json") as Parameters<typeof sceneStats>[0]["foliageIndex"],
    hlodIndex: json(HLOD_INDEX_FILE) as Parameters<typeof sceneStats>[0]["hlodIndex"],
  });
}

export async function statsMain(argv: readonly string[], engineRoot: string): Promise<number> {
  try {
    const args = parseStatsArgs(argv);
    const stats = await runStats(args, engineRoot);
    console.log(args.json ? JSON.stringify(stats, null, 2) : formatSceneStats(stats, args.top));
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (argv.includes("--json")) console.log(JSON.stringify({ error: message }));
    else console.error(`forge stats: ${message}`);
    return 1;
  }
}
