// One schema-driven window for all asset documents. Specialisations add
// tools/preview, never another save path, history or hand-written field form.
import { isJsonAssetType, type AssetPreviewController, type FormField, type SaveClient, type SchemaRegistry } from "../../core/index.ts";
import { openPicker } from "../details/pickerPopover.ts";
import { openCompareWindow } from "../session/conflictUi.ts";
import type { AssetEditorExtension, AssetEditorExtensionContext, AssetEditorPresentation } from "../host/assetEditorTypes.ts";
import type { FeatureEditorDef } from "../host/featureEditor.ts";
import { isEditableTarget, shortcutOf } from "../input/shortcuts.ts";
import { createFormView, type FormView } from "../ui/formView.ts";
import { getAtPath, pathKey } from "../../engine/edit/formPath.ts";
import type { AssetCatalog } from "./assetCatalog.ts";
import { contentTypeLabel } from "../content/contentModel.ts";
import { assetDocumentAdapter, type EditableAsset } from "./assetDocument.ts";
import { installAssetEditorStyle } from "./assetEditorStyle.ts";
import { openAssetSession, type AssetSession } from "./assetSession.ts";
import { arrayFields, createAssetTable } from "./assetTable.ts";
import { createClassTools } from "./classTools.ts";

export interface AssetEditorOptions {
  readonly document: Document;
  readonly registry: SchemaRegistry;
  readonly client: SaveClient;
  readonly catalog: AssetCatalog;
  readonly editors: readonly FeatureEditorDef[];
  readonly source: () => EditableAsset | null;
  readonly lookup: (guid: string) => EditableAsset | null;
  readonly status: (message: string) => void;
  readonly preview: (key: string, asset: EditableAsset, container: HTMLElement, edit: AssetEditorExtensionContext["edit"], status: (message: string) => void) => AssetPreviewController | null;
  readonly beforeSave?: (session: AssetSession) => string | null;
  readonly saved: (session: AssetSession) => Promise<void>;
}

export function filterAssetFields(fields: readonly FormField[], hidden: readonly string[], prefix = ""): readonly FormField[] {
  return fields.filter((field) => !hidden.includes(prefix + field.key)).map((field) => field.kind === "object"
    ? { ...field, fields: filterAssetFields(field.fields, hidden, `${prefix}${field.key}.`) } : field);
}

export function createAssetEditor(options: AssetEditorOptions) {
  const { document: doc } = options;
  installAssetEditorStyle(doc);
  let session: AssetSession | null = null, overlay: HTMLElement | null = null, preview: AssetPreviewController | null = null;
  let extension: AssetEditorExtension | null = null, table: ReturnType<typeof createAssetTable> | null = null, unsubscribe: (() => void) | null = null;
  let generation = 0, saveNow: (() => Promise<boolean>) | null = null, status: ((message: string) => void) = options.status;
  const teardown = () => {
    unsubscribe?.(); unsubscribe = null;
    extension?.dispose?.(); extension = null; table?.dispose(); table = null;
    preview?.dispose(); preview = null;
    overlay?.remove(); overlay = null; session = null; saveNow = null;
  };
  const guard = async (): Promise<boolean> => {
    if (session?.busy()) return false;
    if (!session?.dirty() || !overlay) return true;
    const decision = await new Promise<"save" | "discard" | "cancel">((resolve) => {
      const backdrop = doc.createElement("div"), box = doc.createElement("div"), text = doc.createElement("strong");
      backdrop.className = "asset-editor-confirm"; backdrop.dataset.testid = "asset-unsaved";
      text.textContent = `Save changes to ${session!.asset.name}?`; box.append(text); backdrop.append(box);
      for (const answer of ["save", "discard", "cancel"] as const) {
        const button = doc.createElement("button"); button.type = "button"; button.textContent = answer[0]!.toUpperCase() + answer.slice(1); button.dataset.testid = `asset-unsaved-${answer}`;
        button.addEventListener("click", () => { backdrop.remove(); resolve(answer); }); box.append(button);
      }
      overlay!.append(backdrop);
      box.querySelector<HTMLButtonElement>("button:last-child")!.focus();
    });
    return decision === "discard" || (decision === "save" && await saveNow?.() === true);
  };
  const close = async () => { if (doc.querySelector("[data-testid=asset-unsaved]")) return; if (await guard()) { generation++; teardown(); } };
  const open = async (asset: EditableAsset) => {
    if (session?.asset.id === asset.id && overlay) { overlay.focus(); return; }
    if (doc.querySelector("[data-testid=asset-unsaved]")) return;
    const adapter = assetDocumentAdapter(asset, options.registry);
    if (!adapter) { options.status(`No asset editor for ${asset.type}.`); return; }
    if (!await guard()) return;
    const ticket = ++generation;
    teardown();
    const root = doc.createElement("div"), window = doc.createElement("div"), header = doc.createElement("header"), toolbar = doc.createElement("div"), body = doc.createElement("div"), pane = doc.createElement("div"), fields = doc.createElement("div"), footer = doc.createElement("footer"), title = doc.createElement("strong");
    root.className = "asset-editor-overlay forge-kit"; root.tabIndex = -1; root.dataset.testid = "asset-editor"; root.dataset.assetId = asset.id;
    root.addEventListener("keydown", (event) => event.stopPropagation());
    window.className = "asset-editor-window"; window.setAttribute("role", "dialog"); window.setAttribute("aria-modal", "true"); window.setAttribute("aria-label", `Edit ${asset.name}`);
    header.className = "asset-editor-header"; toolbar.className = "asset-editor-toolbar"; body.className = "asset-editor-body"; pane.className = "asset-editor-preview"; fields.className = "asset-editor-fields"; footer.className = "asset-editor-status"; title.className = "asset-editor-title";
    footer.dataset.testid = "asset-editor-status"; pane.dataset.testid = "asset-editor-preview";
    status = (message) => { if (ticket === generation) footer.textContent = message; };
    title.textContent = `Loading ${asset.name}…`; header.append(title);
    window.append(header, toolbar, body, footer); body.append(pane, fields); root.append(window); doc.body.append(root); overlay = root; root.focus();
    const button = (label: string, id: string, run: () => void, parent: HTMLElement = toolbar) => {
      const node = doc.createElement("button"); node.type = "button"; node.className = "detail-inline-button"; node.textContent = label; node.dataset.testid = id;
      node.addEventListener("click", run); parent.append(node); return node;
    };
    button("Close", "asset-editor-close", () => void close(), header);
    try {
      const opened = await openAssetSession(asset, adapter, options.client);
      if (ticket !== generation) return;
      session = opened;
      const presentation: AssetEditorPresentation | undefined = options.editors.flatMap((editor) => editor.assetEditors).find((editor) => editor.assetType === asset.type);
      const key = adapter.kind === "class" ? "forge.actorClass" : presentation?.preview;
      const edit: AssetEditorExtensionContext["edit"] = (label, path, value, phase) => { opened.edit(label, path, value, phase); };
      if (key) preview = options.preview(key, asset, pane, edit, status);
      if (!preview) window.classList.add("is-data");
      const pickAsset = (type: string | null) => openPicker({ document: doc, host: fields, title: "Select Asset", testId: "asset-editor-picker", items: options.catalog.ofType(type).map((item) => ({ id: item.guid, label: item.name, note: item.file })) });
      const formOptions = { assetLabel: (id: string) => options.catalog.label(id), pickAsset, warn: status };
      const fieldsForEditor = filterAssetFields(adapter.fields, presentation?.handledFields ?? []);
      const legacyTree = () => key === "forge.treeRecipe" && opened.value().generatorVersion !== 4;
      const legacyFields = fieldsForEditor.filter(field => field.key !== "growth");
      let visible = legacyTree() ? legacyFields : fieldsForEditor;
      const uiState = key === "forge.treeRecipe" ? {
        collapsed: new Map(fieldsForEditor.filter(field => field.kind === "array" || field.kind === "object")
          .map(field => [`asset-field-section-${field.key}`, field.key !== "variants" && field.key !== "growth"])),
        linkedScales: new Set<string>(),
      } : undefined;
      let form: FormView | null = null, mode = arrayFields(visible).some((entry) => { const list = getAtPath(opened.value(), entry.path); return Array.isArray(list) && list.length > 50; }) ? "table" : "form";
      const formHost = doc.createElement("div"), toolHost = doc.createElement("div"); fields.append(formHost, toolHost);
      const ctx: AssetEditorExtensionContext = { document: doc, registry: options.registry, catalog: options.catalog, fields: adapter.fields, readOnly: !asset.writable,
        value: opened.value, edit, preview: () => preview, pickAsset, status,
      };
      extension = adapter.kind === "class" ? createClassTools(ctx) : presentation?.tools?.(ctx) ?? null;
      if (extension) toolHost.append(extension.element);
      const drawForm = () => {
        table?.dispose(); table = null; form = null; formHost.replaceChildren();
        if (mode === "table") {
          table = createAssetTable({ document: doc, session: opened, fields: visible, formOptions }); formHost.append(table.element);
        } else {
          form = createFormView({ document: doc, fields: visible, value: opened.value(), disabled: !asset.writable, testIdPrefix: "asset-field", ...formOptions,
            ...(uiState ? { uiState } : {}),
            onChange: (change) => edit(`Edit ${pathKey(change.path)}`, change.path, change.value, change.phase),
          }); formHost.append(form.element);
        }
      };
      drawForm();
      const save = button("Save", "asset-editor-save", () => void saveNow?.());
      const publish = presentation?.publish;
      const generate = publish ? button(publish.label, "asset-editor-generate", async () => {
        status("Generating and saving the family…");
        const result = await opened.save(publish.run);
        if (ticket !== generation) return;
        if (!result.ok) { status(result.message); return; }
        try {
          await options.saved(opened);
          const saved = opened.result();
          status(["Generated and saved the tree family.", ...(saved?.status === "saved" ? saved.warnings.map(w => w.message) : [])].join("\n"));
        } catch (error) { status(`Family saved. Content refresh failed: ${String(error)}`); }
      }) : null;
      const undo = button("Undo", "asset-editor-undo", () => opened.undo());
      const redo = button("Redo", "asset-editor-redo", () => opened.redo());
      const reload = button("Reload", "asset-editor-reload", () => {
        if (opened.dirty() && !doc.defaultView!.confirm("Reload from disk? Your unsaved asset changes will be discarded.")) return;
        void opened.reload().then(() => status("Reloaded from disk."), (error: unknown) => status(String(error)));
      });
      // After a 409 (step 8): the draft against the disk's version, merged field by field.
      const compare = button("Compare…", "asset-editor-compare", () => {
        void opened.compare().then((disk) => {
          if (ticket !== generation || root.querySelector("[data-testid=asset-compare]")) return;
          const count = disk.conflicts.length;
          openCompareWindow({
            document: doc,
            host: root,
            testId: "asset-compare",
            summary: disk.unchanged
              ? "The disk's version is the one this draft started from; nothing to merge."
              : `${count} conflict${count === 1 ? "" : "s"}. Apply merges your draft with the disk's version; it stays unsaved until you save.`,
            rows: disk.conflicts.map((conflict) => ({ key: conflict.path.join("."), label: conflict.path.length === 0 ? asset.name : conflict.path.join("."), fields: [conflict] })),
            apply: (picks) => {
              const result = opened.merge(disk, (path) => picks.get(path.join(".")) ?? "mine");
              status(result.message);
              return result.ok;
            },
          });
        }, (error: unknown) => status(String(error)));
      });
      button("Open Asset…", "asset-editor-open", () => {
        const items = options.catalog.ofType(null).filter((item) => { const candidate = options.lookup(item.guid); return candidate && assetDocumentAdapter(candidate, options.registry); });
        void openPicker({ document: doc, host: fields, title: "Open Asset", testId: "asset-open-picker", items: items.map((item) => ({ id: item.guid, label: item.name, note: item.type })) }).then((id) => {
          const candidate = id ? options.lookup(id) : null; if (candidate) void open(candidate);
        });
      });
      if (arrayFields(visible).length) {
        button("Form", "asset-editor-form", () => { mode = "form"; drawForm(); });
        button("Table", "asset-editor-table", () => { mode = "table"; drawForm(); });
      }
      if (preview) button("Focus", "asset-editor-focus", () => preview?.focus());
      const presets = options.editors.flatMap((editor) => editor.newAssets).filter((template) => template.type === asset.type);
      if (presets.length) button("Preset…", "asset-editor-preset", () => {
        void openPicker({ document: doc, host: fields, title: "Material Preset", testId: "asset-preset", items: presets.map((template, i) => ({ id: String(i), label: template.label })) }).then((index) => {
          if (index === null) return;
          const def = options.registry.getAssetType(asset.type);
          if (def && isJsonAssetType(def)) {
            const defaults = Object.fromEntries(adapter.fields.map((field) => [field.key, structuredClone(field.default)]));
            edit("Apply preset", [], { ...opened.value(), ...defaults, ...presets[Number(index)]!.values });
          }
        });
      }, toolbar).disabled = !asset.writable;
      saveNow = async () => {
        const problem = options.beforeSave?.(opened);
        if (problem) { status(problem); return false; }
        const result = await opened.save();
        status(result.message);
        if (result.ok && opened.result()?.status === "saved") {
          try { await options.saved(opened); } catch (error) { status(`Saved, but scene refresh failed: ${String(error)}`); }
        }
        return result.ok;
      };
      let lastPreviewValue: Readonly<Record<string, unknown>> | null = null;
      const update = () => {
        const nextFields = legacyTree() ? legacyFields : fieldsForEditor;
        if (visible !== nextFields) { visible = nextFields; drawForm(); }
        title.textContent = `${asset.name}${opened.dirty() ? " *" : ""} · ${contentTypeLabel(asset.type)}${asset.writable ? "" : " · Read Only"}`;
        if (generate) generate.disabled = !asset.writable || opened.busy();
        save.disabled = !asset.writable || !opened.dirty() || opened.busy(); undo.disabled = !opened.canUndo(); redo.disabled = !opened.canRedo(); reload.disabled = opened.busy(); compare.disabled = !asset.writable || opened.busy(); fields.inert = opened.busy();
        form?.update(opened.value()); table?.update(); extension?.update?.();
        if (preview && lastPreviewValue !== opened.value()) {
          lastPreviewValue = opened.value();
          const active = preview;
          void active.update(lastPreviewValue).then(() => { if (ticket === generation && active === preview) extension?.update?.(); }).catch((error: unknown) => status(String(error)));
        }
      };
      unsubscribe = opened.onChange(update); update(); status(asset.writable ? "Ready" : "Read-only asset. Copy it into your project to edit it."); root.dataset.assetReady = "1";
    } catch (error) { if (ticket === generation) status(`Cannot open asset: ${String(error)}`); }
  };
  const keydown = (event: KeyboardEvent) => {
    const action = shortcutOf(event);
    if (!overlay) {
      if (action === "editAsset" && !isEditableTarget(event.target)) {
        event.preventDefault(); event.stopImmediatePropagation(); const source = options.source(); if (source) void open(source); else options.status("Edit: select an actor with a source asset.");
      }
      return;
    }
    // Picker Escape belongs to its own dialog; all other shortcuts stay here.
    if (event.key === "Escape" && overlay.querySelector(".details-picker")) return;
    // The Compare window takes its own keys (Escape closes it, not the asset).
    if (overlay.querySelector("[data-testid=asset-compare]")) return;
    if (overlay.querySelector(".asset-editor-confirm")) {
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); overlay.querySelector<HTMLButtonElement>("[data-testid=asset-unsaved-cancel]")?.click(); }
      return;
    }
    if (action === "save") { event.preventDefault(); event.stopImmediatePropagation(); void saveNow?.(); }
    else if (action === "undo") { event.preventDefault(); event.stopImmediatePropagation(); session?.undo(); }
    else if (action === "redo") { event.preventDefault(); event.stopImmediatePropagation(); session?.redo(); }
    else if (action === "editAsset") { event.preventDefault(); event.stopImmediatePropagation(); }
    else if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); void close(); }
  };
  const unload = (event: BeforeUnloadEvent) => { if (session?.dirty()) { event.preventDefault(); event.returnValue = ""; } };
  doc.addEventListener("keydown", keydown, true); doc.defaultView?.addEventListener("beforeunload", unload);
  /**
   * Files changed on disk (step 9f): the open asset's file at a revision the draft did not start from is read
   * again when the draft is clean; a dirty draft is told so (Compare… / Reload stay its choice).
   */
  const diskChanged = (files: readonly { readonly path: string; readonly revision: string | null }[]): void => {
    const opened = session;
    if (!opened || !overlay || opened.busy()) return;
    const change = files.find((file) => file.path === opened.adapter.path);
    if (!change || change.revision === opened.revision()) return;
    // A save the disk refused (409) already says so.
    if (opened.dirty()) { if (opened.result()?.status !== "conflict") status("Changed on disk while you edit: Compare… or Reload."); return; }
    void opened.reload().then(() => status("Updated from disk."), (error: unknown) => status(`Changed on disk; reading it failed: ${String(error)}`));
  };
  return { open, close, diskChanged, isOpen: () => overlay !== null, active: () => session,
    dispose() { generation++; teardown(); doc.removeEventListener("keydown", keydown, true); doc.defaultView?.removeEventListener("beforeunload", unload); },
  };
}
