// Landscape Paint mode in Details, in Forge's layout (user decision
// 2026-11-20; Forge WebGL specialActorDetails.ts and
// landscapeAutoPaintDetails.ts @ forge-webgl-final): the Brush / Auto Paint
// tabs, the Layer list (the active one lit, a layer shown by its material's
// name), Add Layer (n/8), Remove Layer (the active one), the active layer's
// Material; the Brush tab adds Fill Layer (the tools and brush are the
// panel's), the Auto Paint tab the rules: Base Layer, one card per rule
// (Rule n, its layer and bands, Remove), Add Rule, Seed and Apply Auto Paint.
//
// The rules are the actor's `forge.landscapeAutoPaint` (user decision
// 2026-11-19: saved with the level, an agent writes them with `forge edit
// set`); the first edit adds the component. Each edit is a level edit (slider
// steps coalesce into one undo step). Apply repaints once (one undo step).

import { bool, enumOf, formFields, num, type ActorId, type FieldMap } from "../../core/index.ts";
import { defaultTerrainAutoPaintRule, TERRAIN_AUTO_PAINT_RANGES as RANGES } from "../../engine/terrain/terrainAutoPaint.ts";
import { TERRAIN_MAX_LAYERS } from "../../engine/terrain/terrainTypes.ts";
import type { EditableTerrain, LandscapePaintPanel, TerrainEditing } from "../../engine/terrain/terrainEditing.ts";
import type { LandscapeAutoPaintData } from "../../features/terrain/schema.ts";
import { createFormView, type FormView } from "../ui/formView.ts";
import { landscapeAutoPaintSettings } from "./landscapeAutoPaint.ts";
import type { LandscapeLayers } from "./landscapeLayers.ts";

type Status = (message: string, tone?: "info" | "warning" | "error") => void;

const NONE = "none";

function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, className = "", text?: string): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function wideButton(doc: Document, label: string, testId: string, title: string, onClick: () => void): HTMLButtonElement {
  const node = el(doc, "button", "detail-action-button", label);
  node.type = "button";
  node.title = title;
  node.dataset.testid = testId;
  node.style.width = "100%";
  node.addEventListener("click", onClick);
  return node;
}

/** Brush / Auto Paint (Forge's paint panel tabs). */
export function createPaintTabs(doc: Document, editing: TerrainEditing) {
  const element = el(doc, "div");
  element.setAttribute("role", "tablist");
  Object.assign(element.style, { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", margin: "6px 0" });
  const tabs = new Map<LandscapePaintPanel, HTMLButtonElement>();
  for (const [panel, label, title] of [["brush", "Brush", "Fırçayla elle boyama."], ["auto", "Auto Paint", "Yüksekliğe ve eğime göre bütün terrain'i bir kerede boyar."]] as const) {
    const tab = wideButton(doc, label, `landscape-paint-panel-${panel}`, title, () => editing.update({ paintPanel: panel }));
    tab.setAttribute("role", "tab");
    tabs.set(panel, tab);
    element.append(tab);
  }
  const draw = (): void => {
    for (const [panel, tab] of tabs) {
      const on = editing.settings.paintPanel === panel;
      tab.classList.toggle("on", on);
      tab.setAttribute("aria-selected", String(on));
    }
  };
  return { element, draw };
}

/** The layer's shown name: its material's, else its own. */
const layerLabel = (layers: LandscapeLayers | undefined, layer: { name: string; material?: string | null }): string =>
  (layer.material ? layers?.assetLabel(layer.material) : null) ?? layer.name;

/** Layer list, Add / Remove Layer, the active layer's Material and (Brush tab) Fill Layer. */
export function createLayerBlock(doc: Document, editing: TerrainEditing, layers: LandscapeLayers | undefined, status: Status) {
  const element = el(doc, "div");
  element.dataset.testid = "landscape-layers";
  let shown = "";
  const draw = (actor: ActorId | null, terrain: EditableTerrain | undefined, fill: boolean): void => {
    if (!terrain || actor === null) {
      if (shown !== "none") element.replaceChildren();
      shown = "none";
      return;
    }
    const defLayers = terrain.session.world.def.layers;
    const active = editing.settings.activeLayerId;
    const activeLayer = defLayers.find((layer) => layer.id === active);
    const materials = layers?.materials() ?? [];
    const key = JSON.stringify([actor, defLayers.map((layer) => [layer.id, layerLabel(layers, layer), layer.color, layer.material ?? null]), active, fill, layers?.busy ?? false, materials.length]);
    if (key === shown) return;
    shown = key;
    const busy = !layers || layers.busy;
    const heading = el(doc, "div", "detail-hint", "Layer");
    const rows = el(doc, "div");
    Object.assign(rows.style, { display: "grid", gap: "6px", margin: "4px 0 6px" });
    for (const layer of defLayers) {
      const row = wideButton(doc, "", `landscape-layer-${layer.id}-select`, "Bu katmanı boyamak için seç.", () => editing.update({ activeLayerId: layer.id }));
      Object.assign(row.style, { display: "flex", alignItems: "center", gap: "8px", justifyContent: "flex-start" });
      const swatch = el(doc, "span");
      Object.assign(swatch.style, { width: "12px", height: "12px", flex: "0 0 12px", background: layer.color, border: "1px solid rgba(255,255,255,0.25)" });
      row.append(swatch, el(doc, "span", "", layerLabel(layers, layer)));
      row.classList.toggle("on", layer.id === active);
      row.setAttribute("aria-pressed", String(layer.id === active));
      rows.append(row);
    }
    const add = wideButton(doc, `Add Layer (${defLayers.length}/${TERRAIN_MAX_LAYERS})`, "landscape-layer-add", "Terrain'e boya katmanı ekle.", () => void layers?.add(actor));
    add.disabled = busy || defLayers.length >= TERRAIN_MAX_LAYERS;
    const remove = wideButton(doc, "Remove Layer", "landscape-layer-remove", "Etkin katmanı kaldırır; ağırlığı kalan katmanlara dağılır.", () => void layers?.remove(actor, active));
    remove.disabled = busy || defLayers.length <= 1 || !activeLayer;
    const material = createFormView({
      document: doc,
      fields: formFields({
        material: enumOf([NONE, ...materials.map((entry) => entry.guid)], {
          default: NONE,
          labels: Object.fromEntries([[NONE, "None (layer colour)"], ...materials.map((entry) => [entry.guid, entry.label])]),
          label: "Material", hint: "Etkin katmanın materyali; None katmanı kendi rengiyle çizer.",
        }),
      }),
      value: { material: activeLayer?.material ?? NONE },
      testIdPrefix: "landscape-layer",
      disabled: busy || !activeLayer,
      warn: (message) => status(message, "warning"),
      onChange: (change) => {
        if (change.phase === "commit" && activeLayer) layers?.setMaterial(actor, activeLayer.id, change.value === NONE ? null : String(change.value));
      },
    });
    const parts: HTMLElement[] = [heading, rows, add, remove, material.element];
    if (fill) {
      const fillButton = wideButton(doc, "Fill Layer", "landscape-fill-layer", "Bütün terrain'i etkin katmanla doldurur (tek Undo).", () => void layers?.fill(actor, active));
      fillButton.disabled = busy || !activeLayer;
      parts.push(fillButton);
    }
    for (const part of [add, remove]) part.style.marginTop = "6px";
    element.replaceChildren(...parts);
  };
  return { element, draw };
}

/** The ground's world height span (the rules' slider span and the hint). */
function groundRange(terrain: EditableTerrain): [number, number] {
  const { def } = terrain.session.world;
  const low = Math.min(...def.tiles.map((tile) => tile.minHeight));
  const high = Math.max(...def.tiles.map((tile) => tile.maxHeight));
  return Number.isFinite(low) && Number.isFinite(high) ? [def.origin[1] + low, def.origin[1] + high] : [def.origin[1], def.origin[1]];
}

/** Auto Paint's rules (the actor's `forge.landscapeAutoPaint`), Add Rule, Seed and Apply. */
export function createAutoPaintBlock(doc: Document, editing: TerrainEditing, layers: LandscapeLayers | undefined, status: Status) {
  const element = el(doc, "div");
  element.dataset.testid = "landscape-auto-paint";
  let structure = "";
  let forms: FormView[] = [];
  let data: LandscapeAutoPaintData = { baseLayer: "", seed: 1, rules: [] };
  let target: { actor: ActorId; terrain: EditableTerrain } | null = null;
  // Written when a change lands: Details draws itself again after every level edit, which would end a slider drag.
  const write = (next: LandscapeAutoPaintData, phase: "input" | "commit"): void => {
    data = next;
    if (target && phase === "commit") layers?.editAutoPaint(target.actor, next, "commit");
  };

  const draw = (actor: ActorId | null, terrain: EditableTerrain | undefined): void => {
    if (!terrain || actor === null || !layers) {
      if (structure !== "none") element.replaceChildren();
      structure = "none";
      target = null;
      return;
    }
    target = { actor, terrain };
    const defLayers = terrain.session.world.def.layers;
    const ids = defLayers.map((layer) => layer.id);
    const labels = Object.fromEntries(defLayers.map((layer) => [layer.id, layerLabel(layers, layer)]));
    const stored = layers.autoPaintData(actor);
    data = stored ? { baseLayer: stored.baseLayer, seed: stored.seed, rules: stored.rules.map((rule) => ({ ...rule })) } : { baseLayer: "", seed: 1, rules: [] };
    const base = ids.includes(data.baseLayer) ? data.baseLayer : (ids[0] ?? "");
    const [low, high] = groundRange(terrain);
    const margin = Math.max(5, (high - low) * 0.05);
    const span: [number, number] = [Math.floor(low - margin), Math.ceil(high + margin)];
    const key = JSON.stringify([actor, ids, labels, data.rules.length, span, layers.busy]);
    if (key === structure) {
      // Same shape: the values follow (an undo, another panel's edit) without rebuilding a slider being dragged.
      forms[0]?.update({ baseLayer: base });
      data.rules.forEach((rule, i) => forms[i + 1]?.update({ ...rule, layer: ids.includes(rule.layer) ? rule.layer : base }));
      forms.at(-1)?.update({ seed: data.seed });
      return;
    }
    structure = key;
    const layerField = (label: string, hint: string) => enumOf(ids.length > 0 ? ids : [""], { default: ids[0] ?? "", labels, label, hint });
    const baseForm = createFormView({
      document: doc, fields: formFields({ baseLayer: layerField("Base Layer", "Hiçbir kuralın kapsamadığı zeminin katmanı.") }), value: { baseLayer: base },
      testIdPrefix: "landscape-auto", warn: (message) => status(message, "warning"),
      onChange: (change) => write({ ...data, baseLayer: String(change.value) }, change.phase),
    });
    const ruleFields: FieldMap = {
      enabled: bool({ default: true, label: "Enabled", hint: "Kapalı kural uygulanmaz." }),
      layer: layerField("Layer", "Kuralın boyadığı katman."),
      heightMin: num({ default: span[0], min: RANGES.height.min, max: RANGES.height.max, step: 0.5, slider: span, label: "Height Min (m)", hint: "Yükseklik bandının alt sınırı, dünya metresi." }),
      heightMax: num({ default: span[1], min: RANGES.height.min, max: RANGES.height.max, step: 0.5, slider: span, label: "Height Max (m)", hint: "Yükseklik bandının üst sınırı, dünya metresi." }),
      heightFalloff: num({ default: 0, min: RANGES.heightFalloff.min, max: RANGES.heightFalloff.max, step: 0.5, slider: [0, Math.max(10, Math.ceil((span[1] - span[0]) / 2))], label: "Height Falloff (m)", hint: "Bant dışında sıfıra inen geçiş." }),
      slopeMin: num({ default: 0, min: RANGES.slope.min, max: RANGES.slope.max, step: 1, label: "Slope Min (°)", hint: "Eğim bandının alt sınırı (0 düz)." }),
      slopeMax: num({ default: 90, min: RANGES.slope.min, max: RANGES.slope.max, step: 1, label: "Slope Max (°)", hint: "Eğim bandının üst sınırı (90 dikey)." }),
      slopeFalloff: num({ default: 0, min: RANGES.slopeFalloff.min, max: RANGES.slopeFalloff.max, step: 1, label: "Slope Falloff (°)", hint: "Eğim bandı dışında sıfıra inen geçiş." }),
      noiseAmount: num({ default: 0, min: RANGES.noiseAmount.min, max: RANGES.noiseAmount.max, step: 0.01, label: "Noise", hint: "Kaplamayı gürültüyle bölme miktarı (0 kapalı)." }),
      noiseScale: num({ default: 20, min: RANGES.noiseScale.min, max: RANGES.noiseScale.max, step: 1, label: "Noise Scale (m)", hint: "Gürültü deseninin boyu." }),
      strength: num({ default: 1, min: RANGES.strength.min, max: RANGES.strength.max, step: 0.01, label: "Strength", hint: "Kuralın tam uygulandığı yerdeki ağırlığı." }),
    };
    forms = [baseForm];
    const cards = data.rules.map((rule, index) => {
      const card = el(doc, "div", "detail-section");
      card.dataset.testid = `landscape-auto-rule-${index}`;
      Object.assign(card.style, { padding: "6px", margin: "6px 0" });
      const head = el(doc, "div", "detail-row");
      head.append(el(doc, "span", "", `Rule ${index + 1}`));
      const remove = wideButton(doc, "Remove", `landscape-auto-rule-${index}-remove`, "Kuralı sil.", () => write({ ...data, rules: data.rules.filter((_, at) => at !== index) }, "commit"));
      remove.style.width = "auto";
      head.append(remove);
      const form = createFormView({
        document: doc, fields: formFields(ruleFields), value: { ...rule, layer: ids.includes(rule.layer) ? rule.layer : base },
        testIdPrefix: `landscape-auto-rule-${index}`, warn: (message) => status(message, "warning"),
        onChange: (change) => write({ ...data, rules: data.rules.map((entry, at) => (at === index ? { ...entry, ...(change.next as typeof entry) } : entry)) }, change.phase),
      });
      forms.push(form);
      card.append(head, form.element);
      return card;
    });
    const empty = el(doc, "div", "detail-hint", "Henüz kural yok. Add Rule seçili katmanla bütün araziyi kapsayan bir kural ekler; aralıkları daraltarak kullan.");
    const addRule = wideButton(doc, "Add Rule", "landscape-auto-rule-add", "Seçili katmanla bütün araziyi kapsayan bir kural ekler.", () => {
      const layer = ids.includes(editing.settings.activeLayerId) ? editing.settings.activeLayerId : base;
      const fresh = defaultTerrainAutoPaintRule(layer, Math.floor(low), Math.ceil(high));
      const { layerId, ...bands } = fresh;
      write({ ...data, baseLayer: data.baseLayer || base, rules: [...data.rules, { ...bands, layer: layerId }] }, "commit");
    });
    const seedForm = createFormView({
      document: doc, fields: formFields({ seed: num({ default: 1, min: 0, max: 2147483647, step: 1, slider: [0, 1000], label: "Seed", hint: "Bütün kuralların gürültü tohumu." }) }),
      value: { seed: data.seed }, testIdPrefix: "landscape-auto", warn: (message) => status(message, "warning"),
      onChange: (change) => write({ ...data, seed: Number(change.value) }, change.phase),
    });
    forms.push(seedForm);
    const order = el(doc, "div", "detail-hint", `Kurallar yukarıdan aşağı uygulanır; alttaki kural üsttekinin üstüne boyar. Ground ${low.toFixed(3)} – ${high.toFixed(3)} m. Değerleri seçerken View → Height / Slope işe yarar.`);
    const apply = wideButton(doc, "Apply Auto Paint", "landscape-auto-paint-apply", "Kurallarla bütün terrain'i bir kerede yeniden boyar.", () => {
      if (!target) return;
      void layers.autoPaint(target.actor, landscapeAutoPaintSettings(data, base));
    });
    apply.disabled = layers.busy;
    const after = el(doc, "div", "detail-hint", "Apply bütün terrain'i kurallara göre yeniden boyar ve önceki boyamanın üstüne yazar (Ctrl+Z geri alır). Kurallar level'la kaydedilir.");
    element.replaceChildren(el(doc, "div", "detail-hint", "Auto Paint"), baseForm.element, ...(cards.length ? cards : [empty]), addRule, seedForm.element, order, apply, after);
  };
  return { element, draw };
}
