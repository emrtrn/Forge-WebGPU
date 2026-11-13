// Acceptance count of an import (plan 2b "importer acceptance"): per level,
// what the Forge source holds and what the written level holds, counted
// independently (raw source files on one side, the level folder on disk on
// the other), with the reason of every difference the importer knows of.
// Visual equivalence waits for the Faz 3 gate.

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { isJsonObject, type JsonObject } from "../../src/core/index.ts";
import type { ImportRunResult } from "./importRun.ts";
import type { ForgeSource } from "./forgeSource.ts";
import { readForgeLevel } from "./levelRead.ts";

export interface CountRow {
  readonly what: string;
  readonly source: number;
  readonly target: number;
  /** Why they differ; empty when they match. */
  readonly note: string;
}

interface SourceCounts {
  shapes: number;
  models: number;
  playerStarts: number;
  otherMarkers: number;
  landscapes: number;
  heightFog: number;
  /** Directional, point and spot lights of the level and its cells (other types are not Forge's). */
  lights: number;
  cells: number;
  cellKeys: string[];
  foliageInstances: number;
  foliageRules: number;
}

function sourceLights(doc: unknown): number {
  if (!isJsonObject(doc) || !Array.isArray(doc.lights)) return 0;
  return doc.lights.filter((light) => isJsonObject(light) && ["directional", "point", "spot"].includes(String(light.type))).length;
}

function sourcePlacements(doc: JsonObject, counts: SourceCounts): void {
  for (const group of Array.isArray(doc.instances) ? doc.instances : []) {
    if (!isJsonObject(group) || typeof group.assetId !== "string" || !Array.isArray(group.placements)) continue;
    const n = group.placements.length;
    if (group.assetId.startsWith("shape:")) counts.shapes += n;
    else if (group.assetId === "marker:playerStart") counts.playerStarts += n;
    else if (group.assetId.startsWith("marker:")) counts.otherMarkers += n;
    else counts.models += n;
  }
}

async function sourceCounts(source: ForgeSource, path: string): Promise<SourceCounts> {
  const level = await readForgeLevel(source, path);
  const layout = level.input.layout as JsonObject;
  const counts: SourceCounts = {
    shapes: 0, models: 0, playerStarts: 0, otherMarkers: 0,
    landscapes: Array.isArray(layout.landscapes) ? layout.landscapes.length : 0,
    heightFog: isJsonObject(layout.heightFog) ? 1 : 0,
    lights: sourceLights(layout) + level.input.cells.reduce((sum, cell) => sum + sourceLights(cell.doc), 0),
    cells: level.input.cells.length,
    cellKeys: level.input.cells.map((cell) => cell.key),
    foliageInstances: 0,
    foliageRules: 0,
  };
  sourcePlacements(layout, counts);
  for (const cell of level.input.cells) if (isJsonObject(cell.doc)) sourcePlacements(cell.doc, counts);
  const foliage = path.replace(/\.level\.json$/, ".foliage.json");
  if (await source.exists(foliage)) {
    const doc = await source.readJson(foliage);
    if (isJsonObject(doc)) {
      for (const group of Array.isArray(doc.groups) ? doc.groups : []) {
        if (isJsonObject(group) && Array.isArray(group.instances)) counts.foliageInstances += group.instances.length;
      }
      counts.foliageRules = Array.isArray(doc.landscapeRules) ? doc.landscapeRules.length : 0;
    }
  }
  return counts;
}

interface TargetCounts {
  actors: number;
  shapes: number;
  meshes: number;
  roles: number;
  terrains: number;
  heightFog: number;
  lights: number;
  playerStarts: number;
  cells: number;
  persistent: number;
  /** Actor names per cell key. */
  cellActors: Map<string, string[]>;
}

async function targetCounts(projectRoot: string, folder: string): Promise<TargetCounts> {
  const counts: TargetCounts = {
    actors: 0, shapes: 0, meshes: 0, roles: 0, terrains: 0, heightFog: 0, lights: 0, playerStarts: 0, cells: 0, persistent: 0, cellActors: new Map(),
  };
  const count = (doc: unknown, persistent: boolean): void => {
    const key = isJsonObject(doc) && typeof doc.cell === "string" ? doc.cell : null;
    for (const actor of isJsonObject(doc) && Array.isArray(doc.actors) ? doc.actors : []) {
      if (!isJsonObject(actor)) continue;
      counts.actors += 1;
      if (key !== null) counts.cellActors.set(key, [...(counts.cellActors.get(key) ?? []), String(actor.name)]);
      if (persistent) counts.persistent += 1;
      const components = isJsonObject(actor.components) ? Object.values(actor.components) : [];
      if (components.length === 0 && actor.name === "Player Start") counts.playerStarts += 1;
      for (const component of components) {
        const type = isJsonObject(component) && typeof component.type === "string" ? component.type.split("@")[0] : "";
        if (type === "forge.shape") counts.shapes += 1;
        else if (type === "forge.staticMesh") counts.meshes += 1;
        else if (type === "forge.worldRole") counts.roles += 1;
        else if (type === "forge.terrain") counts.terrains += 1;
        else if (type === "forge.heightFog") counts.heightFog += 1;
        else if (type === "forge.directionalLight" || type === "forge.pointLight" || type === "forge.spotLight") counts.lights += 1;
      }
    }
  };
  const dir = join(projectRoot, folder);
  count(JSON.parse(await readFile(join(dir, "level.json"), "utf8")), true);
  let cellFiles: string[] = [];
  try {
    cellFiles = (await readdir(join(dir, "cells"))).filter((name) => name.endsWith(".json"));
  } catch {
    cellFiles = [];
  }
  counts.cells = cellFiles.length;
  for (const name of cellFiles) count(JSON.parse(await readFile(join(dir, "cells", name), "utf8")), false);
  return counts;
}

/**
 * Why a partitioned level has other cells now. Forge kept the level file's own
 * placements (its Player Start) in the persistent level; an actor now goes to
 * the cell it stands in (A11).
 */
function cellDifference(source: readonly string[], target: ReadonlyMap<string, readonly string[]>): string {
  const onlyTarget = [...target.keys()].filter((key) => !source.includes(key)).sort();
  const onlySource = source.filter((key) => !target.has(key)).sort();
  const describe = (key: string): string => `${key} (${target.get(key)!.join(", ")})`;
  const known = onlySource.length === 0 && onlyTarget.every((key) => target.get(key)!.every((name) => name === "Player Start"));
  return `${known ? "" : "? "}only in the target: ${onlyTarget.map(describe).join("; ") || "-"}; only in the source: ${onlySource.join(", ") || "-"}`
    + (known ? ". Forge kept the level file's placements in the persistent level; an actor now goes to the cell it stands in (A11)" : "");
}

/** Rows per level of an import that was written. */
export async function compareImport(projectRoot: string, source: ForgeSource, result: ImportRunResult): Promise<Map<string, CountRow[]>> {
  const tables = new Map<string, CountRow[]>();
  for (const { folder, report } of result.levels) {
    const s = await sourceCounts(source, report.source);
    const t = await targetCounts(projectRoot, folder);
    const missing = report.missingAssets.reduce((sum, entry) => sum + entry.placements, 0);
    const row = (what: string, sourceCount: number, targetCount: number, note: string): CountRow =>
      ({ what, source: sourceCount, target: targetCount, note: sourceCount === targetCount ? "" : note });
    const missingNote = report.missingAssets.map((entry) => `${entry.assetId} ${entry.placements}`).join(", ");
    tables.set(`${report.source} → ${folder}`, [
      row("shape placements → forge.shape", s.shapes, t.shapes, "?"),
      row("model placements → forge.staticMesh", s.models, t.meshes,
        missing === s.models - t.meshes ? `no model in the target: ${missingNote}` : "?"),
      row("Player Start markers → Player Start actors", s.playerStarts, t.playerStarts, "?"),
      row("other markers", s.otherMarkers, 0, "no converter yet (reported, phase 6)"),
      row("landscapes → forge.terrain", s.landscapes, t.terrains, "?"),
      row("heightFog → forge.heightFog", s.heightFog, t.heightFog, "?"),
      row("lights → light actors", s.lights, t.lights, "?"),
      row("actors (placements + terrain + fog + lights)", s.shapes + s.models + s.playerStarts + s.landscapes + s.heightFog + s.lights, t.actors,
        t.actors === s.shapes + s.models - missing + s.playerStarts + s.landscapes + s.heightFog + s.lights ? `placements without a model: ${missing}` : "?"),
      row("cells", s.cells, t.cells, s.cells === 0
        ? "the source level is not partitioned; every level has a grid now and actors are assigned by position (A11)"
        : cellDifference(s.cellKeys, t.cellActors)),
      row("foliage instances", s.foliageInstances, 0, "foliage comes in 5c"),
      row("foliage landscape rules", s.foliageRules, 0, "foliage comes in 5c"),
    ]);
  }
  return tables;
}

export function formatComparison(tables: ReadonlyMap<string, readonly CountRow[]>): string {
  const lines = ["# Import acceptance count", ""];
  for (const [level, rows] of tables) {
    lines.push(`## ${level}`, "", "| Kind | Source | Target | Difference |", "|---|---|---|---|");
    for (const row of rows) lines.push(`| ${row.what} | ${row.source} | ${row.target} | ${row.note || "="} |`);
    lines.push("");
  }
  return lines.join("\n");
}

/** Rows whose difference has no known reason. */
export function unexplained(tables: ReadonlyMap<string, readonly CountRow[]>): string[] {
  return [...tables].flatMap(([level, rows]) => rows.filter((row) => row.note.startsWith("?")).map((row) => `${level}: ${row.what}`));
}
