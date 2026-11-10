// `npm run create-project -- <target> --id <id> [--name <name>] [--register]`
// (architecture §4.8; project contract decision 1I).
//
// A new game repository from samples/starter: the starter's content and
// configuration, a game module named after the project, the level's GUID
// renewed (its files rewritten in canonical form with new revisions and a new
// index). The target must be outside the engine repository and empty.
// `--register` adds the project to forge.projects.local.json so
// `check:projects` checks it before every engine push.

import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import {
  CELL_INDEX_FILE,
  CELLS_DIR,
  createId,
  mergeLevelParts,
  nextCellIndex,
  normalizeLevel,
  normalizeLevelCell,
  normalizeProjectManifest,
  PROJECT_FILE,
  PROJECT_ID_PATTERN,
  splitLevel,
  stringifyDocument,
  type LevelCellDoc,
  type PartKey,
  type SchemaRegistry,
} from "../../src/core/index.ts";
import { fileRevision } from "../assets/revision.ts";
import { loadEngineRegistry } from "../assets/engineRegistry.ts";
import { DEFAULT_PROJECT } from "../server/devProject.ts";
import { registerLocalProject } from "./localProjects.ts";

export interface CreateProjectOptions {
  readonly engineRoot: string;
  readonly target: string;
  readonly id: string;
  readonly name?: string;
  readonly register?: boolean;
}

const gameModuleSource = (id: string, name: string): string => `// The ${name} game module. It imports nothing but @forge/sdk: a game adds its
// features (components, subsystems) to \`features\` and reacts to the start and
// end of play.
import { defineGameModule } from "@forge/sdk";

export default defineGameModule({
  id: "${id}.main",
  features: [],
  onBeginPlay: (ctx) => {
    console.info(\`${name}: playing with \${[...ctx.actors()].length} actor(s).\`);
  },
});
`;

async function isEmptyOrMissing(path: string): Promise<boolean> {
  try {
    if (!(await stat(path)).isDirectory()) return false;
    return (await readdir(path)).length === 0;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return true;
    throw error;
  }
}

/** Gives the level in `folder` a new GUID and rewrites its files with fresh revisions. */
async function renewLevel(folder: string, registry: SchemaRegistry): Promise<void> {
  const options = { strict: true, registry, resolveClass: () => undefined };
  const persistent = normalizeLevel(JSON.parse(await readFile(join(folder, "level.json"), "utf8")), options);
  if (!persistent.ok || !persistent.value) throw new Error(`${folder}/level.json does not normalise: ${persistent.issues[0]?.message}`);
  const cells: LevelCellDoc[] = [];
  const cellDir = join(folder, CELLS_DIR);
  for (const name of await readdir(cellDir).catch(() => [] as string[])) {
    const cell = normalizeLevelCell(JSON.parse(await readFile(join(cellDir, name), "utf8")), options);
    if (!cell.ok || !cell.value) throw new Error(`${folder}/${CELLS_DIR}/${name} does not normalise.`);
    cells.push(cell.value);
  }
  const merged = mergeLevelParts(persistent.value, cells, options);
  const level = { ...merged.value.level, id: createId("level") };
  const split = splitLevel(level, options);
  await rm(cellDir, { recursive: true, force: true });
  const revisions = new Map<PartKey, string>();
  const write = async (path: string, document: unknown): Promise<string> => {
    const text = stringifyDocument(document);
    await writeFile(path, text);
    return fileRevision(text);
  };
  revisions.set(null, await write(join(folder, "level.json"), split.persistent));
  if (split.cells.length > 0) await mkdir(cellDir, { recursive: true });
  for (const cell of split.cells) revisions.set(cell.cell, await write(join(cellDir, `${cell.cell}.json`), cell));
  await write(join(folder, CELL_INDEX_FILE), nextCellIndex(level.id, null, revisions));
}

/** Every folder under `root` that holds a level.json. */
async function levelFolders(root: string): Promise<string[]> {
  const found: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      if (entry.isDirectory()) await walk(join(dir, entry.name));
      else if (entry.name === "level.json") found.push(dir);
    }
  };
  await walk(root);
  return found;
}

export async function createProject(options: CreateProjectOptions): Promise<{ readonly root: string }> {
  const engineRoot = resolve(options.engineRoot);
  const target = resolve(options.target);
  const inside = relative(engineRoot, target);
  if (inside === "" || !(inside.startsWith("..") || /^[A-Za-z]:/.test(inside) || inside.startsWith(sep))) {
    throw new Error(`A game project lives in its own repository, outside the engine: ${target}`);
  }
  if (!PROJECT_ID_PATTERN.test(options.id)) {
    throw new Error(`A project id is lower case letters and digits, starting with a letter: ${options.id}`);
  }
  if (!(await isEmptyOrMissing(target))) throw new Error(`The target is not empty: ${target}`);
  const name = options.name ?? options.id.charAt(0).toUpperCase() + options.id.slice(1);

  const starter = join(engineRoot, DEFAULT_PROJECT);
  await mkdir(target, { recursive: true });
  await cp(starter, target, {
    recursive: true,
    filter: (source) => !relative(starter, source).split(sep).some((part) => part === ".forge"),
  });

  const manifest = normalizeProjectManifest(JSON.parse(await readFile(join(starter, PROJECT_FILE), "utf8")), { strict: true }).value!;
  await writeFile(join(target, PROJECT_FILE), stringifyDocument({ ...manifest, id: options.id, name }));
  await writeFile(join(target, manifest.game.module), gameModuleSource(options.id, name));
  await writeFile(
    join(target, "README.md"),
    `# ${name}\n\nA game project on Forge WebGPU, made from the starter sample.\n\n` +
      "- Open it: `npm run forge -- dev --project <this folder>` from the engine repository.\n" +
      "- Check it: `npm run forge -- check --project <this folder>`.\n" +
      "- It imports the engine through `@forge/sdk` only (architecture §4.8).\n",
  );

  const registry = await loadEngineRegistry(engineRoot);
  for (const root of manifest.contentRoots) {
    for (const folder of await levelFolders(join(target, root))) await renewLevel(folder, registry);
  }
  if (options.register) await registerLocalProject(engineRoot, target);
  return { root: target };
}

