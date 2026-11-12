// `npm run world:random` (plan 2b `tools/world`; Forge WebGL
// tools/world/randomWorldRun.ts, rewritten for the new level format): a few
// choices become a world brief (`src/engine/worldbuilder/randomWorld.ts`),
// written into the level folder as `<folder>.worldbrief.json`, and the brief
// run builds the level from it. A failed build leaves no brief of its own
// behind: the one it replaced comes back, a new one goes.

import { readFile, rm, writeFile } from "node:fs/promises";
import { join, posix } from "node:path";
import {
  createId,
  dataDocument,
  isId,
  isJsonObject,
  stringifyDocument,
  WorldBriefAssetType,
  type AssetId,
} from "../../src/core/index.ts";
import { randomWorldBrief, type RandomWorldOptions } from "../../src/engine/worldbuilder/randomWorld.ts";
import { normalizeWorldBrief, type WorldBuildStep } from "../../src/engine/worldbuilder/worldBrief.ts";
import { loadEngineRegistry } from "../assets/engineRegistry.ts";
import { formatProblem, loadProject } from "../project/check.ts";
import { projectRelative, runWorldBrief, type WorldBriefRunResult } from "./worldBriefRun.ts";
import { commitFiles, projectFileRevision } from "./worldWrite.ts";

export interface RandomWorldRunOptions {
  readonly engineRoot: string;
  readonly projectRoot: string;
  /** Project-relative level folder, e.g. `content/levels/my-world`. */
  readonly out: string;
  readonly world: Omit<RandomWorldOptions, "id" | "name"> & { name?: string };
  readonly force?: boolean | undefined;
  readonly onProgress?: ((step: WorldBuildStep) => void) | undefined;
}

export interface RandomWorldRunResult extends WorldBriefRunResult {
  /** Project-relative brief. */
  readonly brief: string;
  readonly notes: string[];
}

export async function runRandomWorld(options: RandomWorldRunOptions): Promise<RandomWorldRunResult> {
  const folder = projectRelative(options.out, "out");
  const base = posix.basename(folder);
  const id = base.replace(/[^A-Za-z0-9_-]/g, "_") || "random_world";
  const { brief, notes } = randomWorldBrief({ ...options.world, id, name: options.world.name ?? base });
  const { issues } = normalizeWorldBrief(structuredClone(brief));
  if (issues.length) throw new Error(`random world brief is invalid:\n  ${issues.join("\n  ")}`);

  const loaded = await loadProject(options.projectRoot, { engineRoot: options.engineRoot });
  if (!loaded.manifest || loaded.problems.length > 0) {
    throw new Error(`project ${options.projectRoot}: ${loaded.problems.map(formatProblem).join("; ")}`);
  }
  const project = { root: options.projectRoot, manifest: loaded.manifest, registry: await loadEngineRegistry(options.engineRoot) };

  const briefPath = `${folder}/${base}.worldbrief.json`;
  const previousRevision = await projectFileRevision(options.projectRoot, briefPath);
  const previous = previousRevision === null ? null : await readFile(join(options.projectRoot, briefPath), "utf8");
  if (previous !== null && !options.force) throw new Error(`${briefPath} exists; rerun with --force to replace it and its level.`);
  // A replaced brief keeps its asset id.
  let briefId: AssetId = createId("asset");
  try {
    const json = previous === null ? null : JSON.parse(previous) as unknown;
    if (isJsonObject(json) && isId(json.id, "asset")) briefId = json.id;
  } catch {
    // An unreadable brief is replaced with a new id.
  }
  const text = stringifyDocument(dataDocument(WorldBriefAssetType, briefId, brief as unknown as Record<string, unknown>));
  await commitFiles(project, [{ path: briefPath, base: previousRevision, text }]);

  let result: WorldBriefRunResult;
  try {
    result = await runWorldBrief({
      engineRoot: options.engineRoot, projectRoot: options.projectRoot, brief: briefPath, force: options.force, onProgress: options.onProgress,
    });
  } catch (error) {
    // A failed build leaves no brief of its own behind: the one it replaced comes
    // back byte for byte (it may not be a valid document, so not through the
    // save check), a new one goes.
    const absolute = join(options.projectRoot, briefPath);
    await (previous !== null ? writeFile(absolute, previous) : rm(absolute, { force: true })).catch(() => undefined);
    throw error;
  }
  return { ...result, brief: briefPath, notes };
}
