// The Landscape section of a terrain's Details (plan 5d step 2; Forge WebGL
// specialActorDetails.ts renderWorldTerrainDetails @ forge-webgl-final): the
// sculpt tool and its brush, drawn with the kit's form (sliders with their
// range, clamping with a Turkish warning; English names, Turkish hints), and
// the terrain's tiles. The settings are the page's (the editing service's),
// shared with the viewport tool: changing them is never an undo step.
//
// Forge's per-tool fields: Ramp shows its width (twice the brush radius) and
// its offsets instead of size and strength; Noise its scale and seed; Terrace
// its step; Erosion its type and the type's parameters; Flatten its target or
// the clicked height.

import { bool, enumOf, formFields, num, type FieldMap } from "../../core/index.ts";
import { LANDSCAPE_SCULPT_TOOLS, TerrainEditingKey, type LandscapeSettings, type TerrainEditing } from "../../engine/terrain/terrainEditing.ts";
import type { TerrainSculptTool } from "../../engine/terrain/terrainSculpt.ts";
import { terrainTileWorldSize } from "../../engine/terrain/terrainTypes.ts";
import type { DetailsExtensionContext } from "../host/featureEditor.ts";
import { createFormView, createSection, type FormView } from "../ui/formView.ts";

const TOOL_LABELS: Record<TerrainSculptTool, string> = {
  raise: "Raise", lower: "Lower", smooth: "Smooth", flatten: "Flatten", noise: "Noise", ramp: "Ramp", terrace: "Terrace", erosion: "Erosion",
};

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
  const fields: Record<string, FieldMap[string]> = {
    tool: enumOf(LANDSCAPE_SCULPT_TOOLS, { default: "raise", labels: TOOL_LABELS, label: "Tool", hint: "Sculpt aracı; değiştirici tuşlar araç seçimini darbe başına değiştirir." }),
  };
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
function settingsPatch(value: Record<string, unknown>): Partial<LandscapeSettings> {
  const patch: Record<string, unknown> = { ...value };
  if (typeof value.rampWidth === "number" && value.tool === "ramp") patch.brushSize = value.rampWidth / 2;
  if (value.erosionType !== undefined) patch.erosionHydraulic = value.erosionType === "hydraulic";
  delete patch.rampWidth;
  delete patch.erosionType;
  return patch as Partial<LandscapeSettings>;
}

/** Which fields a settings change needs (a new tool, an erosion type, the clicked height switch). */
const fieldsKey = (settings: LandscapeSettings): string => `${settings.tool}:${settings.erosionHydraulic}:${settings.flattenUseClickedHeight}`;

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

  const hint = doc.createElement("div");
  hint.className = "detail-hint";
  hint.textContent = MODIFIER_HINT;
  const toolHint = doc.createElement("div");
  toolHint.className = "detail-hint";
  let form: FormView | null = null;
  let shownFields = "";
  const draw = (): void => {
    const settings = editing.settings;
    const key = fieldsKey(settings);
    if (form && key === shownFields) {
      form.update(formValue(settings));
      return;
    }
    shownFields = key;
    form = createFormView({
      document: doc,
      fields: formFields(landscapeFields(settings)),
      value: formValue(settings),
      testIdPrefix: "landscape",
      warn: (message) => ctx.status(message, "warning"),
      onChange: (change) => editing.update(settingsPatch(change.next)),
    });
    toolHint.textContent = TOOL_HINTS[settings.tool] && settings.tool !== "flatten" ? TOOL_HINTS[settings.tool]! : "";
    toolHint.hidden = toolHint.textContent === "";
    tools.body.replaceChildren(form.element, hint, toolHint);
  };

  const rows = doc.createElement("div");
  tiles.body.append(rows);
  let shownTiles = "";
  const drawTiles = (): void => {
    const target = ctx.target();
    const terrain = target ? editing.find(target.actor, target.key) : undefined;
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
  });
  return { element, dispose: stop };
}
