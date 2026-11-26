// The Details panel (INV-A13, A14, A16; plan phase 4 step 5b): the selected
// actors' name, transform, pivot / placement (Forge's instanceDetails.ts @
// forge-webgl-final), Spatially Loaded, and every component's form from its
// schema (detailsModel.ts; Forge's hand-written specialActorDetails.ts gives
// way to it). Every control comes from the UI kit's form view.
//
// - Several actors: the shared components; differing values show "Multiple
//   Values"; an edit writes that one field to all of them, one undo step.
// - A slider or colour drag is one undo step: its `input` edits merge
//   (history coalescing) and the commit seals the step; while it moves the
//   panel does not redraw (the slider under the pointer stays).
// - A gizmo drag shows live in the transform fields (`TransformTools.preview`).
// - A class actor's overridden fields carry a reset arrow, a component its
//   Reset All; a plain actor adds and removes components.
// - A locked actor's transform, pivot and placement are read only (Lock
//   Movement, step 5a); its components stay editable (Forge).
// - A feature may add to its component's section (step 5e: `details` of
//   `defineFeatureEditor`, e.g. Ground Mist Setup, the World Environment
//   preview); what it adds is disposed when the panel draws again.
// Text is set with textContent; the only markup is the kit's static icons.

import {
  ActorPivotField,
  ActorStreamingFields,
  formFields,
  parseComponentTypeTag,
  transform,
  type ActorDoc,
  type ActorId,
  type ClassResolver,
  type FormField,
  type SchemaRegistry,
  type Vec3,
} from "../../core/index.ts";
import type { AssetCatalog } from "../assets/assetCatalog.ts";
import type { EditorCatalog } from "../host/editorCatalog.ts";
import type { EditorSession } from "../session/editorSession.ts";
import type { PivotPreset, TransformTools } from "../transformTools.ts";
import { getAtPath, pathKey, type FormPath } from "../../engine/edit/formPath.ts";
import { createFormView, createSection, MIXED_TEXT, type FormChange } from "../ui/formView.ts";
import { linkedScaleAxis } from "../../engine/math/scale.ts";
import { ACTOR_TYPE_ICONS, UI_ICONS } from "../ui/icons.ts";
import {
  addComponent,
  cannotAdd,
  detailsTarget,
  editActor,
  editComponent,
  removeComponent,
  resetOverride,
  withRotationAxis,
  type DetailsTarget,
} from "../../engine/edit/actorFields.ts";
import { componentSections, mixedPaths, visibleInDetails } from "./detailsModel.ts";
import { openPicker } from "./pickerPopover.ts";

const ACTOR_FIELDS = formFields({
  transform: transform({ label: "Transform", hint: "Aktörün konumu, dönüşü ve ölçeği (ebeveynine göre)." }),
});
const PIVOT_FIELDS = formFields({ pivot: ActorPivotField });
const GENERAL_FIELDS: readonly FormField[] = formFields(ActorStreamingFields);
/** Forge's pivot presets (Details' Pivot row). */
const PIVOT_PRESETS: readonly (readonly [PivotPreset, string, string])[] = [
  ["reset", "Reset to Origin", "Pivot model orijininde"],
  ["center", "Center Pivot", "Pivot sınır kutusunun merkezinde"],
  ["base", "Use Base", "Pivot alt merkezde (ör. zemine oturan bir menteşe)"],
];

export interface DetailsPanelOptions {
  readonly document: Document;
  readonly editor: EditorSession;
  readonly registry: SchemaRegistry;
  readonly resolveClass: ClassResolver;
  readonly assets: AssetCatalog;
  /** The features' Details extensions. */
  readonly catalog: EditorCatalog;
  /** Each editor frame with its seconds; returns the unsubscribe. */
  readonly onFrame: (listener: (dt: number) => void) => () => void;
  /** Where pickers open (the Details panel). */
  readonly host: HTMLElement;
  readonly status: (message: string, tone?: "info" | "warning" | "error") => void;
  /** The Content Browser (step 6f): its selected asset (Use Selected) and showing one (Browse To). */
  readonly content?: {
    selected(): { readonly id: string; readonly type: string } | null;
    reveal(guid: string): void;
  };
}

export interface DetailsPanel {
  readonly element: HTMLElement;
  /** The transform tools: pivot / placement actions and the live gizmo preview. */
  setTools(tools: TransformTools): void;
  /** Redraws from the session (the panel also follows the session itself). */
  refresh(): void;
}

export function createDetailsPanel(options: DetailsPanelOptions): DetailsPanel {
  const { document: doc, editor, registry, resolveClass, assets, status } = options;
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text?: string): HTMLElementTagNameMap[K] => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const element = el("div", "details-panel");
  let tools: TransformTools | null = null;
  /** True while the panel's own `input` edit runs: it must not redraw the control under the pointer. */
  let editing = false;
  let actorView: ReturnType<typeof createFormView> | null = null;
  let pivotView: ReturnType<typeof createFormView> | null = null;
  const uiState = { collapsed: new Map<string, boolean>(), linkedScales: new Set<string>() };
  const panelSection = (title: string, key: string, collapsed = true) => {
    const parts = createSection(doc, title, { testId: key, collapsed: uiState.collapsed.get(key) ?? collapsed });
    parts.toggle.addEventListener("click", () => uiState.collapsed.set(key, parts.section.classList.contains("collapsed")));
    return parts;
  };
  /** What the drawn extensions leave to clean up (their frame listeners, their own dispose). */
  let disposers: (() => void)[] = [];

  const targets = (): DetailsTarget[] =>
    editor.selection
      .ids()
      .map((id) => editor.level.actor(id))
      .filter((doc): doc is ActorDoc => doc !== undefined)
      .map((doc) => detailsTarget(doc, resolveClass));

  const report = (issues: readonly { readonly message: string }[]): void => status(issues.map((issue) => issue.message).join("; "), "error");

  /** One edit of every selected actor; `input` edits of the same field merge until the commit seals the step. */
  const apply = (label: string, phase: FormChange["phase"], scope: string, build: (target: DetailsTarget) => ActorDoc): void => {
    const now = targets();
    if (now.length === 0) return;
    const key = `details:${now.map((target) => target.doc.id).join(",")}:${scope}`;
    editing = phase === "input";
    let result;
    try {
      result = editor.edit(label, (tx) => {
        for (const target of now) {
          const next = build(target);
          if (next !== target.doc) tx.setActor(next);
        }
      }, { coalesce: key });
    } finally {
      editing = false;
    }
    if (phase === "commit") editor.level.history.seal();
    if (!result.ok) report(result.issues);
  };

  /** A change's path and value for one actor: a rotation axis keeps that actor's other two axes. */
  const leafFor = (root: unknown, change: FormChange): { path: FormPath; value: unknown } => {
    if (change.scale) {
      const before = getAtPath(root, change.path) as Vec3;
      return { path: change.path, value: linkedScaleAxis(before, change.scale.axis, change.scale.value) };
    }
    if (!change.rotation) return { path: change.path, value: change.value };
    const at = change.path.slice(0, -1);
    const current = getAtPath(root, at) as Parameters<typeof withRotationAxis>[0];
    return { path: at, value: withRotationAxis(current, change.rotation.axis, change.rotation.degrees) };
  };

  const what = (now: readonly DetailsTarget[]): string => (now.length === 1 ? now[0]!.doc.name || now[0]!.doc.id : `${now.length} actors`);

  // --- Pivot and Placement (Forge's instanceDetails.ts) -----------------------
  const actions = el("div", "details-placement-toolbar");
  actions.dataset.testid = "detail-placement-toolbar";
  actions.setAttribute("role", "group");
  actions.setAttribute("aria-label", "Pivot, snapping and movement");
  const pivotHost = el("div");
  const pivotSummary = el("span", "detail-transform-summary");
  const actionButton = (text: string, hint: string, testId: string, run: () => void): HTMLButtonElement => {
    const button = el("button", "detail-action-button", text);
    button.type = "button";
    button.title = hint;
    button.dataset.testid = testId;
    button.addEventListener("click", run);
    return button;
  };
  // Native auto popovers provide outside-click / Escape dismissal, focus return,
  // and mutual exclusion, and escape the inspector's scrolling container.
  const popover = (key: string, label: string): HTMLElement => {
    const popup = el("div", "details-action-popover");
    popup.id = `forge-details-${key}`;
    popup.dataset.testid = `detail-${key}`;
    popup.setAttribute("popover", "auto");
    popup.setAttribute("role", "dialog");
    popup.setAttribute("aria-label", label);
    return popup;
  };
  const pivotPopup = popover("pivot-options", "Pivot options");
  const snapPopup = popover("snap-options", "Snap options");
  const closePopup = (popup: HTMLElement): void => {
    if (popup.matches(":popover-open")) popup.hidePopover();
  };
  const closePopups = (): void => { closePopup(pivotPopup); closePopup(snapPopup); };
  const attachPopup = (button: HTMLButtonElement, popup: HTMLElement, width: number): void => {
    button.popoverTargetElement = popup;
    button.setAttribute("aria-haspopup", "dialog");
    button.setAttribute("aria-controls", popup.id);
    button.setAttribute("aria-expanded", "false");
    const position = (): void => {
      const rect = button.getBoundingClientRect();
      const available = doc.documentElement.clientWidth;
      const actualWidth = Math.min(width, available - 16);
      popup.style.width = `${actualWidth}px`;
      const left = button.closest(".details-pivot-split")?.getBoundingClientRect().left ?? rect.left;
      popup.style.left = `${Math.max(8, Math.min(left, available - actualWidth - 8))}px`;
      popup.style.top = `${Math.max(8, Math.min(rect.bottom + 6, doc.documentElement.clientHeight - popup.offsetHeight - 8))}px`;
    };
    popup.addEventListener("beforetoggle", (event) => {
      if ((event as ToggleEvent).newState === "open") position();
    });
    popup.addEventListener("toggle", () => {
      const open = popup.matches(":popover-open");
      button.setAttribute("aria-expanded", String(open));
      if (open) position();
    });
    popup.addEventListener("keydown", (event) => {
      if (event.key === "Escape") event.stopPropagation();
    });
  };
  doc.defaultView?.addEventListener("resize", closePopups);
  doc.addEventListener("scroll", (event) => {
    if (event.target instanceof Node && (pivotPopup.contains(event.target) || snapPopup.contains(event.target))) return;
    closePopups();
  }, true);

  const pivotDrag = actionButton("Edit Pivot", "Viewport'ta pivot düzenlemeyi aç / kapat", "pivot-drag", () => {
    closePopups();
    tools?.setPivotEdit(!tools.pivotEdit);
  });
  const pivotOptions = actionButton("", "Pivot hazır konumları ve sayısal ayarlar", "pivot-options-toggle", () => {});
  pivotOptions.innerHTML = UI_ICONS.chevronDown;
  pivotOptions.setAttribute("aria-label", "Pivot options");
  attachPopup(pivotOptions, pivotPopup, 340);
  const pivotSplit = el("div", "details-pivot-split");
  pivotSplit.append(pivotDrag, pivotOptions);
  const presetRow = el("div", "details-action-list");
  for (const [preset, text, hint] of PIVOT_PRESETS) presetRow.append(actionButton(text, hint, `pivot-${preset}`, () => {
    closePopup(pivotPopup);
    tools?.setPivotPreset(preset);
  }));
  const pivotHeading = el("div", "details-popover-heading", "Pivot");
  pivotHeading.append(pivotSummary);
  pivotPopup.append(pivotHeading, presetRow, pivotHost);
  const snapToggle = actionButton("Snap", "Yüzeye hizalama seçenekleri", "snap-options-toggle", () => {});
  const snapChevron = el("span");
  snapChevron.innerHTML = UI_ICONS.chevronDown;
  snapToggle.append(snapChevron);
  attachPopup(snapToggle, snapPopup, 215);
  const snapFloor = actionButton("Snap to Floor", "Alttaki yüzeye bırak (End)", "snap-floor", () => { closePopup(snapPopup); tools?.snapToFloor(); });
  snapFloor.append(el("kbd", "", "End"));
  const snapWall = actionButton("Snap to Wall", "En yakın duvara yasla", "snap-wall", () => { closePopup(snapPopup); tools?.snapToWall(); });
  snapPopup.append(snapFloor, snapWall);
  const lockButton = actionButton("", "Aktörün taşınmasını, döndürülmesini ve ölçeklenmesini kilitle", "detail-locked", () => {
    const locked = !targets().every((target) => target.doc.locked === true);
    apply(`${locked ? "Lock" : "Unlock"} ${what(targets())}`, "commit", "locked", ({ doc: actor }) => {
      if ((actor.locked === true) === locked) return actor;
      const next: ActorDoc = { ...actor };
      if (locked) next.locked = true;
      else delete next.locked;
      return next;
    });
  });
  lockButton.setAttribute("aria-label", "Lock Movement");
  actions.append(pivotSplit, snapToggle, lockButton, pivotPopup, snapPopup);
  // The editor's global Escape clears selection. Consume it first when an action popup is open,
  // including when focus is still on its trigger rather than inside the popup.
  doc.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const popup = [pivotPopup, snapPopup].find((candidate) => candidate.matches(":popover-open"));
    if (!popup) return;
    event.preventDefault();
    event.stopPropagation();
    closePopup(popup);
    (popup === pivotPopup ? pivotOptions : snapToggle).focus();
  }, true);
  const pivotButtons = [pivotDrag, ...presetRow.querySelectorAll("button")];
  let actionSelection = "";
  const renderActions = (now: readonly DetailsTarget[]): void => {
    actions.hidden = tools === null;
    const on = tools?.pivotEdit === true;
    pivotDrag.classList.toggle("on", on);
    pivotDrag.setAttribute("aria-pressed", String(on));
    pivotDrag.textContent = on ? "Editing Pivot" : "Edit Pivot";
    const locked = now.map((target) => target.doc.locked === true);
    const pivots = now.map((target) => ({ pivot: target.doc.pivot ?? [0, 0, 0] }));
    pivotSummary.textContent = pivots.every((value) => value.pivot.every((axis) => axis === 0)) ? "Pivot: Origin" : "Pivot: Custom";
    pivotView = createFormView({
      document: doc,
      fields: PIVOT_FIELDS,
      value: pivots[0]!,
      testIdPrefix: "detail",
      mixed: mixedPaths(pivots),
      disabled: locked.some(Boolean),
      onChange: (change) => apply(`Edit pivot of ${what(now)}`, change.phase, pathKey(change.path), ({ doc: actor }) => editActor({ ...actor, pivot: actor.pivot ?? [0, 0, 0] }, change.path, change.value)),
    });
    pivotHost.replaceChildren(pivotView.element);
    const allLocked = locked.every(Boolean);
    lockButton.setAttribute("aria-pressed", locked.some(Boolean) && !allLocked ? "mixed" : String(allLocked));
    lockButton.classList.toggle("on", locked.some(Boolean));
    lockButton.innerHTML = allLocked ? UI_ICONS.lock : UI_ICONS.unlock;
    lockButton.append(el("span", "", "Movement"));
    lockButton.title = locked.some(Boolean) && !allLocked ? "Seçimde kilitli ve kilitsiz aktörler var; tümünü kilitle" : allLocked ? "Hareket kilidini aç" : "Aktörün taşınmasını, döndürülmesini ve ölçeklenmesini kilitle";
    for (const button of [...pivotButtons, snapFloor, snapWall]) button.disabled = locked.some(Boolean);
    snapToggle.disabled = locked.some(Boolean);
  };

  // --- The panel -------------------------------------------------------------------
  const actorValue = (target: DetailsTarget): Record<string, unknown> => {
    const preview = tools?.preview(target.doc.id);
    return { transform: preview?.transform ?? target.doc.transform, pivot: preview?.pivot ?? target.doc.pivot ?? ([0, 0, 0] satisfies Vec3) };
  };

  const header = (now: readonly DetailsTarget[]): HTMLElement => {
    const box = el("div", "details-header");
    const icon = el("div", "details-actor-icon");
    const look = options.catalog.present(now[0]!.components, false);
    icon.innerHTML = ACTOR_TYPE_ICONS[look.icon];
    box.append(icon);
    const nameRow = el("label", "detail-row");
    nameRow.append(el("span", "", "Name"));
    const name = el("input");
    name.dataset.testid = "detail-name";
    name.setAttribute("aria-label", "Name");
    if (now.length === 1) {
      name.value = now[0]!.doc.name;
      name.placeholder = now[0]!.doc.id;
      name.title = now[0]!.doc.id;
    } else {
      name.value = "";
      name.placeholder = MIXED_TEXT;
      name.disabled = true;
      name.title = "Birden çok aktör adı birlikte değiştirilmez.";
    }
    name.addEventListener("change", () => {
      const next = name.value;
      apply(`Rename ${what(now)}`, "commit", "name", ({ doc: actor }) => (actor.name === next ? actor : { ...actor, name: next }));
    });
    nameRow.append(name);
    box.append(nameRow);
    const info = el("div", "detail-row");
    if (now.length === 1) {
      const target = now[0]!;
      info.append(el("span", "", "Class"));
      const value = el("output", "detail-value", target.doc.class === null ? "None" : (target.cls?.name ?? `Missing (${target.doc.class})`));
      value.dataset.testid = "detail-class";
      info.append(value);
    } else {
      info.append(el("span", "", "Selection"), el("output", "detail-value", `${now.length} actors`));
    }
    box.append(info);
    box.append(el("div", "details-actor-kind", now.length === 1 ? look.kind : `${now.length} actors selected`));
    return box;
  };

  /** The components' sections, led by the extensions placed on top; a tool component (`details: "tool"`) leads with its extension and ends with its own fields, closed. */
  const componentBlock = (now: readonly DetailsTarget[], tool: string | null): HTMLElement[] => {
    const blocks: HTMLElement[] = [];
    const lead: HTMLElement[] = [];
    const tail: HTMLElement[] = [];
    for (const section of componentSections(now, registry)) {
      if (tool !== null && options.catalog.embedded(section.def.name)) continue;
      const isTool = section.def.name === tool;
      const { section: box, heading, toggle, body } = createSection(doc, section.def.label, { testId: `detail-component-${section.id}`, collapsed: isTool });
      if (section.def.hint) toggle.title = section.def.hint;
      if (section.fromClass) {
        if (section.overridden.size > 0) {
          const resetAll = el("button", "detail-inline-button", "Reset All");
          resetAll.type = "button";
          resetAll.title = "Bu bileşenin bütün override'larını kaldır, sınıf değerlerine dön";
          resetAll.dataset.testid = `detail-component-${section.id}-reset-all`;
          resetAll.addEventListener("click", () => apply(`Reset ${section.def.label}`, "commit", `${section.id}:reset`, ({ doc: actor }) => resetOverride(actor, section.id, null)));
          heading.append(resetAll);
        }
      } else if (!isTool && (!section.def.singleton || section.def.spatial)) {
        const remove = el("button", "detail-inline-button", "Remove");
        remove.type = "button";
        remove.title = "Bileşeni aktörden kaldır";
        remove.dataset.testid = `detail-component-${section.id}-remove`;
        remove.addEventListener("click", () => apply(`Remove ${section.def.label}`, "commit", `${section.id}:remove`, ({ doc: actor }) => removeComponent(actor, section.id)));
        heading.append(remove);
      }
      const view = createFormView({
        document: doc,
        uiState,
        accordion: options.catalog.accordion(section.def.name),
        fields: section.fields,
        value: section.value,
        testIdPrefix: `detail-${section.id}`,
        mixed: section.mixed,
        overridden: section.overridden,
        onReset: (key) => apply(`Reset ${section.def.label} ${key}`, "commit", `${section.id}:${key}:reset`, ({ doc: actor }) => resetOverride(actor, section.id, key)),
        warn: (message) => status(message, "warning"),
        assetLabel: (guid) => assets.label(guid),
        ...(options.content
          ? {
              selectedAsset: (type: string | null) => {
                const selected = options.content!.selected();
                return selected && (type === null || selected.type === type) ? selected.id : null;
              },
              browseToAsset: (guid: string) => options.content!.reveal(guid),
            }
          : {}),
        pickAsset: (type) =>
          openPicker({
            document: doc,
            host: options.host,
            title: "Select asset",
            testId: "asset-picker",
            items: assets.ofType(type).map((asset) => ({ id: asset.guid, label: asset.name, note: asset.file })),
          }),
        actorLabel: (id) => editor.level.actor(id as ActorId)?.name ?? null,
        onChange: (change) => {
          apply(`Edit ${section.def.label} ${pathKey(change.path)}`, change.phase, `${section.id}:${pathKey(change.path)}`, (target) => {
            const leaf = leafFor(target.components[section.id], change);
            return editComponent(target, section.id, leaf.path, leaf.value);
          });
        },
      });
      body.append(view.element);
      const extension = options.catalog.details(section.def.name);
      if (extension) {
        const built = extension({
          document: doc,
          value: () => {
            const component = targets()[0]?.components[section.id];
            return component ? { ...component } : {};
          },
          edit: (label, fields) =>
            apply(label, "commit", `${section.id}:extension`, (target) => {
              let next: DetailsTarget = target;
              for (const [key, value] of Object.entries(fields)) {
                const doc = editComponent(next, section.id, [key], value);
                next = { ...next, doc, components: doc.class === null ? doc.components : next.components };
              }
              return next.doc;
            }),
          target: () => {
            const first = targets()[0];
            return first ? { actor: first.doc.id, key: section.id } : null;
          },
          service: (key) => editor.world.services.get(key),
          onFrame: (listener) => {
            const stop = options.onFrame(listener);
            disposers.push(stop);
            return stop;
          },
          status,
        });
        if (isTool || options.catalog.extensionOnTop(section.def.name)) lead.push(built.element);
        else body.append(built.element);
        if (built.dispose) disposers.push(() => built.dispose!());
      }
      (isTool ? tail : blocks).push(box);
    }
    return [...lead, ...blocks, ...tail];
  };

  const addComponentButton = (target: DetailsTarget): HTMLElement => {
    const button = el("button", "detail-inline-button details-add-component", "+ Add Component");
    button.type = "button";
    button.title = "Aktöre bileşen ekle";
    button.dataset.testid = "detail-add-component";
    button.addEventListener("click", () => {
      const level = editor.level.level.actors;
      void openPicker({
        document: doc,
        host: options.host,
        title: "Add Component",
        testId: "component-picker",
        items: [...registry.components()]
          .filter(visibleInDetails)
          .sort((a, b) => a.label.localeCompare(b.label))
          .map((def) => ({ id: def.name, label: def.label, note: def.name, disabled: cannotAdd(target.doc, def, level, resolveClass) })),
      }).then((picked) => {
        const def = picked === null ? undefined : registry.getComponent(picked);
        if (!def) return;
        apply(`Add ${def.label}`, "commit", `add:${def.name}`, ({ doc: actor }) => addComponent(actor, def));
      });
    });
    return button;
  };

  function render(): void {
    if (editing) return;
    for (const dispose of disposers.splice(0)) dispose();
    const now = targets();
    const selectionKey = now.map((target) => target.doc.id).join(",");
    const openPopup = selectionKey === actionSelection ? [pivotPopup, snapPopup].find((popup) => popup.matches(":popover-open")) : undefined;
    actionSelection = selectionKey;
    const focused = doc.activeElement instanceof HTMLElement && element.contains(doc.activeElement) ? doc.activeElement.dataset.testid : undefined;
    if (now.length === 0) {
      actorView = null;
      pivotView = null;
      const empty = el("div", "empty-details");
      empty.append(el("strong", "", "Nothing selected"), el("span", "", "Ayrıntıları görmek için Outliner'dan bir aktör seçin."));
      element.replaceChildren(empty);
      return;
    }
    const values = now.map(actorValue);
    // A tool actor (Forge's Landscape) shows no placement: its data places it.
    const tool = now.length === 1 ? options.catalog.toolComponent(now[0]!.components) : null;
    // Scene-wide singleton actors have no meaningful placement or streaming controls.
    // Use effective components so class instances follow the same rule as plain actors.
    const showSpatialControls = tool === null && now.every((target) => {
      const components = Object.values(target.components);
      return components.length === 0 || !components.every((component) => {
        const name = parseComponentTypeTag(component.type)?.name;
        const def = name === undefined ? undefined : registry.getComponent(name);
        return def?.singleton === true && !def.spatial;
      });
    });
    actorView = showSpatialControls ? createFormView({
      document: doc,
      uiState,
      fields: ACTOR_FIELDS,
      value: values[0]!,
      testIdPrefix: "detail",
      mixed: mixedPaths(values),
      disabled: now.some((target) => target.doc.locked === true),
      warn: (message) => status(message, "warning"),
      onChange: (change) => {
        const isPivot = change.path[0] === "pivot";
        apply(isPivot ? `Edit pivot of ${what(now)}` : `Transform ${what(now)}`, change.phase, pathKey(change.path), ({ doc: actor }) => {
          const root = isPivot ? { ...actor, pivot: actor.pivot ?? [0, 0, 0] } : actor;
          const leaf = leafFor(root, change);
          return editActor(root, leaf.path, leaf.value);
        });
      },
    }) : null;
    const general = showSpatialControls ? createFormView({
      document: doc,
      fields: GENERAL_FIELDS,
      value: { spatiallyLoaded: now[0]!.doc.spatiallyLoaded },
      testIdPrefix: "detail",
      mixed: mixedPaths(now.map((target) => ({ spatiallyLoaded: target.doc.spatiallyLoaded }))),
      onChange: (change) => apply(`Edit ${pathKey(change.path)} of ${what(now)}`, change.phase, pathKey(change.path), ({ doc: actor }) => editActor(actor, change.path, change.value)),
    }) : null;
    renderActions(now);
    // A tool actor (Forge's Landscape) starts with its tool: no name or kind.
    const parts: HTMLElement[] = tool !== null ? [] : [header(now)];
    if (actorView && general) parts.push(actorView.element, actions);
    parts.push(...componentBlock(now, tool));
    if (general) {
      const advanced = panelSection("Advanced", "detail-advanced");
      advanced.body.append(general.element);
      parts.push(advanced.section);
    }
    if (showSpatialControls && now.length === 1 && now[0]!.doc.class === null) parts.push(addComponentButton(now[0]!));
    element.replaceChildren(...parts);
    // A numeric edit redraws Details. Keep its popup open, but never carry it to another selection.
    if (openPopup && showSpatialControls && tools) openPopup.showPopover();
    if (focused) element.querySelector<HTMLElement>(`[data-testid="${CSS.escape(focused)}"]`)?.focus();
  }

  editor.onChange(render);
  render();

  return {
    element,
    setTools(next) {
      tools = next;
      next.onChange(render);
      // A gizmo drag: the transform fields follow it live (the session only changes on release).
      next.onPreview(() => {
        const primary = targets()[0];
        if (primary && actorView) actorView.update(actorValue(primary));
        if (primary && pivotView) pivotView.update(actorValue(primary));
      });
      render();
    },
    refresh: render,
  };
}
