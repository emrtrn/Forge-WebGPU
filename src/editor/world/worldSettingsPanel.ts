// The World Settings popover (INV-A30, plan phase 4 step 5e): Forge WebGL's
// popover under the top left, opened from the main menu (EditorUi.ts
// `openWorldSettingsPopover`, worldSettingsPanel.ts @ forge-webgl-final), with
// what World Settings is now (worldSettings.ts): the level's settings and its
// one-per-level environment actors. Escape, a click outside or the close
// button closes it. Text is set with textContent.
//
// Streaming (phase 5b decision 1): the level's View Distance and Load Range,
// one undo step per slider drag; the form is kept across redraws and the
// panel does not redraw while a slider moves (the drag would be lost).

import { formFields, LevelSettingsFields, type ClassResolver, type SchemaRegistry } from "../../core/index.ts";
import type { ActorPlacer } from "../place/actorPlacer.ts";
import type { EditorSession } from "../session/editorSession.ts";
import { createFormView, createSection } from "../ui/formView.ts";
import { environmentRows } from "./worldSettings.ts";
import { SHADOW_SETTINGS_COMPONENT, setObjectShadows, setSceneShadows, shadowSettingsTarget } from "./sceneShadows.ts";
import { generateLevelZones, type ModelBounds } from "./zones.ts";

export interface WorldSettingsOptions {
  readonly document: Document;
  /** Where it opens (the shell). */
  readonly host: HTMLElement;
  readonly editor: EditorSession;
  readonly registry: SchemaRegistry;
  readonly resolveClass: ClassResolver;
  /** Adds a missing actor; null before the viewport is up. */
  readonly placer: () => ActorPlacer | null;
  /** Static meshes' model bounds for Generate Zones (plan 5c R9b); null before the viewport is up. */
  readonly modelBounds?: () => ModelBounds | null;
}

export interface WorldSettingsPopover {
  open(): void;
  close(): void;
  readonly isOpen: boolean;
}

export function createWorldSettings(options: WorldSettingsOptions): WorldSettingsPopover {
  const { document: doc, editor } = options;
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text?: string): HTMLElementTagNameMap[K] => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const popover = el("div", "world-settings-popover forge-kit");
  popover.dataset.testid = "world-settings";
  popover.setAttribute("role", "dialog");
  popover.setAttribute("aria-label", "World Settings");
  popover.hidden = true;
  const head = el("div", "world-settings-popover-head");
  const closeButton = el("button", "world-settings-popover-close", "✕");
  closeButton.type = "button";
  closeButton.setAttribute("aria-label", "Close");
  closeButton.dataset.testid = "world-settings-close";
  head.append(closeButton);
  const body = el("div", "details-body world-settings-body");
  popover.append(head, body);
  options.host.append(popover);

  const row = (label: string, value: HTMLElement): HTMLElement => {
    const line = el("div", "detail-row");
    line.append(el("span", "", label), value);
    return line;
  };

  const streamingFeedback = el("div", "detail-hint");
  streamingFeedback.setAttribute("role", "status");
  const streamingValue = (): Record<string, unknown> => ({
    viewDistance: editor.level.level.settings.viewDistance,
    loadRange: editor.level.level.settings.loadRange,
  });
  let streamingInput = false;
  const streamingForm = createFormView({
    document: doc,
    fields: formFields({ viewDistance: LevelSettingsFields.viewDistance, loadRange: LevelSettingsFields.loadRange }),
    value: streamingValue(),
    testIdPrefix: "world-settings",
    warn: (message) => { streamingFeedback.textContent = message; },
    onChange: (change) => {
      const key = String(change.path[0]);
      streamingInput = change.phase === "input";
      let result;
      try {
        result = editor.edit(`Edit ${key}`, (tx) => tx.setSettings({ [key]: change.value }), { coalesce: `world-settings:${key}` });
      } finally {
        streamingInput = false;
      }
      if (change.phase === "commit") editor.level.history.seal();
      streamingFeedback.textContent = result.ok ? "" : result.issues.map((issue) => issue.message).join(" ");
    },
  });

  /** Generate Zones' last outcome: the panel redraws after the edit, the line is drawn again from it. */
  let zoneReport: { text: string; zones: number; portals: number } | null = null;
  let zoneFeedbackNow: HTMLElement | null = null;
  const showZoneReport = (element: HTMLElement): void => {
    element.textContent = zoneReport?.text ?? "";
    if (zoneReport) { element.dataset.zones = String(zoneReport.zones); element.dataset.portals = String(zoneReport.portals); }
  };
  const draw = (): void => {
    if (streamingInput) return;
    const level = editor.level.level;
    const heading = el("div", "detail-heading");
    heading.append(el("strong", "", "World Settings"), el("span", "", editor.level.folder));
    const levelPart = createSection(doc, "Level", { testId: "world-settings-level" });
    const cellSize = el("output", "detail-value", String(level.settings.cellSize));
    cellSize.dataset.testid = "world-settings-cell-size";
    levelPart.body.append(
      row("Level", el("output", "detail-value", level.id)),
      row("Cell Size (m)", cellSize),
      el("div", "detail-hint", "Akış ızgarasının hücre kenarı. Değiştirmek bütün hücre dosyalarını yeniden yazan dünya çapı bir işlemdir; editörden değiştirilmez."),
    );
    const streaming = createSection(doc, "Streaming", { testId: "world-settings-streaming" });
    streamingForm.update(streamingValue());
    streaming.body.append(
      streamingForm.element,
      el("div", "detail-hint", "Hücreler kameranın Load Range çevresinde yüklenir. View Distance oyun kamerasının uzak düzlemidir; editör kamerası kendi uzak düzlemini kullanır."),
      streamingFeedback,
    );
    const shadows = createSection(doc, "Shadows", { testId: "world-settings-shadows" });
    const enabled = el("input");
    enabled.type = "checkbox";
    enabled.setAttribute("aria-label", "Scene Shadows");
    enabled.dataset.testid = "world-settings-shadows-enabled";
    enabled.checked = shadowSettingsTarget(level.actors, options.resolveClass)?.enabled ?? true;
    const supported = options.registry.components().some((component) => component.name === SHADOW_SETTINGS_COMPONENT);
    enabled.disabled = !supported;
    const feedback = el("div", "detail-hint");
    feedback.setAttribute("role", "status");
    enabled.addEventListener("change", () => {
      const result = setSceneShadows(editor, options.resolveClass, enabled.checked);
      if (!result.ok) { enabled.checked = !enabled.checked; feedback.textContent = result.issues.map((issue) => issue.message).join(" "); }
    });
    const bulk = el("div", "world-settings-shadow-actions");
    const incomplete = editor.level.unloadedCells().length > 0;
    for (const value of [true, false]) {
      const button = el("button", "detail-action-button", value ? "Enable on Objects" : "Disable on Objects");
      button.type = "button";
      button.dataset.testid = `world-settings-object-shadows-${value ? "on" : "off"}`;
      button.disabled = !supported || incomplete;
      button.addEventListener("click", () => {
        const result = setObjectShadows(editor, options.resolveClass, value);
        if (!result.ok) feedback.textContent = result.issues.map((issue) => issue.message).join(" ");
      });
      bulk.append(button);
    }
    shadows.body.append(row("Scene Shadows", enabled),
      el("div", "detail-hint", "Sahnenin genel gölge anahtarı. Nesnelerin kendi tercihlerini korur; kalite profili gölgeyi ayrıca sınırlar."),
      bulk, el("div", "detail-hint", incomplete
        ? "Toplu işlem için sahnenin bütün hücrelerini yükleyin."
        : "Modellerin ve temel şekillerin Cast Shadow değerlerini topluca değiştirir. Her işlem tek adımda geri alınır."), feedback);
    // Zones (plan 5c R9b): rooms and doors from the walls, one undo step; the user's zones stay.
    const zones = createSection(doc, "Zones", { testId: "world-settings-zones" });
    const zonesSupported = options.registry.components().some((component) => component.name === "forge.zone");
    const zoneFeedback = el("div", "detail-hint");
    zoneFeedback.setAttribute("role", "status");
    zoneFeedback.dataset.testid = "world-settings-zones-status";
    zoneFeedbackNow = zoneFeedback;
    showZoneReport(zoneFeedback);
    const generate = el("button", "detail-action-button", "Generate Zones");
    generate.type = "button";
    generate.dataset.testid = "world-settings-generate-zones";
    generate.disabled = !zonesSupported || incomplete;
    generate.addEventListener("click", () => {
      generate.disabled = true;
      zoneFeedback.textContent = "Bölgeler üretiliyor…";
      void generateLevelZones(editor, options.registry, options.resolveClass, options.modelBounds?.() ?? null).then(({ result, plan }) => {
        generate.disabled = false;
        zoneReport = {
          zones: plan?.zones ?? 0, portals: plan?.portals ?? 0,
          text: !result.ok
            ? result.issues.map((issue) => issue.message).join(" ")
            : plan?.floorY === null || plan === null
              ? "Göz hizasına uzanan duvar bulunamadı; bölge üretilmedi."
              : `${plan.zones} bölge, ${plan.portals} portal üretildi${plan.kept > 0 ? `; elle düzenlenen ${plan.kept} bölge korundu` : ""}.`,
        };
        if (zoneFeedbackNow) showZoneReport(zoneFeedbackNow);
      }, (error: unknown) => {
        generate.disabled = false;
        zoneReport = { text: String(error), zones: 0, portals: 0 };
        if (zoneFeedbackNow) showZoneReport(zoneFeedbackNow);
      });
    });
    zones.body.append(generate, el("div", "detail-hint", incomplete
      ? "Bölgeleri üretmek için sahnenin bütün hücrelerini yükleyin."
      : "Duvarlardan odaları ve kapıları bulur; her odaya bir Zone Volume, her kapıya bir Portal yazar. Önceki üretileni değiştirir; Generated işareti kapatılan bölgeler korunur. Tek adımda geri alınır."), zoneFeedback);
    const environment = createSection(doc, "Environment", { testId: "world-settings-environment" });
    const placer = options.placer();
    const entries = placer?.entries() ?? [];
    for (const item of environmentRows(options.registry, level.actors, options.resolveClass, entries)) {
      if (item.component === SHADOW_SETTINGS_COMPONENT) continue;
      const button = el("button", "detail-action-button", item.actor ? item.actor.name || item.actor.id : "Add");
      button.type = "button";
      if (item.actor) {
        const actor = item.actor;
        button.dataset.testid = `world-settings-select-${item.component}`;
        button.title = "Seç; Details'te düzenlenir";
        button.addEventListener("click", () => {
          editor.selection.set([actor.id]);
          close();
        });
      } else {
        const key = item.entry;
        button.dataset.testid = `world-settings-add-${item.component}`;
        button.title = "Level'a ekle";
        button.disabled = key === null || placer === null;
        button.addEventListener("click", () => {
          if (key !== null) void placer?.click(key);
        });
      }
      environment.body.append(row(item.label, button));
    }
    environment.body.append(el("div", "detail-hint", "Ortamın değerleri bu aktörlerin bileşenlerindedir; seçip Details'te düzenleyin."));
    body.replaceChildren(heading, levelPart.section, streaming.section, shadows.section, zones.section, environment.section);
  };

  const onPointerDown = (event: Event): void => {
    const target = event.target as Node | null;
    if (target && !popover.contains(target) && !(target as Element).closest?.(".context-menu")) close();
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.code !== "Escape") return;
    event.stopPropagation();
    close();
  };
  let stopFollowing: (() => void) | null = null;
  const open = (): void => {
    draw();
    if (!popover.hidden) return;
    popover.hidden = false;
    stopFollowing = editor.onChange(draw);
    doc.defaultView?.setTimeout(() => doc.addEventListener("pointerdown", onPointerDown, true), 0);
    doc.addEventListener("keydown", onKeyDown, true);
  };
  function close(): void {
    if (popover.hidden) return;
    popover.hidden = true;
    stopFollowing?.();
    stopFollowing = null;
    doc.removeEventListener("pointerdown", onPointerDown, true);
    doc.removeEventListener("keydown", onKeyDown, true);
  }
  closeButton.addEventListener("click", close);
  return {
    open,
    close,
    get isOpen() {
      return !popover.hidden;
    },
  };
}

/** Forge's World Settings popover and main menu button styles. */
export const WORLD_SETTINGS_CSS = `
.editor-shell .editor-main-menu-button {
  flex: 0 0 auto;
}

.world-settings-popover {
  position: absolute;
  top: 50px;
  left: 8px;
  z-index: 90;
  width: 320px;
  max-width: calc(100vw - 16px);
  max-height: calc(100vh - 66px);
  overflow-y: auto;
  border: 1px solid var(--forge-border-mid);
  border-radius: 8px;
  background: var(--forge-bg-2);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.45);
}

.world-settings-popover[hidden] {
  display: none;
}

.world-settings-popover-head {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 6px 8px;
  border-bottom: 1px solid var(--forge-border-soft);
  background: var(--forge-bg-2);
}

.editor-shell .world-settings-popover-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  min-height: 0;
  height: 22px;
  padding: 0;
  border: 0;
  border-radius: var(--forge-radius-sm);
  background: transparent;
  color: var(--forge-text-dim);
  font-size: 13px;
}

.editor-shell .world-settings-popover-close:hover {
  background: var(--forge-border-soft);
  color: var(--forge-text);
}

.world-settings-popover .world-settings-body {
  display: grid;
  gap: 8px;
  padding: 8px 12px 12px;
}

.world-settings-popover .detail-heading {
  display: grid;
  gap: 2px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--forge-border-soft);
}

.world-settings-popover .detail-heading span {
  color: var(--forge-text-dim);
  font-size: 12px;
}

.world-settings-popover .detail-section-body {
  display: grid;
  gap: 6px;
  padding: 8px 4px;
}

.world-settings-shadow-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
`;

const STYLE_ID = "forge-editor-world-settings-style";

export function installWorldSettingsStyle(document: Document): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = WORLD_SETTINGS_CSS;
  document.head.appendChild(style);
}
