// Scale scenarios S1–S7 on the generated level (plan Faz 2a "Ölçek ölçümü").
//
// Every timed scenario runs once cold, then `runs` times warm; the report gives
// the cold time and the warm median / p95. With few runs p95 is close to the
// slowest run. S2 is per cell: one sample per cell of the level, so its
// median / p95 are over cells, not over repeats.
//
// The thresholds were written into the plan before the first measurement.

import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { cpus, totalmem } from "node:os";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
import {
  assignCells,
  buildAssetIndex,
  mergeLevelParts,
  nextCellIndex,
  normalizeActorClass,
  normalizeLevel,
  normalizeLevelCell,
  normalizeLevelCellIndex,
  partFileOf,
  partsToWrite,
  planLevelFiles,
  splitLevel,
  stringifyDocument,
  type ActorClassDoc,
  type AssetId,
  type ClassResolver,
  type LevelCellDoc,
  type LevelDoc,
  type MergedLevel,
  type PartKey,
  type SchemaRegistry,
} from "../../src/core/index.ts";
import { fileRevision } from "../assets/revision.ts";
import { scanContentRoots } from "../assets/scan.ts";
import { createBenchRegistry, generateScaleProject, type ScaleOptions, type ScaleProject } from "./levelScale.ts";

export const THRESHOLDS = {
  s1WholeLoadMs: 2000,
  s2CellLoadP95Ms: 4,
  s3EditSaveMs: 50,
  s4FullSaveMs: 3000,
  s5MigrationFactor: 1.5,
  s6AssetIndexMs: 3000,
  s7HeapMb: 150,
  s7DiskMb: 50,
} as const;

export interface Timing {
  readonly coldMs: number;
  readonly medianMs: number;
  readonly p95Ms: number;
  readonly samples: number;
}

export interface ScaleReport {
  readonly date: string;
  readonly machine: { readonly cpu: string; readonly memoryGb: number; readonly node: string };
  readonly level: { readonly actors: number; readonly persistentActors: number; readonly cells: number };
  readonly generateMs: number;
  readonly s1WholeLoad: Timing;
  readonly s2CellLoad: Timing & { readonly largestCellActors: number; readonly largestCellMs: number };
  readonly s3EditSave: Timing & { readonly partsWritten: number };
  readonly s4FullSave: Timing & { readonly files: number };
  readonly s5MigrationLoad: Timing & { readonly factor: number };
  readonly s6AssetIndex: Timing;
  readonly s7: { readonly heapMb: number | null; readonly diskMb: number };
  readonly thresholds: typeof THRESHOLDS;
  /** Scenario -> within its threshold. */
  readonly pass: Record<string, boolean>;
}

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)]!;
}

function summarize(cold: number, warm: readonly number[]): Timing {
  const sorted = [...warm].sort((a, b) => a - b);
  return { coldMs: cold, medianMs: percentile(sorted, 0.5), p95Ms: percentile(sorted, 0.95), samples: warm.length };
}

async function time<T>(work: () => Promise<T> | T): Promise<{ ms: number; value: T }> {
  const start = performance.now();
  const value = await work();
  return { ms: performance.now() - start, value };
}

async function repeat<T>(runs: number, work: () => Promise<T> | T): Promise<{ timing: Timing; value: T }> {
  const cold = await time(work);
  const warm: number[] = [];
  for (let i = 0; i < runs; i += 1) warm.push((await time(work)).ms);
  return { timing: summarize(cold.ms, warm), value: cold.value };
}

async function writeProject(project: ScaleProject, contentRoot: string): Promise<void> {
  await rm(contentRoot, { recursive: true, force: true });
  for (const file of project.files) {
    const path = join(contentRoot, file.path);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, file.text);
  }
}

const readJson = async (path: string): Promise<unknown> => JSON.parse(await readFile(path, "utf8")) as unknown;

/** Loads the classes a level resolves against: what the asset index would hand it. */
async function loadClasses(contentRoot: string, project: ScaleProject, registry: SchemaRegistry): Promise<ClassResolver> {
  const classes = new Map<string, ActorClassDoc>();
  for (const file of project.files) {
    if (!file.path.startsWith("classes/")) continue;
    const result = normalizeActorClass(await readJson(join(contentRoot, file.path)), { strict: true, registry });
    if (result.value) classes.set(result.value.id, result.value);
  }
  return (id: AssetId) => classes.get(id);
}

function failOn(what: string, issues: readonly { message: string }[]): void {
  if (issues.length > 0) throw new Error(`bench: ${what}: ${issues[0]!.message}`);
}

/** S1: every file of the level from disk to one merged level. */
async function loadWholeLevel(
  folder: string,
  registry: SchemaRegistry,
  resolveClass: ClassResolver,
): Promise<MergedLevel> {
  const options = { strict: true, registry, resolveClass };
  const persistent = normalizeLevel(await readJson(join(folder, "level.json")), options);
  failOn("level.json", persistent.issues);
  const index = normalizeLevelCellIndex(await readJson(join(folder, "cells.json")), options);
  failOn("cells.json", index.issues);
  // Files are read concurrently, as any loader would; normalisation is synchronous.
  const keys = Object.keys(index.value!.cells);
  const raw = await Promise.all(keys.map((key) => readJson(join(folder, partFileOf(key)))));
  const cells: LevelCellDoc[] = [];
  raw.forEach((json, position) => {
    const cell = normalizeLevelCell(json, options);
    failOn(partFileOf(keys[position]!), cell.issues);
    cells.push(cell.value!);
  });
  const merged = mergeLevelParts(persistent.value!, cells, options);
  failOn("merge", merged.issues);
  return merged.value;
}

export interface ScaleRunOptions extends ScaleOptions {
  /** Where the generated projects and the report go. */
  readonly outDir: string;
  readonly runs?: number;
  /** Prints progress. */
  readonly log?: (line: string) => void;
}

export async function runScaleBench(options: ScaleRunOptions): Promise<ScaleReport> {
  const runs = options.runs ?? 5;
  const log = options.log ?? (() => {});
  const registry = createBenchRegistry();

  log("generating the level (current and legacy)…");
  const generated = await time(() => generateScaleProject(options));
  const project = generated.value;
  const legacy = generateScaleProject({ ...options, legacy: true });
  const currentRoot = join(options.outDir, "current");
  const legacyRoot = join(options.outDir, "legacy");
  await writeProject(project, join(currentRoot, "content"));
  await writeProject(legacy, join(legacyRoot, "content"));
  const levelDir = (root: string) => join(root, "content", project.levelFolder);
  const resolveClass = await loadClasses(join(currentRoot, "content"), project, registry);
  const resolveLegacyClass = await loadClasses(join(legacyRoot, "content"), legacy, registry);
  const cellOptions = { strict: true, registry, resolveClass };

  log("S1 whole level load…");
  const s1 = await repeat(runs, () => loadWholeLevel(levelDir(currentRoot), registry, resolveClass));
  const loaded = s1.value;

  log("S2 cell load…");
  const cellSamples: number[] = [];
  let largest = { actors: 0, ms: 0 };
  let coldCell = 0;
  for (const [index, key] of project.cells.entries()) {
    const path = join(levelDir(currentRoot), partFileOf(key));
    const { ms, value } = await time(async () => normalizeLevelCell(await readJson(path), cellOptions));
    if (index === 0) coldCell = ms;
    else cellSamples.push(ms);
    const actors = value.value?.actors.length ?? 0;
    if (actors > largest.actors) largest = { actors, ms };
  }

  log("S3 edit and save one actor…");
  const editable: LevelDoc = structuredClone(loaded.level);
  const moved = editable.actors.find((actor) => actor.parent === null && loaded.fileOf.get(actor.id) !== null)!;
  let step = 0;
  const s3 = await repeat(runs, () => {
    // Across a cell edge and back, so every save writes two cells.
    step += 1;
    moved.transform.p[0] += step % 2 === 1 ? editable.settings.cellSize : -editable.settings.cellSize;
    const assignment = assignCells(editable.actors, editable.settings, cellOptions);
    const parts = partsToWrite(loaded.fileOf, assignment.value, [moved.id]);
    const plan = planLevelFiles(editable, assignment.value, parts, new Set(loaded.cells));
    const written = new Map<PartKey, string>();
    for (const file of plan.write) {
      const check =
        file.key === null
          ? normalizeLevel(JSON.parse(file.text), cellOptions)
          : normalizeLevelCell(JSON.parse(file.text), cellOptions);
      failOn(file.path, check.issues);
      written.set(file.key, fileRevision(file.text));
    }
    nextCellIndex(editable.id, null, new Map([[null, "0".repeat(16)], ...written]), plan.remove.map((entry) => entry.key));
    return plan.write.length + plan.remove.length;
  });

  log("S4 full save…");
  const saveDir = join(options.outDir, "saved");
  const s4 = await repeat(runs, async () => {
    await rm(saveDir, { recursive: true, force: true });
    await mkdir(join(saveDir, "cells"), { recursive: true });
    const split = splitLevel(loaded.level, cellOptions);
    const write = async (key: PartKey, document: unknown): Promise<[PartKey, string]> => {
      const text = stringifyDocument(document);
      await writeFile(join(saveDir, partFileOf(key)), text);
      return [key, fileRevision(text)];
    };
    const revisions = new Map<PartKey, string>([await write(null, split.persistent)]);
    for (const cell of split.cells) {
      const [key, revision] = await write(cell.cell, cell);
      revisions.set(key, revision);
    }
    await writeFile(join(saveDir, "cells.json"), stringifyDocument(nextCellIndex(loaded.level.id, null, revisions)));
    return split.cells.length + 2;
  });

  log("S5 whole level load with migrations…");
  const s5 = await repeat(runs, () => loadWholeLevel(levelDir(legacyRoot), registry, resolveLegacyClass));

  log("S6 asset index…");
  const s6 = await repeat(runs, async () => {
    const scan = await scanContentRoots(currentRoot, ["content"]);
    const index = buildAssetIndex(scan.files, { strict: true, registry });
    failOn("asset index", index.issues);
    return index.entries.size;
  });

  log("S7 memory and disk…");
  const gc = (globalThis as { gc?: () => void }).gc;
  let heapMb: number | null = null;
  if (gc) {
    gc();
    const before = process.memoryUsage().heapUsed;
    const held = await loadWholeLevel(levelDir(currentRoot), registry, resolveClass);
    gc();
    heapMb = (process.memoryUsage().heapUsed - before) / 2 ** 20;
    if (held.level.actors.length === 0) throw new Error("bench: empty level");
  }
  let diskBytes = 0;
  for (const file of ["level.json", "cells.json", ...project.cells.map((key) => partFileOf(key))]) {
    diskBytes += (await stat(join(levelDir(currentRoot), file))).size;
  }
  const diskMb = diskBytes / 2 ** 20;

  const s2 = { ...summarize(coldCell, cellSamples), largestCellActors: largest.actors, largestCellMs: largest.ms };
  const factor = s5.timing.medianMs / s1.timing.medianMs;
  const report: ScaleReport = {
    date: new Date().toISOString(),
    machine: {
      cpu: cpus()[0]?.model.trim() ?? "unknown",
      memoryGb: Math.round((totalmem() / 2 ** 30) * 10) / 10,
      node: process.version,
    },
    level: { actors: project.actorCount, persistentActors: project.persistentActors, cells: project.cells.length },
    generateMs: generated.ms,
    s1WholeLoad: s1.timing,
    s2CellLoad: s2,
    s3EditSave: { ...s3.timing, partsWritten: s3.value },
    s4FullSave: { ...s4.timing, files: s4.value },
    s5MigrationLoad: { ...s5.timing, factor },
    s6AssetIndex: s6.timing,
    s7: { heapMb, diskMb },
    thresholds: THRESHOLDS,
    pass: {
      S1: s1.timing.medianMs <= THRESHOLDS.s1WholeLoadMs,
      S2: s2.p95Ms <= THRESHOLDS.s2CellLoadP95Ms,
      S3: s3.timing.medianMs <= THRESHOLDS.s3EditSaveMs,
      S4: s4.timing.medianMs <= THRESHOLDS.s4FullSaveMs,
      S5: factor <= THRESHOLDS.s5MigrationFactor,
      S6: s6.timing.medianMs <= THRESHOLDS.s6AssetIndexMs,
      S7: (heapMb === null || heapMb <= THRESHOLDS.s7HeapMb) && diskMb <= THRESHOLDS.s7DiskMb,
    },
  };
  await rm(saveDir, { recursive: true, force: true });
  return report;
}

const ms = (value: number): string => (value >= 100 ? value.toFixed(0) : value.toFixed(2));

/** The report as table lines for the terminal and the plan. */
export function formatScaleReport(report: ScaleReport): string[] {
  const t = report.thresholds;
  const mark = (key: string) => (report.pass[key] ? "ok" : "OVER");
  const row = (key: string, name: string, timing: Timing, limit: string, extra = "") =>
    `${key} ${name.padEnd(28)} cold ${ms(timing.coldMs).padStart(7)} ms  median ${ms(timing.medianMs).padStart(7)} ms  p95 ${ms(timing.p95Ms).padStart(7)} ms  limit ${limit.padEnd(10)} ${mark(key)}${extra}`;
  return [
    `${report.machine.cpu}, ${report.machine.memoryGb} GB, Node ${report.machine.node}, ${report.date}`,
    `level: ${report.level.actors} actors (${report.level.persistentActors} persistent), ${report.level.cells} cells; generated in ${ms(report.generateMs)} ms`,
    row("S1", "whole level load", report.s1WholeLoad, `${t.s1WholeLoadMs} ms`),
    row(
      "S2",
      "cell load (per cell)",
      report.s2CellLoad,
      `p95 ${t.s2CellLoadP95Ms} ms`,
      `  largest cell ${report.s2CellLoad.largestCellActors} actors ${ms(report.s2CellLoad.largestCellMs)} ms`,
    ),
    row("S3", "edit + save one actor", report.s3EditSave, `${t.s3EditSaveMs} ms`, `  ${report.s3EditSave.partsWritten} parts`),
    row("S4", "full save", report.s4FullSave, `${t.s4FullSaveMs} ms`, `  ${report.s4FullSave.files} files`),
    row(
      "S5",
      "whole load, migrations",
      report.s5MigrationLoad,
      `${t.s5MigrationFactor}x S1`,
      `  ${report.s5MigrationLoad.factor.toFixed(2)}x`,
    ),
    row("S6", "asset index", report.s6AssetIndex, `${t.s6AssetIndexMs} ms`),
    `S7 memory / disk                 heap ${report.s7.heapMb === null ? "n/a (run with --expose-gc)" : `${report.s7.heapMb.toFixed(1)} MB`}  disk ${report.s7.diskMb.toFixed(1)} MB  limit ${t.s7HeapMb} / ${t.s7DiskMb} MB  ${mark("S7")}`,
  ];
}
