// R9c city fixture. Run against a disposable project copy.
import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, realpath, rename, rm, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  ASSET_META_SCHEMA, assetTypeTag, metaPathOf, normalizeLevel, splitLevel, stringifyDocument, type LevelId,
} from "../src/core/index.ts";
import { ModelAssetType } from "../src/features/model/schema.ts";
import { loadEngineRegistry } from "./assets/engineRegistry.ts";
import { fileRevision } from "./assets/revision.ts";
import { loadProject } from "./project/check.ts";
import { cityScene, type CitySceneOptions } from "./scenes/cityScene.ts";
import { cityModelGlb } from "./scenes/cityModels.ts";
import { runHlod } from "./world/hlodCli.ts";
import { runZones } from "./zones/zonesCli.ts";

const ENGINE_ROOT = fileURLToPath(new URL("../", import.meta.url));

async function ensureDirectory(parent: string, name: string): Promise<string> {
  const path = join(parent, name);
  await mkdir(path).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "EEXIST") throw error;
  });
  if (await realpath(path) !== path) throw new Error(`City output must not traverse symlinks: ${path}`);
  return path;
}

export async function writeCityLevel(projectPath: string, options: CitySceneOptions = {}) {
  const root = await realpath(projectPath);
  const checkout = relative(await realpath(ENGINE_ROOT), root);
  const inside = !isAbsolute(checkout) && checkout !== ".." && !checkout.startsWith(`..${sep}`);
  if (inside && !checkout.startsWith(`.forge-cache${sep}`)) {
    // Use a copy outside the repository, or a disposable copy in its ignored cache.
    throw new Error("Use a disposable project copy outside the engine checkout or under its .forge-cache.");
  }
  const { manifest, problems } = await loadProject(root, { engineRoot: ENGINE_ROOT });
  if (!manifest || problems.length) throw new Error(`Cannot open city project: ${JSON.stringify(problems)}`);
  const contentRoot = manifest.contentRoots[0]!;
  const level = `${contentRoot}/levels/forge-city`;
  let parent = root;
  for (const part of [...contentRoot.split("/"), "levels"]) parent = await ensureDirectory(parent, part);
  const folder = join(parent, "forge-city");
  const exists = await lstat(folder).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
    return null;
  });
  if (exists) throw new Error(`City level already exists: ${folder}`);
  const cache = await ensureDirectory(root, ".forge-cache");

  const scene = cityScene(options);
  const context = { strict: true, registry: await loadEngineRegistry(ENGINE_ROOT), resolveClass: () => undefined };
  const id: LevelId = `lvl_${createHash("sha256").update(`forge-city:${options.seed ?? 1}`).digest("hex").slice(0, 32)}`;
  const normalized = normalizeLevel({ schema: "forge.level/1", id, settings: scene.settings, actors: scene.actors }, context);
  if (!normalized.value || normalized.issues.length) throw new Error(`City level: ${JSON.stringify(normalized.issues)}`);
  const split = splitLevel(normalized.value, context);
  if (split.issues.length) throw new Error(`City cells: ${JSON.stringify(split.issues)}`);

  const stage = await mkdtemp(join(parent, ".forge-city-"));
  let published = false;
  try {
    const writeDoc = async (file: string, document: unknown) => {
      const text = stringifyDocument(document);
      await writeFile(join(stage, file), text);
      return fileRevision(text);
    };
    await mkdir(join(stage, "cells"));
    await mkdir(join(stage, "models"));
    if (new Set(scene.models.map(model => model.id)).size !== scene.models.length) {
      throw new Error("City model IDs must be unique.");
    }
    for (const model of scene.models) {
      const path = `models/${model.name}.glb`;
      await writeFile(join(stage, path), cityModelGlb(model));
      await writeDoc(metaPathOf(path), {
        schema: ASSET_META_SCHEMA, id: model.id, type: assetTypeTag(ModelAssetType), license: "CC0-1.0",
        source: { origin: "Forge procedural city benchmark" }, import: {},
      });
    }
    const persistent = await writeDoc("level.json", split.persistent);
    const cells: Record<string, string> = {};
    for (const cell of split.cells) cells[cell.cell] = await writeDoc(`cells/${cell.cell}.json`, cell);
    await writeDoc("cells.json", { schema: "forge.levelCells/1", level: id, persistent, cells });
    await rename(stage, folder);
    published = true;

    const zones = await runZones({ project: root, level, floor: 0, json: false, dryRun: false }, ENGINE_ROOT);
    if (!zones.edit.ok || !zones.plan?.zones || !zones.plan.portals) {
      throw new Error(`City zone generation failed: ${zones.edit.error?.message ?? "no rooms or portals"}`);
    }
    const hlod = await runHlod({ project: root, level, dryRun: false, json: false }, ENGINE_ROOT);
    if (!hlod.cells || !hlod.triangles || hlod.warnings.length) {
      throw new Error(`City HLOD incomplete: ${JSON.stringify(hlod.warnings)}`);
    }

    const report = { level, poses: scene.poses, walk: scene.walk, settings: scene.settings, counts: scene.counts,
      options: { seed: options.seed ?? 1, blocks: options.blocks ?? 8, heavy: options.heavy ?? false },
      zones: { rooms: zones.plan.zones, portals: zones.plan.portals }, hlod };
    await writeFile(join(cache, "city.json"), stringifyDocument(report), { flag: "wx" });
    return report;
  } catch (error) {
    if (published) await rm(folder, { recursive: true, force: true });
    throw error;
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({ options: {
      project: { type: "string" }, seed: { type: "string" }, blocks: { type: "string" }, heavy: { type: "boolean" },
    } });
    if (!values.project) throw new Error("Usage: bench-city-level --project <disposable copy> [--seed N] [--blocks N] [--heavy]");
    const report = await writeCityLevel(values.project, {
      ...(values.seed === undefined ? {} : { seed: Number(values.seed) }),
      ...(values.blocks === undefined ? {} : { blocks: Number(values.blocks) }),
      heavy: values.heavy ?? false,
    });
    console.log(`forge city: ${report.level}, ${report.counts.meshPlacements} mesh placements, ${report.zones.rooms} rooms, ${report.zones.portals} portals, ${report.hlod.cells} HLOD cells`);
  } catch (error) {
    console.error(`bench-city-level: ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  }
}
