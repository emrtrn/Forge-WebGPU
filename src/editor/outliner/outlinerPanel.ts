// The Outliner panel (INV-A12, plan phase 4 step 5a): Forge WebGL's Scene
// Outliner (src/editor/panels/outliner/outlinerPanel.ts and its markup in
// EditorUi.ts @ forge-webgl-final) as a virtualised list. No redesign: the
// search row, the Show types filter, the rows (icon, name, eye, lock), the
// summary and the `data-testid`s are Forge's; the list draws only the rows in
// view (fixed 40 px rows, Forge's height) so 50.000 actors stay fluid
// (`npm run bench:outliner`).
//
// - Rows come from outlinerModel.ts: rebuilt when the level changes or the
//   search / filter / collapse changes, never on a selection change (that
//   repaints the drawn rows only).
// - Click selects, Ctrl + click adds or takes out, Shift + click takes the
//   range from the anchor (Forge). Double click renames (Forge's prompt).
// - Dragging rows onto a row parents them there, keeping their world
//   placement (edit/hierarchy.ts; one undo step).
// - The eye hides the actor in the editor's view (session visibility, not
//   saved); the lock is the actor's Lock Movement (`locked`, one undo step).
// - New against Forge: a row with children has a collapse chevron (groups are
//   parent actors now, phase 4 decision 10).
// Text is set with textContent; the only markup is the kit's static icons.

import { effectiveComponents, type ActorDoc, type ActorId, type ClassResolver, type ComponentMap } from "../../core/index.ts";
import { reparentActors } from "../edit/hierarchy.ts";
import type { ActorPresentation, EditorCatalog } from "../host/editorCatalog.ts";
import { OUTLINER_TYPES, type OutlinerType } from "../host/featureEditor.ts";
import type { EditorSession } from "../session/editorSession.ts";
import { ACTOR_TYPE_ICONS, UI_ICONS } from "../ui/icons.ts";
import { outlinerRows, rangeIds, revealScrollTop, visibleWindow, type OutlinerRow, type OutlinerSource } from "./outlinerModel.ts";

/** Forge's row height (`.outliner-row` min-height). */
export const OUTLINER_ROW_HEIGHT = 40;
/** Indent per depth (Forge: 8 px + 14 px per level). */
const INDENT = 14;

export interface OutlinerPanelOptions {
  readonly document: Document;
  readonly editor: EditorSession;
  readonly catalog: EditorCatalog;
  readonly resolveClass: ClassResolver;
  readonly status: (message: string, tone?: "info" | "warning" | "error") => void;
}

export interface OutlinerPanel {
  /** The pane: search row, list, summary. */
  readonly element: HTMLElement;
}

interface DrawnRow {
  readonly row: HTMLDivElement;
  readonly expander: HTMLButtonElement;
  readonly kind: HTMLSpanElement;
  readonly name: HTMLElement;
  readonly detail: HTMLElement;
  readonly hide: HTMLButtonElement;
  readonly lock: HTMLButtonElement;
}

export function createOutlinerPanel(options: OutlinerPanelOptions): OutlinerPanel {
  const { document: doc, editor, catalog, resolveClass, status } = options;
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text?: string): HTMLElementTagNameMap[K] => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  const element = el("div", "outliner-pane");
  const searchRow = el("div", "outliner-search-row");
  const searchWrap = el("label", "outliner-search-wrap");
  searchWrap.innerHTML = UI_ICONS.search; // The kit's static SVG.
  const search = el("input", "outliner-search");
  search.type = "search";
  search.placeholder = "Search actors...";
  search.setAttribute("aria-label", "Search actors");
  search.dataset.testid = "outliner-search";
  searchWrap.append(search);
  const searchActions = el("div", "outliner-search-actions");
  const filterButton = el("button", "forge-btn-ghost outliner-filter-button");
  filterButton.type = "button";
  filterButton.innerHTML = UI_ICONS.filter; // The kit's static SVG.
  filterButton.setAttribute("aria-label", "Filter scene objects");
  filterButton.setAttribute("aria-expanded", "false");
  filterButton.title = "Sahne nesnelerini filtrele";
  filterButton.dataset.testid = "outliner-filter";
  const popover = el("div", "outliner-filter-popover");
  popover.hidden = true;
  popover.append(el("strong", "", "Show types"));
  const types = new Set<OutlinerType>(OUTLINER_TYPES.map((entry) => entry.type));
  for (const { type, label } of OUTLINER_TYPES) {
    const option = el("label");
    const box = el("input");
    box.type = "checkbox";
    box.checked = true;
    box.dataset.outlinerTypeFilter = type;
    box.addEventListener("change", () => {
      if (box.checked) types.add(type);
      else types.delete(type);
      filterButton.classList.toggle("is-filtered", types.size !== OUTLINER_TYPES.length);
      rebuild();
    });
    option.append(box, doc.createTextNode(label));
    popover.append(option);
  }
  const setPopover = (open: boolean): void => {
    popover.hidden = !open;
    filterButton.setAttribute("aria-expanded", String(open));
  };
  filterButton.addEventListener("click", () => setPopover(popover.hidden));
  doc.addEventListener("pointerdown", (event) => {
    if (popover.hidden) return;
    const target = event.target as Node | null;
    if (target && (popover.contains(target) || filterButton.contains(target))) return;
    setPopover(false);
  });
  searchActions.append(filterButton, popover);
  searchRow.append(searchWrap, searchActions);

  const list = el("div", "outliner-list");
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-multiselectable", "true");
  list.dataset.testid = "outliner-list";
  const sizer = el("div", "outliner-sizer");
  const empty = el("div", "empty-details");
  list.append(sizer, empty);
  const summary = el("div", "outliner-summary");
  summary.dataset.testid = "outliner-summary";
  element.append(searchRow, list, summary);

  // --- Rows -----------------------------------------------------------------
  const collapsed = new Set<ActorId>();
  let filter = "";
  let rows: OutlinerRow[] = [];
  let rowIndex = new Map<ActorId, number>();
  let anchor: ActorId | null = null;
  let stale = true;
  /**
   * Presentation per document, computed once: documents are replaced on edit,
   * so an entry never goes stale. A plain actor's components are read as they
   * are (no copy: 50.000 copies per rebuild cost more than the rows).
   */
  const presented = new WeakMap<ActorDoc, { readonly look: ActorPresentation; readonly empty: boolean }>();
  const groupLook = catalog.present({}, true);
  const presentationOf = (actor: ActorDoc, hasChildren: boolean): ActorPresentation => {
    let cached = presented.get(actor);
    if (!cached) {
      const components: ComponentMap = actor.class === null ? actor.components : effectiveComponents(actor, resolveClass(actor.class));
      cached = { look: catalog.present(components, false), empty: Object.keys(components).length === 0 };
      presented.set(actor, cached);
    }
    return cached.empty && hasChildren ? groupLook : cached.look;
  };
  let parents = new Set<ActorId>();

  function rebuild(): void {
    const started = performance.now();
    const actors = editor.level.level.actors;
    parents = new Set<ActorId>();
    for (const actor of actors) if (actor.parent !== null) parents.add(actor.parent);
    const items: OutlinerSource[] = actors.map((actor) => ({ id: actor.id, parent: actor.parent, name: actor.name, type: presentationOf(actor, parents.has(actor.id)).type }));
    rows = outlinerRows(items, { filter, types, collapsed });
    rowIndex = new Map(rows.map((row, index) => [row.id, index]));
    sizer.style.height = `${rows.length * OUTLINER_ROW_HEIGHT}px`;
    empty.hidden = rows.length > 0;
    empty.replaceChildren(el("strong", "", actors.length === 0 ? "No objects" : "No matches"), el("span", "", "Scene"));
    stale = false;
    paint();
    // The last rebuild's cost (rows + paint), read by `npm run bench:outliner`; one value, nothing accumulates.
    list.dataset.rebuildMs = (performance.now() - started).toFixed(3);
  }

  const pool: DrawnRow[] = [];
  const makeRow = (): DrawnRow => {
    const row = el("div", "outliner-row");
    row.dataset.testid = "outliner-row";
    row.setAttribute("role", "option");
    row.draggable = true;
    const expander = el("button", "outliner-expander");
    expander.type = "button";
    expander.dataset.action = "expand";
    expander.dataset.testid = "outliner-expander";
    expander.tabIndex = -1;
    const kind = el("span", "outliner-kind");
    kind.setAttribute("aria-hidden", "true");
    const meta = el("span", "outliner-meta");
    const name = el("strong");
    const detail = el("small");
    meta.append(name, detail);
    const actions = el("span", "outliner-actions");
    const toggle = (action: string, testId: string): HTMLButtonElement => {
      const button = el("button", "outliner-toggle");
      button.type = "button";
      button.dataset.action = action;
      button.dataset.testid = testId;
      button.tabIndex = -1;
      return button;
    };
    const hide = toggle("hidden", "outliner-hide");
    const lock = toggle("locked", "outliner-lock");
    actions.append(hide, lock);
    row.append(expander, kind, meta, actions);
    sizer.append(row);
    return { row, expander, kind, name, detail, hide, lock };
  };

  const position = (actor: ActorDoc): string => actor.transform.p.map((value) => Number(value.toFixed(2))).join(", ");

  /** Draws the rows in view; reuses the row elements. */
  function paint(): void {
    if (stale) {
      rebuild();
      return;
    }
    const started = performance.now();
    const window = visibleWindow(list.scrollTop, list.clientHeight || 600, OUTLINER_ROW_HEIGHT, rows.length);
    const count = window.end - window.start;
    while (pool.length < count) pool.push(makeRow());
    // Only drawn rows are in the DOM (a row count reads what is in view).
    for (const spare of pool.splice(count)) spare.row.remove();
    for (let slot = 0; slot < pool.length; slot += 1) {
      const drawn = pool[slot]!;
      const index = window.start + slot;
      const entry = rows[index];
      const actor = entry ? editor.level.actor(entry.id) : undefined;
      if (!entry || !actor) {
        drawn.row.hidden = true;
        continue;
      }
      const { row } = drawn;
      row.hidden = false;
      row.style.top = `${index * OUTLINER_ROW_HEIGHT}px`;
      row.style.paddingLeft = `${8 + entry.depth * INDENT}px`;
      row.dataset.actorId = actor.id;
      row.dataset.index = String(index);
      const selected = editor.selection.has(actor.id);
      row.classList.toggle("active", selected);
      row.setAttribute("aria-selected", String(selected));
      row.classList.remove("drop-target", "is-dragging");
      const hidden = editor.visibility.hidden(actor.id);
      row.classList.toggle("is-hidden", hidden);
      const look = presentationOf(actor, parents.has(actor.id));
      row.dataset.outlinerType = look.type;
      if (drawn.kind.dataset.icon !== look.icon) {
        drawn.kind.dataset.icon = look.icon;
        drawn.kind.innerHTML = ACTOR_TYPE_ICONS[look.icon]; // The kit's static SVG.
      }
      drawn.name.textContent = actor.name || actor.id;
      drawn.name.title = actor.id;
      drawn.detail.textContent = `${look.kind} - ${position(actor)}`;
      drawn.expander.style.visibility = entry.hasChildren ? "visible" : "hidden";
      drawn.expander.setAttribute("aria-label", entry.expanded ? "Collapse" : "Expand");
      drawn.expander.setAttribute("aria-expanded", String(entry.expanded));
      const chevron = entry.expanded ? "down" : "right";
      if (drawn.expander.dataset.chevron !== chevron) {
        drawn.expander.dataset.chevron = chevron;
        drawn.expander.innerHTML = entry.expanded ? UI_ICONS.chevronDown : UI_ICONS.chevronRight; // The kit's static SVG.
      }
      const ownHidden = editor.visibility.has(actor.id);
      setToggle(drawn.hide, ownHidden, ownHidden ? UI_ICONS.eyeOff : UI_ICONS.eye, ownHidden ? "Show object" : "Hide object");
      const locked = actor.locked === true;
      setToggle(drawn.lock, locked, locked ? UI_ICONS.lock : UI_ICONS.unlock, locked ? "Unlock object" : "Lock object");
    }
    const total = editor.level.level.actors.length;
    summary.textContent = `${total} actors (${editor.selection.ids().length} selected)`;
    list.dataset.paintMs = (performance.now() - started).toFixed(3);
  }

  const setToggle = (button: HTMLButtonElement, on: boolean, icon: string, label: string): void => {
    if (button.dataset.on !== String(on)) {
      button.dataset.on = String(on);
      button.innerHTML = icon; // The kit's static SVG.
    }
    button.classList.toggle("on", on);
    button.title = label;
    button.setAttribute("aria-label", label);
  };

  // --- Interaction ------------------------------------------------------------
  const rowOf = (target: EventTarget | null): { row: HTMLElement; id: ActorId } | null => {
    const row = (target as HTMLElement | null)?.closest?.<HTMLElement>(".outliner-row");
    const id = row?.dataset.actorId as ActorId | undefined;
    return row && id ? { row, id } : null;
  };

  const setLocked = (id: ActorId, locked: boolean): void => {
    const actor = editor.level.actor(id);
    if (!actor) return;
    const next: ActorDoc = { ...actor };
    if (locked) next.locked = true;
    else delete next.locked;
    const result = editor.edit(`${locked ? "Lock" : "Unlock"} ${actor.name || actor.id}`, (tx) => tx.setActor(next));
    if (!result.ok) status(result.issues.map((issue) => issue.message).join("; "), "error");
  };

  list.addEventListener("click", (event) => {
    const hit = rowOf(event.target);
    if (!hit) return;
    const action = (event.target as HTMLElement).closest<HTMLElement>("[data-action]")?.dataset.action;
    if (action === "expand") {
      if (collapsed.has(hit.id)) collapsed.delete(hit.id);
      else collapsed.add(hit.id);
      rebuild();
      return;
    }
    if (action === "hidden") {
      editor.visibility.set([hit.id], !editor.visibility.has(hit.id));
      return;
    }
    if (action === "locked") {
      setLocked(hit.id, editor.level.actor(hit.id)?.locked !== true);
      return;
    }
    const additive = event.ctrlKey || event.metaKey;
    if (event.shiftKey) {
      const from = anchor ?? editor.selection.primary();
      const range = rangeIds(rows, from, hit.id);
      editor.selection.set(additive ? [...editor.selection.ids(), ...range] : range);
      return;
    }
    anchor = hit.id;
    if (additive) editor.selection.toggle(hit.id);
    else editor.selection.set([hit.id]);
  });

  list.addEventListener("dblclick", (event) => {
    const hit = rowOf(event.target);
    if (!hit || (event.target as HTMLElement).closest("[data-action]")) return;
    const actor = editor.level.actor(hit.id);
    if (!actor) return;
    const next = doc.defaultView?.prompt("Rename object", actor.name);
    if (next === null || next === undefined || next === actor.name) return;
    const result = editor.edit(`Rename ${actor.name || actor.id}`, (tx) => tx.setActor({ ...actor, name: next }));
    if (!result.ok) status(result.issues.map((issue) => issue.message).join("; "), "error");
  });

  // Drag rows onto a row: parent them there (Forge). The whole selection goes when the dragged row is part of it.
  let dragIds: ActorId[] = [];
  list.addEventListener("dragstart", (event) => {
    const hit = rowOf(event.target);
    if (!hit) return;
    const selected = editor.selection.ids();
    dragIds = selected.includes(hit.id) && selected.length > 1 ? [...selected] : [hit.id];
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", dragIds.join(","));
    }
    hit.row.classList.add("is-dragging");
  });
  list.addEventListener("dragend", () => {
    dragIds = [];
    for (const drawn of pool) drawn.row.classList.remove("is-dragging", "drop-target");
  });
  list.addEventListener("dragover", (event) => {
    const hit = rowOf(event.target);
    if (!hit || dragIds.length === 0 || dragIds.includes(hit.id)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    for (const drawn of pool) drawn.row.classList.toggle("drop-target", drawn.row === hit.row);
  });
  list.addEventListener("dragleave", (event) => {
    rowOf(event.target)?.row.classList.remove("drop-target");
  });
  list.addEventListener("drop", (event) => {
    const hit = rowOf(event.target);
    const moving = dragIds.filter((id) => id !== hit?.id);
    dragIds = [];
    if (!hit || moving.length === 0) return;
    event.preventDefault();
    const parent = editor.level.actor(hit.id);
    const result = reparentActors((id) => editor.level.actor(id), moving, hit.id);
    if (result.refused.length > 0) status("An actor cannot go under itself or its own child.", "warning");
    if (result.docs.length === 0 || !parent) {
      paint();
      return;
    }
    const label = result.docs.length === 1 ? `Parent ${result.docs[0]!.name} to ${parent.name}` : `Parent ${result.docs.length} actors to ${parent.name}`;
    const edit = editor.edit(label, (tx) => {
      for (const next of result.docs) tx.setActor(next);
    });
    if (!edit.ok) status(edit.issues.map((issue) => issue.message).join("; "), "error");
  });

  search.addEventListener("input", () => {
    filter = search.value.trim().toLocaleLowerCase();
    list.scrollTop = 0;
    rebuild();
  });

  let frame = 0;
  list.addEventListener("scroll", () => {
    if (frame) return;
    frame = doc.defaultView?.requestAnimationFrame(() => {
      frame = 0;
      paint();
    }) ?? 0;
    if (!frame) paint();
  });
  doc.defaultView?.addEventListener("resize", () => paint());

  // An edit, undo or redo changes the rows; a selection or visibility change only the drawn ones.
  editor.level.onApplied(() => {
    stale = true;
    paint();
  });
  let primary: ActorId | null = null;
  editor.onChange(() => {
    paint();
    const next = editor.selection.primary();
    if (next === primary) return;
    primary = next;
    // Reveal a selection made elsewhere (the viewport); a row clicked here is already in view.
    const index = next === null ? undefined : rowIndex.get(next);
    if (index === undefined) return;
    const top = revealScrollTop(index, list.scrollTop, list.clientHeight, OUTLINER_ROW_HEIGHT);
    if (top !== null) {
      list.scrollTop = top;
      paint();
    }
  });
  rebuild();

  return { element };
}
