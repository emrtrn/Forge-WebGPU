// The World Terrain dialogs (plan 5d step 4; Forge WebGL worldTerrainDialog.ts,
// worldTerrainExpandDialog.ts and the heightmap import of
// specialActorDetails.ts @ forge-webgl-final): New World Terrain, Expand,
// Import Heightmap. Each is the kit's form (sliders with ranges, clamping with
// a Turkish warning; English names, Turkish hints) in a panel over the editor,
// with the problems that keep its button off and a summary of the result.
// Escape or Cancel gives null. Forge's Open World section is not here: the
// level's partition, view distance and fog are World Settings'.

import { enumOf, formFields, num, text, type FieldMap } from "../../core/index.ts";
import { TERRAIN_DEFAULT_HEIGHT_MAX, TERRAIN_DEFAULT_HEIGHT_MIN, TERRAIN_MAX_TILES_PER_AXIS } from "../../engine/terrain/terrainTypes.ts";
import {
  estimateWorldTerrain, WORLD_TERRAIN_CREATE_DEFAULTS, WORLD_TERRAIN_CREATE_MAX_BASE_HEIGHT, WORLD_TERRAIN_CREATE_MAX_HEIGHT_RANGE,
  WORLD_TERRAIN_CREATE_MAX_SPACING, WORLD_TERRAIN_CREATE_MIN_SPACING, worldTerrainCreateProblems, worldTerrainGridForHeightmap,
  worldTerrainHeightmapProblems, worldTerrainHeightStep,
  type WorldTerrainCreateOptions, type WorldTerrainCreateTileQuads, type WorldTerrainHeightmapSource,
} from "../../engine/terrain/worldTerrainCreate.ts";
import { WORLD_TERRAIN_EXPAND_DEFAULTS, type WorldTerrainExpandOptions } from "../../engine/terrain/worldTerrainExpand.ts";
import { decodeHeightmapPng } from "../../engine/terrain/heightmapPng.ts";
import { heightmapSamplesToRaw } from "../../engine/terrain/terrainImport.ts";
import { createFormView } from "../ui/formView.ts";

/** A picked heightmap file. */
export interface HeightmapFile {
  readonly name: string;
  readonly bytes: Uint8Array;
}

/** A heightmap file as u16 samples: a PNG's own size, a RAW's from its length (square) or the given grid. */
export async function readHeightmapFile(file: HeightmapFile, grid?: { readonly width: number; readonly height: number }): Promise<{ bytes: Uint8Array; width: number; height: number; png: boolean }> {
  if (/\.png$/i.test(file.name)) {
    const decoded = await decodeHeightmapPng(file.bytes);
    return { bytes: heightmapSamplesToRaw(decoded.samples), width: decoded.width, height: decoded.height, png: true };
  }
  // RAW has no header: the grid it is for, else a square from its length (0 when it is not one).
  if (grid) return { bytes: file.bytes, width: grid.width, height: grid.height, png: false };
  const side = Math.sqrt(file.bytes.byteLength / 2);
  const edge = Number.isInteger(side) ? side : 0;
  return { bytes: file.bytes, width: edge, height: edge, png: false };
}

const metres = (value: number): string => `${Number(value.toFixed(2))} m`;
const megabytes = (bytes: number): string => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

interface DialogOptions {
  readonly document: Document;
  readonly host: HTMLElement;
  readonly title: string;
  /** `data-testid` of the panel; its controls are `<testId>-<field>`, `-confirm`, `-cancel`, `-file`. */
  readonly testId: string;
  readonly fields: (value: Record<string, unknown>, file: HeightmapFile | null) => FieldMap;
  readonly value: Record<string, unknown>;
  readonly confirm: string;
  readonly hint?: string;
  /** A file input (a heightmap); `picked` may change the form's value (a grid fitted to it). */
  readonly file?: { readonly label: string; readonly accept: string; picked?(file: HeightmapFile): Promise<{ readonly patch: Record<string, unknown>; readonly note: string }> };
  readonly problems: (value: Record<string, unknown>, file: HeightmapFile | null) => string[];
  readonly summary?: (value: Record<string, unknown>, file: HeightmapFile | null) => string;
  readonly warn: (message: string) => void;
}

/** Opens the panel; resolves to the confirmed value and file, or null. */
function openDialog(options: DialogOptions): Promise<{ value: Record<string, unknown>; file: HeightmapFile | null } | null> {
  const doc = options.document;
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = "", content?: string): HTMLElementTagNameMap[K] => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  };
  options.host.querySelector(":scope > .landscape-dialog")?.remove();
  return new Promise((resolve) => {
    const panel = el("div", "details-picker landscape-dialog");
    panel.dataset.testid = options.testId;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", options.title);
    // Over the whole editor, not inside a panel (the picker's own place is Details).
    Object.assign(panel.style, { position: "fixed", left: "50%", top: "12vh", transform: "translateX(-50%)", width: "min(420px, calc(100vw - 32px))", maxHeight: "76vh", overflowY: "auto", zIndex: "1000" });
    const head = el("div", "details-picker-head");
    head.append(el("strong", "", options.title));
    const formHost = el("div");
    const summary = el("div", "detail-hint");
    summary.dataset.testid = `${options.testId}-summary`;
    const problems = el("ul", "detail-hint");
    problems.dataset.testid = `${options.testId}-problems`;
    const foot = el("div", "details-picker-head");
    const cancel = el("button", "detail-inline-button", "Cancel");
    cancel.type = "button";
    cancel.dataset.testid = `${options.testId}-cancel`;
    const confirm = el("button", "detail-inline-button", options.confirm);
    confirm.type = "button";
    confirm.dataset.testid = `${options.testId}-confirm`;
    foot.append(cancel, confirm);
    panel.append(head);

    let value = { ...options.value };
    let file: HeightmapFile | null = null;
    let fieldsKey = "";
    let form: ReturnType<typeof createFormView> | null = null;
    const refresh = (): void => {
      const fields = options.fields(value, file);
      const key = JSON.stringify(Object.keys(fields));
      if (!form || key !== fieldsKey) {
        fieldsKey = key;
        form = createFormView({
          document: doc, fields: formFields(fields), value, testIdPrefix: options.testId, warn: options.warn,
          onChange: (change) => {
            value = { ...change.next };
            refresh();
          },
        });
        formHost.replaceChildren(form.element);
      } else form.update(value);
      const found = options.problems(value, file);
      problems.replaceChildren(...found.map((problem) => el("li", "", problem)));
      confirm.disabled = found.length > 0;
      summary.textContent = found.length === 0 ? (options.summary?.(value, file) ?? "") : "";
    };

    if (options.file) {
      const spec = options.file;
      const row = el("label", "detail-row");
      const input = el("input");
      input.type = "file";
      input.accept = spec.accept;
      input.dataset.testid = `${options.testId}-file`;
      const note = el("div", "detail-hint");
      note.dataset.testid = `${options.testId}-file-note`;
      row.append(el("span", "", spec.label), input);
      input.addEventListener("change", async () => {
        const picked = input.files?.[0];
        file = null;
        note.textContent = "";
        if (picked) {
          note.textContent = `Reading ${picked.name}…`;
          try {
            file = { name: picked.name, bytes: new Uint8Array(await picked.arrayBuffer()) };
            const fitted = await spec.picked?.(file);
            if (fitted) value = { ...value, ...fitted.patch };
            note.textContent = fitted?.note ?? picked.name;
          } catch (error) {
            file = null;
            note.textContent = `${picked.name}: ${error instanceof Error ? error.message : String(error)}`;
          }
        }
        refresh();
      });
      panel.append(formHost, row, note);
    } else panel.append(formHost);
    if (options.hint) panel.append(el("div", "detail-hint", options.hint));
    panel.append(summary, problems, foot);

    const close = (result: { value: Record<string, unknown>; file: HeightmapFile | null } | null): void => {
      doc.removeEventListener("keydown", onKey, true);
      panel.remove();
      resolve(result);
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close(null);
      }
    };
    doc.addEventListener("keydown", onKey, true);
    cancel.addEventListener("click", () => close(null));
    confirm.addEventListener("click", () => {
      if (options.problems(value, file).length === 0) close({ value, file });
    });
    options.host.append(panel);
    refresh();
  });
}

const QUADS = ["64", "128", "256"] as const;

/** New World Terrain (Add Actor > Terrain > World Terrain…): the grid, or a heightmap the grid is fitted to. */
export async function openCreateTerrainDialog(document: Document, host: HTMLElement, warn: (message: string) => void): Promise<{ options: WorldTerrainCreateOptions; heightmap: WorldTerrainHeightmapSource | null } | null> {
  const D = WORLD_TERRAIN_CREATE_DEFAULTS;
  // The picked heightmap's samples, kept here (the form holds only its fields).
  let picked: { bytes: Uint8Array; width: number; height: number; png: boolean } | null = null;
  const read = (value: Record<string, unknown>, file: HeightmapFile | null): WorldTerrainCreateOptions => {
    const multi = Number(value.tilesX) * Number(value.tilesZ) > 1;
    return {
      name: String(value.name ?? ""), tilesX: Number(value.tilesX), tilesZ: Number(value.tilesZ),
      tileQuads: Number(value.tileQuads) as WorldTerrainCreateTileQuads, spacing: Number(value.spacing), baseHeight: Number(value.baseHeight),
      // A single tile is f32: no encoding range; a heightmap brings its own.
      ...(multi && !file ? { heightMin: Number(value.heightMin), heightMax: Number(value.heightMax) } : {}),
    };
  };
  const source = (value: Record<string, unknown>, file: HeightmapFile | null): WorldTerrainHeightmapSource | null => {
    if (!file || !picked) return null;
    return {
      bytes: picked.bytes, width: picked.width, height: picked.height,
      endianness: picked.png ? "little" : (value.byteOrder as "little" | "big"), heightMin: Number(value.heightmapMin), heightMax: Number(value.heightmapMax),
    };
  };
  const result = await openDialog({
    document, host, title: "New World Terrain", testId: "terrain-create", confirm: "Create", warn,
    value: {
      name: D.name, tilesX: D.tilesX, tilesZ: D.tilesZ, tileQuads: String(D.tileQuads), spacing: D.spacing, baseHeight: D.baseHeight,
      heightMin: TERRAIN_DEFAULT_HEIGHT_MIN, heightMax: TERRAIN_DEFAULT_HEIGHT_MAX,
      byteOrder: "little", heightmapMin: TERRAIN_DEFAULT_HEIGHT_MIN, heightmapMax: TERRAIN_DEFAULT_HEIGHT_MAX,
    },
    fields: (value, file) => {
      const multi = Number(value.tilesX) * Number(value.tilesZ) > 1;
      const heightmap = file !== null && picked !== null;
      const fields: Record<string, FieldMap[string]> = {
        name: text({ default: D.name, label: "Name", hint: "Aktörün ve asset dosyasının adı (content/terrain/<ad>.terrain.json)." }),
        tilesX: num({ default: 1, min: 1, max: TERRAIN_MAX_TILES_PER_AXIS, step: 1, label: "Tiles X", hint: "X yönünde tile sayısı." }),
        tilesZ: num({ default: 1, min: 1, max: TERRAIN_MAX_TILES_PER_AXIS, step: 1, label: "Tiles Z", hint: "Z yönünde tile sayısı." }),
        tileQuads: enumOf(QUADS, { default: "128", labels: { 64: "64 × 64 quads", 128: "128 × 128 quads", 256: "256 × 256 quads" }, label: "Tile Resolution", hint: "Bir tile'ın kenarındaki dörtgen sayısı." }),
        spacing: num({ default: 1, min: WORLD_TERRAIN_CREATE_MIN_SPACING, max: WORLD_TERRAIN_CREATE_MAX_SPACING, step: 0.25, label: "Vertex Spacing (m)", hint: "Komşu köşeler arası metre." }),
        baseHeight: num({ default: 0, min: -WORLD_TERRAIN_CREATE_MAX_BASE_HEIGHT, max: WORLD_TERRAIN_CREATE_MAX_BASE_HEIGHT, step: 0.5, label: "Base Height (m)", hint: "Yükseklik referansının dünya Y'si; heightmap yoksa arazi burada düzdür." }),
      };
      if (multi && !heightmap) {
        fields.heightMin = num({ default: TERRAIN_DEFAULT_HEIGHT_MIN, min: -WORLD_TERRAIN_CREATE_MAX_HEIGHT_RANGE, max: 0, step: 1, label: "Height Min (m)", hint: "Çok tile'lı arazide u16 kodlama aralığının altı (referansa göre). Sculpt aşarsa Save genişletir." });
        fields.heightMax = num({ default: TERRAIN_DEFAULT_HEIGHT_MAX, min: 0, max: WORLD_TERRAIN_CREATE_MAX_HEIGHT_RANGE, step: 1, label: "Height Max (m)", hint: "Kodlama aralığının üstü (referansa göre)." });
      }
      if (heightmap) {
        if (!picked!.png) fields.byteOrder = enumOf(["little", "big"], { default: "little", labels: { little: "Little-endian", big: "Big-endian" }, label: "RAW Byte Order", hint: "RAW dosyasının bayt sırası." });
        fields.heightmapMin = num({ default: TERRAIN_DEFAULT_HEIGHT_MIN, min: -WORLD_TERRAIN_CREATE_MAX_HEIGHT_RANGE, max: WORLD_TERRAIN_CREATE_MAX_HEIGHT_RANGE, step: 1, label: "Min Height (0), m", hint: "Heightmap'te 0 değerinin referansa göre yüksekliği." });
        fields.heightmapMax = num({ default: TERRAIN_DEFAULT_HEIGHT_MAX, min: -WORLD_TERRAIN_CREATE_MAX_HEIGHT_RANGE, max: WORLD_TERRAIN_CREATE_MAX_HEIGHT_RANGE, step: 1, label: "Max Height (65535), m", hint: "Heightmap'te 65535 değerinin referansa göre yüksekliği." });
      }
      return fields;
    },
    file: {
      label: "Heightmap (optional)", accept: ".png,.raw,.r16,image/png",
      async picked(file) {
        picked = null;
        const read = await readHeightmapFile(file);
        picked = read;
        const grid = worldTerrainGridForHeightmap(read.width, read.height);
        const patch = grid ? { tilesX: grid.tilesX, tilesZ: grid.tilesZ, tileQuads: String(grid.tileQuads) } : {};
        return { patch, note: grid
          ? `${file.name}: ${read.width} × ${read.height} samples → ${grid.tilesX} × ${grid.tilesZ} tiles of ${grid.tileQuads} quads.`
          : `${file.name}: ${read.width} × ${read.height} samples fit no tile grid ((size - 1) must be a multiple of 64, 128 or 256).` };
      },
    },
    hint: "Varsayılan Grass / Dirt / Rock / Snow katmanlarıyla dünya orijinine ortalanır; heightmap seçilmezse düzdür. Asset hemen content/terrain'e yazılır, aktör level'a tek Undo ile eklenir.",
    problems: (value, file) => {
      const options = read(value, file);
      const heightmap = source(value, file);
      return [...worldTerrainCreateProblems(options), ...(heightmap ? worldTerrainHeightmapProblems(options, heightmap) : [])];
    },
    summary: (value, file) => {
      const options = read(value, file);
      const estimate = estimateWorldTerrain(options);
      const range = source(value, file) ?? options;
      const multi = options.tilesX * options.tilesZ > 1;
      return `${metres(estimate.extent[0])} × ${metres(estimate.extent[1])} · ${estimate.tileCount} tile${estimate.tileCount === 1 ? "" : "s"} of ${metres(options.tileQuads * options.spacing)} · `
        + `${(estimate.vertices / 1e6).toFixed(2)} M vertices · ~${megabytes(estimate.diskBytes)} on disk`
        + (multi ? ` · heights in ${(worldTerrainHeightStep(range) * 100).toFixed(1)} cm steps` : "");
    },
  });
  return result ? { options: read(result.value, result.file), heightmap: source(result.value, result.file) } : null;
}

/** Expand (a single tile into a grid, Forge's): the grid and where the original tile sits in it. */
export async function openExpandDialog(document: Document, host: HTMLElement, warn: (message: string) => void, problems: (options: WorldTerrainExpandOptions) => string[]): Promise<WorldTerrainExpandOptions | null> {
  const read = (value: Record<string, unknown>): WorldTerrainExpandOptions => ({
    tilesX: Number(value.tilesX), tilesZ: Number(value.tilesZ), originalX: Number(value.originalX), originalZ: Number(value.originalZ),
  });
  const result = await openDialog({
    document, host, title: "Expand World Terrain", testId: "terrain-expand", confirm: "Expand", warn,
    value: { ...WORLD_TERRAIN_EXPAND_DEFAULTS },
    fields: () => ({
      tilesX: num({ default: 2, min: 1, max: TERRAIN_MAX_TILES_PER_AXIS, step: 1, label: "Tiles X", hint: "Yeni ızgaranın X yönündeki tile sayısı." }),
      tilesZ: num({ default: 2, min: 1, max: TERRAIN_MAX_TILES_PER_AXIS, step: 1, label: "Tiles Z", hint: "Yeni ızgaranın Z yönündeki tile sayısı." }),
      originalX: num({ default: 0, min: 0, max: TERRAIN_MAX_TILES_PER_AXIS - 1, step: 1, label: "Original Tile X", hint: "Asıl tile'ın yeni ızgaradaki X sırası (0'dan)." }),
      originalZ: num({ default: 0, min: 0, max: TERRAIN_MAX_TILES_PER_AXIS - 1, step: 1, label: "Original Tile Z", hint: "Asıl tile'ın yeni ızgaradaki Z sırası (0'dan)." }),
    }),
    hint: "Asıl tile dünya konumunu, yüksekliklerini ve boyasını korur. Yeni yükseklikler en yakın kenarı veya köşeyi uzatır; yeni boya ilk katmanda başlar. Tek Undo; Save yeni tile'ları yazar.",
    problems: (value) => problems(read(value)),
  });
  return result ? read(result.value) : null;
}

/** Import Heightmap: a 16-bit PNG or RAW the size of the grid, and the heights 0 / 65535 stand for. */
export async function openImportHeightmapDialog(
  document: Document, host: HTMLElement, warn: (message: string) => void,
  grid: { readonly width: number; readonly height: number }, range: { readonly heightMin: number; readonly heightMax: number },
): Promise<{ file: HeightmapFile; endianness: "little" | "big"; heightMin: number; heightMax: number } | null> {
  const result = await openDialog({
    document, host, title: "Import Heightmap", testId: "terrain-heightmap", confirm: "Import", warn,
    value: { byteOrder: "little", heightMin: range.heightMin, heightMax: range.heightMax },
    fields: () => ({
      byteOrder: enumOf(["little", "big"], { default: "little", labels: { little: "Little-endian", big: "Big-endian" }, label: "RAW Byte Order", hint: "Yalnız RAW için; PNG'nin kendi sırası var." }),
      heightMin: num({ default: TERRAIN_DEFAULT_HEIGHT_MIN, min: -WORLD_TERRAIN_CREATE_MAX_HEIGHT_RANGE, max: WORLD_TERRAIN_CREATE_MAX_HEIGHT_RANGE, step: 0.1, label: "Min Height (0), m", hint: "0 değerinin terrain referansına göre yüksekliği (Export bunu durum satırında söyler)." }),
      heightMax: num({ default: TERRAIN_DEFAULT_HEIGHT_MAX, min: -WORLD_TERRAIN_CREATE_MAX_HEIGHT_RANGE, max: WORLD_TERRAIN_CREATE_MAX_HEIGHT_RANGE, step: 0.1, label: "Max Height (65535), m", hint: "65535 değerinin terrain referansına göre yüksekliği." }),
    }),
    file: { label: "16-bit PNG or RAW", accept: ".png,.raw,.r16,image/png" },
    hint: `Bu terrain tam ${grid.width} × ${grid.height} örnek ister (satırlar +Z boyunca); yeniden örnekleme yok. Bütün yükseklikler değişir, boya kalır; tek Undo.`,
    problems: (value, file) => [
      ...(file ? [] : ["Bir heightmap dosyası seçin."]),
      ...(Number(value.heightMax) > Number(value.heightMin) ? [] : ["Max Height, Min Height'tan büyük olmalı."]),
    ],
  });
  if (!result || !result.file) return null;
  return { file: result.file, endianness: result.value.byteOrder === "big" ? "big" : "little", heightMin: Number(result.value.heightMin), heightMax: Number(result.value.heightMax) };
}
