// Reads a Forge WebGL level with everything beside it (plan 2b importer): the
// level file, the cell files it lists, the terrain definitions its landscapes
// name, and its sidecars (World Builder brief, recipe, region profile and
// reference image; foliage and mesh paint, which are reported).
//
// Forge's naming: `<dir>/<Stem>.level.json`, cells under
// `<dir>/<Stem>.cells/main/<key>.cell.json`, sidecars `<dir>/<Stem>.<kind>`; a
// brief names its own profile and reference image.

import { isJsonObject, type JsonObject } from "../../src/core/index.ts";
import type { ForgeLevelInput } from "../../src/engine/forgeImport/forgeLevel.ts";
import type { ForgeSource } from "./forgeSource.ts";

const LEVEL_SUFFIX = ".level.json";

export interface ForgeSidecar {
  /** Public-relative path. */
  readonly path: string;
  /** Parsed content; absent for an image. */
  readonly json?: JsonObject;
}

export interface ForgeLevelFiles {
  readonly path: string;
  /** File name without `.level.json`: the level folder's name. */
  readonly stem: string;
  readonly input: ForgeLevelInput;
  readonly brief: ForgeSidecar | null;
  readonly recipe: ForgeSidecar | null;
  readonly profile: ForgeSidecar | null;
  readonly reference: ForgeSidecar | null;
  /** Sidecars not converted now, with their phase. */
  readonly deferred: ReadonlyArray<{ readonly path: string; readonly phase: string }>;
  /** Forge asset ids the level uses: placed models and its terrain layers' materials. */
  readonly seeds: readonly string[];
  /** Terrain parts to copy, by Forge path: tiles and global maps. */
  readonly terrainParts: readonly string[];
}

/** Sidecars converted later. */
const DEFERRED_SIDECARS: Readonly<Record<string, string>> = { ".foliage.json": "5c", ".meshpaint.json": "5d" };

function text(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

async function readSidecar(source: ForgeSource, path: string | null, json = true): Promise<ForgeSidecar | null> {
  if (path === null || !(await source.exists(path))) return null;
  if (!json) return { path };
  const value = await source.readJson(path);
  if (!isJsonObject(value)) throw new Error(`${path}: not a JSON object`);
  return { path, json: value };
}

function modelIds(doc: JsonObject): string[] {
  const ids: string[] = [];
  for (const group of Array.isArray(doc.instances) ? doc.instances : []) {
    if (!isJsonObject(group) || typeof group.assetId !== "string" || group.assetId.includes(":")) continue;
    if (Array.isArray(group.placements) && group.placements.length > 0) ids.push(group.assetId);
  }
  return ids;
}

/**
 * Asset ids a region profile names, with where (World Builder's
 * `regionProfileAssetIds`, read on the raw profile): the importer turns them
 * into GUIDs, which the new profile carries.
 */
export function profileAssetIds(profile: JsonObject): Array<{ readonly id: string; readonly set: (guid: string) => void }> {
  const found: Array<{ id: string; set: (guid: string) => void }> = [];
  const idList = (holder: JsonObject): void => {
    const list = holder.assetIds;
    if (!Array.isArray(list)) return;
    list.forEach((id, index) => {
      if (typeof id === "string") found.push({ id, set: (guid) => { list[index] = guid; } });
    });
  };
  for (const road of Object.values(isJsonObject(profile.roads) ? profile.roads : {})) {
    if (isJsonObject(road) && typeof road.meshAsset === "string") {
      found.push({ id: road.meshAsset, set: (guid) => { road.meshAsset = guid; } });
    }
  }
  for (const role of Object.values(isJsonObject(profile.roles) ? profile.roles : {})) if (isJsonObject(role)) idList(role);
  for (const rule of Array.isArray(profile.streetFurniture) ? profile.streetFurniture : []) if (isJsonObject(rule)) idList(rule);
  return found;
}

export async function readForgeLevel(source: ForgeSource, path: string): Promise<ForgeLevelFiles> {
  if (!path.endsWith(LEVEL_SUFFIX)) throw new Error(`not a Forge level file: ${path}`);
  const layout = await source.readJson(path);
  if (!isJsonObject(layout)) throw new Error(`${path}: not a JSON object`);
  const base = path.slice(0, -LEVEL_SUFFIX.length);
  const stem = base.slice(base.lastIndexOf("/") + 1);
  const seeds: string[] = [...modelIds(layout)];

  const cells: Array<{ key: string; doc: unknown }> = [];
  for (const key of Array.isArray(layout.worldCells) ? layout.worldCells : []) {
    if (typeof key !== "string") continue;
    const doc = await source.readJson(`${base}.cells/main/${key}.cell.json`);
    cells.push({ key, doc });
    if (isJsonObject(doc)) seeds.push(...modelIds(doc));
  }

  const terrains = new Map<string, unknown>();
  const terrainParts: string[] = [];
  for (const landscape of Array.isArray(layout.landscapes) ? layout.landscapes : []) {
    if (!isJsonObject(landscape) || typeof landscape.dataRef !== "string" || terrains.has(landscape.dataRef)) continue;
    const def = await source.readJson(landscape.dataRef);
    terrains.set(landscape.dataRef, def);
    if (typeof landscape.material === "string") seeds.push(landscape.material);
    if (!isJsonObject(def)) continue;
    const terrainBase = landscape.dataRef.replace(/\.terrain\.json$/, "");
    for (const tile of Array.isArray(def.tiles) ? def.tiles : []) {
      if (isJsonObject(tile) && typeof tile.key === "string") terrainParts.push(`${terrainBase}.tiles/${tile.key}.tile.bin`);
    }
    terrainParts.push(`${terrainBase}.global.bin`);
    for (const layer of Array.isArray(def.layers) ? def.layers : []) {
      if (isJsonObject(layer) && typeof layer.material === "string") seeds.push(layer.material);
    }
  }

  const brief = await readSidecar(source, `${base}.worldbrief.json`);
  const recipe = await readSidecar(source, `${base}.worldrecipe.json`);
  // The brief's model rows name models by path: World Builder rebuilds from them.
  for (const model of Array.isArray(brief?.json?.models) ? brief.json.models : []) {
    const id = isJsonObject(model) ? source.byPath.get(text(model.file) ?? "")?.id : undefined;
    if (id !== undefined) seeds.push(id);
  }
  const briefReference = brief?.json && isJsonObject(brief.json.reference) ? text(brief.json.reference.image) : null;
  const profile = await readSidecar(source, text(brief?.json?.regionProfile) ?? `${base}.regionprofile.json`);
  const reference = await readSidecar(source, briefReference ?? `${base}.reference.png`, false);
  if (profile?.json) seeds.push(...profileAssetIds(profile.json).map(({ id }) => id));
  const deferred: Array<{ path: string; phase: string }> = [];
  for (const [suffix, phase] of Object.entries(DEFERRED_SIDECARS)) {
    if (await source.exists(`${base}${suffix}`)) deferred.push({ path: `${base}${suffix}`, phase });
  }

  return {
    path,
    stem,
    input: { path, layout, cells, terrains },
    brief,
    recipe,
    profile,
    reference,
    deferred,
    seeds: [...new Set(seeds)],
    terrainParts,
  };
}
