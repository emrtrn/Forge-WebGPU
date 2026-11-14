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
// Text is set with textContent; the only markup is the kit's static icons.

import {
  ActorPivotField,
  ActorStreamingFields,
  formFields,
  transform,
  type ActorDoc,
  type ActorId,
  type ClassResolver,
  type FormField,
  type SchemaRegistry,
  type Vec3,
} from "../../core/index.ts";
import type { AssetCatalog } from "../assets/assetCatalog.ts";
import type { EditorSession } from "../session/editorSession.ts";
import type { PivotPreset, TransformTools } from "../transformTools.ts";
import { getAtPath, pathKey, type FormPath } from "../ui/formPath.ts";
import { createFormView, createSection, MIXED_TEXT, type FormChange } from "../ui/formView.ts";
import {
  addComponent,
  cannotAdd,
  componentSections,
  detailsTarget,
  editActor,
  editComponent,
  mixedPaths,
  removeComponent,
  resetOverride,
  withRotationAxis,
  type DetailsTarget,
} from "./detailsModel.ts";
import { openPicker } from "./pickerPopover.ts";

const ACTOR_FIELDS = formFields({
  transform: transform({ label: "Transform", hint: "Aktörün konumu, dönüşü ve ölçeği (ebeveynine göre)." }),
  pivot: ActorPivotField,
});
const GENERAL_FIELDS: readonly FormField[] = formFields(ActorStreamingFields);
/** Forge's pivot presets (Details' Pivot row). */
const PIVOT_PRESETS: readonly (readonly [PivotPreset, string, string])[] = [
  ["reset", "Reset Pivot", "Pivot model orijininde"],
  ["center", "Center Pivot", "Pivot sınır kutusunun merkezinde"],
  ["base", "Use Base", "Pivot alt merkezde (ör. zemine oturan bir menteşe)"],
];

export interface DetailsPanelOptions {
  readonly document: Document;
  readonly editor: EditorSession;
  readonly registry: SchemaRegistry;
  readonly resolveClass: ClassResolver;
  readonly assets: AssetCatalog;
  /** Where pickers open (the Details panel). */
  readonly host: HTMLElement;
  readonly status: (message: string, tone?: "info" | "warning" | "error") => void;
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
    if (!change.rotation) return { path: change.path, value: change.value };
    const at = change.path.slice(0, -1);
    const current = getAtPath(root, at) as Parameters<typeof withRotationAxis>[0];
    return { path: at, value: withRotationAxis(current, change.rotation.axis, change.rotation.degrees) };
  };

  const what = (now: readonly DetailsTarget[]): string => (now.length === 1 ? now[0]!.doc.name || now[0]!.doc.id : `${now.length} actors`);

  // --- Pivot and Placement (Forge's instanceDetails.ts) -----------------------
  const actions = el("div", "detail-actions");
  const actionButton = (text: string, hint: string, testId: string, run: () => void): HTMLButtonElement => {
    const button = el("button", "detail-action-button", text);
    button.type = "button";
    button.title = hint;
    button.dataset.testid = testId;
    button.addEventListener("click", run);
    return button;
  };
  const pivotDrag = actionButton("Drag in viewport", "Pivotu ayarlamak için viewport'taki gizmoyu sürükleyin", "pivot-drag", () => tools?.setPivotEdit(!tools.pivotEdit));
  const pivotRow = el("div", "detail-actions-row");
  pivotRow.append(pivotDrag);
  const presetRow = el("div", "detail-actions-row");
  for (const [preset, text, hint] of PIVOT_PRESETS) presetRow.append(actionButton(text, hint, `pivot-${preset}`, () => tools?.setPivotPreset(preset)));
  const placementRow = el("div", "detail-actions-row");
  const snapFloor = actionButton("Snap to Floor", "Alttaki yüzeye bırak (End)", "snap-floor", () => tools?.snapToFloor());
  const snapWall = actionButton("Snap to Wall", "En yakın duvara yasla", "snap-wall", () => tools?.snapToWall());
  placementRow.append(snapFloor, snapWall);
  // Forge's Lock Movement toggle (Placement): the actors' `locked`, one undo step.
  const lockToggle = el("label", "detail-toggle");
  const lockBox = el("input");
  lockBox.type = "checkbox";
  lockBox.dataset.testid = "detail-locked";
  lockBox.title = "Açıkken aktör editörde taşınmaz, döndürülmez, ölçeklenmez.";
  lockToggle.append(lockBox, el("span", "", "Lock Movement"));
  lockBox.addEventListener("change", () => {
    const locked = lockBox.checked;
    apply(`${locked ? "Lock" : "Unlock"} ${what(targets())}`, "commit", "locked", ({ doc: actor }) => {
      if ((actor.locked === true) === locked) return actor;
      const next: ActorDoc = { ...actor };
      if (locked) next.locked = true;
      else delete next.locked;
      return next;
    });
  });
  actions.append(el("div", "detail-actions-title", "Pivot"), pivotRow, presetRow, el("div", "detail-actions-title", "Placement"), placementRow, lockToggle);
  const pivotButtons = [pivotDrag, ...presetRow.querySelectorAll("button")];
  const renderActions = (now: readonly DetailsTarget[]): void => {
    actions.hidden = tools === null;
    const on = tools?.pivotEdit === true;
    pivotDrag.classList.toggle("on", on);
    pivotDrag.setAttribute("aria-pressed", String(on));
    pivotDrag.textContent = on ? "● Dragging pivot" : "Drag in viewport";
    const locked = now.map((target) => target.doc.locked === true);
    lockBox.checked = locked.every(Boolean);
    lockBox.indeterminate = locked.some(Boolean) && !locked.every(Boolean);
    for (const button of [...pivotButtons, snapFloor, snapWall]) button.disabled = locked.some(Boolean);
  };

  // --- The panel -------------------------------------------------------------------
  const actorValue = (target: DetailsTarget): Record<string, unknown> => {
    const preview = tools?.preview(target.doc.id);
    return { transform: preview?.transform ?? target.doc.transform, pivot: preview?.pivot ?? target.doc.pivot ?? ([0, 0, 0] satisfies Vec3) };
  };

  const header = (now: readonly DetailsTarget[]): HTMLElement => {
    const box = el("div", "details-header");
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
    return box;
  };

  const componentBlock = (now: readonly DetailsTarget[]): HTMLElement[] => {
    const blocks: HTMLElement[] = [];
    for (const section of componentSections(now, registry)) {
      const { section: box, heading, toggle, body } = createSection(doc, section.def.label, { testId: `detail-component-${section.id}` });
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
      } else {
        const remove = el("button", "detail-inline-button", "Remove");
        remove.type = "button";
        remove.title = "Bileşeni aktörden kaldır";
        remove.dataset.testid = `detail-component-${section.id}-remove`;
        remove.addEventListener("click", () => apply(`Remove ${section.def.label}`, "commit", `${section.id}:remove`, ({ doc: actor }) => removeComponent(actor, section.id)));
        heading.append(remove);
      }
      const view = createFormView({
        document: doc,
        fields: section.fields,
        value: section.value,
        testIdPrefix: `detail-${section.id}`,
        mixed: section.mixed,
        overridden: section.overridden,
        onReset: (key) => apply(`Reset ${section.def.label} ${key}`, "commit", `${section.id}:${key}:reset`, ({ doc: actor }) => resetOverride(actor, section.id, key)),
        warn: (message) => status(message, "warning"),
        assetLabel: (guid) => assets.label(guid),
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
      blocks.push(box);
    }
    return blocks;
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
    const now = targets();
    const focused = doc.activeElement instanceof HTMLElement && element.contains(doc.activeElement) ? doc.activeElement.dataset.testid : undefined;
    if (now.length === 0) {
      actorView = null;
      const empty = el("div", "empty-details");
      empty.append(el("strong", "", "Nothing selected"), el("span", "", "Ayrıntıları görmek için Outliner'dan bir aktör seçin."));
      element.replaceChildren(empty);
      return;
    }
    const values = now.map(actorValue);
    actorView = createFormView({
      document: doc,
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
    });
    const general = createFormView({
      document: doc,
      fields: GENERAL_FIELDS,
      value: { spatiallyLoaded: now[0]!.doc.spatiallyLoaded },
      testIdPrefix: "detail",
      mixed: mixedPaths(now.map((target) => ({ spatiallyLoaded: target.doc.spatiallyLoaded }))),
      onChange: (change) => apply(`Edit ${pathKey(change.path)} of ${what(now)}`, change.phase, pathKey(change.path), ({ doc: actor }) => editActor(actor, change.path, change.value)),
    });
    renderActions(now);
    const parts: HTMLElement[] = [header(now), actorView.element, actions, general.element, ...componentBlock(now)];
    if (now.length === 1 && now[0]!.doc.class === null) parts.push(addComponentButton(now[0]!));
    element.replaceChildren(...parts);
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
      });
      render();
    },
    refresh: render,
  };
}
