// `npm run import:forge` (plan 2b importer, user decisions 2026-11-12): brings
// Forge WebGL levels and the assets they use into a project of the new format.
//
// - Levels go to `<levels>/<Stem>/` (level folder, A11) with their terrain
//   (`terrain/<id>.terrain.json`, tiles and global map copied byte for byte)
//   and their World Builder sidecars as data documents; the paths inside the
//   sidecars are rewritten to the new file labels. An old recipe's ledger moves
//   onto the objects (`forge.worldRole.stage`) and its protected regions to the
//   top level (option B), as World Builder writes it.
// - Assets go to `<assets>/<Forge path without assets/>` with a meta file whose
//   GUID comes from the Forge id and whose licence comes from the provenance
//   table. An asset the project already sees under that GUID elsewhere (a
//   content pack) is not copied again: references point at it.
// - Everything is one atomic save through the save service. A level folder
//   that exists is replaced only with `force`; the importer's own files in it
//   that it no longer writes are deleted. Assets are rewritten in place (same
//   GUID, same bytes on a second run).

import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, posix } from "node:path";
import {
  CELL_INDEX_FILE,
  CELLS_DIR,
  cellFileOf,
  createAssetMeta,
  dataDocument,
  fileLabel,
  isJsonObject,
  LEVEL_FILE,
  normalizeLevel,
  RegionProfileAssetType,
  splitLevel,
  stringifyDocument,
  WorldBriefAssetType,
  WorldRecipeAssetType,
  buildAssetIndex,
  type AssetIndex,
  type BinaryAssetTypeDef,
  type JsonObject,
  type LevelDoc,
} from "../../src/core/index.ts";
import { importForgeLevel, type ForgeLevelReport } from "../../src/engine/forgeImport/forgeLevel.ts";
import { forgeAssetId, stableHex } from "../../src/engine/forgeImport/ids.ts";
import { normalizeWorldRecipe } from "../../src/engine/worldbuilder/recipe.ts";
import { fileRevision } from "../assets/revision.ts";
import { createClassStore, createDocumentCheck } from "../save/documentCheck.ts";
import { createSaveService, type SaveDelete, type SaveWrite } from "../save/transaction.ts";
import { createWritePolicy } from "../server/projectPaths.ts";
import { engineContentRoots } from "../assets/engineContent.ts";
import { loadEngineRegistry } from "../assets/engineRegistry.ts";
import { scanRoots } from "../assets/scan.ts";
import { openWorldProject } from "../world/worldProject.ts";
import { planAssets, type AssetPlan } from "./assetPlan.ts";
import { openForgeSource, type ForgeSource } from "./forgeSource.ts";
import { profileAssetIds, readForgeLevel, type ForgeLevelFiles } from "./levelRead.ts";
import { provenanceOf } from "./provenance.ts";

export interface ImportRunOptions {
  readonly engineRoot: string;
  /** The game project to write into; or `pack`. */
  readonly projectRoot?: string | undefined;
  /** A content pack of the engine to write into (`content/packs/<pack>/`): assets only, no levels. */
  readonly pack?: string | undefined;
  /** Forge WebGL `public/` folder (it holds `assets/manifest.json`). */
  readonly forgeRoot: string;
  /** Public-relative `*.level.json` files. */
  readonly levels: readonly string[];
  /** More Forge asset ids to bring (a starter subset), with what they use. */
  readonly assets?: readonly string[] | undefined;
  /** Project-relative folders. */
  readonly assetsFolder?: string | undefined;
  readonly levelsFolder?: string | undefined;
  readonly force?: boolean | undefined;
  /** Plan and report only. */
  readonly dryRun?: boolean | undefined;
}

export interface ImportedLevelSummary {
  readonly folder: string;
  readonly report: ForgeLevelReport;
  readonly deferredSidecars: ReadonlyArray<{ readonly path: string; readonly phase: string }>;
  readonly sidecars: readonly string[];
}

export interface ImportRunResult {
  readonly levels: readonly ImportedLevelSummary[];
  readonly plan: AssetPlan;
  /** Forge ids of planned assets the project already has under their GUID elsewhere. */
  readonly reused: readonly string[];
  /** Project-relative files written (the importer's own; the cell indexes too). */
  readonly written: readonly string[];
  readonly removed: readonly string[];
}

/** Files of a level folder the importer owns. */
function ownedByImport(relative: string): boolean {
  return relative === LEVEL_FILE || relative === CELL_INDEX_FILE || relative.startsWith(`${CELLS_DIR}/`) || relative.startsWith("terrain/");
}

async function listFiles(dir: string, relative = ""): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(join(dir, relative), { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const files: string[] = [];
  for (const entry of entries) {
    const path = relative === "" ? entry.name : `${relative}/${entry.name}`;
    if (entry.isDirectory()) files.push(...await listFiles(dir, path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

/** Every string equal to a key of `labels` replaced by its value; a deep copy. */
export function relabel<T>(value: T, labels: ReadonlyMap<string, string>): T {
  if (typeof value === "string") return (labels.get(value) ?? value) as T;
  if (Array.isArray(value)) return value.map((item) => relabel(item, labels)) as T;
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, relabel(item, labels)])) as T;
  }
  return value;
}

/** Stage of each placement in an old recipe's ledger (`ownership.placements`). */
function oldLedgerStages(recipe: JsonObject | undefined): Map<string, string> {
  const stages = new Map<string, string>();
  const ledger = recipe && isJsonObject(recipe.ownership) && isJsonObject(recipe.ownership.placements) ? recipe.ownership.placements : {};
  for (const [id, entry] of Object.entries(ledger)) if (isJsonObject(entry) && typeof entry.stage === "string") stages.set(id, entry.stage);
  return stages;
}

/** An old recipe in the new shape: protected regions at the top, ledger empty (it is on the objects). */
function convertRecipe(raw: JsonObject): JsonObject {
  const ownership = isJsonObject(raw.ownership) ? raw.ownership : {};
  const input = { ...raw, ...(raw.protectedRegions === undefined && Array.isArray(ownership.protectedRegions) ? { protectedRegions: ownership.protectedRegions } : {}) };
  const result = normalizeWorldRecipe(input);
  if (!result.recipe) throw new Error(`recipe: ${result.issues.join("; ")}`);
  return { ...structuredClone(result.recipe), generatedBy: { placements: {}, splines: {} } } as unknown as JsonObject;
}

/** Where the import writes: a game project, or one of the engine's content packs. */
interface ImportTarget {
  readonly root: string;
  readonly writableRoots: readonly string[];
  readonly registry: WorldRegistry;
  readonly index: AssetIndex;
}
type WorldRegistry = Awaited<ReturnType<typeof loadEngineRegistry>>;

const PACK_ID = /^[a-z][a-z0-9-]*$/;

async function openTarget(options: ImportRunOptions): Promise<ImportTarget> {
  if (options.pack !== undefined) {
    if (options.projectRoot !== undefined) throw new Error("give a project or a pack, not both");
    if (!PACK_ID.test(options.pack)) throw new Error(`not a content pack id: ${options.pack}`);
    if (options.levels.length > 0) throw new Error("a content pack takes assets only; levels go to a project");
    const folder = `content/packs/${options.pack}`;
    const registry = await loadEngineRegistry(options.engineRoot);
    // The pack sees the engine's content (a pack may refer to it) and itself, as verify:assets indexes it.
    const roots = [...engineContentRoots(options.engineRoot, []), { label: folder, dir: join(options.engineRoot, folder) }];
    const index = buildAssetIndex((await scanRoots(roots)).files, { strict: true, registry });
    return { root: options.engineRoot, writableRoots: [folder], registry, index };
  }
  if (options.projectRoot === undefined) throw new Error("give a project or a pack");
  const project = await openWorldProject(options.engineRoot, options.projectRoot);
  return { root: project.root, writableRoots: project.manifest.contentRoots, registry: project.registry, index: project.index };
}

const fileAssetId = (path: string) => `ast_${stableHex(`forge-webgl/file/${path}`)}` as const;
const baseName = (path: string): string => path.slice(path.lastIndexOf("/") + 1);

interface PendingWrites {
  readonly texts: Map<string, string>;
  readonly binaries: Map<string, { readonly from: string }>;
}

export async function runForgeImport(options: ImportRunOptions): Promise<ImportRunResult> {
  const assetsFolder = posix.normalize(options.assetsFolder ?? (options.pack !== undefined ? `content/packs/${options.pack}` : "content/forge"));
  const levelsFolder = posix.normalize(options.levelsFolder ?? "content/levels");
  const project = await openTarget(options);
  const source = await openForgeSource(options.forgeRoot);
  const levels: ForgeLevelFiles[] = [];
  for (const path of options.levels) levels.push(await readForgeLevel(source, path));
  const plan = await planAssets(source, [...levels.flatMap((level) => level.seeds), ...(options.assets ?? [])]);

  const pending: PendingWrites = { texts: new Map(), binaries: new Map() };
  const labels = new Map<string, string>();
  const reused: string[] = [];
  const modelGuids = new Set<string>();
  for (const [id, planned] of plan.imported) {
    const guid = forgeAssetId(id);
    const target = `${assetsFolder}/${planned.asset.path.replace(/^assets\//, "")}`;
    const existing = project.index.entries.get(guid);
    const existingLabel = existing ? fileLabel(existing.root, existing.path) : null;
    if (planned.type === "forge.model") modelGuids.add(guid);
    if (existingLabel !== null && existingLabel !== target) {
      reused.push(id);
      labels.set(planned.asset.path, existingLabel);
      continue;
    }
    labels.set(planned.asset.path, target);
    const type = project.registry.getAssetType(planned.type) as BinaryAssetTypeDef | undefined;
    if (!type) throw new Error(`the engine has no ${planned.type} asset type`);
    const meta = createAssetMeta(type, planned.provenance, { strict: true, registry: project.registry }, guid);
    if (!meta.value || !meta.ok) throw new Error(`${planned.asset.path}: meta: ${meta.issues.map((issue) => issue.message).join("; ")}`);
    pending.binaries.set(target, { from: planned.asset.path });
    pending.texts.set(`${target}.meta.json`, stringifyDocument(meta.value));
  }
  const meshAsset = (id: string): string | null => {
    const guid = forgeAssetId(id);
    return modelGuids.has(guid) || project.index.entries.get(guid)?.type === "forge.model" ? guid : null;
  };

  const summaries: ImportedLevelSummary[] = [];
  const folders: string[] = [];
  for (const level of levels) {
    const folder = `${levelsFolder}/${level.stem}`;
    folders.push(folder);
    const sidecars = levelSidecars(level, folder, labels, pending, project);
    const stages = oldLedgerStages(level.recipe?.json);
    const imported = importForgeLevel(level.input, { meshAsset, stageOf: (id) => stages.get(id) });
    writeLevel(project, folder, imported.level, pending);
    for (const terrain of imported.terrains) {
      pending.texts.set(`${folder}/${terrain.file}`, stringifyDocument(terrain.document));
      const fromBase = terrain.source.replace(/\.terrain\.json$/, "");
      const toBase = `${folder}/${terrain.file.replace(/\.terrain\.json$/, "")}`;
      for (const key of terrain.tileKeys) pending.binaries.set(`${toBase}.tiles/${key}.tile.bin`, { from: `${fromBase}.tiles/${key}.tile.bin` });
      pending.binaries.set(`${toBase}.global.bin`, { from: `${fromBase}.global.bin` });
    }
    summaries.push({ folder, report: imported.report, deferredSidecars: level.deferred, sidecars });
  }

  if (options.dryRun) return { levels: summaries, plan, reused, written: [], removed: [] };
  const { written, removed } = await commit(project, source, pending, folders, options.force === true);
  return { levels: summaries, plan, reused, written, removed };
}

/** The level's World Builder sidecars into its folder, their inner paths relabelled. */
function levelSidecars(
  level: ForgeLevelFiles,
  folder: string,
  labels: Map<string, string>,
  pending: PendingWrites,
  project: ImportTarget,
): string[] {
  const written: string[] = [];
  // A sidecar another level of this run placed already (two briefs naming one profile) is
  // written once, where it landed first; the later level refers to it there.
  const place = (path: string, name: string): string | null => {
    if (labels.has(path)) return null;
    const target = `${folder}/${name}`;
    labels.set(path, target);
    written.push(target);
    return target;
  };
  // Labels first: the brief names the profile and the image.
  const profileTarget = level.profile ? place(level.profile.path, baseName(level.profile.path)) : null;
  const referenceTarget = level.reference ? place(level.reference.path, baseName(level.reference.path)) : null;
  const briefTarget = level.brief ? place(level.brief.path, `${level.stem}.worldbrief.json`) : null;
  const recipeTarget = level.recipe ? place(level.recipe.path, `${level.stem}.worldrecipe.json`) : null;

  if (level.profile && profileTarget) {
    // The new profile names assets by GUID (World Builder checks them against the asset index).
    const profile = relabel(level.profile.json!, labels);
    for (const reference of profileAssetIds(profile)) reference.set(forgeAssetId(reference.id));
    pending.texts.set(profileTarget, stringifyDocument(dataDocument(RegionProfileAssetType, fileAssetId(level.profile.path), profile)));
  }
  if (level.reference && referenceTarget) {
    const decision = provenanceOf({ path: level.reference.path });
    if (decision.kind !== "import") throw new Error(`${level.reference.path}: ${decision.reason}`);
    const type = project.registry.getAssetType("forge.texture") as BinaryAssetTypeDef;
    const meta = createAssetMeta(type, decision.provenance, { strict: true, registry: project.registry }, fileAssetId(level.reference.path));
    if (!meta.value) throw new Error(`${level.reference.path}: meta: ${meta.issues.map((issue) => issue.message).join("; ")}`);
    pending.binaries.set(referenceTarget, { from: level.reference.path });
    pending.texts.set(`${referenceTarget}.meta.json`, stringifyDocument(meta.value));
  }
  if (level.brief && briefTarget) {
    pending.texts.set(briefTarget, stringifyDocument(dataDocument(WorldBriefAssetType, fileAssetId(level.brief.path), relabel(level.brief.json!, labels))));
  }
  if (level.recipe && recipeTarget) {
    const recipe = relabel(convertRecipe(level.recipe.json!), labels);
    pending.texts.set(recipeTarget, stringifyDocument(dataDocument(WorldRecipeAssetType, fileAssetId(level.recipe.path), recipe)));
  }
  return written;
}

/** Normalises and splits the level into its files (as `tools/world`). */
function writeLevel(project: ImportTarget, folder: string, level: LevelDoc, pending: PendingWrites): void {
  const options = { strict: true, registry: project.registry, resolveClass: project.index.resolveClass };
  const normalized = normalizeLevel(level, options);
  if (!normalized.value || !normalized.ok) {
    throw new Error(`${folder}: the converted level is not valid: ${normalized.issues.map((issue) => `${issue.path} ${issue.message}`).join("; ")}`);
  }
  const split = splitLevel(normalized.value as LevelDoc, options);
  if (split.issues.length) throw new Error(`${folder}: the level does not split into cells: ${split.issues.map((issue) => issue.message).join("; ")}`);
  pending.texts.set(`${folder}/${LEVEL_FILE}`, stringifyDocument(split.persistent));
  for (const cell of split.cells) pending.texts.set(`${folder}/${cellFileOf(cell.cell)}`, stringifyDocument(cell));
}

async function commit(
  project: ImportTarget,
  source: ForgeSource,
  pending: PendingWrites,
  folders: readonly string[],
  force: boolean,
): Promise<{ written: string[]; removed: string[] }> {
  const revisionOf = async (path: string): Promise<string | null> => {
    try {
      return fileRevision(await readFile(join(project.root, path)));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  };
  const deletes: SaveDelete[] = [];
  for (const folder of folders) {
    const existing = await listFiles(join(project.root, folder));
    if (existing.includes(LEVEL_FILE) && !force) throw new Error(`${folder} already holds a level; pass --force to replace it`);
    for (const relative of existing) {
      const path = `${folder}/${relative}`;
      if (relative === CELL_INDEX_FILE || !ownedByImport(relative) || pending.texts.has(path) || pending.binaries.has(path)) continue;
      deletes.push({ path, base: fileRevision(await readFile(join(project.root, path))) });
    }
  }

  const staging = await mkdtemp(join(project.root, ".forge-staging-import-"));
  try {
    const writes: SaveWrite[] = [];
    for (const [path, text] of pending.texts) writes.push({ path, base: await revisionOf(path), text });
    let staged = 0;
    for (const [path, { from }] of pending.binaries) {
      const file = join(staging, `${(staged += 1)}.bin`);
      await writeFile(file, await source.readBytes(from));
      writes.push({ path, base: await revisionOf(path), staged: file });
    }
    const service = createSaveService({
      policy: createWritePolicy(project.root, project.writableRoots),
      check: createDocumentCheck(project.registry, createClassStore(project.root, project.registry, project.index)),
    });
    const result = await service.commit({ writes, deletes });
    if (result.status === "conflict") throw new Error(`files changed during the import: ${result.conflicts.map((conflict) => conflict.path).join(", ")}`);
    if (result.status === "rejected") {
      throw new Error(`the save refused the import (${result.reason}): ${result.issues.map((issue) => `${issue.file} ${issue.path} ${issue.message}`.trim()).join("; ")}`);
    }
    return {
      written: result.files.filter((file) => file.revision !== null).map((file) => file.path),
      removed: result.files.filter((file) => file.revision === null).map((file) => file.path),
    };
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
