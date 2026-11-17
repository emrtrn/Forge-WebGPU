import { randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { buildAssetIndex, HLOD_INDEX_FILE } from "../../src/core/index.ts";
import type { HlodBuildReport } from "../../src/core/level/hlodBuild.ts";
import { projectIndexRoots } from "../assets/engineContent.ts";
import { loadEngineRegistry } from "../assets/engineRegistry.ts";
import { fileRevision } from "../assets/revision.ts";
import { scanRoots } from "../assets/scan.ts";
import { loadGameSchemas } from "../project/gameSchemas.ts";
import { withProjectLock } from "../save/projectLock.ts";
import { resolveDevProject } from "../server/devProject.ts";
import { createWritePolicy, resolveProjectPath, resolveWritablePath } from "../server/projectPaths.ts";
import { buildLevelHlod, validateHlodOptions } from "./hlodBuild.ts";
import { dependencyRevisions, digest, fingerprintHlod, sameRevisions, trackHlodInput, type Revisions } from "./hlodFingerprint.ts";
import { contentPath, diskHlodInput } from "./hlodInput.ts";
import { HlodOutputsChanged, outputRevisions, writeHlodResult } from "./hlodPublish.ts";

export interface HlodJobRequest {
  engineRoot: string; project: string; level: string; build: boolean;
  force?: boolean; ratio?: number; error?: number; dryRun?: boolean;
}
export interface HlodJobResult {
  state: "current" | "missing" | "stale" | "superseded";
  built: boolean;
  publication: string | null;
  completedAt?: string;
  report?: HlodBuildReport;
  message?: string;
}
interface Cache {
  version: 1;
  stamp: string;
  inputs: Revisions;
  outputs: Revisions;
  publication: string;
  completedAt: string;
  report: HlodBuildReport;
}
const revisionMap = (value: unknown): value is Revisions => value !== null && typeof value === "object" && !Array.isArray(value) &&
  Object.values(value).every((item) => item === null || typeof item === "string" && /^[a-f0-9]{16}$/.test(item));
async function readCache(path: string): Promise<Cache | null> {
  try {
    const value = JSON.parse(await readFile(path, "utf8")) as Partial<Cache>;
    if (value.version !== 1 || typeof value.stamp !== "string" || !revisionMap(value.inputs) || !revisionMap(value.outputs) ||
      typeof value.publication !== "string" || typeof value.completedAt !== "string" || !value.report ||
      ![value.report.cells, value.report.triangles, value.report.skippedPlacements, value.report.buildMs, value.report.totalMs]
        .every((number) => Number.isFinite(number) && number >= 0) || !Array.isArray(value.report.warnings) ||
      !value.report.warnings.every((warning) => typeof warning === "string")) return null;
    return value as Cache;
  } catch { return null; }
}

async function snapshot(request: HlodJobRequest) {
  const project = await resolveDevProject(request.engineRoot, { FORGE_PROJECT_ROOT: resolve(request.project) });
  if (!project.manifest || project.problems.length || project.readOnly) throw new Error(`Project is not writable: ${project.problems.join("; ") || project.root}`);
  const policy = createWritePolicy(project.root, project.manifest.contentRoots);
  const folder = resolveWritablePath(policy, `${request.level}/level.json`).relative.replace(/\/level\.json$/, "");
  const absoluteFolder = dirname(resolveWritablePath(policy, `${folder}/level.json`).absolute);
  const lower = (path: string) => resolve(path).toLowerCase();
  if (lower(project.root) === lower(request.engineRoot)) throw new Error("Engine content and packs are read-only");
  for (const path of ["content/engine", "content/packs"]) {
    const denied = lower(resolve(request.engineRoot, path)), target = lower(absoluteFolder);
    if (target === denied || target.startsWith(`${denied}${sep}`)) throw new Error("Engine content and packs are read-only");
  }
  const registry = await loadEngineRegistry(request.engineRoot);
  await loadGameSchemas(request.engineRoot, project.root, project.manifest.game.module, registry, { readOnly: true });
  const roots = projectIndexRoots(request.engineRoot, project.root, project.manifest);
  // Check configured root ancestors before scanning, including engine/pack roots.
  for (const root of roots) {
    const owner = root.label.startsWith("engine:") ? request.engineRoot : policy.root;
    resolveProjectPath(owner, `${relative(owner, root.dir)}/hlod-path-check`);
  }
  const scan = await scanRoots(roots);
  const index = buildAssetIndex(scan.files, { strict: true, registry });
  const level = [...index.levels.values()].find((level) => !level.root.startsWith("engine:") &&
    `${level.root}${level.folder ? `/${level.folder}` : ""}` === folder);
  if (!level) throw new Error(`Not a project-owned level folder: ${request.level}`);
  const virtualFolder = contentPath({ root: level.root, path: level.folder });
  const tracked = trackHlodInput(diskHlodInput(scan.files, index, registry, roots));
  const fingerprint = await fingerprintHlod(virtualFolder, tracked.input, request);
  // Private helpers bypass the content-only write policy but still reject links/traversal.
  const cacheRelative = `.forge-cache/hlod/${digest(folder)}.json`;
  const cachePath = resolveProjectPath(policy.root, cacheRelative);
  return { policy, folder, virtualFolder, tracked, fingerprint, cacheRelative, cachePath };
}

/** Build runs outside the save lock; only the final recheck and publication hold it. */
export async function runHlodJob(request: HlodJobRequest, control?: { readonly cancelled: () => boolean }): Promise<HlodJobResult> {
  const started = performance.now();
  validateHlodOptions(request);
  const source = await snapshot(request);
  const { policy, folder, tracked, fingerprint, cachePath } = source;
  const before = await outputRevisions(policy, folder);
  const cache = await readCache(cachePath);
  let current = false;
  // Scene document bytes also contain names, editor flags and view distance.
  // Their effective HLOD placements/settings are already covered by stamp.
  const dependenciesOnly = (revisions: Revisions): Revisions => Object.fromEntries(Object.entries(revisions).filter(([path]) =>
    path !== `${source.virtualFolder}/level.json` && path !== `${source.virtualFolder}/cells.json` && !path.startsWith(`${source.virtualFolder}/cells/`)));
  if (cache && cache.stamp === fingerprint.stamp && sameRevisions(cache.outputs, before)) {
    try {
      current = sameRevisions(dependenciesOnly(cache.inputs), dependenciesOnly({ ...await dependencyRevisions(tracked.input, Object.keys(cache.inputs)), ...fingerprint.revisions })) && !tracked.changed();
    } catch { current = false; } // Unusable optimization, never grant freshness on it.
  }
  const previous = cache ? { publication: cache.publication, completedAt: cache.completedAt, report: cache.report } : { publication: null };
  // A level published before, an empty publication (no files) included, is stale rather than missing.
  const state = current ? "current" : cache || Object.values(before).some((revision) => revision !== null) ? "stale" : "missing";
  if (!request.build || current && !request.force && !request.dryRun) return { state, built: false, ...previous };
  if (control?.cancelled()) throw new Error("HLOD generation cancelled before publication");
  if (process.connected && process.send) process.send({ phase: "building" });
  const result = await buildLevelHlod(source.virtualFolder, tracked.input, request);
  const builtAt = performance.now();
  const report: HlodBuildReport = { cells: result.index.cells.length,
    triangles: result.index.cells.reduce((sum, cell) => sum + cell.triangles, 0), skippedPlacements: result.skippedPlacements,
    warnings: result.warnings, buildMs: Math.round(builtAt - started), totalMs: Math.round(builtAt - started),
    clusters: result.index.clusters.length, clusterTriangles: result.index.clusters.reduce((sum, cluster) => sum + cluster.triangles, 0),
    landmarkTriangles: result.index.landmarks?.triangles ?? 0 };
  if (request.dryRun) return { state, built: false, ...previous, report, message: "Dry run; no HLOD outputs or cache written" };
  if (control?.cancelled()) throw new Error("HLOD generation cancelled before publication");
  const inputs = { ...fingerprint.revisions, ...tracked.revisions };
  // Resolve both lock ancestors before the lock helper creates any directories.
  resolveProjectPath(policy.root, ".forge-journal/save.lock");
  return withProjectLock(policy.root, async () => {
    let latest: Awaited<ReturnType<typeof snapshot>>;
    try { latest = await snapshot(request); }
    catch (error) { return { state: "superseded", built: false, ...previous,
      message: `HLOD inputs are no longer valid; retry: ${error instanceof Error ? error.message : String(error)}` }; }
    if (control?.cancelled()) throw new Error("HLOD generation cancelled before publication");
    if (tracked.changed() || latest.fingerprint.stamp !== fingerprint.stamp ||
      !sameRevisions(inputs, { ...await dependencyRevisions(latest.tracked.input, Object.keys(inputs)), ...latest.fingerprint.revisions }) ||
      !sameRevisions(before, await outputRevisions(latest.policy, latest.folder)) ||
      (await readCache(latest.cachePath))?.publication !== cache?.publication) {
      return { state: "superseded", built: false, ...previous, message: "HLOD inputs or outputs changed during computation; retry the build" };
    }
    // Remove the previous cache from visibility before publication, even for byte-identical
    // forced builds. Failure to save the new cache can never advertise an old UUID.
    const publication = randomUUID(), completedAt = new Date().toISOString();
    const oldCacheRelative = `${source.cacheRelative}.${publication}.old`;
    const oldCache = resolveProjectPath(policy.root, oldCacheRelative);
    const cacheTarget = resolveProjectPath(policy.root, source.cacheRelative);
    let hadCache = false;
    try {
      const info = await lstat(cacheTarget);
      if (!info.isFile()) throw new Error("HLOD cache target is not a regular file");
      await rename(cacheTarget, oldCache); hadCache = true;
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    try { await writeHlodResult(latest.policy, latest.folder, result, before); }
    catch (error) {
      if (hadCache) await rename(oldCache, cacheTarget);
      if (error instanceof HlodOutputsChanged) return { state: "superseded", built: false, ...previous, message: error.message };
      throw error;
    }
    const finalReport = { ...report, totalMs: Math.round(performance.now() - started) };
    const entry: Cache = { version: 1, stamp: fingerprint.stamp, inputs,
      // A missing index reads as null in outputRevisions; an empty publication matches that.
      outputs: { [HLOD_INDEX_FILE]: null, ...Object.fromEntries([...result.files].map(([path, bytes]) => [path, fileRevision(bytes)])) },
      publication, completedAt, report: finalReport };
    const tempRelative = `${source.cacheRelative}.${publication}.tmp`;
    let message: string | undefined;
    try {
      const target = resolveProjectPath(policy.root, source.cacheRelative);
      const temp = resolveProjectPath(policy.root, tempRelative);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(temp, JSON.stringify(entry) + "\n", { flag: "wx" });
      await rename(temp, target);
    } catch (error) {
      message = `HLOD published successfully, but freshness cache could not be saved; next check requires rebuilding: ${String(error)}`;
    } finally {
      await rm(resolveProjectPath(policy.root, tempRelative), { force: true }).catch(() => undefined);
      if (hadCache) await rm(oldCache, { force: true }).catch(() => undefined);
    }
    return { state: "current", built: true, publication, completedAt, report: finalReport, ...(message ? { message } : {}) };
  });
}
