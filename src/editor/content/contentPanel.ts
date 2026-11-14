// The Content Browser (plan phase 4 step 6a; INV-A23): Forge WebGL's Content
// Drawer (EditorUi.ts drawer markup and handlers, panels/content/
// contentPanel.ts cards, editorUi.css `content-*` @ forge-webgl-final), no
// redesign. A strip under the viewport opens upwards (Ctrl + Space, its
// title); open, it has Add / Import / Save All, Back / Forward, the
// breadcrumb, search with the type filter, the thumbnail size and the
// settings menu (Lock Drawer Open, Tall Height, Refresh); below, the folder
// tree (Favorites, then a node per content root) and the open folder's cards.
// An outside click closes it unless it is locked (Forge).
//
// The file operations (Rename, Cut / Copy / Paste, Delete; step 6c) are
// contentActions.ts: the cards', rows' and empty space's menus and the
// drawer's keys while it has the focus.
//
// Forge's selectors are kept: `data-content-*` attributes, `.folder-row`
// with the folder's path as its title, cards with `data-asset-path` /
// `data-asset-id` / `data-folder-path`, `.content-breadcrumb`.
// The open folder, the favourites, the size and the drawer's height and lock
// are the page's, per project (localStorage), like Forge's last folder.
// Text is set with textContent; the only markup is the kit's static icons.

import { UI_ICONS } from "../ui/icons.ts";
import { openPicker } from "../details/pickerPopover.ts";
import { openContextMenu, type ContextMenuItem } from "../ui/contextMenu.ts";
import { createContentGrid, type ContentViewSize } from "./contentGrid.ts";
import {
  CONTENT_FILTER_ALL,
  contentTypeLabel,
  contentTypePlural,
  folderItems,
  folderTrail,
  FolderHistory,
  treeChildren,
  type ContentAssetItem,
  type ContentFolderNode,
  type ContentIndex,
  type ContentItem,
} from "./contentModel.ts";
import { createContentActions, targetOfAsset, targetOfFolder, type ContentTarget } from "./contentActions.ts";
import { CONTENT_ASSET_MIME, type AssetDrop } from "./assetDrop.ts";
import type { NewAssetItem } from "./newAssets.ts";
import type { ContentStore } from "./contentStore.ts";
import { thumbnailKind, type ContentThumbnails } from "./contentThumbnails.ts";

export interface ContentPanelOptions {
  readonly document: Document;
  /** The editor shell's root: `content-drawer-open` / `content-drawer-tall` go on it (Forge). */
  readonly shell: HTMLElement;
  readonly store: ContentStore;
  readonly storage: Storage | null;
  /** The page's remembered state is per project. */
  readonly projectKey: string;
  /** The open level's folder (`content/levels/L03`): its card is the Active one. */
  readonly activeLevel: string;
  readonly status: (message: string, tone?: "info" | "warning" | "error") => void;
  /** Save All (the level). */
  readonly save: () => void;
  /** Card images (step 6b); without them cards show their type's text. */
  readonly thumbnails?: ContentThumbnails;
  /** Names of the open level's actors that use any of these asset GUIDs (a delete is refused then). */
  readonly inUse?: (ids: readonly string[]) => readonly string[];
  /** The New menu (step 6d) and a new level's actors. */
  readonly newItems?: readonly NewAssetItem[];
  readonly levelActors?: () => readonly unknown[];
  /** Cards dragged into the viewport (step 6f). */
  readonly drag?: AssetDrop;
  /** Opens a level in the editor (step 6f: a Level card's double click, Open Level…). */
  readonly openLevel?: (folder: string, name: string) => void;
  /** Schema-driven asset editor (phase 4 step 7). False leaves a non-editable file alone. */
  readonly canOpenAsset?: (item: ContentAssetItem) => boolean;
  readonly openAsset?: (item: ContentAssetItem) => void;
  /** Import (step 6e): the extensions it takes, and what follows a reimport. */
  readonly importExtensions?: readonly string[];
  readonly reimported?: (item: ContentAssetItem) => void;
}

export interface ContentPanel {
  readonly element: HTMLElement;
  /** Open Level… (step 6f): every level of the project and the packs in a searchable list. */
  openLevelDialog(): void;
  /** Shows the first of these GUIDs the browser has (Ctrl + B, Details' Browse To); false when none. */
  revealAsset(guids: readonly string[]): boolean;
  isOpen(): boolean;
  setOpen(open: boolean): void;
  /** Opens the drawer at the asset's folder, selects its card and flashes it (Forge's revealContentAsset). */
  reveal(file: string): void;
  /** The selected asset card's item, if any. */
  selected(): ContentAssetItem | null;
}

interface DrawerState {
  folder?: string;
  favorites?: string[];
  view?: ContentViewSize;
  tall?: boolean;
  locked?: boolean;
}

const STORAGE_PREFIX = "forge.contentDrawer:";
const VIEW_SIZES: readonly ContentViewSize[] = ["small", "medium", "large"];

function readState(storage: Storage | null, key: string): DrawerState {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(STORAGE_PREFIX + key) ?? "{}");
    return parsed !== null && typeof parsed === "object" ? (parsed as DrawerState) : {};
  } catch {
    return {};
  }
}

function writeState(storage: Storage | null, key: string, state: DrawerState): void {
  try {
    storage?.setItem(STORAGE_PREFIX + key, JSON.stringify(state));
  } catch {
    // Persistence is an enhancement (Forge).
  }
}

/** The card's tooltip: the whole name, the file when it differs, a line per issue (Forge's contentCardTooltip). */
function cardTooltip(item: ContentAssetItem): string {
  const file = item.file.slice(item.file.lastIndexOf("/") + 1);
  return [item.name, ...(file !== item.name ? [file] : []), ...item.issues.map((issue) => `⚠ ${issue.message}`)].join("\n");
}

export function createContentPanel(options: ContentPanelOptions): ContentPanel {
  const doc = options.document;
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text?: string): HTMLElementTagNameMap[K] => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const button = (className: string, label: string, icon?: string, text?: string): HTMLButtonElement => {
    const node = el("button", className);
    node.type = "button";
    if (icon) node.innerHTML = icon; // The kit's static SVG.
    if (text !== undefined) node.append(el("span", "", text));
    node.setAttribute("aria-label", label);
    node.title = label;
    return node;
  };

  const saved = readState(options.storage, options.projectKey);
  let index: ContentIndex = options.store.index();
  const firstRoot = (): string => index.roots[0]?.label ?? "";
  let folder = saved.folder && index.folder(saved.folder) ? saved.folder : firstRoot();
  const history = new FolderHistory(folder);
  const favorites = new Set((saved.favorites ?? []).filter((path) => typeof path === "string"));
  let view: ContentViewSize = VIEW_SIZES.includes(saved.view as ContentViewSize) ? saved.view! : "medium";
  let tall = saved.tall === true;
  let locked = saved.locked === true;
  let open = false;
  let typeFilter = CONTENT_FILTER_ALL;
  let search = "";
  /** Engine content and packs start folded. */
  const collapsed = new Set(index.roots.filter((root) => !root.writable).map((root) => root.label));
  let selectedFile: string | null = null;
  let selectedFolder: string | null = null;
  let items: ContentItem[] = [];

  const persist = (): void => writeState(options.storage, options.projectKey, { folder, favorites: [...favorites], view, tall, locked });

  // ---- markup (Forge's drawer) ----
  const drawer = el("section", "editor-content-drawer");
  drawer.dataset.contentDrawer = "";
  drawer.dataset.testid = "content-drawer";
  drawer.setAttribute("aria-hidden", "true");
  const top = el("div", "content-drawer-top");
  const title = el("div", "content-drawer-title");
  const toggle = el("button", "content-drawer-collapse");
  toggle.type = "button";
  toggle.dataset.contentToggle = "";
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-label", "Toggle Content Drawer");
  toggle.title = "Content Drawer'ı aç/kapat (Ctrl+Space)";
  const chevron = el("span", "content-drawer-chevron");
  chevron.innerHTML = UI_ICONS.chevronUp;
  chevron.setAttribute("aria-hidden", "true");
  toggle.append(chevron, el("strong", "", "CONTENT DRAWER"));
  title.append(toggle);

  const primary = el("div", "content-primary-actions");
  const add = button("forge-btn-primary", "Add", UI_ICONS.add, "Add");
  add.dataset.contentAdd = "";
  const importButton = button("forge-btn-ghost", "Import", UI_ICONS.import, "Import");
  importButton.dataset.contentImport = "";
  const saveAll = el("button", "forge-btn-ghost", "Save All");
  saveAll.type = "button";
  saveAll.dataset.contentSaveAll = "";
  saveAll.addEventListener("click", () => options.save());
  primary.append(add, importButton, saveAll);

  const navigation = el("div", "content-navigation");
  navigation.setAttribute("aria-label", "Folder navigation");
  const back = button("forge-btn-ghost", "Back", UI_ICONS.arrowLeft);
  back.dataset.contentBack = "";
  const forward = button("forge-btn-ghost", "Forward", UI_ICONS.arrowRight);
  forward.dataset.contentForward = "";
  navigation.append(back, forward);

  const crumbs = el("nav", "content-breadcrumbs");
  crumbs.setAttribute("aria-label", "Current folder");
  const crumbsIcon = el("span", "content-breadcrumbs-icon");
  crumbsIcon.innerHTML = UI_ICONS.folder;
  crumbsIcon.setAttribute("aria-hidden", "true");
  const path = el("div", "content-path");
  path.dataset.contentPath = "";
  crumbs.append(crumbsIcon, path);

  const searchWrap = el("div", "content-search-wrap");
  const searchInput = el("input", "content-search");
  searchInput.type = "search";
  searchInput.placeholder = "Search assets";
  searchInput.dataset.contentSearch = "";
  searchInput.setAttribute("aria-label", "Search assets");
  const filterButton = button("forge-btn-ghost content-filter-button", "Filter assets", UI_ICONS.filter);
  filterButton.dataset.contentFilterButton = "";
  filterButton.setAttribute("aria-expanded", "false");
  const filterPopover = el("div", "content-filter-popover");
  filterPopover.hidden = true;
  const filterLabel = el("label", "", "Asset type");
  const filterSelect = el("select", "content-filter");
  filterSelect.dataset.contentTypeFilter = "";
  filterSelect.setAttribute("aria-label", "Asset type");
  filterLabel.append(filterSelect);
  filterPopover.append(filterLabel);
  searchWrap.append(searchInput, filterButton, filterPopover);

  const drawerActions = el("div", "content-drawer-actions");
  const viewButton = button("forge-btn-ghost", "Change thumbnail size", UI_ICONS.grid);
  viewButton.dataset.contentView = "";
  const settings = button("forge-btn-ghost", "Content Drawer settings", UI_ICONS.gear);
  settings.dataset.contentSettings = "";
  drawerActions.append(viewButton, settings);
  top.append(title, primary, navigation, crumbs, searchWrap, drawerActions);

  const body = el("div", "content-drawer-body");
  const tree = el("nav", "folder-tree");
  tree.dataset.folderTree = "";
  tree.setAttribute("aria-label", "Asset folders");
  const assets = el("section", "content-assets");
  const head = el("div", "content-assets-head");
  const count = el("span", "content-item-count", "0 items");
  count.dataset.contentItemCount = "";
  head.append(count);
  const list = el("div", "content-list");
  list.dataset.contentList = "";
  assets.append(head, list);
  body.append(tree, assets);
  drawer.append(top, body);

  // ---- cards ----
  const actions = createContentActions({
    document: doc,
    store: options.store,
    host: drawer,
    activeLevel: options.activeLevel,
    ...(options.inUse ? { inUse: options.inUse } : {}),
    ...(options.newItems ? { newItems: options.newItems } : {}),
    ...(options.levelActors ? { levelActors: options.levelActors } : {}),
    ...(options.importExtensions ? { importExtensions: options.importExtensions } : {}),
    ...(options.reimported ? { reimported: options.reimported } : {}),
    storage: options.storage,
    status: options.status,
    done: (paths) => {
      const first = paths[0];
      if (first === undefined) {
        redrawKeepingFocus();
        return;
      }
      showPath(first);
    },
    reveal: (path) => showPath(path),
  });
  /** Navigates to a path's folder and selects its card (a file, a level's folder or a folder). */
  const showPath = (target: string): void => {
    const asset = index.byFile(target) ?? index.assets.find((one) => one.levelFolder === target);
    if (asset) {
      api.reveal(asset.file);
      return;
    }
    const node = index.folder(target);
    if (!node) return;
    navigate(node.parent ?? node.path);
    selectedFolder = node.path;
    selectedFile = null;
    grid.draw();
  };
  const menuAt = (event: MouseEvent, entries: readonly ContextMenuItem[], testId: string): void => {
    event.preventDefault();
    event.stopPropagation();
    openContextMenu(doc, { x: event.clientX, y: event.clientY }, entries, testId);
  };
  const folderMenu = (event: MouseEvent, node: ContentFolderNode): void =>
    menuAt(
      event,
      [
        { label: "Open", run: () => navigate(node.path), testId: "content-menu-open" },
        {
          label: favorites.has(node.path) ? "Remove from Favorites" : "Add to Favorites",
          run: () => {
            if (favorites.has(node.path)) favorites.delete(node.path);
            else favorites.add(node.path);
            persist();
            renderTree();
          },
          testId: "content-menu-favorite",
        },
        { separator: true },
        ...actions.folderMenu(node),
      ],
      "content-folder-menu",
    );
  const assetMenu = (event: MouseEvent, item: ContentAssetItem): void =>
    menuAt(
      event,
      [
        ...(item.levelFolder !== null ? levelMenu(item) : []),
        ...(options.canOpenAsset?.(item) ? [{ label: "Open", run: () => options.openAsset?.(item), testId: "content-menu-open-asset" }, { separator: true as const }] : []),
        ...(options.thumbnails && thumbnailKind(item) !== null
          ? [{ label: "Refresh Thumbnail", run: () => options.thumbnails!.refresh(item), testId: "content-menu-refresh-thumbnail" }, { separator: true as const }]
          : []),
        ...actions.assetMenu(item, folder),
      ],
      "content-asset-menu",
    );

  /** A Level card's own items (Forge: Set Default Level, here Open Level and Set as Start Level). */
  const levelMenu = (item: ContentAssetItem): ContextMenuItem[] => {
    const folder = item.levelFolder!;
    const start = folder === index.startLevel;
    return [
      { label: "Open Level", enabled: folder !== options.activeLevel && options.openLevel !== undefined, run: () => options.openLevel?.(folder, item.name), testId: "content-menu-open-level" },
      start
        ? { label: "✓ Start Level", enabled: false, run: () => {}, testId: "content-menu-start-level" }
        : {
            label: "Set as Start Level",
            enabled: item.writable && !folder.startsWith("engine:"),
            run: () =>
              void options.store.op({ op: "startLevel", level: folder }).then((answer) =>
                options.status(answer.status === "done" ? `${item.name} is the start level.` : answer.message, answer.status === "done" ? "info" : "error"),
              ),
            testId: "content-menu-start-level",
          },
      { separator: true },
    ];
  };

  const describe = (item: ContentAssetItem): void => {
    const prefix = `${item.name} · ${contentTypeLabel(item.type)}`;
    if (item.issues.length === 0) options.status(`${prefix} · No issues`);
    else options.status(`${prefix} · ${item.issues.map((issue) => issue.message).join("; ")}`, "warning");
  };

  const assetCard = (item: ContentAssetItem): HTMLElement => {
    const card = el("button", "asset-card");
    card.type = "button";
    const active = item.levelFolder !== null && item.levelFolder === options.activeLevel;
    card.classList.toggle("is-unregistered", item.id === null);
    card.classList.toggle("has-issues", item.issues.length > 0);
    card.classList.toggle("is-active-level", active);
    card.classList.toggle("is-selected", item.file === selectedFile);
    card.classList.toggle("is-actor-script", item.type === "forge.actorClass");
    card.classList.toggle("is-cut", actions.isCut(item.levelFolder ?? item.file));
    card.dataset.assetPath = item.levelFolder ?? item.file;
    card.dataset.testid = "content-card";
    if (item.id !== null) card.dataset.assetId = item.id;
    if (item.type !== null) card.dataset.assetType = item.type;
    card.title = cardTooltip(item);
    if (item.issues.length > 0) {
      const dot = el("span", "asset-issue-dot");
      const text = item.issues.map((issue) => issue.message).join("; ");
      dot.title = text;
      dot.setAttribute("aria-label", text);
      card.append(dot);
    }
    if (active) {
      const badge = el("span", "asset-active-badge", "Active");
      badge.title = "Açık level";
      card.append(badge);
    }
    const thumb = el("span", "asset-thumb", item.type === "forge.actorClass" ? "BP" : item.ext);
    thumb.dataset.assetThumb = "";
    options.thumbnails?.attach(item, thumb);
    const meta = el("span", "asset-meta");
    meta.append(el("strong", "", item.name), el("span", "asset-type-line", contentTypeLabel(item.type)));
    card.append(thumb, meta);
    card.addEventListener("click", () => {
      selectedFile = item.file;
      selectedFolder = null;
      describe(item);
      redrawKeepingFocus();
    });
    if (item.levelFolder !== null) {
      card.classList.toggle("is-start-level", item.levelFolder === index.startLevel);
      if (item.levelFolder === index.startLevel) card.title = `${card.title}\nStart level`;
      if (item.levelFolder !== options.activeLevel) {
        card.addEventListener("dblclick", (event) => {
          event.preventDefault();
          options.openLevel?.(item.levelFolder!, item.name);
        });
      }
    }
    else if (options.canOpenAsset?.(item)) card.addEventListener("dblclick", (event) => { event.preventDefault(); options.openAsset?.(item); });
    if (options.drag?.draggable(item)) {
      card.draggable = true;
      card.addEventListener("dragstart", (event) => {
        event.dataTransfer?.setData(CONTENT_ASSET_MIME, item.id ?? "");
        if (event.dataTransfer) event.dataTransfer.effectAllowed = "copy";
        selectedFile = item.file;
        options.drag!.begin(item);
      });
      // Forge's handleAssetDragEnd: the drag ends the preview and closes the drawer unless it is locked.
      card.addEventListener("dragend", () => {
        options.drag!.end();
        if (!locked) setOpen(false);
      });
    }
    card.addEventListener("contextmenu", (event) => {
      selectedFile = item.file;
      selectedFolder = null;
      grid.draw();
      assetMenu(event, item);
    });
    return card;
  };

  const folderCard = (node: ContentFolderNode): HTMLElement => {
    const card = el("button", "asset-card is-folder");
    card.type = "button";
    card.classList.toggle("is-selected", node.path === selectedFolder);
    card.classList.toggle("is-cut", actions.isCut(node.path));
    card.dataset.folderPath = node.path;
    card.dataset.testid = "content-folder-card";
    card.title = `${node.name}\n${node.path}`;
    const thumb = el("span", "asset-thumb folder-thumb");
    thumb.setAttribute("aria-hidden", "true");
    thumb.append(el("span", "folder-glyph"));
    const meta = el("span", "asset-meta");
    meta.append(el("strong", "", node.name), el("span", "asset-type-line", "Folder"));
    card.append(thumb, meta);
    card.addEventListener("click", () => {
      selectedFolder = node.path;
      selectedFile = null;
      options.status(`${node.name} - Folder`);
      redrawKeepingFocus();
    });
    card.addEventListener("dblclick", (event) => {
      event.preventDefault();
      navigate(node.path);
    });
    card.addEventListener("contextmenu", (event) => {
      selectedFolder = node.path;
      selectedFile = null;
      grid.draw();
      folderMenu(event, node);
    });
    return card;
  };

  /** Draws the cards again and gives the focus back to the selected one (the drawer's keys need it). */
  const redrawKeepingFocus = (): void => {
    grid.draw();
    list.querySelector<HTMLElement>(".asset-card.is-selected")?.focus();
  };
  const grid = createContentGrid<ContentItem>({
    document: doc,
    list,
    card: (item) => (item.kind === "folder" ? folderCard(item.folder) : assetCard(item)),
    drawn: (shown) => options.thumbnails?.retain(shown.filter((item): item is ContentAssetItem => item.kind === "asset")),
  });

  // ---- tree ----
  const folderRow = (node: ContentFolderNode, depth: number): HTMLElement => {
    const wrapper = el("div", "folder-node");
    const children = treeChildren(index, node.path);
    const hasChildren = children.length > 0;
    const isCollapsed = hasChildren && collapsed.has(node.path);
    const row = el("button", "folder-row");
    row.type = "button";
    row.classList.toggle("has-children", hasChildren);
    row.classList.toggle("active", node.path === folder);
    row.classList.toggle("is-read-only", !node.writable);
    row.style.setProperty("--depth", String(depth));
    row.title = node.path;
    row.dataset.testid = "content-folder-row";
    if (hasChildren) row.setAttribute("aria-expanded", String(!isCollapsed));
    row.append(el("span", "folder-caret", hasChildren ? (isCollapsed ? ">" : "v") : ""), el("span", "folder-row-icon"), el("span", "folder-name", node.name));
    if (node.parent === null && !node.writable) {
      const lock = el("span", "folder-lock");
      lock.innerHTML = UI_ICONS.lock;
      lock.title = "Salt okunur (motor içeriği / paket)";
      row.append(lock);
    }
    row.addEventListener("click", () => {
      if (hasChildren && node.path === folder) {
        if (isCollapsed) collapsed.delete(node.path);
        else collapsed.add(node.path);
      } else if (hasChildren) collapsed.delete(node.path);
      navigate(node.path);
    });
    row.addEventListener("contextmenu", (event) => folderMenu(event, node));
    wrapper.append(row);
    if (!isCollapsed) for (const child of children) wrapper.append(folderRow(child, depth + 1));
    return wrapper;
  };

  const renderTree = (): void => {
    const nodes: Node[] = [];
    const favoriteNodes = [...favorites].map((path) => index.folder(path)).filter((node): node is ContentFolderNode => node !== undefined);
    if (favoriteNodes.length > 0) {
      const heading = el("div", "folder-section-heading");
      heading.innerHTML = UI_ICONS.star; // The kit's static SVG.
      heading.append(el("span", "", "Favorites"));
      nodes.push(heading);
      for (const node of favoriteNodes) {
        const row = el("button", "folder-row folder-row-favorite");
        row.type = "button";
        row.classList.toggle("active", node.path === folder);
        row.title = node.path;
        row.append(el("span", "folder-caret"), el("span", "folder-row-icon"), el("span", "folder-name", node.name));
        row.addEventListener("click", () => navigate(node.path));
        row.addEventListener("contextmenu", (event) => folderMenu(event, node));
        nodes.push(row);
      }
    }
    for (const root of index.roots) {
      const node = index.folder(root.label);
      if (node) nodes.push(folderRow(node, 0));
    }
    if (nodes.length === 0) nodes.push(el("div", "empty-details", "Asset klasörü yok"));
    tree.replaceChildren(...nodes);
  };

  // ---- the open folder ----
  const renderCrumbs = (): void => {
    const trail = folderTrail(index, folder);
    const parts: Node[] = [];
    const crumb = (label: string, target: string): void => {
      if (parts.length > 0) parts.push(el("span", "content-breadcrumb-separator", ">"));
      const node = el("button", "content-breadcrumb", label);
      node.type = "button";
      node.title = target;
      node.dataset.path = target;
      node.addEventListener("click", () => navigate(target));
      parts.push(node);
    };
    if (trail.length > 0) crumb("All", trail[0]!.path);
    for (const node of trail) crumb(node.name, node.path);
    path.replaceChildren(...parts);
  };

  const renderFilter = (): void => {
    const types = index.types;
    if (typeFilter !== CONTENT_FILTER_ALL && !types.includes(typeFilter)) typeFilter = CONTENT_FILTER_ALL;
    const choices = [new Option("All types", CONTENT_FILTER_ALL), ...types.map((type) => new Option(contentTypePlural(type), type))];
    filterSelect.replaceChildren(...choices);
    filterSelect.value = typeFilter;
    filterSelect.disabled = types.length === 0;
    filterButton.classList.toggle("is-filtered", typeFilter !== CONTENT_FILTER_ALL);
  };

  const renderItems = (): void => {
    items = folderItems(index, folder, { type: typeFilter, search });
    count.textContent = `${items.length} item${items.length === 1 ? "" : "s"}`;
    drawer.dataset.contentView = view;
    grid.set(items, view);
  };

  const renderNav = (): void => {
    back.disabled = !history.canGo(-1);
    forward.disabled = !history.canGo(1);
  };

  const renderAll = (): void => {
    if (!index.folder(folder)) folder = firstRoot();
    renderTree();
    renderCrumbs();
    renderFilter();
    renderItems();
    renderNav();
  };

  function navigate(next: string, record = true): void {
    if (!index.folder(next)) return;
    folder = next;
    if (record) history.visit(next);
    selectedFolder = null;
    // The folder's ancestors open (Forge's revealContentAsset expands them).
    for (let node = index.folder(next); node?.parent; node = index.folder(node.parent)) collapsed.delete(node.parent);
    persist();
    renderAll();
  }

  const setOpen = (next: boolean): void => {
    open = next;
    drawer.classList.toggle("open", open);
    options.shell.classList.toggle("content-drawer-open", open);
    drawer.setAttribute("aria-hidden", String(!open));
    toggle.classList.toggle("active", open);
    toggle.setAttribute("aria-expanded", String(open));
    if (!open) setFilterOpen(false);
    else {
      renderAll();
      void options.store.refresh();
    }
  };
  const setFilterOpen = (next: boolean): void => {
    filterPopover.hidden = !next;
    filterButton.setAttribute("aria-expanded", String(next));
  };
  const setTall = (next: boolean): void => {
    tall = next;
    options.shell.classList.toggle("content-drawer-tall", tall);
    persist();
  };

  toggle.addEventListener("click", () => setOpen(!open));
  importButton.addEventListener("click", () => {
    const node = index.folder(folder);
    if (node) actions.pickImport(node);
  });
  // Files dropped from the system on the open folder are imported into it (Forge took them through Import… only).
  list.addEventListener("dragover", (event) => {
    if (!event.dataTransfer?.types.includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  });
  list.addEventListener("drop", (event) => {
    const files = [...(event.dataTransfer?.files ?? [])];
    if (files.length === 0) return;
    event.preventDefault();
    const node = index.folder(folder);
    if (node) void actions.importFiles(node, files);
  });
  add.addEventListener("click", () => {
    const node = index.folder(folder);
    if (!node) return;
    const rect = add.getBoundingClientRect();
    openContextMenu(doc, { x: rect.left, y: rect.bottom + 4 }, actions.addMenu(node), "content-add-menu");
  });
  back.addEventListener("click", () => {
    const to = history.go(-1, (candidate) => index.folder(candidate) !== undefined);
    if (to !== null) navigate(to, false);
  });
  forward.addEventListener("click", () => {
    const to = history.go(1, (candidate) => index.folder(candidate) !== undefined);
    if (to !== null) navigate(to, false);
  });
  filterButton.addEventListener("click", () => setFilterOpen(filterPopover.hidden));
  filterSelect.addEventListener("change", () => {
    typeFilter = filterSelect.value;
    filterButton.classList.toggle("is-filtered", typeFilter !== CONTENT_FILTER_ALL);
    setFilterOpen(false);
    renderItems();
  });
  searchInput.addEventListener("input", () => {
    search = searchInput.value.trim().toLocaleLowerCase();
    renderItems();
  });
  viewButton.addEventListener("click", () => {
    view = VIEW_SIZES[(VIEW_SIZES.indexOf(view) + 1) % VIEW_SIZES.length]!;
    viewButton.title = `Küçük resim boyutu: ${view.slice(0, 1).toUpperCase()}${view.slice(1)}`;
    persist();
    renderItems();
    options.status(`Content thumbnail size: ${view}.`);
  });
  settings.addEventListener("click", (event) =>
    menuAt(
      event,
      [
        {
          label: locked ? "Unlock Drawer" : "Lock Drawer Open",
          run: () => {
            locked = !locked;
            persist();
          },
          testId: "content-settings-lock",
        },
        { label: tall ? "Use Short Height" : "Use Tall Height", run: () => setTall(!tall), testId: "content-settings-tall" },
        { separator: true },
        {
          label: "Refresh",
          run: () =>
            void options.store.refresh(true).then((ok) => options.status(ok ? "Content refreshed." : "The content listing could not be read.", ok ? "info" : "error")),
          testId: "content-settings-refresh",
        },
      ],
      "content-settings-menu",
    ),
  );
  // Click on empty grid space clears the card selection (Forge).
  list.addEventListener("click", (event) => {
    if ((event.target as Element).closest(".asset-card")) return;
    selectedFile = null;
    selectedFolder = null;
    grid.draw();
  });
  list.addEventListener("contextmenu", (event) => {
    const node = index.folder(folder);
    if ((event.target as Element).closest(".asset-card") || !node) {
      event.preventDefault();
      return;
    }
    menuAt(event, actions.emptyMenu(node), "content-empty-menu");
  });
  // The drawer's keys while it has the focus (not while typing a search or a name).
  drawer.addEventListener("keydown", (event) => {
    const target = event.target as HTMLElement;
    if (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA") return;
    const selected: ContentTarget | null =
      selectedFile !== null && index.byFile(selectedFile)
        ? targetOfAsset(index.byFile(selectedFile)!)
        : selectedFolder !== null && index.folder(selectedFolder)
          ? targetOfFolder(index.folder(selectedFolder)!)
          : null;
    if (!actions.key(event, selected, index.folder(folder) ?? null)) return;
    event.preventDefault();
    event.stopPropagation();
  });
  // An outside click closes the drawer unless it is locked; a menu opened from it is part of it (Forge).
  doc.addEventListener(
    "pointerdown",
    (event) => {
      if (!open) return;
      const target = event.target as Element | null;
      if (!target || target.closest?.(".context-menu")) return;
      if (!filterPopover.hidden && !filterPopover.contains(target) && !filterButton.contains(target)) setFilterOpen(false);
      if (locked || drawer.contains(target)) return;
      setOpen(false);
    },
    true,
  );

  options.store.onChange((next) => {
    index = next;
    if (selectedFile !== null && !index.byFile(selectedFile)) selectedFile = null;
    if (selectedFolder !== null && !index.folder(selectedFolder)) selectedFolder = null;
    renderAll();
  });
  setTall(tall);
  viewButton.title = `Küçük resim boyutu: ${view.slice(0, 1).toUpperCase()}${view.slice(1)}`;
  renderAll();

  const api: ContentPanel = {
    element: drawer,
    openLevelDialog() {
      const levels = index.assets.filter((asset) => asset.levelFolder !== null);
      void openPicker({
        document: doc,
        host: options.shell,
        title: "Open Level",
        testId: "open-level",
        items: levels.map((asset) => ({
          id: asset.levelFolder!,
          label: asset.name,
          note: asset.levelFolder!,
          ...(asset.levelFolder === options.activeLevel ? { disabled: "Açık level" } : {}),
        })),
      }).then((folder) => {
        if (folder === null) return;
        options.openLevel?.(folder, levels.find((asset) => asset.levelFolder === folder)?.name ?? folder);
      });
    },
    revealAsset(guids) {
      const asset = guids.map((guid) => index.byId(guid)).find((found) => found !== undefined);
      if (!asset) return false;
      api.reveal(asset.file);
      return true;
    },
    isOpen: () => open,
    setOpen,
    reveal(file) {
      const item = index.byFile(file) ?? index.assets.find((asset) => asset.levelFolder === file);
      if (!item) {
        options.status(`Not in the Content Browser: ${file}`, "warning");
        return;
      }
      if (!open) setOpen(true);
      typeFilter = CONTENT_FILTER_ALL;
      search = "";
      searchInput.value = "";
      selectedFile = item.file;
      navigate(item.folder);
      const at = items.indexOf(item);
      if (at >= 0) grid.reveal(at);
      const card = list.querySelector<HTMLElement>(`.asset-card[data-asset-path="${CSS.escape(item.levelFolder ?? item.file)}"]`);
      if (card) {
        card.classList.add("is-revealed");
        doc.defaultView?.setTimeout(() => card.classList.remove("is-revealed"), 1600);
      }
      options.status(`Revealed in Content Browser: ${item.levelFolder ?? item.file}`);
    },
    selected: () => (selectedFile === null ? null : (index.byFile(selectedFile) ?? null)),
  };
  return api;
}

