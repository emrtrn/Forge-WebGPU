// The Foliage tab's tools (plan 5d step 6, INV-B09; Forge WebGL
// src/editor/panels/foliage/foliagePanel.ts @ forge-webgl-final): the seven
// tools as a button grid (pressing the lit one turns it off), the brush, the
// surface filters and the selection's actions. The settings are the page's
// (foliageTool.ts), never an undo step. Forge's Erase Density did nothing and
// is left out, as is Resource Usage (`forge stats` and `?debug` have it).

import { bool, formFields, num, type FieldMap } from "../../core/index.ts";
import { createFormView, createSection } from "../ui/formView.ts";
import { FOLIAGE_TOOLS, type FoliageTool, type FoliageTools, type FoliageToolSettings } from "./foliageTool.ts";

const LABELS: Record<FoliageTool, string> = { select: "Select", lasso: "Lasso", paint: "Paint", erase: "Erase", single: "Single", fill: "Fill", remove: "Remove" };
const HINTS: Record<FoliageTool, string> = {
  select: "Seçmek için bir örneğe tıkla (Shift / Ctrl seçime ekler ya da çıkarır).",
  lasso: "Örnekleri seçmek için fırçayı üzerlerinde sürükle (Ctrl çıkarır).",
  paint: "Seçili türü serpmek için sürükle; Shift ile sürüklemek fırça altındaki bütün türleri siler.",
  erase: "Fırça altındaki bütün türleri silmek için sürükle.",
  single: "Tek bir örnek yerleştirmek için tıkla.",
  fill: "Bir yüzeye tıklayarak bütün alanını seçili türle doldur (terrain'in bütün tile'ları yüklenir; en çok 20.000 aday).",
  remove: "Fırça altındaki yalnız seçili türü silmek için sürükle.",
};

const FIELDS: FieldMap = {
  brushSize: num({ default: 4, min: 0.1, max: 200, step: 0.1, slider: [0.5, 50], label: "Brush Size", hint: "Fırça yarıçapı (metre)." }),
  paintDensity: num({ default: 0.5, min: 0, max: 4, step: 0.05, label: "Paint Density", hint: "Darbe başına yoğunluk çarpanı; Fill'de adayın tutulma olasılığı (en çok 1)." }),
  randomSeed: num({ default: 1, min: 1, max: 2147483647, step: 1, slider: [1, 1000], label: "Random Seed", hint: "Serpme deseninin tohumu." }),
  landscape: bool({ default: true, label: "Landscape", hint: "Arazi yüzeyine boyanır." }),
  staticMesh: bool({ default: true, label: "Static Mesh", hint: "Statik mesh ve şekil yüzeylerine boyanır." }),
};

export function createFoliagePaintPanel(doc: Document, tools: FoliageTools, status: (message: string, tone?: "info" | "warning" | "error") => void) {
  const { section, body } = createSection(doc, "Tools", { testId: "foliage-tools" });
  const button = (label: string, testId: string, title: string, run: () => void): HTMLButtonElement => {
    const node = doc.createElement("button");
    node.type = "button";
    node.className = "detail-action-button";
    node.textContent = label;
    node.title = title;
    node.dataset.testid = testId;
    node.addEventListener("click", run);
    return node;
  };
  const grid = (columns: number, nodes: readonly HTMLElement[]): HTMLElement => {
    const node = doc.createElement("div");
    Object.assign(node.style, { display: "grid", gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: "6px", margin: "6px 0" });
    node.append(...nodes);
    return node;
  };
  const buttons = new Map(FOLIAGE_TOOLS.map((tool) => [tool, button(LABELS[tool], `foliage-tool-${tool}`, HINTS[tool], () => tools.update({ tool: tools.settings.tool === tool ? null : tool }))] as const));
  const hint = doc.createElement("div");
  hint.className = "detail-hint";
  const values = (): Record<string, unknown> => ({ ...tools.settings });
  const form = createFormView({
    document: doc, fields: formFields(FIELDS), value: values(), testIdPrefix: "foliage-brush", warn: (message) => status(message, "warning"),
    onChange: (change) => tools.update({ [String(change.path[0])]: change.value } as Partial<FoliageToolSettings>),
  });
  const actions = {
    invalid: button("Select Invalid", "foliage-select-invalid", "Altında uygun zemin kalmayan örnekleri bütün level'da seçer.", () => void tools.selectInvalid()),
    deselect: button("Deselect All", "foliage-deselect", "Seçimi bırakır (Esc).", () => tools.deselect()),
    reattach: button("Reattach", "foliage-reattach", "Seçili örnekleri altlarındaki zemine oturtur (tek Undo).", () => void tools.reattach()),
    remove: button("Remove Selected", "foliage-remove-selected", "Seçili örnekleri siler (Delete; tek Undo).", () => tools.removeSelected()),
  };
  const reapply = button("Reapply to Type", "foliage-reapply", "Var olan örneklerin ölçek ve dönüşünü türün şimdiki ayarlarından yeniden üretir; konum korunur (tek Undo).", () => void tools.reapply());
  body.append(grid(4, [...buttons.values()]), hint, form.element, grid(2, Object.values(actions)), grid(1, [reapply]));

  let shown = "";
  const draw = (): void => {
    const { settings } = tools;
    const picked = tools.selectionSize();
    for (const [tool, node] of buttons) {
      node.classList.toggle("on", tool === settings.tool);
      node.setAttribute("aria-pressed", String(tool === settings.tool));
    }
    hint.textContent = settings.tool ? HINTS[settings.tool] : "Bir araç seç; aynı düğme ya da Esc kapatır. Araç yokken tıklama aktör seçer.";
    actions.deselect.disabled = actions.reattach.disabled = actions.remove.disabled = picked === 0 || tools.busy;
    actions.invalid.disabled = reapply.disabled = tools.busy;
    reapply.textContent = picked > 0 ? `Reapply to Selection (${picked})` : "Reapply to Type";
    section.dataset.selected = String(picked);
    const { tool: _tool, ...fields } = settings;
    const key = JSON.stringify(fields);
    if (key === shown) return;
    shown = key;
    if (!body.contains(doc.activeElement)) form.update(values());
  };
  draw();
  const stop = tools.onChange(draw);
  return { element: section, dispose: stop };
}
