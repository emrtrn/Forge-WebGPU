// A Forge WebGL `public/` folder as the importer reads it (plan 2b importer):
// its asset manifest (`assets/manifest.json`) and its files by public-relative
// path. Read only.

import { access, readFile } from "node:fs/promises";
import { join } from "node:path";

export interface ForgeManifestAsset {
  readonly id: string;
  readonly assetType: string;
  /** Public-relative path, `assets/...`. */
  readonly path: string;
  readonly license?: string;
  readonly source?: Readonly<Record<string, unknown>>;
}

export interface ForgeSource {
  /** The `public/` folder. */
  readonly root: string;
  readonly assets: ReadonlyMap<string, ForgeManifestAsset>;
  readonly byPath: ReadonlyMap<string, ForgeManifestAsset>;
  readJson(path: string): Promise<unknown>;
  readBytes(path: string): Promise<Buffer>;
  exists(path: string): Promise<boolean>;
}

/** A public-relative path with plain segments. */
function checkPath(path: string): string {
  if (path.startsWith("/") || /^[a-z]:/i.test(path) || path.split("/").some((part) => part === "" || part === "." || part === "..")) {
    throw new Error(`not a public-relative path: ${path}`);
  }
  return path;
}

export async function openForgeSource(publicRoot: string): Promise<ForgeSource> {
  const raw = JSON.parse(await readFile(join(publicRoot, "assets/manifest.json"), "utf8")) as { assets?: unknown };
  if (!Array.isArray(raw.assets)) throw new Error(`${publicRoot}: assets/manifest.json has no asset list`);
  const assets = new Map<string, ForgeManifestAsset>();
  const byPath = new Map<string, ForgeManifestAsset>();
  for (const entry of raw.assets as ForgeManifestAsset[]) {
    if (typeof entry?.id !== "string" || typeof entry.path !== "string" || typeof entry.assetType !== "string") continue;
    if (!assets.has(entry.id)) assets.set(entry.id, entry);
    byPath.set(entry.path, entry);
  }
  return {
    root: publicRoot,
    assets,
    byPath,
    readJson: async (path) => JSON.parse(await readFile(join(publicRoot, checkPath(path)), "utf8")) as unknown,
    readBytes: (path) => readFile(join(publicRoot, checkPath(path))),
    exists: (path) => access(join(publicRoot, checkPath(path))).then(() => true, () => false),
  };
}

/** `a/b/Tree.glb` -> `a/b/Tree`. */
export function stemOf(path: string): string {
  const slash = path.lastIndexOf("/");
  const dot = path.indexOf(".", slash + 1);
  return dot < 0 ? path : path.slice(0, dot);
}
