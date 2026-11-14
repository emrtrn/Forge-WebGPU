// The Content Browser's file operations as a save plan (plan phase 4 step 6c;
// INV-A24; architecture §4.6, A10): move (Cut / Paste), rename, copy (Copy /
// Paste), delete, new folder, and a new asset (step 6d: a level, an actor
// class, a JSON asset of a registered type; the save's document check writes
// its canonical form). Pure: the server passes the content roots as
// last scanned, the asset index over them and the project's start level; the
// plan goes through the save transaction (tools/save/transaction.ts), all or
// nothing.
//
// What an item takes with it:
// - a folder: everything under it (a level folder is a folder too; the Level
//   card names its folder);
// - an asset: its file, its meta file, the parts its type names (a terrain's
//   tiles and global map);
// - a file that is no asset: itself.
// References are GUIDs, so a move or rename rewrites nothing; the start level
// in the manifest is a path, so it follows (decision 4 of step 6, 2026-11-14).
// A rename changes the name before the first dot (`crate.glb` -> `box.glb`,
// with `box.glb.meta.json`; `valley.terrain.json` with `valley.tiles/`).
//
// Refused (nothing is written):
// - an item under a root the server does not write (the engine's content and
//   packs, A9), a protected item (the level the editor has open), the start
//   level deleted, a target that exists, a folder into itself;
// - a delete of an asset another asset still references (`planDelete`: the
//   referrers are listed, decision 1 of step 6); references from inside the
//   deleted items do not count;
// - a move, rename or delete of a file a World Builder document names by path
//   (§4.6 "veri belgeleri": those inputs refer to each other by file label).
// A copy may take from a read-only root (the engine's content and packs into
// the project). A copy gives every copied asset a new GUID (A1): binaries a new meta id, JSON
// assets a new `id`, a level a new level id and new actor ids (parents
// follow); references to the copied assets are not redirected.

import {
  createId,
  dataDocumentPartMatchers,
  DATA_DOCUMENT_TYPES,
  fileLabel,
  ACTOR_CLASS_SCHEMA,
  DEFAULT_CELL_SIZE,
  isJsonAssetType,
  isJsonObject,
  LEVEL_SCHEMA,
  stringifyDocument,
  type AssetIndex,
  type ContentOpBody,
  type ContentReferrerBody,
  type DocumentAssetTypeDef,
  type IdKind,
  type SchemaRegistry,
} from "../../src/core/index.ts";
import type { ScanResult } from "./scan.ts";

/** The request (src/core/edit/contentProtocol.ts). */
export type ContentOp = ContentOpBody;
export type ContentReferrer = ContentReferrerBody;

export interface ContentPlan {
  readonly moves: { readonly from: string; readonly to: string }[];
  readonly deletes: string[];
  readonly writes: { readonly path: string; readonly text?: string; readonly copyOf?: string }[];
  readonly mkdirs: string[];
  readonly removeDirs: string[];
  /** The start level's new folder, when it moved. */
  readonly startLevel?: string;
  /** Where the items are now (moved, renamed, copied, made), for the editor to select. */
  readonly result: string[];
}

export type ContentOpOutcome =
  | { readonly ok: true; readonly plan: ContentPlan }
  | {
      readonly ok: false;
      /** HTTP status: 400 request, 403 path, 404 missing, 409 conflict or in use. */
      readonly status: 400 | 403 | 404 | 409;
      readonly reason: "request" | "read-only" | "protected" | "missing" | "exists" | "in-use" | "named-by-path" | "start-level";
      readonly message: string;
      readonly referrers?: readonly ContentReferrer[];
    };

export interface ContentOpContext {
  readonly scan: ScanResult;
  readonly index: AssetIndex;
  readonly registry: SchemaRegistry;
  /** True for a root the server writes. */
  readonly writable: (rootLabel: string) => boolean;
  /** The manifest's start level folder (`content/levels/main`), or "". */
  readonly startLevel: string;
  readonly newId?: (kind: IdKind) => string;
}

/** Characters a file or folder name cannot have (Windows' set, and the separators). */
const BAD_NAME = /[\\/:*?"<>|\u0000-\u001f]/;

export function checkContentName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed === "") return "A name cannot be empty.";
  if (trimmed !== name) return "A name cannot start or end with a space.";
  if (trimmed.startsWith(".")) return 'A name cannot start with ".".';
  if (BAD_NAME.test(trimmed)) return 'A name cannot have \\ / : * ? " < > |.';
  if (trimmed.length > 120) return "A name is at most 120 characters.";
  return null;
}

const parentOf = (path: string): string => path.slice(0, path.lastIndexOf("/"));
const baseOf = (path: string): string => path.slice(path.lastIndexOf("/") + 1);
const within = (path: string, folder: string): boolean => path === folder || path.startsWith(`${folder}/`);

interface Group {
  /** The item as given (a folder or a file). */
  readonly item: string;
  readonly folder: boolean;
  /** Every file it takes, `<root>/<path>`. */
  readonly files: readonly string[];
  /** Folders under a folder item, deepest last. */
  readonly folders: readonly string[];
  /** Asset GUIDs among the files. */
  readonly ids: readonly string[];
}

export function planContentOp(request: ContentOp, ctx: ContentOpContext): ContentOpOutcome {
  const newId = ctx.newId ?? ((kind: IdKind) => createId(kind));
  const files = ctx.scan.files.map((file) => fileLabel(file.root, file.path));
  const fileSet = new Set(files);
  const folderSet = new Set([...ctx.scan.folders, ...ctx.scan.roots]);
  const jsonOf = new Map(ctx.scan.files.filter((file) => file.json !== undefined).map((file) => [fileLabel(file.root, file.path), file.json]));
  const entryOf = new Map([...ctx.index.entries.values()].map((entry) => [fileLabel(entry.root, entry.path), entry]));
  const rootOf = (path: string): string | undefined => ctx.scan.roots.find((root) => within(path, root));
  const refuse = (status: 400 | 403 | 404 | 409, reason: Extract<ContentOpOutcome, { ok: false }>["reason"], message: string, referrers?: ContentReferrer[]): ContentOpOutcome => ({
    ok: false,
    status,
    reason,
    message,
    ...(referrers ? { referrers } : {}),
  });

  // A copy's sources may be read-only (the engine's content and packs into the project); everything else writes them.
  const readOnlySource = request.op === "copy";
  const groupOf = (item: string): Group | ContentOpOutcome => {
    const root = rootOf(item);
    if (root === undefined) return refuse(404, "missing", `Not in a content root: ${item}`);
    if (!readOnlySource && !ctx.writable(root)) return refuse(403, "read-only", `${item} is under ${root}, which this server does not write (the engine's content and packs are read-only here).`);
    if (folderSet.has(item)) {
      if (item === root && !readOnlySource) return refuse(400, "request", `A content root cannot be moved, renamed or deleted: ${item}`);
      const inside = files.filter((file) => within(file, item));
      const folders = ctx.scan.folders.filter((folder) => folder !== item && within(folder, item)).sort((a, b) => a.split("/").length - b.split("/").length);
      return { item, folder: true, files: inside, folders, ids: inside.flatMap((file) => { const id = entryOf.get(file)?.id; return id === undefined ? [] : [id as string]; }) };
    }
    if (!fileSet.has(item)) return refuse(404, "missing", `No such file or folder: ${item}`);
    const entry = entryOf.get(item);
    if (!entry) return { item, folder: false, files: [item], folders: [], ids: [] };
    const taken = [item];
    if (entry.meta !== null) taken.push(fileLabel(entry.root, entry.meta));
    const def = ctx.registry.getAssetType(entry.type) as DocumentAssetTypeDef | undefined;
    if (def?.storage === "document" && def.dataFile !== undefined) {
      const matchers = dataDocumentPartMatchers(def, entry.path);
      for (const file of ctx.scan.files) {
        if (file.root === entry.root && matchers.some((matcher) => matcher.test(file.path))) taken.push(fileLabel(file.root, file.path));
      }
    }
    return { item, folder: false, files: taken, folders: [], ids: [entry.id] };
  };
  const groupsOf = (items: readonly string[]): Group[] | ContentOpOutcome => {
    const groups: Group[] = [];
    for (const item of [...new Set(items)]) {
      const group = groupOf(item);
      if ("ok" in group) return group;
      groups.push(group);
    }
    // An item inside another one goes with it.
    return groups.filter((group) => !groups.some((other) => other !== group && other.folder && within(group.item, other.item) && group.item !== other.item));
  };
  const protectedHit = (groups: readonly Group[], protect: readonly string[] | undefined): ContentOpOutcome | null => {
    for (const path of protect ?? []) {
      const hit = groups.find((group) => within(path, group.item) || group.files.some((file) => within(file, path)));
      if (hit) return refuse(409, "protected", `${path} is the level the editor has open; open another level first.`);
    }
    return null;
  };
  /** World Builder documents that name one of `labels` by path, outside `exclude`. */
  const namedByPath = (labels: readonly string[], exclude: ReadonlySet<string>): ContentReferrer[] => {
    const dataTypes = new Set(DATA_DOCUMENT_TYPES.map((def) => def.name));
    const found: ContentReferrer[] = [];
    const wanted = labels.filter((label) => label.endsWith(".json"));
    if (wanted.length === 0) return found;
    for (const entry of ctx.index.entries.values()) {
      if (!dataTypes.has(entry.type)) continue;
      const file = fileLabel(entry.root, entry.path);
      if (exclude.has(file)) continue;
      const text = JSON.stringify(jsonOf.get(file) ?? null);
      for (const label of wanted) if (text.includes(JSON.stringify(label))) found.push({ file, id: entry.id, target: label });
    }
    return found;
  };
  const freeTarget = (path: string, taken: ReadonlySet<string>): boolean => !fileSet.has(path) && !folderSet.has(path) && !taken.has(path);
  const emptyPlan = (): ContentPlan => ({ moves: [], deletes: [], writes: [], mkdirs: [], removeDirs: [], result: [] });
  const followStart = (plan: ContentPlan, from: string, to: string): ContentPlan =>
    ctx.startLevel !== "" && within(ctx.startLevel, from) ? { ...plan, startLevel: to + ctx.startLevel.slice(from.length) } : plan;

  /** Moves a group so its item is at `target`; its files keep their place under it. */
  const relocate = (group: Group, target: string, rename: (relative: string) => string, plan: ContentPlan, taken: Set<string>): ContentOpOutcome | null => {
    const from = parentOf(group.item);
    for (const file of group.files) {
      const to = `${target === "" ? "" : `${target}/`}${rename(file.slice(from.length + 1))}`;
      if (!freeTarget(to, taken)) return refuse(409, "exists", `There is already a file at ${to}.`);
      taken.add(to);
      plan.moves.push({ from: file, to });
    }
    if (group.folder) {
      for (const folder of group.folders) {
        const to = `${target}/${rename(folder.slice(from.length + 1))}`;
        if (!group.files.some((file) => within(file, folder))) plan.mkdirs.push(to);
      }
      plan.removeDirs.push(group.item, ...group.folders);
    }
    return null;
  };

  switch (request.op) {
    case "mkdir": {
      const root = rootOf(request.path);
      if (root === undefined || !folderSet.has(parentOf(request.path))) return refuse(404, "missing", `No such folder: ${parentOf(request.path)}`);
      if (!ctx.writable(root)) return refuse(403, "read-only", `${root} is not written by this server.`);
      const problem = checkContentName(baseOf(request.path));
      if (problem) return refuse(400, "request", problem);
      if (!freeTarget(request.path, new Set())) return refuse(409, "exists", `${request.path} already exists.`);
      return { ok: true, plan: { ...emptyPlan(), mkdirs: [request.path], result: [request.path] } };
    }
    case "create": {
      const root = rootOf(request.folder);
      if (root === undefined || !folderSet.has(request.folder)) return refuse(404, "missing", `No such folder: ${request.folder}`);
      if (!ctx.writable(root)) return refuse(403, "read-only", `${root} is not written by this server.`);
      const problem = checkContentName(request.name) ?? (request.name.includes(".") ? 'A new asset\'s name has no ".".' : null);
      if (problem) return refuse(400, "request", problem);
      let path: string;
      let document: Record<string, unknown>;
      if (request.kind === "level") {
        const folder = `${request.folder}/${request.name}`;
        if (!freeTarget(folder, new Set())) return refuse(409, "exists", `${folder} already exists.`);
        path = `${folder}/level.json`;
        document = { schema: LEVEL_SCHEMA, id: newId("level"), settings: { cellSize: DEFAULT_CELL_SIZE }, actors: [...(request.actors ?? [])] };
      } else if (request.kind === "actorClass") {
        path = `${request.folder}/${request.name}.actor.json`;
        document = { schema: ACTOR_CLASS_SCHEMA, id: newId("asset"), name: request.name, components: {} };
      } else {
        const def = ctx.registry.getAssetType(request.type ?? "");
        if (!def || !isJsonAssetType(def)) return refuse(400, "request", `No JSON asset type ${request.type ?? "(none)"}.`);
        path = `${request.folder}/${request.name}${def.json.suffix}`;
        document = { ...(request.values ?? {}), schema: `${def.name}/${def.json.version}`, id: newId("asset") };
      }
      if (!freeTarget(path, new Set())) return refuse(409, "exists", `${path} already exists.`);
      const result = request.kind === "level" ? parentOf(path) : path;
      return { ok: true, plan: { ...emptyPlan(), writes: [{ path, text: stringifyDocument(document) }], result: [result] } };
    }
    case "move":
    case "rename": {
      const groups = groupsOf(request.op === "move" ? request.items : [request.item]);
      if ("ok" in groups) return groups;
      const blocked = protectedHit(groups, request.protect);
      if (blocked) return blocked;
      const moving = groups.flatMap((group) => group.files);
      const byPath = namedByPath(moving, new Set(moving));
      if (byPath.length > 0) return refuse(409, "named-by-path", "A World Builder document names it by path; it would lose it.", byPath);
      let plan = emptyPlan();
      const taken = new Set<string>();
      if (request.op === "rename") {
        const group = groups[0]!;
        const problem = checkContentName(request.name);
        if (problem) return refuse(400, "request", problem);
        const oldBase = baseOf(group.item);
        if (!group.folder && request.name.includes(".")) return refuse(400, "request", 'An asset\'s name has no "." (its file type follows it).');
        const dot = oldBase.indexOf(".");
        const stem = group.folder || dot <= 0 ? oldBase : oldBase.slice(0, dot);
        const swap = (relative: string): string => {
          const first = relative.split("/")[0]!;
          const rest = relative.slice(first.length);
          if (group.folder) return first === oldBase ? request.name + rest : relative;
          return first === stem || first.startsWith(`${stem}.`) ? request.name + first.slice(stem.length) + rest : relative;
        };
        if (request.name === stem) return { ok: true, plan };
        const refused = relocate(group, parentOf(group.item), swap, plan, taken);
        if (refused) return refused;
        const renamed = `${parentOf(group.item)}/${swap(oldBase)}`;
        plan.result.push(renamed);
        plan = followStart(plan, group.item, renamed);
        return { ok: true, plan };
      }
      const to = request.to;
      const toRoot = rootOf(to);
      if (toRoot === undefined || !folderSet.has(to)) return refuse(404, "missing", `No such folder: ${to}`);
      if (!ctx.writable(toRoot)) return refuse(403, "read-only", `${toRoot} is not written by this server.`);
      for (const group of groups) {
        if (parentOf(group.item) === to) continue;
        if (group.folder && within(to, group.item)) return refuse(400, "request", `A folder cannot go into itself: ${group.item}`);
        const refused = relocate(group, to, (relative) => relative, plan, taken);
        if (refused) return refused;
        const moved = `${to}/${baseOf(group.item)}`;
        plan.result.push(moved);
        plan = followStart(plan, group.item, moved);
      }
      return { ok: true, plan };
    }
    case "delete": {
      const groups = groupsOf(request.items);
      if ("ok" in groups) return groups;
      const blocked = protectedHit(groups, request.protect);
      if (blocked) return blocked;
      if (ctx.startLevel !== "" && groups.some((group) => within(ctx.startLevel, group.item))) {
        return refuse(409, "start-level", `${ctx.startLevel} is the project's start level; set another one first (Set as Start Level).`);
      }
      const going = new Set(groups.flatMap((group) => group.files));
      const goingIds = new Set(groups.flatMap((group) => group.ids));
      const referrers: ContentReferrer[] = [];
      for (const id of goingIds) {
        for (const reference of ctx.index.referrersOf(id)) {
          if (going.has(reference.file) || goingIds.has(reference.from)) continue;
          referrers.push({ file: reference.file, id: reference.from, target: id });
        }
      }
      if (referrers.length > 0) return refuse(409, "in-use", "It is still used; take the references away first.", referrers);
      const byPath = namedByPath([...going], going);
      if (byPath.length > 0) return refuse(409, "named-by-path", "A World Builder document names it by path.", byPath);
      const plan = emptyPlan();
      // A level's index is the server's: it goes with its level.json (the save transaction).
      for (const file of going) if (!file.endsWith("/cells.json") || !going.has(`${parentOf(file)}/level.json`)) plan.deletes.push(file);
      for (const group of groups) if (group.folder) plan.removeDirs.push(group.item, ...group.folders);
      return { ok: true, plan };
    }
    case "copy": {
      const groups = groupsOf(request.items);
      if ("ok" in groups) return groups;
      const to = request.to;
      const toRoot = rootOf(to);
      if (toRoot === undefined || !folderSet.has(to)) return refuse(404, "missing", `No such folder: ${to}`);
      if (!ctx.writable(toRoot)) return refuse(403, "read-only", `${toRoot} is not written by this server.`);
      const plan = emptyPlan();
      const taken = new Set<string>();
      for (const group of groups) {
        if (group.folder && within(to, group.item)) return refuse(400, "request", `A folder cannot be copied into itself: ${group.item}`);
        const base = baseOf(group.item);
        const dot = group.folder ? -1 : base.indexOf(".");
        const stem = dot > 0 ? base.slice(0, dot) : base;
        // Unreal's naming: the same name when it is free, else `<name>_2`, `_3`, ...
        let name = stem;
        for (let n = 2; !freeTarget(`${to}/${name}${dot > 0 ? base.slice(dot) : ""}`, taken); n += 1) name = `${stem}_${n}`;
        const swap = (relative: string): string => {
          const first = relative.split("/")[0]!;
          if (group.folder) return first === base ? name + relative.slice(first.length) : relative;
          return first === stem || first.startsWith(`${stem}.`) ? name + relative.slice(stem.length) : relative;
        };
        const from = parentOf(group.item);
        const ids = new Map<string, string>();
        const renew = (id: string, kind: IdKind): string => {
          const found = ids.get(id);
          if (found) return found;
          const fresh = newId(kind);
          ids.set(id, fresh);
          return fresh;
        };
        for (const file of group.files) {
          const target = `${to}/${swap(file.slice(from.length + 1))}`;
          taken.add(target);
          if (file.endsWith("/cells.json") && group.files.includes(`${parentOf(file)}/level.json`)) continue; // the server writes it
          const json = jsonOf.get(file);
          const entry = entryOf.get(file);
          if (isJsonObject(json) && (file.endsWith(".meta.json") || entry !== undefined || json.schema === "forge.levelCell/1")) {
            plan.writes.push({ path: target, text: stringifyDocument(renewIds(json, renew)) });
          } else {
            plan.writes.push({ path: target, copyOf: file });
          }
        }
        for (const folder of group.folders) {
          if (!group.files.some((file) => within(file, folder))) plan.mkdirs.push(`${to}/${swap(folder.slice(from.length + 1))}`);
        }
        plan.result.push(`${to}/${swap(base)}`);
      }
      return { ok: true, plan };
    }
  }
}

/** A copied document with new GUIDs: its own id, a level's actors (and their parents), a cell's level. */
function renewIds(json: Record<string, unknown>, renew: (id: string, kind: IdKind) => string): Record<string, unknown> {
  const out: Record<string, unknown> = { ...json };
  const kindOf = (id: string): IdKind | null => (id.startsWith("ast_") ? "asset" : id.startsWith("lvl_") ? "level" : id.startsWith("act_") ? "actor" : null);
  if (typeof out.id === "string" && kindOf(out.id)) out.id = renew(out.id, kindOf(out.id)!);
  if (typeof out.level === "string" && out.level.startsWith("lvl_")) out.level = renew(out.level, "level");
  if (Array.isArray(out.actors)) {
    out.actors = out.actors.map((actor: unknown) => {
      if (!isJsonObject(actor)) return actor;
      const copy: Record<string, unknown> = { ...actor };
      if (typeof copy.id === "string" && copy.id.startsWith("act_")) copy.id = renew(copy.id, "actor");
      if (typeof copy.parent === "string" && copy.parent.startsWith("act_")) copy.parent = renew(copy.parent, "actor");
      return copy;
    });
  }
  return out;
}
