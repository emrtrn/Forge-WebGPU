// The Landscape section of a terrain's Details (plan 5d steps 2–3; Forge WebGL
// specialActorDetails.ts renderWorldTerrainDetails @ forge-webgl-final): the
// mode (Sculpt / Paint) and view mode, the tool and its brush, drawn with the
// kit's form (sliders with their range, clamping with a Turkish warning;
// English names, Turkish hints), and the terrain's tiles. The settings are the
// page's (the editing service's), shared with the viewport tool: changing them
// is never an undo step.
//
// Forge's layout (user decision 2026-11-20): Mode, the tools as a button grid
// (the selected one lit), the hint, the brush, then View.
//
// Paint (step 3; Forge's layout 2026-11-20, landscapePaintPanel.ts): the Brush
// / Auto Paint tabs; Brush: the paint tools, the layers, Fill Layer, the
// brush; Auto Paint: the layers and the rules (`forge.landscapeAutoPaint` on
// this actor). Layer actions are the editor's (landscapeLayers.ts), each one
// undo step.
//
// Splines (step 5, landscapeSplinePanel.ts): Draw / Edit Points and Forge's
// spline lists and effects.
//
// Tiles (step 4): Expand… (a single tile into a grid), Import Heightmap… and
// Export PNG / RAW (landscapeTerrain.ts). Moving the terrain is the gizmo's.
//
// Forge's per-tool fields: Ramp shows its width (twice the brush radius) and
// its offsets instead of size and strength; Noise its scale and seed; Terrace
// its step; Erosion its type and the type's parameters; Flatten its target or
// the clicked height.

import { bool, enumOf, formFields, num, type ActorId, type FieldMap } from "../../core/index.ts";
import {
  LANDSCAPE_PAINT_TOOLS, LANDSCAPE_SCULPT_TOOLS, LANDSCAPE_SPLINE_TOOLS, LANDSCAPE_VIEW_MODES, TerrainEditingKey,
  type EditableTerrain, type LandscapePaintTool, type LandscapeSettings, type LandscapeSplineTool, type LandscapeViewMode, type TerrainEditing,
} from "../../engine/terrain/terrainEditing.ts";
import type { TerrainSculptTool } from "../../engine/terrain/terrainSculpt.ts";
import { terrainTileWorldSize } from "../../engine/terrain/terrainTypes.ts";
import type { DetailsExtensionContext } from "../host/featureEditor.ts";
import { createFormView, createSection, type FormView } from "../ui/formView.ts";
import { LandscapeLayersKey, type LandscapeLayers } from "./landscapeLayers.ts";
import { createAutoPaintBlock, createLayerBlock, createPaintTabs } from "./landscapePaintPanel.ts";
import { createSplineBlock } from "./landscapeSplinePanel.ts";
import { LandscapeSplinesKey } from "./landscapeSplines.ts";
import { LandscapeTerrainKey } from "./landscapeTerrain.ts";

const TOOL_LABELS: Record<TerrainSculptTool, string> = {
  raise: "Raise", lower: "Lower", smooth: "Smooth", flatten: "Flatten", noise: "Noise", ramp: "Ramp", terrace: "Terrace", erosion: "Erosion",
};

const PAINT_TOOL_LABELS: Record<LandscapePaintTool, string> = { paint: "Paint", erase: "Erase", smoothWeights: "Weights" };
const VIEW_LABELS: Record<LandscapeViewMode, string> = { lit: "Lit", height: "Height", slope: "Slope", layer: "Layer" };

const SPLINE_TOOL_LABELS: Record<LandscapeSplineTool, string> = { draw: "Draw", edit: "Edit Points" };
const SPLINE_TOOL_HINTS: Record<LandscapeSplineTool, string> = {
  draw: "Arazide tıklamak etkin spline'a nokta ekler; var olan bir noktaya tıklamak ona bağlar (kapatır, dallandırır, birleştirir).",
  edit: "Noktaya tıklamak seçer; gizmo ile taşınır.",
};

/** The mode row: Sculpt / Paint / Splines. */
const MODE_FIELDS: FieldMap = {
  mode: enumOf(["sculpt", "paint", "splines"], { default: "sculpt", labels: { sculpt: "Sculpt", paint: "Paint", splines: "Splines" }, label: "Mode", hint: "Sculpt yüksekliği, Paint boya katmanlarını, Splines yolları düzenler." }),
};

/** The view row under the brush (an editor preview, never saved). */
const VIEW_FIELDS: FieldMap = {
  viewMode: enumOf(LANDSCAPE_VIEW_MODES, { default: "lit", labels: VIEW_LABELS, label: "View", hint: "Yalnız editör önizlemesi: Height yüksekliği, Slope eğimi, Layer etkin katmanın ağırlığını boyar. Level'a ve Play'e geçmez." }),
};

const SCULPT_TOOL_HINTS: Record<TerrainSculptTool, string> = {
  raise: "Araziyi yükseltir.", lower: "Araziyi alçaltır.", smooth: "Yükseklikleri yumuşatır.", flatten: "Hedef yüksekliğe düzler.",
  noise: "Doğal yükseklik çeşitliliği boyar.", ramp: "İki nokta arasında rampa / yol açar.", terrace: "Yükseklik basamakları boyar.", erosion: "Aşınma uygular.",
};
const PAINT_TOOL_HINTS: Record<LandscapePaintTool, string> = {
  paint: "Etkin katmanı boyar.", erase: "Etkin katmanı azaltır.", smoothWeights: "Katman ağırlıklarını yumuşatır.",
};

/** Forge's paint brush. */
export function landscapePaintFields(): FieldMap {
  return {
    brushSize: num({ default: 6, min: 0.5, max: 50, step: 0.5, label: "Brush Size", hint: "Fırça yarıçapı (metre)." }),
    strength: num({ default: 0.25, min: 0.01, max: 2, step: 0.01, label: "Strength", hint: "Darbe başına etki." }),
    falloff: num({ default: 2, min: 0.25, max: 8, step: 0.25, label: "Falloff", hint: "Kenara doğru zayıflamanın üssü; büyük değer merkezi keskinleştirir." }),
  };
}

/** Forge's hint under the tools. */
const MODIFIER_HINT = "Sculpt sırasında Raise ile Lower'ı değiştirmek için Shift'e basılı tutun. Ctrl: Smooth. Alt: Flatten. Ctrl+Alt: tıklanan yükseklikte Flatten.";

const TOOL_HINTS: Partial<Record<TerrainSculptTool, string>> = {
  noise: "Doğal yükseklik çeşitliliği boyar. Scale desen boyutunu belirler; aynı seed deseni tile'lar arasında kesintisiz tutar.",
  ramp: "Terrain üzerinde sürükleyip bırakın. Ramp Width düz yolun tam genişliğidir; Shoulder Width her iki kenarı araziye karıştırır. Falloff yalnızca kenarları şekillendirir. Yol, Strength'ten bağımsız olarak tek uygulamada uç noktaların yüksekliğine ulaşır. Yalnızca tıklamak bir değişiklik yapmaz.",
  terrace: "Terrain orijinine göre yükseklik basamakları boyar. Smoothing basamaklar arası geçişleri yumuşatır.",
  flatten: "Use Clicked Height her sürüklemenin başındaki yüksekliği kullanır ve bırakana kadar sabit tutar.",
};

/** The form's fields for these settings (Forge's limits and steps). */
export function landscapeFields(settings: LandscapeSettings): FieldMap {
  const fields: Record<string, FieldMap[string]> = {};
  if (settings.tool === "ramp") {
    fields.rampWidth = num({ default: 12, min: 1, max: 100, step: 1, label: "Ramp Width (m)", hint: "Düz yol yüzeyinin tam genişliği." });
  } else {
    fields.brushSize = num({ default: 6, min: 0.5, max: 50, step: 0.5, label: "Brush Size", hint: "Fırça yarıçapı (metre)." });
    fields.strength = num({ default: 0.25, min: 0.01, max: 2, step: 0.01, label: "Strength", hint: "Darbe başına etki." });
  }
  fields.falloff = num({ default: 2, min: 0.25, max: 8, step: 0.25, label: "Falloff", hint: "Kenara doğru zayıflamanın üssü; büyük değer merkezi keskinleştirir." });
  if (settings.tool === "noise") {
    fields.noiseScale = num({ default: 4, min: 0.1, max: 1000, step: 0.1, slider: [0.1, 100], label: "Noise Scale (m)", hint: "Gürültü deseninin boyutu." });
    fields.noiseSeed = num({ default: 1, min: 0, max: 2147483647, step: 1, slider: [0, 1000], label: "Noise Seed", hint: "Aynı seed aynı deseni verir." });
  } else if (settings.tool === "ramp") {
    fields.rampStartOffset = num({ default: 0, min: -1000, max: 1000, step: 0.1, slider: [-20, 20], label: "Start Offset (m)", hint: "Başlangıç noktasının yüksekliğine eklenir." });
    fields.rampEndOffset = num({ default: 0, min: -1000, max: 1000, step: 0.1, slider: [-20, 20], label: "End Offset (m)", hint: "Bitiş noktasının yüksekliğine eklenir." });
    fields.rampShoulder = num({ default: 2, min: 0, max: 50, step: 0.5, label: "Shoulder Width (m)", hint: "Yolun iki kenarını araziye karıştıran genişlik." });
  } else if (settings.tool === "terrace") {
    fields.terraceStep = num({ default: 2, min: 0.01, max: 1000, step: 0.1, slider: [0.1, 50], label: "Step Height (m)", hint: "Basamak yüksekliği." });
    fields.terraceSmoothing = num({ default: 0.15, min: 0, max: 1, step: 0.05, label: "Step Smoothing", hint: "Basamaklar arası geçişin yumuşaklığı." });
  } else if (settings.tool === "erosion") {
    fields.erosionType = enumOf(["thermal", "hydraulic"], { default: "thermal", labels: { thermal: "Thermal", hydraulic: "Hydraulic" }, label: "Erosion Type", hint: "Thermal: dik yamaçta toprak kayar. Hydraulic: yağmur kanallar açar." });
    fields.erosionIterations = num({ default: 24, min: 1, max: 64, step: 1, label: "Iterations", hint: "Darbe başına aşınma adımı." });
    if (settings.erosionHydraulic) {
      fields.erosionRainAmount = num({ default: 0.5, min: 0, max: 10, step: 0.1, label: "Rain Amount", hint: "Daha güçlü aşınma için artırın; düz arazide eğim gerekir." });
      fields.erosionSedimentCapacity = num({ default: 4, min: 0, max: 20, step: 0.5, label: "Sediment Capacity", hint: "Suyun taşıyabildiği toprak." });
      fields.erosionEvaporation = num({ default: 0.02, min: 0, max: 1, step: 0.01, label: "Evaporation", hint: "Adım başına buharlaşan su." });
      fields.erosionSeed = num({ default: 1, min: 0, max: 2147483647, step: 1, slider: [0, 1000], label: "Rain Seed", hint: "Yağmur damlalarının dağılımı." });
    } else {
      fields.erosionTalus = num({ default: 30, min: 0, max: 89, step: 1, label: "Resting Angle (deg)", hint: "Bu açıdan dik yamaçlarda gevşek toprak aşağı kayar." });
    }
  } else if (settings.tool === "flatten") {
    fields.flattenUseClickedHeight = bool({ default: false, label: "Use Clicked Height", hint: TOOL_HINTS.flatten! });
    if (!settings.flattenUseClickedHeight) fields.flattenTargetHeight = num({ default: 0, step: 0.1, label: "Flatten Target", hint: "Terrain orijinine göre hedef yükseklik (metre)." });
  }
  return fields;
}

/** The form's value for these settings. */
function formValue(settings: LandscapeSettings): Record<string, unknown> {
  return { ...settings, rampWidth: settings.brushSize * 2, erosionType: settings.erosionHydraulic ? "hydraulic" : "thermal" };
}

/** A form value back into settings. */
function settingsPatch(value: Record<string, unknown>, tool: TerrainSculptTool): Partial<LandscapeSettings> {
  const patch: Record<string, unknown> = { ...value };
  if (typeof value.rampWidth === "number" && tool === "ramp") patch.brushSize = value.rampWidth / 2;
  if (value.erosionType !== undefined) patch.erosionHydraulic = value.erosionType === "hydraulic";
  // The tool buttons, Mode and View own these; the brush form never writes them back.
  for (const key of ["rampWidth", "erosionType", "mode", "tool", "paintTool", "viewMode", "activeLayerId"]) delete patch[key];
  return patch as Partial<LandscapeSettings>;
}

/** Which fields a settings change needs (the mode, a new tool, an erosion type, the clicked height switch). */
const fieldsKey = (settings: LandscapeSettings): string =>
  settings.mode === "splines" ? "splines" : settings.mode === "paint" ? `paint:${settings.paintPanel}` : `${settings.tool}:${settings.erosionHydraulic}:${settings.flattenUseClickedHeight}`;

const button = (doc: Document, label: string, testId: string, title: string, onClick: () => void): HTMLButtonElement => {
  const node = doc.createElement("button");
  node.type = "button";
  node.className = "detail-inline-button";
  node.textContent = label;
  node.title = title;
  node.dataset.testid = testId;
  node.addEventListener("click", onClick);
  return node;
};

/** Forge's tool buttons, four to a row; the selected one is lit (`on`, `aria-pressed`). */
function createToolGrid(doc: Document, editing: TerrainEditing) {
  const element = doc.createElement("div");
  element.dataset.testid = "landscape-tools";
  Object.assign(element.style, { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "6px", margin: "6px 0" });
  const buttons = new Map<string, HTMLButtonElement>();
  let shown = "";
  const draw = (): void => {
    const settings = editing.settings;
    const painting = settings.mode === "paint";
    if (shown !== settings.mode) {
      shown = settings.mode;
      buttons.clear();
      const entries: [string, string, string, () => void][] = settings.mode === "splines"
        ? LANDSCAPE_SPLINE_TOOLS.map((tool) => [tool, SPLINE_TOOL_LABELS[tool], SPLINE_TOOL_HINTS[tool], () => editing.update({ splineTool: tool })])
        : painting
        ? LANDSCAPE_PAINT_TOOLS.map((tool) => [tool, PAINT_TOOL_LABELS[tool], PAINT_TOOL_HINTS[tool], () => editing.update({ paintTool: tool })])
        : LANDSCAPE_SCULPT_TOOLS.map((tool) => [tool, TOOL_LABELS[tool], SCULPT_TOOL_HINTS[tool], () => editing.update({ tool })]);
      element.replaceChildren(...entries.map(([tool, label, title, pick]) => {
        const node = button(doc, label, `landscape-tool-${tool}`, title, pick);
        node.className = "detail-action-button";
        buttons.set(tool, node);
        return node;
      }));
    }
    const current = settings.mode === "splines" ? settings.splineTool : painting ? settings.paintTool : settings.tool;
    for (const [tool, node] of buttons) {
      node.classList.toggle("on", tool === current);
      node.setAttribute("aria-pressed", String(tool === current));
    }
  };
  return { element, draw };
}

export function createLandscapeDetails(ctx: DetailsExtensionContext): { element: HTMLElement; dispose(): void } {
  const doc = ctx.document;
  const element = doc.createElement("div");
  element.dataset.testid = "landscape-panel";
  const editing: TerrainEditing | undefined = ctx.service(TerrainEditingKey);
  if (!editing) {
    element.className = "detail-hint";
    element.textContent = "Landscape araçları yalnız editörde.";
    return { element, dispose() {} };
  }
  const tools = createSection(doc, "Landscape Mode", { testId: "landscape-sculpt" });
  const tiles = createSection(doc, "Tiles", { testId: "landscape-tiles" });
  element.append(tools.section, tiles.section);
  const layers: LandscapeLayers | undefined = ctx.service(LandscapeLayersKey);
  const modeForm = createFormView({
    document: doc,
    fields: formFields(MODE_FIELDS),
    value: { mode: editing.settings.mode },
    testIdPrefix: "landscape",
    warn: (message) => ctx.status(message, "warning"),
    onChange: (change) => editing.update({ mode: change.next.mode as LandscapeSettings["mode"] }),
  });
  const viewForm = createFormView({
    document: doc,
    fields: formFields(VIEW_FIELDS),
    value: { viewMode: editing.settings.viewMode },
    testIdPrefix: "landscape",
    warn: (message) => ctx.status(message, "warning"),
    onChange: (change) => editing.update({ viewMode: change.next.viewMode as LandscapeSettings["viewMode"] }),
  });
  const toolGrid = createToolGrid(doc, editing);
  const paintTabs = createPaintTabs(doc, editing);
  const layerBlock = createLayerBlock(doc, editing, layers, ctx.status);
  const autoBlock = createAutoPaintBlock(doc, editing, layers, ctx.status);
  const terrainNow = (): { actor: ActorId | null; terrain: EditableTerrain | undefined } => {
    const target = ctx.target();
    return { actor: target?.actor ?? null, terrain: target ? editing.find(target.actor, target.key) : undefined };
  };
  const splineBlock = createSplineBlock(doc, editing, ctx.service(LandscapeSplinesKey), ctx.status);
  const drawLayers = (): void => {
    if (editing.settings.mode === "splines") {
      const { actor, terrain } = terrainNow();
      splineBlock.draw(actor, terrain);
      return;
    }
    if (editing.settings.mode !== "paint") return;
    const { actor, terrain } = terrainNow();
    // A terrain without the active layer paints its first one.
    const defLayers = terrain?.session.world.def.layers ?? [];
    if (defLayers.length > 0 && !defLayers.some((layer) => layer.id === editing.settings.activeLayerId)) {
      editing.update({ activeLayerId: defLayers[0]!.id });
      return;
    }
    const brush = editing.settings.paintPanel === "brush";
    layerBlock.draw(actor, terrain, brush);
    if (!brush) autoBlock.draw(actor, terrain);
  };

  const hint = doc.createElement("div");
  hint.className = "detail-hint";
  hint.textContent = MODIFIER_HINT;
  const toolHint = doc.createElement("div");
  toolHint.className = "detail-hint";
  let form: FormView | null = null;
  let shownFields = "";
  const draw = (): void => {
    const settings = editing.settings;
    modeForm.update({ mode: settings.mode });
    viewForm.update({ viewMode: settings.viewMode });
    toolGrid.draw();
    paintTabs.draw();
    const key = fieldsKey(settings);
    if (key === shownFields) {
      form?.update(formValue(settings));
      drawLayers();
      return;
    }
    shownFields = key;
    const painting = settings.mode === "paint";
    if (settings.mode === "splines") {
      form = null;
      toolHint.hidden = false;
      toolHint.textContent = "Draw: arazide tıkla; var olan noktaya tıklamak bağlar (kapat, dallandır, birleştir). Edit Points: noktayı seç, gizmo ile taşı.";
      tools.body.replaceChildren(modeForm.element, toolGrid.element, toolHint, splineBlock.element, viewForm.element);
      drawLayers();
      return;
    }
    form = createFormView({
      document: doc,
      fields: formFields(painting ? landscapePaintFields() : landscapeFields(settings)),
      value: formValue(settings),
      testIdPrefix: "landscape",
      warn: (message) => ctx.status(message, "warning"),
      onChange: (change) => editing.update(settingsPatch(change.next, editing.settings.tool)),
    });
    if (painting) {
      tools.body.replaceChildren(...(settings.paintPanel === "brush"
        ? [modeForm.element, paintTabs.element, toolGrid.element, layerBlock.element, form.element, viewForm.element]
        : [modeForm.element, paintTabs.element, layerBlock.element, autoBlock.element, viewForm.element]));
      drawLayers();
      return;
    }
    toolHint.textContent = TOOL_HINTS[settings.tool] && settings.tool !== "flatten" ? TOOL_HINTS[settings.tool]! : "";
    toolHint.hidden = toolHint.textContent === "";
    tools.body.replaceChildren(modeForm.element, toolGrid.element, hint, toolHint, form.element, viewForm.element);
  };

  const rows = doc.createElement("div");
  const terrainOps = ctx.service(LandscapeTerrainKey);
  const actions = doc.createElement("div");
  actions.className = "detail-row";
  const onTarget = (run: (actor: ActorId) => void) => () => {
    const actor = ctx.target()?.actor;
    if (actor) run(actor);
  };
  const expand = button(doc, "Expand…", "landscape-expand", "Tek tile'lı terrain'i tile ızgarasına genişletir (tek Undo).", onTarget((actor) => void terrainOps?.openExpand(actor)));
  const importMap = button(doc, "Import Heightmap…", "landscape-heightmap-import", "16-bit PNG ya da RAW'dan bütün yükseklikleri alır (tek Undo).", onTarget((actor) => void terrainOps?.openImport(actor)));
  const exportPng = button(doc, "Export PNG", "landscape-heightmap-export-png", "Bütün ızgarayı 16-bit gri PNG olarak indirir.", onTarget((actor) => void terrainOps?.exportHeightmap(actor, "png")));
  const exportRaw = button(doc, "Export RAW", "landscape-heightmap-export-raw", "Bütün ızgarayı 16-bit RAW (little-endian) olarak indirir.", onTarget((actor) => void terrainOps?.exportHeightmap(actor, "raw")));
  actions.append(expand, importMap, exportPng, exportRaw);
  const moveHint = doc.createElement("div");
  moveHint.className = "detail-hint";
  moveHint.textContent = "Terrain'i taşımak için gizmo: tanımın orijini ve dünya çerçeveli spline'ları birlikte kayar, tile'lar değişmez. Döndürme ve ölçek uygulanmaz.";
  tiles.body.append(rows, actions, moveHint);
  if (!terrainOps) actions.hidden = true;
  let shownTiles = "";
  const drawTiles = (): void => {
    const { terrain } = terrainNow();
    const lines: [string, string][] = [];
    if (!terrain) {
      lines.push(["Terrain", "Loading…"]);
    } else {
      const { def, tiles: loaded } = terrain.session.world;
      const size = terrainTileWorldSize(def);
      const holes = def.tilesX * def.tilesZ - def.tiles.length;
      const metres = (value: number): string => `${Number(value.toFixed(2))} m`;
      lines.push(
        ["Tiles", `${def.tilesX} × ${def.tilesZ}${holes > 0 ? ` (${holes} empty)` : ""}`],
        ["Tiles in memory", `${loaded.size} / ${def.tiles.length}`],
        ["Tile Size", metres(size)],
        ["World Size", `${metres(size * def.tilesX)} × ${metres(size * def.tilesZ)}`],
        ["Spacing", metres(def.spacing)],
        ["Unsaved Tiles", String(terrain.session.dirtyKeys().length)],
      );
    }
    const single = terrain !== undefined && terrain.session.world.def.tilesX * terrain.session.world.def.tilesZ === 1;
    const busy = terrainOps?.busy ?? true;
    expand.disabled = !single || busy;
    importMap.disabled = exportPng.disabled = exportRaw.disabled = !terrain || busy;
    const text = JSON.stringify(lines);
    if (text === shownTiles) return;
    shownTiles = text;
    rows.replaceChildren(...lines.map(([name, value]) => {
      const row = doc.createElement("div");
      row.className = "detail-row";
      const label = doc.createElement("span");
      label.textContent = name;
      const shown = doc.createElement("span");
      shown.textContent = value;
      shown.dataset.testid = `landscape-${name.toLowerCase().replaceAll(" ", "-")}`;
      row.append(label, shown);
      return row;
    }));
  };

  draw();
  drawTiles();
  const stop = editing.onChange(() => {
    draw();
    drawTiles();
  });
  let since = 0;
  ctx.onFrame((dt) => {
    since += dt;
    if (since < 0.25) return;
    since = 0;
    drawTiles();
    drawLayers();
  });
  return { element, dispose: stop };
}
