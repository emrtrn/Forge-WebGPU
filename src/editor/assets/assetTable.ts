// A13 arrays in a virtual table. Cells are the existing schema form controls;
// compound values stay in a selected row's details, never flattened by guessing.
import type { ArrayFormField, FormField } from "../../core/index.ts";
import { createFormView, type FormView, type FormViewOptions } from "../ui/formView.ts";
import { getAtPath, pathKey, type FormPath } from "../ui/formPath.ts";
import type { AssetSession } from "./assetSession.ts";

export function arrayFields(fields: readonly FormField[], path: FormPath = []): { field: ArrayFormField; path: FormPath }[] {
  return fields.flatMap((field) => field.kind === "array" ? [{ field, path: [...path, field.key] }]
    : field.kind === "object" ? arrayFields(field.fields, [...path, field.key]) : []);
}
export function visibleTableRows(count: number, top: number, height: number): { start: number; end: number } {
  const start = Math.max(0, Math.floor(top / 72) - 3);
  return { start, end: Math.min(count, start + Math.ceil(height / 72) + 6) };
}

export function createAssetTable(options: {
  readonly document: Document;
  readonly fields: readonly FormField[];
  readonly session: AssetSession;
  readonly formOptions: Pick<FormViewOptions, "assetLabel" | "pickAsset" | "warn">;
}) {
  const { document: doc, session } = options;
  const root = doc.createElement("div"), choices = doc.createElement("div"), heading = doc.createElement("div");
  const viewport = doc.createElement("div"), canvas = doc.createElement("div"), details = doc.createElement("div");
  root.className = "asset-table"; viewport.className = "asset-table-viewport"; canvas.className = "asset-table-canvas";
  viewport.dataset.testid = "asset-table-viewport"; heading.className = "asset-table-head";
  choices.className = "asset-table-choices"; details.className = "asset-table-details";
  viewport.append(canvas); root.append(choices, heading, viewport, details);
  const arrays = arrayFields(options.fields);
  let chosen = arrays[0], selected = 0, stamp = "";
  let views: { view: FormView; row: number; field: FormField | null }[] = [];
  let rowView: FormView | null = null;
  const button = (label: string, run: () => void, disabled = false) => {
    const node = doc.createElement("button"); node.type = "button"; node.className = "detail-inline-button";
    node.textContent = label; node.disabled = disabled; node.addEventListener("click", run); return node;
  };
  const items = (): unknown[] => { const value = chosen ? getAtPath(session.value(), chosen.path) : []; return Array.isArray(value) ? value : []; };
  const columns = (): readonly FormField[] => chosen?.field.item.kind === "object" ? chosen.field.item.fields.filter((field) => field.kind !== "object" && field.kind !== "array") : chosen ? [chosen.field.item] : [];
  const updateDetails = () => {
    if (!chosen || items().length === 0) { details.replaceChildren(); rowView = null; return; }
    selected = Math.min(selected, items().length - 1);
    rowView = createFormView({ document: doc, fields: [{ ...chosen.field.item, key: "row", label: `Row ${selected + 1}` }],
      value: { row: items()[selected] }, disabled: !session.asset.writable || session.busy(), testIdPrefix: "asset-row", ...options.formOptions,
      onChange: (change) => session.edit("Edit row", [...chosen!.path, selected, ...change.path.slice(1)], change.value, change.phase),
    });
    details.replaceChildren(rowView.element);
  };
  const draw = () => {
    const list = items(), range = visibleTableRows(list.length, viewport.scrollTop, viewport.clientHeight || 400);
    const nextStamp = `${chosen && pathKey(chosen.path)}:${range.start}:${range.end}:${list.length}:${session.busy()}`;
    if (stamp === nextStamp) {
      for (const { view, row, field } of views) view.update({ value: field ? (list[row] as Record<string, unknown>)?.[field.key] : list[row] });
      rowView?.update({ row: list[selected] });
      return;
    }
    stamp = nextStamp; views = []; canvas.replaceChildren();
    canvas.style.height = `${list.length * 72}px`;
    const cols = columns();
    heading.textContent = ["Row", ...cols.map((field) => chosen?.field.item.kind === "object" ? field.label : "Value")].join("   ·   ");
    for (let row = range.start; row < range.end; row++) {
      const node = doc.createElement("div"); node.className = "asset-table-row"; node.dataset.testid = "asset-table-row"; node.dataset.row = String(row);
      node.style.top = `${row * 72}px`;
      node.append(button(String(row + 1), () => { selected = row; updateDetails(); }));
      for (const field of cols) {
        const objectRow = chosen!.field.item.kind === "object";
        const view = createFormView({ document: doc, fields: [{ ...field, key: "value" }], value: { value: objectRow ? (list[row] as Record<string, unknown>)[field.key] : list[row] },
          disabled: !session.asset.writable || session.busy(), testIdPrefix: `asset-cell-${row}-${objectRow ? field.key : "value"}`, ...options.formOptions,
          onChange: (change) => session.edit("Edit cell", [...chosen!.path, row, ...(objectRow ? [field.key] : []), ...change.path.slice(1)], change.value, change.phase),
        });
        views.push({ view, row, field: objectRow ? field : null }); node.append(view.element);
      }
      const locked = !session.asset.writable || session.busy();
      node.append(button("↑", () => { const next = [...items()]; [next[row - 1], next[row]] = [next[row], next[row - 1]]; session.edit("Move row", chosen!.path, next); }, locked || row === 0));
      node.append(button("↓", () => { const next = [...items()]; [next[row + 1], next[row]] = [next[row], next[row + 1]]; session.edit("Move row", chosen!.path, next); }, locked || row === list.length - 1));
      const remove = button("Remove", () => session.edit("Remove row", chosen!.path, items().filter((_, index) => index !== row)), locked);
      remove.dataset.testid = `asset-row-${row}-remove`; node.append(remove); canvas.append(node);
    }
    updateDetails();
  };
  for (const entry of arrays) choices.append(button(pathKey(entry.path), () => { chosen = entry; selected = 0; stamp = ""; viewport.scrollTop = 0; draw(); }));
  const add = button("Add Row", () => { if (chosen) session.edit("Add row", chosen.path, [...items(), structuredClone(chosen.field.item.default)]); }, !session.asset.writable);
  add.dataset.testid = "asset-table-add"; choices.append(add);
  viewport.addEventListener("scroll", draw);
  const observer = new ResizeObserver(() => { stamp = ""; draw(); }); observer.observe(viewport);
  draw();
  return { element: root, update: draw, dispose: () => observer.disconnect() };
}
