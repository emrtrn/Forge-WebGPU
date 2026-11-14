// The Add Actor menu (INV-A11, plan phase 4 step 5d): Forge WebGL's
// "+ Add Actor" hover menu (EditorUi.ts `buildAddActorMenuMarkup`,
// `bindAddActorEntry`, `renderAddActorSearchResults` @ forge-webgl-final): a
// search row, the categories with their flyouts, flat search results. No
// redesign. A click places (actorPlacer.ts); an entry that is not one per
// level drags into the viewport, which shows it under the pointer and places
// it on the drop. `data-testid="add-shape-cube"` is Forge's.
// Text is set with textContent; the only markup is the kit's static icons.

import { ADD_ACTOR_CATEGORIES } from "../host/featureEditor.ts";
import { ACTOR_TYPE_ICONS, UI_ICONS, type ActorTypeIcon } from "../ui/icons.ts";
import { CLASSES_CATEGORY, type ActorPlacer, type PlacerEntry } from "./actorPlacer.ts";

/** The drag payload's type (the key is kept here too: a drag over cannot read the payload). */
export const ADD_ACTOR_MIME = "application/x-forge-add-actor";

const MENU_CHEVRON =
  '<svg class="menu-chevron" viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4.5L6 7.5 9 4.5"/></svg>';

export interface AddActorMenuOptions {
  readonly document: Document;
  readonly placer: ActorPlacer;
  /** The viewport panel: drags end there. */
  readonly viewport: HTMLElement;
  readonly status: (message: string, tone?: "info" | "warning" | "error") => void;
}

/** Categories in Forge's order, a game's after them, Classes last; only those with entries. */
export function menuCategories(entries: readonly PlacerEntry[]): { label: string; icon: ActorTypeIcon }[] {
  const known: { label: string; icon: ActorTypeIcon }[] = [...ADD_ACTOR_CATEGORIES];
  const used = new Set(entries.map((entry) => entry.category));
  for (const entry of entries) {
    if (entry.category !== CLASSES_CATEGORY && !known.some((category) => category.label === entry.category)) known.push({ label: entry.category, icon: entry.icon });
  }
  known.push({ label: CLASSES_CATEGORY, icon: "gameplay" });
  return known.filter((category) => used.has(category.label));
}

export function createAddActorMenu(options: AddActorMenuOptions): HTMLElement {
  const { document: doc, placer, status } = options;
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text?: string): HTMLElementTagNameMap[K] => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  const menu = el("div", "add-actor-menu");
  const button = el("button", "topbar-menu-button primary");
  button.type = "button";
  button.dataset.testid = "add-actor-button";
  button.setAttribute("aria-label", "Add actor");
  button.append(doc.createTextNode("+ Add Actor"));
  button.insertAdjacentHTML("beforeend", MENU_CHEVRON); // The shell's static SVG.
  button.addEventListener("mousedown", (event) => event.preventDefault());
  const popover = el("div", "add-actor-popover");
  popover.dataset.testid = "add-actor-popover";
  const searchRow = el("div", "add-actor-search-row");
  searchRow.innerHTML = UI_ICONS.search; // The kit's static SVG.
  const search = el("input", "add-actor-search");
  search.type = "text";
  search.placeholder = "Search actors";
  search.setAttribute("aria-label", "Search actors");
  search.dataset.testid = "add-actor-search";
  searchRow.append(search);
  const categories = el("div", "add-actor-categories");
  const results = el("div", "add-actor-results");
  results.hidden = true;
  popover.append(searchRow, categories, results);
  menu.append(button, popover);

  let dragKey: string | null = null;
  // An empty drag image: the preview in the viewport is the feedback (Forge).
  const blank = el("canvas");
  blank.width = 1;
  blank.height = 1;

  const item = (entry: PlacerEntry, showCategory: boolean): HTMLButtonElement => {
    const row = el("button", "add-actor-item");
    row.type = "button";
    row.dataset.addKey = entry.key;
    if (entry.key === "forge.shape:cube" && !showCategory) row.dataset.testid = "add-shape-cube";
    row.innerHTML = ACTOR_TYPE_ICONS[entry.icon]; // The kit's static SVG.
    row.append(el("span", "add-actor-item-label", entry.label));
    if (showCategory) row.append(el("span", "add-actor-item-cat", entry.category));
    row.title = entry.singleton ? "Tıklayınca eklenir (level başına bir)" : "Tıklayınca viewport'un ortasına eklenir; viewport'a sürükleyerek yerleştirin";
    row.addEventListener("click", () => {
      void placer.click(entry.key);
      menu.classList.add("force-closed");
    });
    if (!entry.singleton) {
      row.draggable = true;
      row.addEventListener("dragstart", (event) => {
        dragKey = entry.key;
        event.dataTransfer?.setData(ADD_ACTOR_MIME, entry.key);
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = "copy";
          event.dataTransfer.setDragImage(blank, 0, 0);
        }
        menu.classList.add("force-closed");
        status(`Dragging ${entry.label} - drop in the viewport to place.`);
      });
      row.addEventListener("dragend", () => {
        dragKey = null;
        placer.endDrag();
      });
    }
    return row;
  };

  const draw = (): void => {
    const entries = placer.entries();
    categories.replaceChildren(
      ...menuCategories(entries).map((category) => {
        const box = el("div", "add-actor-category");
        const label = el("button", "add-actor-category-label");
        label.type = "button";
        label.innerHTML = ACTOR_TYPE_ICONS[category.icon]; // The kit's static SVG.
        label.append(el("span", "", category.label));
        const submenu = el("div", "add-actor-submenu");
        submenu.append(...entries.filter((entry) => entry.category === category.label).map((entry) => item(entry, false)));
        box.append(label, submenu);
        return box;
      }),
    );
    const query = search.value.trim().toLowerCase();
    categories.hidden = query !== "";
    results.hidden = query === "";
    if (query === "") {
      results.replaceChildren();
      return;
    }
    const matches = entries.filter((entry) => entry.label.toLowerCase().includes(query) || entry.category.toLowerCase().includes(query));
    results.replaceChildren(...(matches.length === 0 ? [el("div", "add-actor-empty", `“${search.value.trim()}” ile eşleşen aktör yok`)] : matches.map((entry) => item(entry, true))));
  };
  search.addEventListener("input", draw);
  search.addEventListener("keydown", (event) => {
    if (event.key === "Enter") results.querySelector<HTMLButtonElement>(".add-actor-item")?.click();
  });
  // Entering the menu again opens it (a click or a drag closed it); the class list may have grown since.
  menu.addEventListener("pointerenter", () => {
    menu.classList.remove("force-closed");
    draw();
  });
  draw();

  // The viewport takes the drag: preview under the pointer, place on the drop.
  const host = options.viewport;
  host.addEventListener("dragover", (event) => {
    if (dragKey === null || !placer.dragOver(dragKey, event.clientX, event.clientY)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  });
  host.addEventListener("dragleave", (event) => {
    if (dragKey !== null && !host.contains(event.relatedTarget as Node | null)) placer.dragLeave();
  });
  host.addEventListener("drop", (event) => {
    // The payload is readable on the drop (a drag from another window of the page has no `dragKey`).
    const key = dragKey ?? (event.dataTransfer?.getData(ADD_ACTOR_MIME) || null);
    if (key === null) return;
    event.preventDefault();
    dragKey = null;
    placer.drop(key, event.clientX, event.clientY);
  });
  return menu;
}
