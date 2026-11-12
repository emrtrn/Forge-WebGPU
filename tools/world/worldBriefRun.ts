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
// (it may hold editor changes) and keeps its level id.

import { readFile } from "node:fs/promises";
import { join, posix } from "node:path";
import {
  createId,
  GroundCoverAssetType,
  isId,
  isJsonObject,
  LEVEL_FILE,
  RegionProfileAssetType,
  stringifyDocument,
  WorldBriefAssetType,
  type LevelId,
} from "../../src/core/index.ts";
import { buildWorldFromBrief, type WorldBuild } from "../../src/engine/worldbuilder/build/worldBuild.ts";
import { worldLevel, type WorldLevel } from "../../src/engine/worldbuilder/build/worldLevel.ts";
import { normalizeGroundCover, type GroundCover } from "../../src/engine/worldbuilder/groundCover.ts";
import { normalizeRegionProfile, regionProfileAssetIds, type RegionProfile } from "../../src/engine/worldbuilder/regionProfile.ts";
import { normalizeWorldBrief, type WorldBuildStep } from "../../src/engine/worldbuilder/worldBrief.ts";
import { openWorldProject } from "./worldProject.ts";
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

async function existingLevelId(projectRoot: string, folder: string): Promise<LevelId | null | undefined> {
  let text: string;
  try {
    text = await readFile(join(projectRoot, folder, LEVEL_FILE), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new Error(`existing level ${folder}/${LEVEL_FILE} is not JSON: ${(error as Error).message}`);
  }
  return isJsonObject(json) && isId(json.id, "level") ? json.id : null;
}

export async function runWorldBrief(options: WorldBriefRunOptions): Promise<WorldBriefRunResult> {
  const briefPath = projectRelative(options.brief, "brief");
  if (!briefPath.endsWith(".worldbrief.json")) throw new Error(`brief must be a *.worldbrief.json file: ${briefPath}`);
  const folder = posix.dirname(briefPath);
  if (folder === ".") throw new Error(`a brief sits in its level's folder, not at the project root: ${briefPath}`);
  const project = await openWorldProject(options.engineRoot, options.projectRoot);

  const { brief, issues } = normalizeWorldBrief(project.readData(briefPath, WorldBriefAssetType, "world brief"));
  if (!brief) throw new Error(`invalid world brief ${briefPath}:\n  ${issues.join("\n  ")}`);
  if (issues.length) throw new Error(`invalid world brief ${briefPath}:\n  ${issues.join("\n  ")}`);

  const previous = await existingLevelId(options.projectRoot, folder);
  if (previous !== undefined && !options.force) {
    throw new Error(`${folder}/${LEVEL_FILE} exists; it may hold editor changes. Rerun with --force to rebuild it from the brief.`);
  }
  const levelId = previous ?? createId("level");

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
  }

  const build = buildWorldFromBrief({
    brief, profile, cover, assetIdForFile: (file) => project.assetIdOf(file), onProgress: options.onProgress,
  });
  options.onProgress?.("files");
  const level = worldLevel(build, { levelId, terrainId: brief.terrain.id });
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
