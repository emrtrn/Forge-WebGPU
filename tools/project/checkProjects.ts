// `npm run check:projects` (architecture §4.8, A8; project contract 1J).
//
// The compatibility gate: every game project this engine knows (samples/*
// and the ones in forge.projects.local.json) is checked against the engine
// as it is now. In CI only samples/ exist, so there it is the contract test.
// For each project:
//
// 1. `forge check`: manifest, SDK version, compile, import boundary;
// 2. the asset gate with the project's own registry (engine schemas plus the
//    components and asset types of the game's features);
// 3. a headless start: the engine's features and the game module are loaded
//    through Vite (so `@forge/sdk` resolves), the start level is read from
//    disk, and `bootGame` runs a few frames with a manual scheduler. Anything
//    the boot screen would show as an error fails the project.

import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { createServer, type ViteDevServer } from "vite";
import {
  buildAssetIndex,
  CELL_INDEX_FILE,
  CELLS_DIR,
  defineFeature,
  installFeatures,
  isJsonObject,
  mergeLevelParts,
  normalizeLevel,
  normalizeLevelCell,
  normalizeLevelCellIndex,
  type ClassResolver,
  type FeatureDef,
  type LevelCellDoc,
  type LevelDoc,
  type SchemaRegistry,
} from "../../src/core/index.ts";
import { loadEngineRegistry } from "../assets/engineRegistry.ts";
import { scanContentRoots } from "../assets/scan.ts";
import { checkProject, formatProblem } from "./check.ts";

// The runtime is loaded through Vite (`ssrLoadModule`), never imported: tools
// stay out of src/runtime (layer rule tools-are-node-only). These are the
// shapes this tool relies on.
interface GameModuleShape {
  readonly kind: "gameModule";
  readonly features?: readonly FeatureDef[];
}
interface BootErrorViewShape {
  readonly title: string;
  readonly message: string;
  readonly details: readonly string[];
}
interface RunningGameShape {
  readonly world: { readonly context: { actors(): Iterable<unknown> } };
  stop(): void;
}
type BootGame = (options: {
  features: readonly FeatureDef[];
  gameModule?: GameModuleShape;
  strict: boolean;
  loadLevel: (registry: SchemaRegistry) => Promise<{ level: unknown; resolveClass: ClassResolver } | null>;
  screen: { info(title: string, message: string): void; error(view: BootErrorViewShape): void; clear(): void };
  scheduler: { request(frame: (time: number) => void): number; cancel(handle: number): void };
}) => Promise<RunningGameShape | null>;

export interface ProjectReport {
  readonly root: string;
  readonly name: string;
  readonly ok: boolean;
  readonly problems: readonly string[];
  /** What the headless start did: "played N frames", "nothing to open", or why it stopped. */
  readonly start: string;
}

const FRAMES = 3;

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

/** A level folder from disk: persistent layer and every cell the index lists, merged. */
async function loadLevelFromDisk(folder: string, registry: SchemaRegistry, resolveClass: ClassResolver): Promise<LevelDoc> {
  const options = { strict: true, registry, resolveClass };
  const persistent = normalizeLevel(await readJson(join(folder, "level.json")), options);
  if (!persistent.ok || !persistent.value) throw new Error(`level.json: ${persistent.issues.map((issue) => issue.message).join("; ")}`);
  let keys: string[] = [];
  try {
    keys = Object.keys(normalizeLevelCellIndex(await readJson(join(folder, CELL_INDEX_FILE)), options).value?.cells ?? {});
  } catch {
    keys = [];
  }
  const cells: LevelCellDoc[] = [];
  for (const key of keys) {
    const cell = normalizeLevelCell(await readJson(join(folder, CELLS_DIR, `${key}.json`)), options);
    if (!cell.ok || !cell.value) throw new Error(`cells/${key}.json: ${cell.issues.map((issue) => issue.message).join("; ")}`);
    cells.push(cell.value);
  }
  const merged = mergeLevelParts(persistent.value, cells, options);
  if (!merged.ok) throw new Error(merged.issues.map((issue) => `${issue.file} ${issue.message}`).join("; "));
  return merged.value.level;
}

async function engineFeatures(vite: ViteDevServer, engineRoot: string): Promise<FeatureDef[]> {
  const features: FeatureDef[] = [];
  const root = join(engineRoot, "src/features");
  for (const entry of (await readdir(root, { withFileTypes: true })).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (!entry.isDirectory()) continue;
    const loaded = (await vite.ssrLoadModule(join(root, entry.name, "feature.ts"))) as { default?: FeatureDef };
    if (loaded.default) features.push(loaded.default);
  }
  return features;
}

async function checkOne(vite: ViteDevServer, engineRoot: string, root: string): Promise<ProjectReport> {
  const problems: string[] = [];
  const checked = await checkProject(root, engineRoot);
  problems.push(...checked.problems.map(formatProblem));
  const manifest = checked.manifest;
  const name = manifest?.name ?? root;
  if (!manifest || problems.length > 0) return { root, name, ok: false, problems, start: "not started" };

  // The game's own schemas join the engine's.
  let gameModule: GameModuleShape | undefined;
  if (manifest.game.module !== "") {
    const loaded = (await vite.ssrLoadModule(join(root, manifest.game.module))) as { default?: unknown };
    if (!isJsonObject(loaded.default) || loaded.default.kind !== "gameModule") {
      problems.push(`${manifest.game.module}: must export default defineGameModule(...)`);
      return { root, name, ok: false, problems, start: "not started" };
    }
    gameModule = loaded.default as unknown as GameModuleShape;
  }
  const registry = await loadEngineRegistry(engineRoot);
  installFeatures(
    (gameModule?.features ?? []).map((feature) => defineFeature({ id: feature.id, components: feature.components, assetTypes: feature.assetTypes })),
    registry,
  );
  const scan = await scanContentRoots(root, manifest.contentRoots);
  const index = buildAssetIndex(scan.files, { strict: true, registry });
  problems.push(...index.issues.map((issue) => `${issue.file}${issue.path === "" ? "" : ` ${issue.path}`} ${issue.code}: ${issue.message}`));
  if (problems.length > 0) return { root, name, ok: false, problems, start: "not started" };

  // Headless start.
  const { bootGame } = (await vite.ssrLoadModule(join(engineRoot, "src/runtime/boot.ts"))) as { bootGame: BootGame };
  const features = await engineFeatures(vite, engineRoot);
  let shown: { kind: "info" | "error"; text: string } | null = null;
  const frames: ((time: number) => void)[] = [];
  const game = await bootGame({
    features,
    ...(gameModule ? { gameModule } : {}),
    strict: true,
    loadLevel: async (bootRegistry) =>
      manifest.startLevel === ""
        ? null
        : { level: await loadLevelFromDisk(join(root, manifest.startLevel), bootRegistry, index.resolveClass), resolveClass: index.resolveClass },
    screen: {
      info: (title) => (shown = { kind: "info", text: title }),
      error: (view: BootErrorViewShape) => (shown = { kind: "error", text: [view.title, view.message, ...view.details.slice(0, 3)].join(" | ") }),
      clear: () => undefined,
    },
    scheduler: { request: (frame: (time: number) => void) => frames.push(frame), cancel: () => undefined },
  });
  if (game === null) {
    const result = shown as { kind: "info" | "error"; text: string } | null;
    if (result?.kind === "info") return { root, name, ok: true, problems, start: "nothing to open" };
    problems.push(`start: ${result?.text ?? "the boot stopped without a reason"}`);
    return { root, name, ok: false, problems, start: "stopped" };
  }
  for (let frame = 0; frame < FRAMES; frame += 1) {
    const next = frames.shift();
    if (!next) break;
    next(frame * 16);
    const result = shown as { kind: "info" | "error"; text: string } | null;
    if (result?.kind === "error") {
      problems.push(`frame ${frame}: ${result.text}`);
      break;
    }
  }
  const actors = [...game.world.context.actors()].length;
  game.stop();
  return { root, name, ok: problems.length === 0, problems, start: `played ${FRAMES} frames with ${actors} actor(s)` };
}

/** Checks the projects one after another with one Vite server. */
export async function checkProjects(engineRoot: string, roots: readonly string[]): Promise<ProjectReport[]> {
  const vite = await createServer({
    root: engineRoot,
    configFile: false,
    logLevel: "silent",
    appType: "custom",
    resolve: {
      alias: {
        "@forge/sdk": join(engineRoot, "src/sdk/index.ts"),
        "@forge/editor-sdk": join(engineRoot, "src/editor-sdk/index.ts"),
      },
    },
    server: { middlewareMode: true, hmr: false, watch: null },
  });
  try {
    const reports: ProjectReport[] = [];
    for (const root of roots) {
      try {
        reports.push(await checkOne(vite, engineRoot, root));
      } catch (error) {
        reports.push({ root, name: root, ok: false, problems: [error instanceof Error ? error.message : String(error)], start: "not started" });
      }
    }
    return reports;
  } finally {
    await vite.close();
  }
}

export function formatReport(report: ProjectReport, engineRoot: string): string[] {
  const rel = relative(engineRoot, report.root).split(sep).join("/");
  const where = rel.startsWith("..") ? report.root : rel;
  return [`${report.ok ? "ok  " : "FAIL"} ${report.name} (${where}): ${report.start}`, ...report.problems.map((problem) => `     ${problem}`)];
}
