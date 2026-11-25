// The Foliage tab beside Details (plan 5c F5, user decision 2026-11-18: ahead
// of 5d; its tools came with 5d step 6: foliagePaintPanel.ts, above the types,
// painting the selected type). Forge WebGL's foliage panel
// (src/editor/panels/foliage/foliagePanel.ts @ forge-webgl-final) listed the
// level's types and edited the active one's fields by hand; here:
// - Types: every `forge.foliageType` the project sees (engine content and
//   packs read only), by name. New Type picks a model and creates the asset as
//   the Content Browser's New does.
// - The selected type's fields are its schema's form (ui/formView.ts: slider
//   + box, Turkish hints, English names), edited in an asset session
//   (assets/assetSession.ts: its own undo, Save, Reload); Save goes through the
//   asset editor's `saved` path, so the open level's foliage regrows with it.
// - Landscape Rules (F6, foliageRules.ts): the terrain's rules, level edits.
// Visible explanations and empty states are Turkish; names and buttons English.

import type { SaveClient, SchemaRegistry } from "../../core/index.ts";
import { pathKey } from "../../engine/edit/formPath.ts";
import type { AssetCatalog } from "../assets/assetCatalog.ts";
import { assetDocumentAdapter, type EditableAsset } from "../assets/assetDocument.ts";
import { openAssetSession, type AssetSession } from "../assets/assetSession.ts";
import type { EditorSession } from "../session/editorSession.ts";
import { createFormView, type FormView } from "../ui/formView.ts";
import { createFoliageRules, type FoliageRules } from "./foliageRules.ts";

export const FOLIAGE_TYPE = "forge.foliageType";

export interface FoliagePanelOptions {
  readonly document: Document;
  readonly registry: SchemaRegistry;
  readonly client: SaveClient;
  readonly catalog: AssetCatalog;
  /** The open level (Landscape Rules, F6); without it the tab shows the types only. */
  readonly editor?: EditorSession;
  lookup(guid: string): EditableAsset | null;
  /** Creates a JSON asset as the Content Browser's New does; resolves to its GUID, null when refused. */
  createAsset(type: string, name: string, values: Readonly<Record<string, unknown>>): Promise<string | null>;
  /** After a save: the asset editor's path (listing, caches, the actors that use it). */
  saved(session: AssetSession): Promise<void>;
  /** The tools' section, above the types (5d step 6). */
  readonly tools?: HTMLElement;
  /** Painted instances of a type in the open level. */
  readonly painted?: (guid: string) => number;
  /** Opens an asset picker; resolves to the chosen GUID or null. */
  pickAsset(type: string | null): Promise<string | null>;
  status(message: string, tone?: "info" | "warning" | "error"): void;
}

export interface FoliagePanel {
  readonly element: HTMLElement;
  /** The listing changed (an import, a move): the type list is drawn again. */
  refresh(): void;
  /** The selected type; null for none. */
  selected(): string | null;
  /** The painted counts changed: the rows' numbers are drawn again. */
  countsChanged(): void;
  /** The selected type's session, if any (tests, the shell's guards). */
  active(): AssetSession | null;
  dispose(): void;
}

export function installFoliagePanelStyle(doc: Document): void {
  if (doc.getElementById("forge-foliage-panel-style")) return;
  const style = doc.createElement("style");
  style.id = "forge-foliage-panel-style";
  style.textContent = `
.foliage-panel{display:flex;flex-direction:column;gap:10px;padding:8px}
.foliage-section-head{display:flex;align-items:center;gap:6px;font-weight:600;color:var(--forge-text)}
.foliage-section-head>span{flex:1}
.foliage-list{display:flex;flex-direction:column;max-height:180px;overflow:auto;border:1px solid var(--forge-border-soft);border-radius:var(--forge-radius-sm);background:var(--forge-bg-1)}
.foliage-row{display:flex;gap:6px;align-items:baseline;padding:4px 8px;border:0;background:none;color:var(--forge-text);text-align:left;cursor:pointer}
.foliage-row:hover{background:var(--forge-bg-3)}
.foliage-row[aria-selected=true]{background:var(--forge-accent-soft)}
.foliage-row small{color:var(--forge-text-dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.foliage-empty{padding:8px;color:var(--forge-text-secondary)}
.foliage-toolbar{display:flex;gap:6px;flex-wrap:wrap}
.foliage-rules{display:flex;flex-direction:column;gap:6px;border-top:1px solid var(--forge-border-soft);padding-top:8px}
.foliage-terrain{max-width:50%}
`;
  doc.head.append(style);
}

export function createFoliagePanel(options: FoliagePanelOptions): FoliagePanel {
  const doc = options.document;
  installFoliagePanelStyle(doc);
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text?: string): HTMLElementTagNameMap[K] => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const button = (label: string, testId: string, hint: string, run: () => void): HTMLButtonElement => {
    const node = el("button", "detail-inline-button", label);
    node.type = "button";
    node.dataset.testid = testId;
    node.title = hint;
    node.addEventListener("click", run);
    return node;
  };

  const element = el("div", "foliage-panel");
  element.dataset.testid = "foliage-panel";

  // Types.
  const typesHead = el("div", "foliage-section-head");
  typesHead.append(el("span", "", "Foliage Types"));
  const newType = button("New Type", "foliage-type-new", "Bir model seçip yeni foliage türü oluşturur.", () => void createType());
  typesHead.append(newType);
  const list = el("div", "foliage-list");
  list.setAttribute("role", "listbox");
  list.dataset.testid = "foliage-type-list";
  const editor = el("div", "foliage-type-editor");
  editor.dataset.testid = "foliage-type-editor";
  if (options.tools) element.append(options.tools);
  element.append(typesHead, list, editor);
  const rules: FoliageRules | null = options.editor
    ? createFoliageRules({
        document: doc, editor: options.editor, catalog: options.catalog, selectedType: () => selected,
        pickAsset: (type) => options.pickAsset(type), status: options.status,
      })
    : null;
  if (rules) element.append(rules.element);

  let selected: string | null = null;
  let session: AssetSession | null = null;
  let form: FormView | null = null;
  let unsubscribe: (() => void) | null = null;
  let ticket = 0;

  const closeSession = (): void => {
    unsubscribe?.();
    unsubscribe = null;
    session = null;
    form = null;
    editor.replaceChildren();
  };

  const drawList = (): void => {
    const types = options.catalog.ofType(FOLIAGE_TYPE);
    list.replaceChildren();
    if (types.length === 0) {
      list.append(el("div", "foliage-empty", "Projede foliage türü yok. New Type ile bir modelden oluştur."));
      return;
    }
    for (const type of types) {
      const row = el("button", "foliage-row");
      row.type = "button";
      row.setAttribute("role", "option");
      row.setAttribute("aria-selected", String(type.guid === selected));
      row.dataset.testid = "foliage-type-row";
      row.dataset.guid = type.guid;
      row.title = type.file;
      const writable = options.lookup(type.guid)?.writable ?? false;
      row.append(el("span", "", type.name), el("small", "", writable ? type.file : `${type.file} · Read Only`));
      if (options.painted) {
        const count = el("small", "foliage-count");
        count.dataset.testid = "foliage-type-count";
        count.title = "Level'da boyanmış örnek sayısı.";
        row.append(count);
      }
      row.addEventListener("click", () => void select(type.guid));
      list.append(row);
    }
    drawCounts();
  };
  const drawCounts = (): void => {
    for (const count of list.querySelectorAll<HTMLElement>(".foliage-count")) {
      const painted = options.painted?.(count.closest<HTMLElement>("[data-guid]")!.dataset.guid!) ?? 0;
      count.textContent = painted > 0 ? String(painted) : "";
    }
  };

  /** A dirty draft asks before it is left. */
  const leave = (): boolean => {
    if (!session?.dirty()) return true;
    return doc.defaultView?.confirm(`${session.asset.name} türündeki kaydedilmemiş değişiklikler atılsın mı?`) ?? true;
  };

  const select = async (guid: string): Promise<void> => {
    if (guid === selected && session) return;
    if (!leave()) return;
    closeSession();
    selected = guid;
    drawList();
    const asset = options.lookup(guid);
    const adapter = asset ? assetDocumentAdapter(asset, options.registry) : null;
    if (!asset || !adapter) {
      editor.append(el("div", "foliage-empty", "Bu tür okunamadı."));
      return;
    }
    const mine = ++ticket;
    try {
      const opened = await openAssetSession(asset, adapter, options.client);
      if (mine !== ticket) return;
      session = opened;
      const toolbar = el("div", "foliage-toolbar");
      const save = button("Save", "foliage-type-save", "Türü kaydeder; açık level'daki foliage yeniden kurulur.", () => void saveNow());
      const undo = button("Undo", "foliage-type-undo", "Bu türdeki son değişikliği geri alır.", () => opened.undo());
      const redo = button("Redo", "foliage-type-redo", "Geri alınan değişikliği yineler.", () => opened.redo());
      const reload = button("Reload", "foliage-type-reload", "Diskteki sürümü yeniden okur; kaydedilmemiş değişiklikler atılır.", () => {
        if (opened.dirty() && !(doc.defaultView?.confirm("Diskteki sürüm okunsun mu? Kaydedilmemiş değişiklikler atılır.") ?? true)) return;
        void opened.reload().then(() => options.status("Reloaded from disk."), (error: unknown) => options.status(String(error), "error"));
      });
      toolbar.append(save, undo, redo, reload);
      form = createFormView({
        document: doc, fields: adapter.fields, value: opened.value(), disabled: !asset.writable, testIdPrefix: "foliage-field",
        assetLabel: (id) => options.catalog.label(id), pickAsset: (type) => options.pickAsset(type),
        warn: (message) => options.status(message, "warning"),
        onChange: (change) => { opened.edit(`Edit ${pathKey(change.path)}`, change.path, change.value, change.phase); },
      });
      if (!asset.writable) editor.append(el("div", "foliage-empty", "Salt okunur tür (motor içeriği ya da paket). Düzenlemek için projeye kopyala."));
      editor.append(toolbar, form.element);
      const update = (): void => {
        save.disabled = !asset.writable || !opened.dirty() || opened.busy();
        undo.disabled = !opened.canUndo();
        redo.disabled = !opened.canRedo();
        reload.disabled = opened.busy();
        form?.update(opened.value());
        const row = list.querySelector<HTMLElement>(`[data-guid="${guid}"] span`);
        if (row) row.textContent = `${asset.name}${opened.dirty() ? " *" : ""}`;
      };
      unsubscribe = opened.onChange(update);
      update();
    } catch (error) {
      if (mine === ticket) editor.append(el("div", "foliage-empty", `Tür açılamadı: ${String(error)}`));
    }
  };

  const saveNow = async (): Promise<void> => {
    const opened = session;
    if (!opened) return;
    const result = await opened.save();
    options.status(result.message, result.ok ? "info" : "warning");
    if (result.ok && opened.result()?.status === "saved") {
      try { await options.saved(opened); } catch (error) { options.status(`Saved, but scene refresh failed: ${String(error)}`, "warning"); }
    }
  };

  const createType = async (): Promise<void> => {
    const model = await options.pickAsset("forge.model");
    if (!model) return;
    const suggested = options.catalog.label(model) ?? "Foliage";
    const name = doc.defaultView?.prompt("New Foliage Type name", suggested);
    if (!name || name.trim() === "") return;
    const guid = await options.createAsset(FOLIAGE_TYPE, name.trim(), { mesh: model });
    if (!guid) return;
    drawList();
    await select(guid);
  };

  // Save from the keyboard while focus is in the tab (the level's Ctrl+S stays the level's elsewhere).
  element.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s" && session) {
      event.preventDefault();
      event.stopPropagation();
      void saveNow();
    }
  });

  drawList();
  return {
    element,
    refresh() {
      if (selected && !options.lookup(selected)) { closeSession(); selected = null; }
      drawList();
    },
    selected: () => selected,
    countsChanged: drawCounts,
    active: () => session,
    dispose() {
      ticket += 1;
      closeSession();
      rules?.dispose();
      element.remove();
    },
  };
}
