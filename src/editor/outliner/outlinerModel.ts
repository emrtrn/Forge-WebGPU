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
// - A search (Forge: the name starts with the text, any case) lists the
//   matches flat, at depth 0.
// - Everything is linear in the actor count: the panel recomputes the rows on
//   an edit, never on a selection change (50.000 actors, plan phase 4 gate).

import type { ActorId } from "../../core/index.ts";
import type { OutlinerType } from "../host/featureEditor.ts";

export interface OutlinerSource {
  readonly id: ActorId;
  readonly parent: ActorId | null;
  readonly name: string;
  readonly type: OutlinerType;
}

export interface OutlinerQuery {
  /** Search text; empty for the tree. */
  readonly filter: string;
  /** Type groups shown (Forge's Show types). */
  readonly types: ReadonlySet<OutlinerType>;
  readonly collapsed: ReadonlySet<ActorId>;
}

export interface OutlinerRow {
  readonly id: ActorId;
  readonly depth: number;
  readonly hasChildren: boolean;
  readonly expanded: boolean;
}

export function outlinerRows(items: readonly OutlinerSource[], query: OutlinerQuery): OutlinerRow[] {
  const shown = items.filter((item) => query.types.has(item.type));
  const filter = query.filter.trim().toLocaleLowerCase();
  if (filter !== "") {
    return shown.filter((item) => item.name.toLocaleLowerCase().startsWith(filter)).map((item) => ({ id: item.id, depth: 0, hasChildren: false, expanded: false }));
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
  const walk = (root: OutlinerSource): void => {
    // Iterative: a deep chain must not overflow the stack.
    const stack: (readonly [OutlinerSource, number])[] = [[root, 0]];
    while (stack.length > 0) {
      const [item, depth] = stack.pop()!;
      if (visited.has(item.id)) continue;
      visited.add(item.id);
      const kids = children.get(item.id);
      const expanded = !query.collapsed.has(item.id);
      rows.push({ id: item.id, depth, hasChildren: kids !== undefined, expanded });
      if (!kids) continue;
      if (!expanded) {
        hide(kids);
        continue;
      }
      for (let index = kids.length - 1; index >= 0; index -= 1) stack.push([kids[index]!, depth + 1]);
    }
  };
  for (const item of shown) if (item.parent === null || !included.has(item.parent)) walk(item);
  // A cycle has no root; it cannot come out of a normalised level, but never drop an actor.
  for (const item of shown) if (!visited.has(item.id)) walk(item);
  return rows;
}

/** The ids from the anchor's row to the target's, inclusive (Shift + click); just the target without an anchor row. */
export function rangeIds(rows: readonly OutlinerRow[], anchor: ActorId | null, target: ActorId): ActorId[] {
  const to = rows.findIndex((row) => row.id === target);
  const from = anchor === null ? -1 : rows.findIndex((row) => row.id === anchor);
  if (to < 0) return [target];
  if (from < 0) return [target];
  return rows.slice(Math.min(from, to), Math.max(from, to) + 1).map((row) => row.id);
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
