import { randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname } from "node:path";
import { HLOD_DIR, HLOD_INDEX_FILE, hlodCellFileOf, hlodClusterFileOf, normalizeHlodIndex } from "../../src/core/level/hlod.ts";
import { fileRevision } from "../assets/revision.ts";
import { resolveProjectPath, resolveWritablePath, type WritePolicy } from "../server/projectPaths.ts";
import type { HlodBuildResult } from "./hlodBuild.ts";
import { digest, sameRevisions, type Revisions } from "./hlodFingerprint.ts";

export class HlodOutputsChanged extends Error {}
export async function outputRevisions(policy: WritePolicy, folder: string): Promise<Revisions> {
  const target = (path: string) => resolveWritablePath(policy, `${folder}/${path}`).absolute;
  const paths = [HLOD_INDEX_FILE];
  try { for (const name of await readdir(target(HLOD_DIR))) if (/\.glb$/i.test(name)) paths.push(`${HLOD_DIR}/${name}`); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const revisions: Revisions = {};
  for (const path of paths.sort()) {
    try { revisions[path] = fileRevision(await readFile(target(path))); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; revisions[path] = null; }
  }
  return revisions;
}

/** Called under the project save lock by the service. Hidden, policy-checked helpers
 * stay beside their target. Back up every replacement/deletion before modifying any. */
export async function writeHlodResult(policy: WritePolicy, folder: string, result: HlodBuildResult,
  expected?: Revisions): Promise<void> {
  const normalized = normalizeHlodIndex(result.index, { strict: true });
  const required = new Set([HLOD_INDEX_FILE, ...result.index.cells.map((cell) => hlodCellFileOf(cell.key)),
    ...result.index.clusters.map((cluster) => hlodClusterFileOf(cluster.key))]);
  if (!normalized.ok || !normalized.value || result.files.size !== required.size ||
    [...required].some((path) => !result.files.has(path))) throw new Error("Invalid HLOD publication file set");
  const encoded = result.files.get(HLOD_INDEX_FILE)!;
  if (digest(JSON.parse(new TextDecoder().decode(encoded))) !== digest(result.index)) throw new Error("HLOD index bytes disagree with result");
  const before = await outputRevisions(policy, folder);
  if (expected && !sameRevisions(before, expected)) throw new HlodOutputsChanged("HLOD outputs changed during computation; retry");
  const token = randomUUID();
  const target = (path: string) => resolveWritablePath(policy, `${folder}/${path}`).absolute;
  const helper = (path: string, suffix: string) => {
    const absolute = target(path);
    return resolveProjectPath(policy.root, `${folder}/${path.slice(0, path.lastIndexOf("/") + 1)}.${basename(absolute)}.${token}.${suffix}`);
  };
  const paths = new Set([...Object.keys(before).filter((path) => before[path] !== null), ...required]);
  const entries = [...paths].filter((path) => path !== HLOD_INDEX_FILE).sort().concat(HLOD_INDEX_FILE)
    .map((path) => ({ path, target: target(path), temp: helper(path, "tmp"), backup: helper(path, "bak"),
      existed: before[path] != null, touched: false }));
  let rollbackFailed = false;
  try {
    for (const file of entries) {
      await mkdir(dirname(file.target), { recursive: true });
      const bytes = result.files.get(file.path);
      if (bytes) await writeFile(file.temp, bytes, { flag: "wx" });
      if (file.existed) await copyFile(file.target, file.backup);
    }
    if (!sameRevisions(before, await outputRevisions(policy, folder))) throw new HlodOutputsChanged("HLOD outputs changed while staging; retry");
    for (const file of entries) {
      if (result.files.has(file.path)) await rename(file.temp, file.target);
      else await rm(file.target);
      file.touched = true;
    }
  } catch (cause) {
    const failures: unknown[] = [];
    for (const file of [...entries].reverse().filter((file) => file.touched)) {
      try {
        if (file.existed) await rename(file.backup, file.target);
        else await rm(file.target, { force: true });
      } catch (error) { failures.push(error); }
    }
    if (failures.length) {
      rollbackFailed = true;
      throw new AggregateError([cause, ...failures], `HLOD publication rollback failed; hidden backups retained (${token})`);
    }
    throw cause;
  } finally {
    for (const file of entries) {
      await rm(file.temp, { force: true }).catch(() => undefined);
      if (!rollbackFailed) await rm(file.backup, { force: true }).catch(() => undefined);
    }
  }
}
