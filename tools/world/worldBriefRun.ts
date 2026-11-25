// `npm run world:brief` (plan 2b `tools/world`; Forge WebGL
// tools/world/worldBriefRun.ts, rewritten for the new level format): builds
// the level of a `*.worldbrief.json` in the brief's folder.
//
// Reads the brief, its region profile and its ground cover through the
// project's asset index (labels), builds in memory
// (`src/engine/worldbuilder/build`), converts to a level and writes it through
// the save service. The level is a folder: `level.json`, `cells.json`,
// `cells/`, `terrain/<id>.terrain.json` with its tiles, and
// `<folder>.worldrecipe.json`. An existing level is replaced only with `force`
// (it may hold editor changes) and keeps its level id, its settings and its
// scene settings actors (user decision 2026-11-25). A recipe of the project
// the brief or cover names is generated first when it has no output.

import { readdir, readFile } from "node:fs/promises";
import { join, posix } from "node:path";
import {
  CELLS_DIR,
  createId,
  fileLabel,
  GroundCoverAssetType,
  isId,
  isJsonObject,
  LEVEL_FILE,
  normalizeLevel,
  normalizeLevelCell,
  RegionProfileAssetType,
  stringifyDocument,
  WorldBriefAssetType,
  type AssetId,
  type LevelId,
} from "../../src/core/index.ts";
import { readSheetEntries } from "../../src/engine/plant/familySheet.ts";
import { recipeGenerator } from "../../src/engine/procgen/recipeOutputs.ts";
import { buildWorldFromBrief, worldRecipes, type WorldBuild } from "../../src/engine/worldbuilder/build/worldBuild.ts";
import { hasLook, sceneSettingsActors } from "../../src/engine/worldbuilder/build/sceneSettings.ts";
import { worldLevel, type WorldLevel, type WorldLevelOptions } from "../../src/engine/worldbuilder/build/worldLevel.ts";
import { generatedSources } from "../../src/engine/worldbuilder/generatedModels.ts";
import { normalizeGroundCover, type GroundCover } from "../../src/engine/worldbuilder/groundCover.ts";
import { normalizeRegionProfile, regionProfileAssetIds, type RegionProfile } from "../../src/engine/worldbuilder/regionProfile.ts";
import { normalizeWorldBrief, type WorldBuildStep } from "../../src/engine/worldbuilder/worldBrief.ts";
import { openWorldProject, type WorldProject } from "./worldProject.ts";
import { writeWorld } from "./worldWrite.ts";

export interface WorldBriefRunOptions {
  readonly engineRoot: string;
  readonly projectRoot: string;
  /** Project-relative `*.worldbrief.json`; its folder is the level's. */
  readonly brief: string;
  /** Replace an existing level. */
  readonly force?: boolean | undefined;
  /** Told as each build step starts. */
  readonly onProgress?: ((step: WorldBuildStep) => void) | undefined;
}

export interface WorldBriefRunResult {
  /** Project-relative level folder. */
  readonly folder: string;
  readonly levelId: LevelId;
  readonly build: WorldBuild;
  readonly level: WorldLevel;
  readonly written: string[];
  readonly removed: string[];
}

/** A project path with plain segments: no `..`, no drive, no empty part. */
export function projectRelative(path: string, label: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "");
  if (!normalized || /^[a-z][a-z\d+.-]*:/i.test(normalized) || normalized.startsWith("/")
    || normalized.split("/").some((part) => part === "" || part === "." || part === "..")) {
    throw new Error(`${label} must be a path inside the project: ${path}`);
  }
  return normalized;
}

interface ExistingLevel {
  /** Null when the document names no usable id. */
  readonly id: LevelId | null;
  /** Its settings and scene settings actors, for the level built over it. */
  readonly keep: WorldLevelOptions["keep"];
}

/** The level in `folder`, or undefined when there is none. */
async function existingLevel(project: WorldProject, folder: string): Promise<ExistingLevel | undefined> {
  const readJson = async (path: string): Promise<unknown> => {
    const text = await readFile(join(project.root, folder, path), "utf8");
    try {
      return JSON.parse(text) as unknown;
    } catch (error) {
      throw new Error(`existing level ${folder}/${path} is not JSON: ${(error as Error).message}`);
    }
  };
  const missing = (error: NodeJS.ErrnoException): undefined => {
    if (error.code === "ENOENT") return undefined;
    throw error;
  };
  const json = await readJson(LEVEL_FILE).catch(missing);
  if (json === undefined) return undefined;
  const options = { strict: false, registry: project.registry, resolveClass: project.index.resolveClass };
  const persistent = normalizeLevel(json, options).value;
  if (!persistent) return { id: isJsonObject(json) && isId(json.id, "level") ? json.id : null, keep: undefined };
  // A scene settings actor can stand in a cell (a directional light left spatially loaded).
  const actors = [...persistent.actors];
  const cells = (await readdir(join(project.root, folder, CELLS_DIR)).catch(missing)) ?? [];
  for (const name of cells.filter((one) => one.endsWith(".json")).sort()) {
    actors.push(...(normalizeLevelCell(await readJson(`${CELLS_DIR}/${name}`), options).value?.actors ?? []));
  }
  const kept = sceneSettingsActors(actors, options);
  return { id: persistent.id, keep: { settings: persistent.settings, actors: kept, look: hasLook(kept, options) } };
}

/** The entries of every family sheet of the project (its packs' too). */
const sheetsOf = (project: WorldProject) =>
  [...project.index.entries.values()].filter((entry) => entry.type === "forge.familySheet").map((entry) => readSheetEntries(project.index.jsonAssets.get(entry.id)));

/**
 * Generates the project's own recipes that have no output yet (vegetation plan §7.2; user decision 2026-11-25:
 * existing output is never touched, a pack is read-only and a rejected recipe stays as it is).
 */
async function generateMissing(project: WorldProject, options: WorldBriefRunOptions, recipes: readonly AssetId[]): Promise<WorldProject> {
  const sources = generatedSources(project.index, sheetsOf(project));
  const labels = recipes.flatMap((recipe) => {
    const entry = project.index.entries.get(recipe)!;
    return sources(recipe)?.state === "missing" && project.manifest.contentRoots.includes(entry.root) ? [fileLabel(entry.root, entry.path)] : [];
  });
  if (labels.length === 0) return project;
  const { generateFromRecipe } = await import("../procgen/generate.ts");
  for (const recipe of labels) await generateFromRecipe({ engineRoot: options.engineRoot, projectRoot: options.projectRoot, recipe });
  return openWorldProject(options.engineRoot, options.projectRoot);
}

export async function runWorldBrief(options: WorldBriefRunOptions): Promise<WorldBriefRunResult> {
  const briefPath = projectRelative(options.brief, "brief");
  if (!briefPath.endsWith(".worldbrief.json")) throw new Error(`brief must be a *.worldbrief.json file: ${briefPath}`);
  const folder = posix.dirname(briefPath);
  if (folder === ".") throw new Error(`a brief sits in its level's folder, not at the project root: ${briefPath}`);
  let project = await openWorldProject(options.engineRoot, options.projectRoot);

  const { brief, issues } = normalizeWorldBrief(project.readData(briefPath, WorldBriefAssetType, "world brief"));
  if (!brief) throw new Error(`invalid world brief ${briefPath}:\n  ${issues.join("\n  ")}`);
  if (issues.length) throw new Error(`invalid world brief ${briefPath}:\n  ${issues.join("\n  ")}`);

  const previous = await existingLevel(project, folder);
  if (previous !== undefined && !options.force) {
    throw new Error(`${folder}/${LEVEL_FILE} exists; it may hold editor changes. Rerun with --force to rebuild it from the brief.`);
  }
  const levelId = previous?.id ?? createId("level");

  let profile: RegionProfile | null = null;
  if (brief.regionProfile) {
    const normalized = normalizeRegionProfile(project.readData(brief.regionProfile, RegionProfileAssetType, "region profile"));
    if (!normalized.profile || normalized.issues.length) {
      throw new Error(`region profile ${brief.regionProfile}: ${normalized.issues.join("; ")}`);
    }
    profile = normalized.profile;
    // A level naming an asset the project lacks does not start: refuse to build one.
    const missing = regionProfileAssetIds(profile).filter(({ id }) => !project.index.entries.has(id));
    if (missing.length) {
      throw new Error(`region profile ${brief.regionProfile} names asset(s) not in the project: ${missing.map(({ id, where }) => `${id} (${where})`).join(", ")}`);
    }
  }
  let cover: GroundCover | null = null;
  if (brief.cover) {
    const normalized = normalizeGroundCover(project.readData(brief.cover.file, GroundCoverAssetType, "ground cover"));
    if (!normalized.cover) throw new Error(`ground cover ${brief.cover.file}: ${normalized.issues.join("; ")}`);
    cover = normalized.cover;
    const missing = cover.plants.filter((plant) => plant.foliageType !== null && !project.index.entries.has(plant.foliageType));
    if (missing.length) throw new Error(`ground cover ${brief.cover.file} names foliage type(s) not in the project: ${missing.map((plant) => `${plant.foliageType} (${plant.id})`).join(", ")}`);
  }

  const unknown = worldRecipes(brief, cover).filter((recipe) => recipeGenerator(project.index.entries.get(recipe)?.type ?? "") === null);
  if (unknown.length) throw new Error(`${briefPath}: no model recipe in the project: ${unknown.join(", ")}`);
  const grown = (cover?.plants ?? []).flatMap((plant) => (plant.recipe ? [plant.recipe] : [])).filter((recipe) => project.index.entries.get(recipe)!.type === "forge.rockRecipe");
  if (grown.length) throw new Error(`ground cover ${brief.cover!.file} grows rock recipe(s): ${grown.join(", ")}`);
  project = await generateMissing(project, options, worldRecipes(brief, cover));
  const generated = generatedSources(project.index, sheetsOf(project));

  const build = buildWorldFromBrief({
    brief, profile, cover, generated, assetIdForFile: (file) => (isId(file, "asset") ? (project.index.entries.has(file) ? file : null) : project.assetIdOf(file)), onProgress: options.onProgress,
  });
  options.onProgress?.("files");
  const level = worldLevel(build, { levelId, terrainId: brief.terrain.id, keep: previous?.keep });
  const name = posix.basename(folder);
  const { written, removed } = await writeWorld(project, {
    folder,
    level,
    tileBytes: build.tileBytes,
    globalBytes: build.globalBytes,
    texts: [{ path: `${name}.worldrecipe.json`, text: stringifyDocument(level.recipe) }],
  });
  return { folder, levelId, build, level, written, removed };
}
