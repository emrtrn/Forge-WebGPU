// The editor shell (plan phase 4 step 2): Forge WebGL's editor layout
// (src/editor/EditorUi.ts @ forge-webgl-final: the top bar with the level
// name and Save / Undo / Redo, the Outliner on the left, Details on the right,
// the viewport panel between them, the hidden status line and the toast) with
// the `data-testid`s Forge's smokes use (`forge-editor`, `editor-save`,
// `editor-undo`, `editor-redo`, `editor-status`, `outliner-row`).
//
// What it draws comes from the editor session: the Outliner lists the level's
// actors (a plain list until the virtualised Outliner, step 5), a click
// selects; Details shows the primary selection's transform through the UI
// kit, and each committed field is one transaction (one undo step).
// Ctrl+S / Ctrl+Z / Ctrl+Y (Ctrl+Shift+Z) save, undo, redo.
// The viewport's view controls (step 3) sit in the work bar as Forge's hover
// menus: Camera (Perspective / Top / Left / Front; keys 1 Top, 2 Front,
// 3 Left, 4 Perspective), F focuses the selection, Escape clears it. The
// shell holds no viewport state: it asks the viewport and follows its changes.
// Text is set with textContent; the only markup is the kit's static icons.

import { formFields, transform, type ActorDoc, type ActorId } from "../../core/index.ts";
import type { EditorSession } from "../session/editorSession.ts";
import { createFormView, type FormView } from "../ui/formView.ts";
import { ACTOR_TYPE_ICONS } from "../ui/icons.ts";

/** Forge's toolbar glyphs (EditorUi TOOLBAR_ICONS). */
const TOOLBAR_ICONS = {
  save: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 3.5h7.4l1.6 1.6v6.9a.5.5 0 0 1-.5.5h-8a.5.5 0 0 1-.5-.5v-8a.5.5 0 0 1 .5-.5z"/><path d="M5.5 3.5v3h4v-3"/><rect x="5.5" y="9" width="5" height="3.5"/></svg>',
  undo: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4L3 7l3 3"/><path d="M3 7h5.5a3.5 3.5 0 0 1 0 7H7"/></svg>',
  redo: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M10 4l3 3-3 3"/><path d="M13 7H7.5a3.5 3.5 0 0 0 0 7H9"/></svg>',
  camera: '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M2 5.5h6.5L10 3.5h3.5v9H2z"/><circle cx="6.5" cy="9" r="2.4"/></svg>',
} as const;

const MENU_CHEVRON =
  '<svg class="menu-chevron" viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4.5L6 7.5 9 4.5"/></svg>';

/** Forge's camera preset keys (EditorUi): 1 Top, 2 Front, 3 Left, 4 Perspective. */
const VIEW_KEYS: Readonly<Record<string, string>> = { Digit1: "top", Digit2: "front", Digit3: "left", Digit4: "perspective" };

/** One choice of a view menu: its id and its label. */
export type MenuChoice = readonly [id: string, label: string];

/** The viewport's view state as the shell's menus read and set it (three-free). */
export interface ViewportMenus {
  /** Camera presets, in menu order. */
  readonly views: readonly MenuChoice[];
  view(): string;
  setView(view: string): void;
  onViewChange(listener: (view: string) => void): void;
  /** Frames the selection (key F). */
  focusSelection(): void;
}

const TRANSFORM_FIELDS = formFields({ transform: transform({ label: "Transform", hint: "Aktörün konumu, dönüşü ve ölçeği (ebeveynine göre)." }) });

export interface ShellOptions {
  readonly document: Document;
  /** Project and level shown in the top bar. */
  readonly projectName: string;
  readonly levelFolder: string;
  /** The project cannot be written (an engine sample): Save stays off. */
  readonly readOnly: boolean;
}

export interface EditorShell {
  readonly root: HTMLElement;
  /** Where the renderer's canvas goes. */
  readonly viewport: HTMLElement;
  /** Binds the shell to an opened level. */
  attach(editor: EditorSession): void;
  /** Binds the view controls to the viewport. */
  attachViewport(menus: ViewportMenus): void;
  /** The status line; errors and warnings also show as a toast. */
  status(message: string, tone?: "info" | "warning" | "error"): void;
}

export function createShell(options: ShellOptions): EditorShell {
  const doc = options.document;
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text?: string): HTMLElementTagNameMap[K] => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const iconButton = (icon: string, label: string, testId: string, hint: string): HTMLButtonElement => {
    const button = el("button", "tool-button");
    button.type = "button";
    button.innerHTML = icon; // The shell's own static SVG.
    button.setAttribute("aria-label", label);
    button.dataset.testid = testId;
    button.title = hint;
    return button;
  };

  const root = el("div", "editor-shell forge-kit");
  root.id = "editor-ui";
  root.dataset.testid = "forge-editor";
  root.addEventListener("contextmenu", (event) => event.preventDefault());

  const viewport = el("div", "editor-viewport-host");
  viewport.dataset.viewportHost = "";

  const topbar = el("header", "editor-topbar");
  const lead = el("div", "editor-lead");
  const brand = el("div", "editor-brand");
  const logo = el("span", "editor-logo", "F");
  logo.setAttribute("aria-hidden", "true");
  const brandText = el("span", "editor-brand-text");
  brandText.append(el("strong", "", options.projectName), el("span", "", options.readOnly ? `${options.levelFolder} (read only)` : options.levelFolder));
  brand.append(logo, brandText);
  const history = el("div", "editor-history-actions");
  const save = iconButton(TOOLBAR_ICONS.save, "Save Level", "editor-save", options.readOnly ? "Bu proje salt okunur (motor örneği); kaydedilmez." : "Değişiklikleri kaydet (Ctrl+S)");
  const undo = iconButton(TOOLBAR_ICONS.undo, "Undo", "editor-undo", "Geri al (Ctrl+Z)");
  const redo = iconButton(TOOLBAR_ICONS.redo, "Redo", "editor-redo", "Yinele (Ctrl+Y)");
  history.append(save, undo, redo);
  lead.append(brand, history);
  const workbar = el("div", "editor-workbar");
  const viewControls = el("div", "editor-view-controls");
  workbar.append(viewControls);
  topbar.append(lead, workbar);

  /** A Forge hover menu: icon + current label + chevron, a popover of choices. */
  const topbarMenu = (kind: string, icon: string, ariaLabel: string, choices: readonly MenuChoice[], pick: (id: string) => void) => {
    const menu = el("div", `${kind}-menu topbar-menu`);
    const button = el("button", "topbar-menu-button");
    button.type = "button";
    button.setAttribute("aria-label", ariaLabel);
    button.dataset.testid = `${kind}-button`;
    const label = el("span");
    button.innerHTML = icon; // The shell's own static SVG.
    button.append(label);
    button.insertAdjacentHTML("beforeend", MENU_CHEVRON);
    // A hover menu: a click must not take focus and pin it open (Forge).
    button.addEventListener("mousedown", (event) => event.preventDefault());
    const popover = el("div", "topbar-popover");
    const options = choices.map(([id, text]) => {
      const option = el("button", "", text);
      option.type = "button";
      option.dataset[`${kind}Choice`] = id;
      option.addEventListener("click", () => pick(id));
      return option;
    });
    popover.append(...options);
    menu.append(button, popover);
    // Entering one menu closes the others at once (Forge's hover intent).
    menu.addEventListener("pointerenter", () => {
      for (const other of viewControls.querySelectorAll(".topbar-menu")) other.classList.toggle("force-closed", other !== menu);
    });
    viewControls.append(menu);
    return {
      show(id: string) {
        label.textContent = choices.find(([choice]) => choice === id)?.[1] ?? id;
        for (const option of options) option.classList.toggle("active", option.dataset[`${kind}Choice`] === id);
      },
    };
  };

  const outliner = el("aside", "editor-panel editor-outliner");
  const outlinerHeading = el("div", "editor-panel-heading");
  const outlinerCount = el("small");
  outlinerHeading.append(el("span", "", "Outliner"), outlinerCount);
  const outlinerList = el("div", "outliner-list");
  outlinerList.setAttribute("role", "listbox");
  outliner.append(outlinerHeading, outlinerList);

  const details = el("aside", "editor-panel editor-details");
  const detailsHeading = el("div", "editor-panel-heading");
  detailsHeading.append(el("span", "", "Details"));
  const detailsBody = el("div", "details-scroll");
  details.append(detailsHeading, detailsBody);

  const statusLine = el("footer", "editor-status");
  const statusText = el("span", "", "Loading level");
  statusText.dataset.testid = "editor-status";
  statusLine.append(statusText);
  const toast = el("div", "editor-toast");
  toast.setAttribute("role", "alert");
  toast.hidden = true;
  const toastText = el("span", "editor-toast-text");
  toastText.dataset.testid = "editor-toast";
  const toastClose = el("button", "editor-toast-close", "✕");
  toastClose.type = "button";
  toastClose.setAttribute("aria-label", "Dismiss");
  toastClose.addEventListener("click", () => (toast.hidden = true));
  toast.append(toastText, toastClose);

  root.append(viewport, topbar, outliner, details, statusLine, toast);
  save.disabled = true;
  undo.disabled = true;
  redo.disabled = true;

  const status = (message: string, tone: "info" | "warning" | "error" = "info"): void => {
    statusText.textContent = message;
    statusLine.dataset.tone = tone;
    if (tone === "info") return;
    toastText.textContent = message;
    toast.dataset.tone = tone;
    toast.hidden = false;
  };

  return {
    root,
    viewport,
    status,
    attachViewport(menus) {
      const camera = topbarMenu("camera", TOOLBAR_ICONS.camera, "Camera view", menus.views, (id) => menus.setView(id));
      camera.show(menus.view());
      menus.onViewChange((view) => camera.show(view));
      doc.defaultView?.addEventListener("keydown", (event) => {
        if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
        const target = event.target as HTMLElement | null;
        if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)) return;
        if (event.code === "KeyF") {
          event.preventDefault();
          menus.focusSelection();
          return;
        }
        const view = VIEW_KEYS[event.code];
        if (!view) return;
        event.preventDefault();
        menus.setView(view);
      });
    },
    attach(editor) {
      let detailsFor: ActorId | null = null;
      let detailsView: FormView | null = null;

      const renderOutliner = (): void => {
        const actors = editor.level.level.actors;
        outlinerCount.textContent = `${actors.length} actor${actors.length === 1 ? "" : "s"}`;
        outlinerList.replaceChildren(
          ...actors.map((actor) => {
            const row = el("button", "outliner-row");
            row.type = "button";
            row.dataset.testid = "outliner-row";
            row.dataset.actorId = actor.id;
            row.setAttribute("role", "option");
            const selected = editor.selection.has(actor.id);
            row.classList.toggle("active", selected);
            row.setAttribute("aria-selected", String(selected));
            const icon = el("span", "outliner-icon");
            icon.innerHTML = ACTOR_TYPE_ICONS.generic; // Static SVG; type icons come with the Outliner (step 5).
            const name = el("span", "outliner-name", actor.name || actor.id);
            name.title = actor.id;
            row.append(icon, name, el("span", "outliner-meta", actor.parent === null ? "" : "child"));
            row.addEventListener("click", () => editor.selection.set([actor.id]));
            return row;
          }),
        );
      };

      const renderDetails = (): void => {
        const id = editor.selection.primary();
        const actor: ActorDoc | undefined = id === null ? undefined : editor.level.actor(id);
        if (!actor) {
          detailsFor = null;
          detailsView = null;
          const empty = el("div", "empty-details");
          empty.append(el("strong", "", "Nothing selected"), el("span", "", "Ayrıntıları görmek için Outliner'dan bir aktör seçin."));
          detailsBody.replaceChildren(empty);
          return;
        }
        if (detailsFor === actor.id && detailsView) {
          detailsView.update({ transform: actor.transform });
          return;
        }
        detailsFor = actor.id;
        const heading = el("div", "empty-details");
        heading.append(el("strong", "", actor.name || actor.id), el("span", "", actor.id));
        detailsView = createFormView({
          document: doc,
          fields: TRANSFORM_FIELDS,
          value: { transform: actor.transform },
          testIdPrefix: "detail",
          warn: (message) => status(message, "warning"),
          onChange: (change) => {
            if (change.phase !== "commit") return;
            const current = editor.level.actor(actor.id);
            if (!current) return;
            // One committed field, one undo step (a slider drag's `input` phase merges in step 5).
            const result = editor.edit(`Transform ${current.name || current.id}`, (tx) => tx.setActor({ ...current, transform: change.next.transform }));
            if (!result.ok) status(result.issues.map((issue) => issue.message).join("; "), "error");
          },
        });
        detailsBody.replaceChildren(heading, detailsView.element);
      };

      const renderToolbar = (): void => {
        undo.disabled = !editor.canUndo();
        redo.disabled = !editor.canRedo();
        save.disabled = options.readOnly || editor.dirty() === 0;
      };

      const runSave = async (): Promise<void> => {
        if (options.readOnly) return;
        save.disabled = true;
        status("Saving");
        const report = await editor.save();
        status(report.message, report.ok ? "info" : "error");
        renderToolbar();
      };
      const runUndo = (): void => {
        if (editor.undo()) status("Undo");
      };
      const runRedo = (): void => {
        if (editor.redo()) status("Redo");
      };
      save.addEventListener("click", () => void runSave());
      undo.addEventListener("click", runUndo);
      redo.addEventListener("click", runRedo);
      doc.defaultView?.addEventListener("keydown", (event) => {
        if (event.code !== "Escape" || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
        const target = event.target as HTMLElement | null;
        if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) return;
        editor.selection.set([]);
      });
      doc.defaultView?.addEventListener("keydown", (event) => {
        if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
        const target = event.target as HTMLElement | null;
        if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT") && event.key.toLowerCase() !== "s") return;
        const key = event.key.toLowerCase();
        if (key === "s") void runSave();
        else if (key === "z" && !event.shiftKey) runUndo();
        else if (key === "y" || (key === "z" && event.shiftKey)) runRedo();
        else return;
        event.preventDefault();
      });

      const refresh = (): void => {
        renderOutliner();
        renderDetails();
        renderToolbar();
      };
      editor.onChange(refresh);
      refresh();
      status("Ready");
      root.dataset.editorReady = "1";
    },
  };
}
