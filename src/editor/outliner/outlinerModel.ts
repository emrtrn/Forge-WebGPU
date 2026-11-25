// The Outliner's rows (INV-A12, plan phase 4 step 5a; Forge WebGL
// src/editor/panels/outliner/outlinerPanel.ts @ forge-webgl-final): which
// actors show, in what order and how deep, and which of them the virtualised
// list draws. DOM-free and three-free; the panel (outlinerPanel.ts) draws the
// window this gives.
//
// - Tree order (Forge's `orderOutlinerTree`): depth first, children under
//   their parent in the level's order. An actor whose parent the type filter
//   hides shows at the root. A collapsed row hides its descendants (new: Forge
//   had no hierarchy deep enough to need it; groups are parents now).
// - Folders (user decision 2026-11-25, as Unreal): the root actors that carry a
//   folder path are under its folder row, folders first and by name. A folder
//   is open only when it is in `openFolders`: a generated world's thousand
//   fences start as one row. Empty folders are the page's own (`folders`).
// - A search (Forge: the name starts with the text, any case) lists the
//   matches flat, at depth 0.
// - Everything is linear in the actor count: the panel recomputes the rows on
//   an edit, never on a selection change (50.000 actors, plan phase 4 gate).

import { folderName, parentFolder, type ActorId } from "../../core/index.ts";
import type { OutlinerType } from "../host/featureEditor.ts";

export interface OutlinerSource {
  readonly id: ActorId;
  readonly parent: ActorId | null;
  readonly name: string;
  readonly type: OutlinerType;
  /** Outliner folder of a root actor; "" at the level root. */
  readonly folder: string;
}

export interface OutlinerQuery {
  /** Search text; empty for the tree. */
  readonly filter: string;
  /** Type groups shown (Forge's Show types). */
  readonly types: ReadonlySet<OutlinerType>;
  readonly collapsed: ReadonlySet<ActorId>;
  readonly openFolders: ReadonlySet<string>;
  /** Folders shown even when no actor is in them. */
  readonly folders: Iterable<string>;
}

export interface OutlinerActorRow {
  readonly kind: "actor";
  readonly id: ActorId;
  readonly depth: number;
  readonly hasChildren: boolean;
  readonly expanded: boolean;
}

export interface OutlinerFolderRow {
  readonly kind: "folder";
  readonly path: string;
  readonly name: string;
  readonly depth: number;
  readonly hasChildren: boolean;
  readonly expanded: boolean;
  /** The shown root actors in it, subfolders included. */
  readonly ids: readonly ActorId[];
}

export type OutlinerRow = OutlinerActorRow | OutlinerFolderRow;

interface FolderNode {
  readonly path: string;
  readonly children: FolderNode[];
  readonly items: OutlinerSource[];
}

export function outlinerRows(items: readonly OutlinerSource[], query: OutlinerQuery): OutlinerRow[] {
  const shown = items.filter((item) => query.types.has(item.type));
  const filter = query.filter.trim().toLocaleLowerCase();
  if (filter !== "") {
    return shown.filter((item) => item.name.toLocaleLowerCase().startsWith(filter)).map((item) => ({ kind: "actor", id: item.id, depth: 0, hasChildren: false, expanded: false }));
  }
  const included = new Set(shown.map((item) => item.id));
  const children = new Map<ActorId, OutlinerSource[]>();
  for (const item of shown) {
    if (item.parent === null || !included.has(item.parent)) continue;
    const list = children.get(item.parent);
    if (list) list.push(item);
    else children.set(item.parent, [item]);
  }
  const rows: OutlinerRow[] = [];
  const visited = new Set<ActorId>();
  /** A collapsed row's descendants: seen, not drawn. */
  const hide = (kids: readonly OutlinerSource[]): void => {
    const stack = [...kids];
    while (stack.length > 0) {
      const item = stack.pop()!;
      if (visited.has(item.id)) continue;
      visited.add(item.id);
      stack.push(...(children.get(item.id) ?? []));
    }
  };
  const walk = (root: OutlinerSource, at = 0): void => {
    // Iterative: a deep chain must not overflow the stack.
    const stack: (readonly [OutlinerSource, number])[] = [[root, at]];
    while (stack.length > 0) {
      const [item, depth] = stack.pop()!;
      if (visited.has(item.id)) continue;
      visited.add(item.id);
      const kids = children.get(item.id);
      const expanded = !query.collapsed.has(item.id);
      rows.push({ kind: "actor", id: item.id, depth, hasChildren: kids !== undefined, expanded });
      if (!kids) continue;
      if (!expanded) {
        hide(kids);
        continue;
      }
      for (let index = kids.length - 1; index >= 0; index -= 1) stack.push([kids[index]!, depth + 1]);
    }
  };
  const folders = new Map<string, FolderNode>();
  const top: FolderNode[] = [];
  const ensure = (path: string): FolderNode => {
    const known = folders.get(path);
    if (known) return known;
    const node: FolderNode = { path, children: [], items: [] };
    folders.set(path, node);
    const parent = parentFolder(path);
    (parent === "" ? top : ensure(parent).children).push(node);
    return node;
  };
  for (const path of query.folders) ensure(path);
  const roots: OutlinerSource[] = [];
  for (const item of shown) {
    if (item.parent !== null && included.has(item.parent)) continue;
    if (item.parent === null && item.folder !== "") ensure(item.folder).items.push(item);
    else roots.push(item);
  }
  const idsOf = (node: FolderNode): ActorId[] => [...node.children.flatMap(idsOf), ...node.items.map((item) => item.id)];
  const emit = (nodes: readonly FolderNode[], depth: number, drawn: boolean): void => {
    const sorted = [...nodes].sort((a, b) => folderName(a.path).localeCompare(folderName(b.path), undefined, { numeric: true }));
    for (const node of sorted) {
      const expanded = drawn && query.openFolders.has(node.path);
      if (drawn) rows.push({ kind: "folder", path: node.path, name: folderName(node.path), depth, hasChildren: node.children.length + node.items.length > 0, expanded, ids: idsOf(node) });
      emit(node.children, depth + 1, expanded);
      if (expanded) for (const item of node.items) walk(item, depth + 1);
      else hide(node.items);
    }
  };
  emit(top, 0, true);
  for (const item of roots) walk(item);
  // A cycle has no root; it cannot come out of a normalised level, but never drop an actor.
  for (const item of shown) if (!visited.has(item.id)) walk(item);
  return rows;
}

/** The ids from the anchor's row to the target's, inclusive (Shift + click); just the target without an anchor row. */
export function rangeIds(rows: readonly OutlinerRow[], anchor: ActorId | null, target: ActorId): ActorId[] {
  const at = (id: ActorId): number => rows.findIndex((row) => row.kind === "actor" && row.id === id);
  const to = at(target);
  const from = anchor === null ? -1 : at(anchor);
  if (to < 0) return [target];
  if (from < 0) return [target];
  return rows.slice(Math.min(from, to), Math.max(from, to) + 1).flatMap((row) => (row.kind === "actor" ? [row.id] : []));
}

/** The rows a list of fixed-height rows draws: what is in view and `overscan` rows either side; `end` exclusive. */
export function visibleWindow(scrollTop: number, viewHeight: number, rowHeight: number, count: number, overscan = 8): { start: number; end: number } {
  const first = Math.floor(Math.max(0, scrollTop) / rowHeight);
  const last = Math.ceil((Math.max(0, scrollTop) + Math.max(0, viewHeight)) / rowHeight);
  return { start: Math.max(0, Math.min(count, first - overscan)), end: Math.max(0, Math.min(count, last + overscan)) };
}

/** The scroll position that brings row `index` into view, or null when it is already in view. */
export function revealScrollTop(index: number, scrollTop: number, viewHeight: number, rowHeight: number): number | null {
  const top = index * rowHeight;
  if (top < scrollTop) return top;
  if (top + rowHeight > scrollTop + viewHeight) return Math.max(0, top + rowHeight - viewHeight);
  return null;
}

/** A folder path and the folders it is in, outermost first: what must be open to show what is in it. */
export function folderChain(path: string): string[] {
  const chain: string[] = [];
  for (let at = path; at !== ""; at = parentFolder(at)) chain.unshift(at);
  return chain;
}

/** `name` in folder `parent`, numbered when a folder of that path exists (`New Folder 2`). */
export function freeFolder(parent: string, name: string, taken: (path: string) => boolean): string {
  const base = parent === "" ? name : `${parent}/${name}`;
  if (!taken(base)) return base;
  for (let number = 2; ; number += 1) if (!taken(`${base} ${number}`)) return `${base} ${number}`;
}
