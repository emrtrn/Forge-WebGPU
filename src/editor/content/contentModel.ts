// The Content Browser's model (plan phase 4 step 6a): the dev server's listing
// (`GET /__forge/content`) as a folder tree and folder contents, with Forge
// WebGL's rules (src/editor/panels/content/contentPanel.ts and EditorUi.ts @
// forge-webgl-final): a folder shows its sub-folders, then its assets; the
// type filter and the search apply to what the open folder holds; Back /
// Forward walk the folders visited.
//
// Two adaptations to this engine's content model (architecture §4.6, §4.8):
// - a level is a folder (`level.json` with its cells). In its parent folder
//   the level folder is a Level card; in the tree it stays a folder, so what
//   else it holds (a terrain, a World Builder brief) is reachable. Its
//   `level.json` is not listed inside it.
// - the tree has a node per content root: the project's own (Content), the
//   engine's content (Engine) and each selected pack, the last ones read-only
//   unless the server says otherwise (decision 6).
// An asset's name is its file's name up to the first dot (`crate.glb`,
// `red.material.json`), a level's its folder's. Three-free and DOM-free.

import type { ContentIssueBody, ContentListingBody } from "../../core/index.ts";

export const LEVEL_TYPE = "forge.level";
/** The type filter's "every type" value (Forge's CONTENT_FILTER_ALL). */
export const CONTENT_FILTER_ALL = "__all__";
/** Filter value of the files that are no asset. */
export const CONTENT_FILTER_FILE = "file";

export interface ContentRootNode {
  readonly label: string;
  readonly title: string;
  readonly writable: boolean;
}

export interface ContentFolderNode {
  /** `<root label>/<path>`; a root's own path is its label. */
  readonly path: string;
  readonly name: string;
  readonly root: string;
  readonly parent: string | null;
  /** Sub-folder paths, by name. */
  readonly children: readonly string[];
  /** The level this folder is, when it holds a `level.json`. */
  readonly level: ContentAssetItem | null;
  readonly writable: boolean;
}

export interface ContentAssetItem {
  readonly kind: "asset";
  /** `<root label>/<path>` of the asset's file (a level: its `level.json`). */
  readonly file: string;
  /** The folder the card is shown in (a level: the parent of its folder). */
  readonly folder: string;
  readonly name: string;
  /** Upper-case extension, the card's placeholder (`GLB`; a level `LEVEL`). */
  readonly ext: string;
  readonly id: string | null;
  /** Asset type name; null for a file that is no asset. */
  readonly type: string | null;
  readonly issues: readonly ContentIssueBody[];
  readonly writable: boolean;
  /** The listing's revision (what the thumbnail is keyed by); null when it has none. */
  readonly revision: string | null;
  /** A level: its folder. */
  readonly levelFolder: string | null;
}

export interface ContentFolderItem {
  readonly kind: "folder";
  readonly folder: ContentFolderNode;
}

export type ContentItem = ContentFolderItem | ContentAssetItem;

export interface ContentIndex {
  readonly roots: readonly ContentRootNode[];
  folder(path: string): ContentFolderNode | undefined;
  /** The assets shown in a folder, by name. */
  assetsIn(path: string): readonly ContentAssetItem[];
  /** Every asset, by name. */
  readonly assets: readonly ContentAssetItem[];
  byId(id: string): ContentAssetItem | undefined;
  byFile(file: string): ContentAssetItem | undefined;
  /** The type filter's choices: the types listed, then `file` when a file is no asset. */
  readonly types: readonly string[];
}

/** Forge's names for the engine's asset types; another type reads from its name (`ridgebound.contract` -> Contract). */
const TYPE_LABELS: Readonly<Record<string, string>> = {
  "forge.model": "Static Mesh",
  "forge.texture": "Texture",
  "forge.sound": "Sound",
  "forge.material": "Material",
  "forge.level": "Level",
  "forge.actorClass": "Actor Class",
  "forge.terrain": "Terrain",
  "forge.worldBrief": "World Brief",
  "forge.worldRecipe": "World Recipe",
  "forge.regionProfile": "Region Profile",
  "forge.groundCover": "Ground Cover",
};

export function contentTypeLabel(type: string | null): string {
  if (type === null || type === CONTENT_FILTER_FILE) return "File";
  const known = TYPE_LABELS[type];
  if (known) return known;
  const name = type.slice(type.lastIndexOf(".") + 1);
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toLocaleUpperCase() + part.slice(1))
    .join(" ");
}

/** The filter's plural (`Static Meshes`, `Textures`, `Actor Classes`). */
export function contentTypePlural(type: string): string {
  const label = contentTypeLabel(type);
  if (/(s|sh|ch|x)$/i.test(label)) return `${label}es`;
  return `${label}s`;
}

/** `content` -> Content, `engine:content/engine` -> Engine, `engine:content/packs/starter` -> Starter Pack. */
export function contentRootTitle(label: string): string {
  const title = (name: string): string => name.slice(0, 1).toLocaleUpperCase() + name.slice(1);
  if (label === "engine:content/engine") return "Engine";
  const pack = /^engine:content\/packs\/([^/]+)$/.exec(label);
  if (pack) return `${title(pack[1]!)} Pack`;
  return title(label.slice(label.lastIndexOf("/") + 1));
}

function parentOf(path: string): string {
  return path.slice(0, path.lastIndexOf("/"));
}

function baseName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

const byName = (a: { readonly name: string }, b: { readonly name: string }): number =>
  a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

export function buildContentIndex(listing: ContentListingBody): ContentIndex {
  const roots: ContentRootNode[] = listing.roots.map((root) => ({ label: root.label, title: contentRootTitle(root.label), writable: root.writable }));
  const rootOf = (path: string): ContentRootNode | undefined => roots.find((root) => path === root.label || path.startsWith(`${root.label}/`));

  interface Draft {
    path: string;
    name: string;
    root: string;
    parent: string | null;
    children: string[];
    level: ContentAssetItem | null;
    writable: boolean;
  }
  const drafts = new Map<string, Draft>();
  for (const root of roots) {
    drafts.set(root.label, { path: root.label, name: root.title, root: root.label, parent: null, children: [], level: null, writable: root.writable });
  }
  const ensure = (path: string): Draft | undefined => {
    const found = drafts.get(path);
    if (found) return found;
    const root = rootOf(path);
    if (!root) return undefined;
    const parent = ensure(parentOf(path));
    if (!parent) return undefined;
    const draft: Draft = { path, name: baseName(path), root: root.label, parent: parent.path, children: [], level: null, writable: root.writable };
    drafts.set(path, draft);
    parent.children.push(path);
    return draft;
  };
  for (const folder of listing.folders) ensure(folder);

  const assets: ContentAssetItem[] = [];
  const types = new Set<string>();
  let loose = false;
  for (const file of listing.files) {
    const root = rootOf(file.file);
    const folder = ensure(parentOf(file.file));
    if (!root || !folder) continue;
    const base = baseName(file.file);
    const dot = base.indexOf(".");
    const type = file.type ?? null;
    const isLevel = type === LEVEL_TYPE && base === "level.json" && folder.parent !== null;
    const item: ContentAssetItem = {
      kind: "asset",
      file: file.file,
      folder: isLevel ? folder.parent! : folder.path,
      name: isLevel ? folder.name : dot > 0 ? base.slice(0, dot) : base,
      ext: isLevel ? "LEVEL" : (base.slice(base.lastIndexOf(".") + 1) || "FILE").toLocaleUpperCase(),
      id: file.id ?? null,
      type,
      issues: file.issues ?? [],
      writable: root.writable,
      revision: file.revision ?? null,
      levelFolder: isLevel ? folder.path : null,
    };
    if (isLevel) folder.level = item;
    assets.push(item);
    if (type === null) loose = true;
    else types.add(type);
  }
  assets.sort(byName);

  const folders = new Map<string, ContentFolderNode>();
  for (const draft of drafts.values()) {
    draft.children.sort((a, b) => byName(drafts.get(a)!, drafts.get(b)!));
    folders.set(draft.path, draft);
  }
  const shown = new Map<string, ContentAssetItem[]>();
  for (const asset of assets) {
    const list = shown.get(asset.folder);
    if (list) list.push(asset);
    else shown.set(asset.folder, [asset]);
  }
  const byId = new Map(assets.filter((asset) => asset.id !== null).map((asset) => [asset.id!, asset]));
  const byFile = new Map(assets.map((asset) => [asset.file, asset]));
  return {
    roots,
    folder: (path) => folders.get(path),
    assetsIn: (path) => shown.get(path) ?? [],
    assets,
    byId: (id) => byId.get(id),
    byFile: (file) => byFile.get(file),
    types: [...[...types].sort((a, b) => contentTypePlural(a).localeCompare(contentTypePlural(b))), ...(loose ? [CONTENT_FILTER_FILE] : [])],
  };
}

export interface ContentQuery {
  /** A type name, `file`, or CONTENT_FILTER_ALL. */
  readonly type: string;
  /** Lower-case search text; empty matches everything. */
  readonly search: string;
}

function matches(text: string, search: string): boolean {
  return search === "" || text.toLocaleLowerCase().includes(search);
}

/**
 * What a folder shows (Forge's renderContentAssets): its sub-folders that are
 * not levels and match the search, then its assets (level folders as Level
 * cards) of the filtered type that match the search on name, type or path.
 */
export function folderItems(index: ContentIndex, path: string, query: ContentQuery): ContentItem[] {
  const folder = index.folder(path);
  if (!folder) return [];
  const folders: ContentItem[] = folder.children
    .map((child) => index.folder(child)!)
    .filter((child) => child.level === null && matches(`${child.name} folder ${child.path}`, query.search))
    .map((child) => ({ kind: "folder", folder: child }));
  const assets = index.assetsIn(path).filter((asset) => {
    const type = asset.type ?? CONTENT_FILTER_FILE;
    if (query.type !== CONTENT_FILTER_ALL && type !== query.type) return false;
    return matches(`${asset.name} ${contentTypeLabel(asset.type)} ${asset.file}`, query.search);
  });
  return [...folders, ...assets];
}

/** The tree's folders under a node: level folders included (they hold more than the level). */
export function treeChildren(index: ContentIndex, path: string): readonly ContentFolderNode[] {
  return (index.folder(path)?.children ?? []).map((child) => index.folder(child)!);
}

/** Root first, then each folder down to `path`. */
export function folderTrail(index: ContentIndex, path: string): ContentFolderNode[] {
  const trail: ContentFolderNode[] = [];
  for (let node = index.folder(path); node; node = node.parent === null ? undefined : index.folder(node.parent)) trail.unshift(node);
  return trail;
}

/** True when `path` is `folder` or inside it. */
export function isWithin(path: string, folder: string): boolean {
  return path === folder || path.startsWith(`${folder}/`);
}

/** Back / Forward over the folders visited (Forge's content navigation history). */
export class FolderHistory {
  private entries: string[];
  private at = 0;

  constructor(initial: string) {
    this.entries = [initial];
  }

  get current(): string {
    return this.entries[this.at]!;
  }

  /** A new folder: forward entries are dropped; the same folder again is no new entry. */
  visit(path: string): void {
    if (path === this.current) return;
    this.entries = [...this.entries.slice(0, this.at + 1), path];
    this.at = this.entries.length - 1;
  }

  canGo(offset: -1 | 1): boolean {
    return this.at + offset >= 0 && this.at + offset < this.entries.length;
  }

  /** The folder `offset` away, skipping ones that no longer exist; null when there is none. */
  go(offset: -1 | 1, exists: (path: string) => boolean): string | null {
    let at = this.at + offset;
    while (at >= 0 && at < this.entries.length && !exists(this.entries[at]!)) at += offset;
    if (at < 0 || at >= this.entries.length) return null;
    this.at = at;
    return this.current;
  }

  /** A folder renamed or moved: every entry under it follows. */
  rename(from: string, to: string): void {
    this.entries = this.entries.map((path) => (isWithin(path, from) ? to + path.slice(from.length) : path));
  }
}
