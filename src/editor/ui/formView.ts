// The editor UI kit's form view (K7, plan phase 4 step 1): a schema form
// (core `formOf` / `formFields`) drawn as Details rows. Details, the World
// Settings panel, the generic data editor (A13) and the asset editors all draw
// their fields with this; none of them builds an input by hand.
//
// - One row per field: English name (30 %), control (70 %), the Turkish hint as
//   the tooltip. A bounded number is a slider + number box with the range under
//   the name (paramFields.ts); vectors and transforms are X / Y / Z axis fields;
//   objects and arrays are collapsible sections.
// - Every edit is reported as (path, value) with the whole next value; `input`
//   while a slider or colour moves, `commit` when the edit lands. The caller
//   decides what a change is (Details: a transaction, merged while dragging).
// - Out-of-range numbers are clamped and `warn` gets Forge's Turkish message;
//   an unparsable number puts the old value back. The schema's normalisation
//   stays the authority: the kit only keeps the user inside the limits.
// - Rotation is shown in XYZ degrees and stored as the quaternion.
// - Text is set with `textContent`; the only markup is the kit's own icons.

import type { FormField, NumberFormField, Transform } from "../../core/index.ts";
import { eulerDegreesToQuaternion, quaternionToEulerDegrees } from "../../engine/math/euler.ts";
import { getAtPath, pathKey, setAtPath, type FormPath } from "./formPath.ts";
import { UI_ICONS } from "./icons.ts";
import { clampParam, clampWarning, paramRangeText, sliderStep } from "./paramFields.ts";

export interface FormChange {
  readonly path: FormPath;
  readonly value: unknown;
  /** The form's whole value after this change. */
  readonly next: Record<string, unknown>;
  /** `input`: still moving (slider, colour). `commit`: the edit landed. */
  readonly phase: "input" | "commit";
}

export interface FormViewOptions {
  readonly document: Document;
  readonly fields: readonly FormField[];
  readonly value: Record<string, unknown>;
  readonly onChange: (change: FormChange) => void;
  /** Shown to the user when a value was clamped (Turkish). */
  readonly warn?: (message: string) => void;
  /** `data-testid` prefix of the controls; default `field` (`field-density`, `field-size[0]`). */
  readonly testIdPrefix?: string;
  readonly disabled?: boolean;
  /** Locale of range texts and warnings; the page's by default. */
  readonly locale?: string;
  /** Display name of an asset GUID (Content Browser, step 6); the GUID otherwise. */
  readonly assetLabel?: (guid: string) => string | null;
  /** Opens a picker; resolves to the chosen GUID or null. No Browse button without it. */
  readonly pickAsset?: (assetType: string | null) => Promise<string | null>;
  readonly actorLabel?: (id: string) => string | null;
  readonly pickActor?: () => Promise<string | null>;
}

export interface FormView {
  readonly element: HTMLElement;
  /** The current value (the last change's `next`). */
  value(): Record<string, unknown>;
  /** Draws `value` (an undo, another panel's edit); focus stays on the same control. */
  update(value: Record<string, unknown>): void;
}

const AXES = ["x", "y", "z", "w"] as const;

export function createFormView(options: FormViewOptions): FormView {
  const doc = options.document;
  const prefix = options.testIdPrefix ?? "field";
  const warn = options.warn ?? (() => {});
  let current: Record<string, unknown> = options.value;
  const element = doc.createElement("div");
  element.className = "details-body";

  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text?: string): HTMLElementTagNameMap[K] => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  const emit = (path: FormPath, value: unknown, phase: FormChange["phase"]): void => {
    current = setAtPath(current, path, value);
    options.onChange({ path, value, next: current, phase });
  };

  const testId = (path: FormPath): string => `${prefix}-${pathKey(path)}`;

  const labelSpan = (label: string, hint: string | null): HTMLSpanElement => {
    const span = el("span", "", label);
    if (hint) span.title = hint;
    return span;
  };

  const numberInput = (path: FormPath, value: number, label: string, hint: string | null, step: number | null): HTMLInputElement => {
    const input = el("input");
    input.type = "number";
    input.step = step !== null ? String(step) : "any";
    input.value = Number.isFinite(value) ? String(value) : "";
    input.dataset.testid = testId(path);
    input.setAttribute("aria-label", label);
    if (hint) input.title = hint;
    input.disabled = options.disabled ?? false;
    return input;
  };

  /** Parses, clamps (with the warning) and writes back a number box; null keeps the old value. */
  const readNumber = (input: HTMLInputElement, field: { label: string; range: NumberFormField["range"] }, old: number): number => {
    const parsed = input.value.trim() === "" ? Number.NaN : Number(input.value);
    if (!Number.isFinite(parsed)) {
      input.value = String(old);
      return old;
    }
    const { value, clamped } = clampParam(parsed, field.range);
    if (clamped) warn(clampWarning(field.label, field.range, value, options.locale));
    input.value = String(value);
    return value;
  };

  const sectionOf = (title: string, hint: string | null, path: FormPath): { section: HTMLElement; body: HTMLElement; heading: HTMLElement } => {
    const parts = createSection(doc, title, { testId: `${prefix}-section-${pathKey(path)}` });
    if (hint) parts.toggle.title = hint;
    return parts;
  };

  function numberRow(field: NumberFormField, path: FormPath, value: unknown, label: string): HTMLElement {
    const row = el("label", "detail-row");
    const old = typeof value === "number" ? value : field.default;
    const span = labelSpan(label, field.hint);
    const range = paramRangeText(field.range, options.locale);
    if (field.control === "slider" && range !== null) span.append(el("small", "param-range", range));
    row.append(span);
    const input = numberInput(path, old, label, field.hint, field.step);
    if (field.range.min !== null) input.min = String(field.range.min);
    if (field.range.max !== null) input.max = String(field.range.max);
    let last = old;
    input.addEventListener("change", () => {
      last = readNumber(input, { label, range: field.range }, last);
      if (slider) slider.value = String(last);
      emit(path, last, "commit");
    });
    let slider: HTMLInputElement | null = null;
    if (field.control === "slider" && field.slider) {
      const travel = field.slider;
      slider = el("input", "param-slider");
      slider.type = "range";
      slider.min = String(Math.max(field.range.min ?? -Infinity, travel.min));
      slider.max = String(Math.min(field.range.max ?? Infinity, travel.max));
      slider.step = String(sliderStep(field.step, travel));
      slider.value = String(old);
      slider.tabIndex = -1; // The number box stays the keyboard target.
      slider.setAttribute("aria-hidden", "true");
      slider.dataset.testid = `${testId(path)}-slider`;
      slider.disabled = options.disabled ?? false;
      if (field.hint) slider.title = field.hint;
      const move = (phase: FormChange["phase"]) => () => {
        last = Number(slider!.value);
        input.value = slider!.value;
        emit(path, last, phase);
      };
      slider.addEventListener("input", move("input"));
      slider.addEventListener("change", move("commit"));
      const control = el("span", "param-control");
      control.append(input, slider); // Number first: the label targets it.
      row.append(control);
    } else {
      row.append(input);
    }
    return row;
  }

  function vectorRow(path: FormPath, values: readonly number[], label: string, hint: string | null, field: { range: NumberFormField["range"]; step: number | null }, write: (values: number[]) => void): HTMLElement {
    const row = el("div", "detail-vector");
    row.append(Object.assign(labelSpan(label, hint), { className: "detail-vector-label" }));
    const fields = el("div", "vector-fields");
    fields.style.setProperty("--axis-count", String(values.length));
    const state = [...values];
    values.forEach((component, index) => {
      const axis = AXES[index] ?? "w";
      const cell = el("label", `axis-field axis-${axis}`);
      cell.append(el("span", "axis-tag", axis.toUpperCase()));
      const input = numberInput([...path, index], component, `${label} ${axis.toUpperCase()}`, hint, field.step);
      if (field.range.min !== null) input.min = String(field.range.min);
      if (field.range.max !== null) input.max = String(field.range.max);
      input.addEventListener("change", () => {
        state[index] = readNumber(input, { label: `${label} ${axis.toUpperCase()}`, range: field.range }, state[index]!);
        write([...state]);
      });
      cell.append(input);
      fields.append(cell);
    });
    row.append(fields);
    return row;
  }

  function refRow(path: FormPath, value: unknown, label: string, hint: string | null, describe: (id: string) => string | null, pick: (() => Promise<string | null>) | undefined): HTMLElement {
    const row = el("div", "detail-row");
    row.append(labelSpan(label, hint));
    const control = el("span", "ref-control");
    const id = typeof value === "string" ? value : null;
    const shown = el("output", "", id === null ? "None" : (describe(id) ?? id));
    shown.dataset.testid = testId(path);
    if (id !== null) shown.title = id;
    control.append(shown);
    if (pick) {
      const browse = el("button", "detail-inline-button", "Browse");
      browse.type = "button";
      browse.title = "Seç";
      browse.disabled = options.disabled ?? false;
      browse.addEventListener("click", () => {
        void pick().then((chosen) => {
          if (chosen === null) return;
          emit(path, chosen, "commit");
          render();
        });
      });
      control.append(browse);
    }
    const clear = el("button", "detail-inline-button", "Clear");
    clear.type = "button";
    clear.title = "Başvuruyu kaldır";
    clear.disabled = (options.disabled ?? false) || id === null;
    clear.dataset.testid = `${testId(path)}-clear`;
    clear.addEventListener("click", () => {
      emit(path, null, "commit");
      render();
    });
    control.append(clear);
    row.append(control);
    return row;
  }

  function fieldRow(field: FormField, path: FormPath, value: unknown, label = field.label): HTMLElement {
    switch (field.kind) {
      case "number":
        return numberRow(field, path, value, label);
      case "bool": {
        const row = el("label", "detail-row");
        row.append(labelSpan(label, field.hint));
        const input = el("input");
        input.type = "checkbox";
        input.checked = typeof value === "boolean" ? value : field.default;
        input.dataset.testid = testId(path);
        input.setAttribute("aria-label", label);
        if (field.hint) input.title = field.hint;
        input.disabled = options.disabled ?? false;
        input.addEventListener("change", () => emit(path, input.checked, "commit"));
        row.append(input);
        return row;
      }
      case "enum": {
        const row = el("label", "detail-row");
        row.append(labelSpan(label, field.hint));
        const select = el("select");
        for (const option of field.options) {
          const entry = el("option", "", option.label);
          entry.value = option.value;
          select.append(entry);
        }
        select.value = typeof value === "string" ? value : field.default;
        select.dataset.testid = testId(path);
        select.setAttribute("aria-label", label);
        if (field.hint) select.title = field.hint;
        select.disabled = options.disabled ?? false;
        select.addEventListener("change", () => emit(path, select.value, "commit"));
        row.append(select);
        return row;
      }
      case "color": {
        const row = el("label", "detail-row");
        row.append(labelSpan(label, field.hint));
        const control = el("span", "color-control");
        const color = typeof value === "string" ? value : field.default;
        const input = el("input");
        input.type = "color";
        input.value = color ?? "#000000";
        input.dataset.testid = testId(path);
        input.setAttribute("aria-label", label);
        if (field.hint) input.title = field.hint;
        input.disabled = options.disabled ?? false;
        control.classList.toggle("is-empty", color === null);
        let clear: HTMLButtonElement | null = null;
        const set = (phase: FormChange["phase"]) => () => {
          control.classList.remove("is-empty");
          if (clear) clear.disabled = options.disabled ?? false;
          emit(path, input.value, phase);
        };
        input.addEventListener("input", set("input"));
        input.addEventListener("change", set("commit"));
        control.append(input);
        if (field.optional) {
          const button = el("button", "detail-inline-button", "Clear");
          button.type = "button";
          button.title = "Rengi kaldır";
          button.dataset.testid = `${testId(path)}-clear`;
          button.disabled = (options.disabled ?? false) || color === null;
          button.addEventListener("click", (event) => {
            event.preventDefault();
            control.classList.add("is-empty");
            button.disabled = true;
            emit(path, null, "commit");
          });
          control.append(button);
          clear = button;
        }
        row.append(control);
        return row;
      }
      case "text": {
        const row = el("label", "detail-row");
        row.append(labelSpan(label, field.hint));
        const input = field.multiline ? el("textarea") : el("input");
        input.value = typeof value === "string" ? value : field.default;
        input.dataset.testid = testId(path);
        input.setAttribute("aria-label", label);
        if (field.hint) input.title = field.hint;
        input.disabled = options.disabled ?? false;
        const pattern = field.pattern !== null ? new RegExp(field.pattern) : null;
        const check = () => {
          const text = input.value;
          const invalid = (field.required && text.trim() === "") || (pattern !== null && text !== "" && !pattern.test(text));
          input.setAttribute("aria-invalid", String(invalid));
        };
        check();
        input.addEventListener("input", check);
        input.addEventListener("change", () => emit(path, input.value, "commit"));
        row.append(input);
        return row;
      }
      case "vector": {
        const values = Array.isArray(value) && value.length === field.size ? (value as number[]) : [...field.default];
        return vectorRow(path, values, label, field.hint, field, (next) => emit(path, next, "commit"));
      }
      case "transform":
        return transformRows(path, (value ?? field.default) as Transform, label, field.hint);
      case "assetRef":
        return refRow(path, value, label, field.hint, (id) => options.assetLabel?.(id) ?? null, options.pickAsset ? () => options.pickAsset!(field.assetType) : undefined);
      case "actorRef":
        return refRow(path, value, label, field.hint, (id) => options.actorLabel?.(id) ?? null, options.pickActor);
      case "object": {
        const { section, body } = sectionOf(label, field.hint, path);
        const object = (value !== null && typeof value === "object" ? value : field.default) as Record<string, unknown>;
        for (const child of field.fields) body.append(fieldRow(child, [...path, child.key], object[child.key]));
        return section;
      }
      case "array": {
        const items = Array.isArray(value) ? (value as unknown[]) : [...field.default];
        const itemsNow = (): unknown[] => {
          const now = getAtPath(current, path);
          return Array.isArray(now) ? now : items;
        };
        const { section, body, heading } = sectionOf(`${label} (${items.length})`, field.hint, path);
        const list = el("div", "array-items");
        if (items.length === 0) list.append(el("div", "array-empty", "Öğe yok."));
        items.forEach((item, index) => {
          const entry = el("div", "array-item");
          entry.append(fieldRow(field.item, [...path, index], item, `${field.item.label} ${index}`));
          const remove = el("button", "detail-inline-button", "Remove");
          remove.type = "button";
          remove.title = "Öğeyi sil";
          remove.dataset.testid = `${testId([...path, index])}-remove`;
          remove.disabled = options.disabled ?? false;
          remove.addEventListener("click", () => {
            // The array as it is now: an item may have been edited since this row was drawn.
            emit(path, itemsNow().filter((_, at) => at !== index), "commit");
            render();
          });
          entry.append(remove);
          list.append(entry);
        });
        body.append(list);
        const add = el("button", "detail-inline-button", "Add");
        add.type = "button";
        add.title = "Öğe ekle";
        add.dataset.testid = `${testId(path)}-add`;
        add.disabled = options.disabled ?? false;
        add.addEventListener("click", () => {
          emit(path, [...itemsNow(), structuredClone(field.item.default)], "commit");
          render();
        });
        heading.append(add);
        return section;
      }
    }
  }

  function transformRows(path: FormPath, value: Transform, label: string, hint: string | null): HTMLElement {
    const { section, body } = sectionOf(label, hint, path);
    const open = { min: null, max: null };
    let transform: Transform = value;
    const write = (next: Transform) => {
      transform = next;
      emit(path, next, "commit");
    };
    body.append(
      vectorRow([...path, "p"], transform.p, "Location", "Konum (m)", { range: open, step: 0.1 }, (p) => write({ ...transform, p: p as [number, number, number] })),
      vectorRow(
        [...path, "r"],
        quaternionToEulerDegrees(transform.r).map((angle) => Number(angle.toFixed(3))),
        "Rotation",
        "Dönüş (derece, XYZ)",
        { range: open, step: 1 },
        (degrees) => write({ ...transform, r: eulerDegreesToQuaternion(degrees as [number, number, number]) }),
      ),
      vectorRow([...path, "s"], transform.s, "Scale", "Ölçek", { range: open, step: 0.1 }, (s) => write({ ...transform, s: s as [number, number, number] })),
    );
    return section;
  }

  function render(): void {
    const focused = doc.activeElement instanceof HTMLElement && element.contains(doc.activeElement) ? doc.activeElement.dataset.testid : undefined;
    element.replaceChildren(...options.fields.map((field) => fieldRow(field, [field.key], getAtPath(current, [field.key]))));
    if (focused) element.querySelector<HTMLElement>(`[data-testid="${CSS.escape(focused)}"]`)?.focus();
  }

  render();
  return {
    element,
    value: () => current,
    update(value) {
      current = value;
      render();
    },
  };
}

/** A collapsible Details section: heading button with a chevron, body below. Panels use it for their own groups. */
export function createSection(
  document: Document,
  title: string,
  options: { readonly collapsed?: boolean; readonly testId?: string } = {},
): { section: HTMLElement; heading: HTMLElement; toggle: HTMLButtonElement; body: HTMLElement } {
  const section = document.createElement("section");
  section.className = "detail-section";
  if (options.collapsed) section.classList.add("collapsed");
  if (options.testId) section.dataset.testid = options.testId;
  const heading = document.createElement("div");
  heading.className = "detail-section-heading";
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "detail-section-toggle";
  toggle.setAttribute("aria-expanded", String(!options.collapsed));
  const chevron = document.createElement("span");
  chevron.className = "detail-section-chevron";
  chevron.innerHTML = UI_ICONS.chevronDown; // The kit's own static SVG.
  const text = document.createElement("span");
  text.textContent = title;
  toggle.append(chevron, text);
  toggle.addEventListener("click", () => {
    const collapsed = section.classList.toggle("collapsed");
    toggle.setAttribute("aria-expanded", String(!collapsed));
  });
  heading.append(toggle);
  const body = document.createElement("div");
  body.className = "detail-section-body";
  section.append(heading, body);
  return { section, heading, toggle, body };
}
