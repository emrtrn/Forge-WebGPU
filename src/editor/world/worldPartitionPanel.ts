// World Partition in the Outliner (phase 5b step 7). Map presentation and
// pointer gestures follow Forge WebGL's read-only reference world panel.
// Streaming, camera movement, terrain IO and HLOD rebuilding belong to the host.
import { cellBounds, parseCellKey, type LevelSettings } from "../../core/index.ts";
import {
  mapPixelToWorld, shadeWorldMapHeights, worldMapFrame, worldToMapPixel,
  type WorldMapHeights, type WorldMapRect,
} from "../../engine/world/worldMapView.ts";
import type { EditorCellState, EditorCellStreaming } from "../session/cellStreaming.ts";
import { installWorldPartitionStyle } from "./worldPartitionStyle.ts";

export interface WorldPartitionTerrain {
  readonly key: string;
  readonly bounds: WorldMapRect;
  readonly state: string;
  /** Already available global/tile heights covering bounds; no IO in the panel. */
  readonly map?: WorldMapHeights;
}

export interface WorldPartitionPanelOptions {
  readonly document: Document;
  readonly streaming: EditorCellStreaming;
  readonly settings: () => LevelSettings;
  readonly camera: () => readonly [number, number, number];
  readonly focus: (x: number, z: number) => void;
  /** dt is in seconds, as in the editor host. */
  readonly onFrame: (listener: (dt: number) => void) => () => void;
  readonly terrain: () => readonly WorldPartitionTerrain[];
  readonly hlod: () => { present: boolean; stale: readonly string[]; unchecked: number };
  readonly status: (message: string, tone?: "info" | "warning" | "error") => void;
}

const MAP_SIZE = 512;
const ROW_LIMIT = 200;
const HINT = "Click to focus. Drag to select and hold occupied cells.";
const COLORS = {
  occupied: "#6ec8e6", loaded: "#5bd6a0", dirty: "#ff9b52", held: "#b48cff",
  loading: "#f0c070", failed: "#ff6b6b", camera: "#ffffff",
} as const;

interface MappedCell {
  readonly cell: EditorCellState;
  readonly bounds: WorldMapRect;
}

interface MapDrag {
  readonly pointer: number;
  readonly clientX: number;
  readonly clientY: number;
  readonly start: readonly [number, number];
  end: readonly [number, number];
  moved: boolean;
}

const intersects = (a: WorldMapRect, b: WorldMapRect): boolean =>
  a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;

function stateText(cell: EditorCellState): string {
  return ["occupied", cell.loaded ? "loaded" : "unloaded", cell.dirty ? "dirty" : "clean",
    cell.held ? "held" : "not held", ...(cell.loading ? ["loading"] : []), ...(cell.failed ? ["failed"] : [])].join(" · ");
}

export function createWorldPartitionPanel(options: WorldPartitionPanelOptions): { element: HTMLElement; dispose(): void } {
  const { document: doc, streaming } = options;
  installWorldPartitionStyle(doc);
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text?: string): HTMLElementTagNameMap[K] => {
    const node = doc.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const element = el("section", "world-partition-panel forge-kit");
  element.dataset.testid = "world-partition-panel";
  element.setAttribute("aria-label", "World Partition");
  const summary = el("p", "wp-summary");
  const terrainSummary = el("p", "wp-summary");
  const canvas = el("canvas", "world-partition-map");
  canvas.dataset.testid = "world-partition-map";
  canvas.width = canvas.height = MAP_SIZE;
  canvas.tabIndex = 0;
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", "World Partition map. Click to focus; drag to select and hold cells. Use the cell search and checkboxes for keyboard selection.");
  const hint = el("p", "wp-hint", HINT);
  const toolbar = el("div", "wp-toolbar");
  const button = (label: string, testid: string): HTMLButtonElement => {
    const node = el("button", "forge-btn forge-btn-ghost", label);
    node.type = "button";
    node.dataset.testid = testid;
    toolbar.append(node);
    return node;
  };
  const load = button("Load", "wp-load");
  const unload = button("Unload", "wp-unload");
  const release = button("Release held", "wp-release");
  const legend = el("ul", "wp-legend");
  for (const name of Object.keys(COLORS)) {
    const item = el("li");
    const swatch = el("i", `wp-${name}`);
    swatch.setAttribute("aria-hidden", "true");
    item.append(swatch, doc.createTextNode(name[0]!.toUpperCase() + name.slice(1)));
    legend.append(item);
  }
  const hlod = el("p", "wp-hlod");
  const searchLabel = el("label", "wp-search-label", "Find cell by key");
  const search = el("input", "wp-search");
  search.type = "search";
  search.placeholder = "Cell key, e.g. -1_2";
  search.dataset.testid = "wp-cell-search";
  search.setAttribute("aria-label", "Search occupied cells by key");
  searchLabel.append(search);
  const count = el("p", "wp-count");
  const list = el("div", "wp-cell-list");
  list.setAttribute("role", "group");
  list.setAttribute("aria-label", "Select occupied cells");
  const feedback = el("p", "wp-status");
  feedback.setAttribute("role", "status");
  feedback.setAttribute("aria-live", "polite");
  element.append(summary, terrainSummary, canvas, hint, toolbar, legend, hlod, searchLabel, count, list, feedback);

  let disposed = false;
  let cellsStale = true;
  let rowsStale = true;
  let cells: readonly EditorCellState[] = [];
  let mapped: MappedCell[] = [];
  let tiles: readonly WorldPartitionTerrain[] = [];
  let cellSize = NaN;
  let frame = worldMapFrame([]);
  let drag: MapDrag | null = null;
  let region: WorldMapRect | null = null;
  let hover: readonly [number, number] | null = null;
  let busy = false;
  const selected = new Set<string>();
  // The host replaces a supplied map when its samples change (no revision in
  // this API). Cache only the shaded bitmap, never fetch terrain data here.
  const shaded = new WeakMap<WorldMapHeights, { scale: number; canvas: HTMLCanvasElement }>();
  const listeners: (() => void)[] = [];
  const listen = <K extends keyof HTMLElementEventMap>(node: HTMLElement, type: K, listener: (event: HTMLElementEventMap[K]) => void): void => {
    node.addEventListener(type, listener);
    listeners.push(() => node.removeEventListener(type, listener));
  };
  const report = (message: string, tone: "info" | "warning" | "error" = "info"): void => {
    if (disposed) return;
    feedback.textContent = message;
    feedback.dataset.tone = tone;
    options.status(message, tone);
  };
  // A non-empty selection always wins; otherwise act on all held cells.
  const targets = (): string[] => cells.filter((cell) => selected.size ? selected.has(cell.key) : cell.held).map((cell) => cell.key);
  const refreshButtons = (): void => {
    const keys = new Set(targets());
    load.disabled = busy || keys.size === 0;
    unload.disabled = busy || keys.size === 0;
    release.disabled = busy || (region === null && !cells.some((cell) => keys.has(cell.key) && cell.held));
    const title = selected.size ? "selected cells" : "all held cells";
    load.title = `Load and hold ${title}`;
    unload.title = `Unload ${title}; dirty cells stay loaded`;
    release.title = `Release holds on ${title}; camera streaming resumes`;
  };

  const drawRows = (): void => {
    const query = search.value.trim();
    const matches = cells.filter((cell) => cell.key.includes(query));
    // Prioritize an exact key even if a substring matches more than 200 cells.
    const exact = matches.find((cell) => cell.key === query);
    const visible = exact ? [exact, ...matches.filter((cell) => cell !== exact)].slice(0, ROW_LIMIT) : matches.slice(0, ROW_LIMIT);
    const visibleKeys = new Set(visible.map((cell) => cell.key));
    // Reuse existing rows to keep keyboard focus and checkbox activation stable.
    for (const row of Array.from(list.children)) if (!visibleKeys.has((row as HTMLElement).dataset.cell!)) row.remove();
    const existing = new Map(Array.from(list.children).map((row) => [(row as HTMLElement).dataset.cell!, row as HTMLLabelElement]));
    for (let index = 0; index < visible.length; index += 1) {
      const cell = visible[index]!;
      let row = existing.get(cell.key);
      if (!row) {
        row = el("label", "wp-cell");
        row.dataset.testid = "wp-cell";
        row.dataset.cell = cell.key;
        const check = el("input");
        check.type = "checkbox";
        const meta = el("span");
        meta.append(el("strong", "", cell.key), el("small"));
        row.append(check, meta);
      }
      row.dataset.loaded = String(cell.loaded);
      row.dataset.dirty = String(cell.dirty);
      row.dataset.held = String(cell.held);
      row.dataset.loading = String(cell.loading);
      row.dataset.failed = String(cell.failed);
      const check = row.querySelector("input")!;
      check.checked = selected.has(cell.key);
      check.setAttribute("aria-label", `Select cell ${cell.key}: ${stateText(cell)}`);
      row.querySelector("small")!.textContent = stateText(cell);
      if (list.children[index] !== row) list.insertBefore(row, list.children[index] ?? null);
    }
    count.textContent = `${selected.size} selected · ${visible.length}/${matches.length} matching cells shown${matches.length > ROW_LIMIT ? "; refine the key to find any cell" : ""}${cells.length === 0 ? " · No occupied cells" : ""}`;
    rowsStale = false;
  };

  const bitmap = (tile: WorldPartitionTerrain): HTMLCanvasElement | null => {
    const map = tile.map;
    if (!map || map.width < 1 || map.height < 1) return null;
    const scale = Math.max(1e-6, (tile.bounds.maxX - tile.bounds.minX) / Math.max(1, map.width - 1));
    const cached = shaded.get(map);
    if (cached?.scale === scale) return cached.canvas;
    const image = el("canvas");
    image.width = map.width;
    image.height = map.height;
    const context = image.getContext("2d");
    if (!context) return null;
    const pixels = context.createImageData(map.width, map.height);
    pixels.data.set(shadeWorldMapHeights(map, scale));
    context.putImageData(pixels, 0, 0);
    shaded.set(map, { scale, canvas: image });
    return image;
  };
  const pixel = (x: number, z: number): [number, number] => worldToMapPixel(frame, MAP_SIZE, x, z);
  const pixelRect = (bounds: WorldMapRect): [number, number, number, number] => {
    const [x, y] = pixel(bounds.minX, bounds.minZ);
    const [right, bottom] = pixel(bounds.maxX, bounds.maxZ);
    return [x, y, right - x, bottom - y];
  };
  const dragRect = (): WorldMapRect | null => drag?.moved ? {
    minX: Math.min(drag.start[0], drag.end[0]), minZ: Math.min(drag.start[1], drag.end[1]),
    maxX: Math.max(drag.start[0], drag.end[0]), maxZ: Math.max(drag.start[1], drag.end[1]),
  } : null;

  const drawMap = (camera: readonly [number, number, number], loadRange: number): void => {
    const context = canvas.getContext("2d");
    if (!context) return;
    context.fillStyle = "#15181b";
    context.fillRect(0, 0, MAP_SIZE, MAP_SIZE);
    context.font = "11px system-ui, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    for (const tile of tiles) {
      const rect = pixelRect(tile.bounds);
      const image = bitmap(tile);
      context.fillStyle = "#3b4a3d";
      context.fillRect(...rect);
      if (image) context.drawImage(image, ...rect);
      if (tile.state !== "resident" && tile.state !== "loaded") {
        context.fillStyle = tile.state === "loading" ? "rgba(240,180,60,.38)" : tile.state === "failed" ? "rgba(230,60,70,.4)" : "rgba(8,10,12,.62)";
        context.fillRect(...rect);
      }
      context.strokeStyle = "rgba(255,255,255,.3)";
      context.lineWidth = 1;
      context.strokeRect(...rect);
      if (rect[2] > 80 && rect[3] > 24) {
        context.fillStyle = "#fff";
        context.fillText(`${tile.key}: ${tile.state}`, rect[0] + rect[2] / 2, rect[1] + 10, rect[2] - 4);
      }
    }
    for (const { cell, bounds } of mapped) {
      const [x, y, width, height] = pixelRect(bounds);
      context.fillStyle = cell.failed ? "rgba(255,107,107,.35)" : cell.loading ? "rgba(240,192,112,.35)" : cell.loaded ? "rgba(91,214,160,.22)" : "rgba(110,200,230,.07)";
      context.fillRect(x, y, width, height);
      context.lineWidth = 1;
      context.strokeStyle = cell.failed ? COLORS.failed : cell.loading ? COLORS.loading : cell.loaded ? COLORS.loaded : COLORS.occupied;
      context.strokeRect(x, y, width, height);
      // Separate inset outlines keep dirty and held visible together.
      if (cell.dirty) {
        context.strokeStyle = COLORS.dirty;
        context.lineWidth = 2;
        context.strokeRect(x + 2, y + 2, Math.max(1, width - 4), Math.max(1, height - 4));
      }
      if (cell.held) {
        context.strokeStyle = COLORS.held;
        context.lineWidth = 2;
        context.strokeRect(x + 5, y + 5, Math.max(1, width - 10), Math.max(1, height - 10));
      }
      if (selected.has(cell.key)) {
        context.fillStyle = "rgba(255,255,255,.18)";
        context.fillRect(x, y, width, height);
        context.strokeStyle = "#fff";
        context.lineWidth = 2;
        context.strokeRect(x, y, width, height);
      }
      if (width > 42 && height > 20) {
        context.fillStyle = "#d8f3ff";
        context.fillText(cell.key, x + width / 2, y + height / 2, width - 4);
      }
    }
    const selection = dragRect() ?? region;
    if (selection) {
      context.fillStyle = "rgba(255,255,255,.1)";
      context.fillRect(...pixelRect(selection));
      context.strokeStyle = "#fff";
      context.lineWidth = 1.5;
      context.setLineDash([5, 3]);
      context.strokeRect(...pixelRect(selection));
      context.setLineDash([]);
    }
    const [cx, cy] = pixel(camera[0], camera[2]);
    context.strokeStyle = "rgba(255,255,255,.6)";
    context.lineWidth = 1;
    context.setLineDash([4, 4]);
    context.beginPath();
    context.arc(cx, cy, Math.max(0, loadRange) * MAP_SIZE / (frame.maxX - frame.minX), 0, Math.PI * 2);
    context.stroke();
    context.setLineDash([]);
    context.fillStyle = COLORS.camera;
    context.strokeStyle = "#101316";
    context.lineWidth = 2;
    context.beginPath();
    context.arc(cx, cy, 5, 0, Math.PI * 2);
    context.fill();
    context.stroke();
  };

  const paint = (): void => {
    if (disposed) return;
    const settings = options.settings();
    let remap = cellSize !== settings.cellSize;
    cellSize = settings.cellSize;
    if (cellsStale) {
      cells = streaming.cells();
      cellsStale = false;
      rowsStale = remap = true;
      const occupied = new Set(cells.map((cell) => cell.key));
      for (const key of selected) if (!occupied.has(key)) selected.delete(key);
    }
    if (remap) mapped = cells.flatMap((cell) => {
      const coord = parseCellKey(cell.key);
      return coord ? [{ cell, bounds: cellBounds(cellSize, coord) }] : [];
    });
    tiles = options.terrain();
    const camera = options.camera();
    // Freeze coordinates during a gesture so streaming cannot move its target.
    if (!drag) frame = worldMapFrame([
      ...tiles.map((tile) => tile.bounds), ...mapped.map((cell) => cell.bounds),
      { minX: camera[0] - settings.loadRange, minZ: camera[2] - settings.loadRange,
        maxX: camera[0] + settings.loadRange, maxZ: camera[2] + settings.loadRange },
    ]);
    const totals = { loaded: 0, dirty: 0, held: 0, loading: 0, failed: 0 };
    for (const cell of cells) for (const key of Object.keys(totals) as (keyof typeof totals)[]) if (cell[key]) totals[key] += 1;
    summary.textContent = `${cells.length} occupied · ${totals.loaded} loaded · ${totals.dirty} dirty · ${totals.held} held · ${totals.loading} loading · ${totals.failed} failed. ${cellSize} m cells · ${settings.loadRange} m load range.`;
    const states = new Map<string, number>();
    for (const tile of tiles) states.set(tile.state, (states.get(tile.state) ?? 0) + 1);
    terrainSummary.textContent = tiles.length ? `Terrain: ${tiles.length} tiles · ${[...states].map(([state, total]) => `${total} ${state}`).join(" · ")}` : "No terrain tiles available.";
    const index = options.hlod();
    hlod.textContent = `HLOD: ${index.present ? "index present" : "index missing"} · ${index.stale.length} known stale cells${index.stale.length ? `: ${index.stale.join(", ")}` : ""} · ${index.unchecked} unchecked cells.`;
    if (hover) {
      const [x, z] = hover;
      const contains = (bounds: WorldMapRect): boolean => x >= bounds.minX && x < bounds.maxX && z >= bounds.minZ && z < bounds.maxZ;
      const tile = tiles.find((entry) => contains(entry.bounds));
      const cell = mapped.find((entry) => contains(entry.bounds))?.cell;
      hint.textContent = [tile ? `Tile ${tile.key}: ${tile.state}` : "",
        cell ? `Cell ${cell.key}: ${stateText(cell)}` : "No occupied cell",
        `${Math.round(x)}, ${Math.round(z)}`].filter(Boolean).join(" · ");
    } else hint.textContent = HINT;
    if (rowsStale) drawRows();
    refreshButtons();
    drawMap(camera, settings.loadRange);
    canvas.dataset.worldFrame = JSON.stringify(frame);
    canvas.dataset.camera = JSON.stringify(camera);
  };

  const clientWorld = (event: PointerEvent): [number, number] => {
    const bounds = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (event.clientX - bounds.left) / Math.max(1, bounds.width)));
    const y = Math.max(0, Math.min(1, (event.clientY - bounds.top) / Math.max(1, bounds.height)));
    return mapPixelToWorld(frame, MAP_SIZE, x * MAP_SIZE, y * MAP_SIZE);
  };
  listen(canvas, "pointerdown", (event) => {
    if (disposed || event.button !== 0 || drag) return;
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    canvas.setPointerCapture(event.pointerId);
    const start = clientWorld(event);
    drag = { pointer: event.pointerId, clientX: event.clientX, clientY: event.clientY, start, end: start, moved: false };
  });
  listen(canvas, "pointermove", (event) => {
    hover = clientWorld(event);
    if (!drag || drag.pointer !== event.pointerId) return;
    drag.end = hover;
    drag.moved ||= Math.hypot(event.clientX - drag.clientX, event.clientY - drag.clientY) >= 4;
  });
  listen(canvas, "pointerup", (event) => {
    if (!drag || drag.pointer !== event.pointerId) return;
    drag.end = clientWorld(event);
    drag.moved ||= Math.hypot(event.clientX - drag.clientX, event.clientY - drag.clientY) >= 4;
    const rectangle = dragRect();
    const point = drag.end;
    drag = null;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (!rectangle) { options.focus(point[0], point[1]); return; }
    region = rectangle;
    selected.clear();
    for (const { cell, bounds } of mapped) if (intersects(bounds, rectangle)) selected.add(cell.key);
    rowsStale = true;
    streaming.hold([...selected], true);
    streaming.holdRegion(rectangle);
    report(`Selected and held ${selected.size} occupied cells.`);
  });
  const cancelDrag = (): void => { drag = null; };
  listen(canvas, "pointercancel", cancelDrag);
  listen(canvas, "lostpointercapture", cancelDrag);
  listen(canvas, "pointerleave", () => { hover = null; });
  listen(search, "input", () => { rowsStale = true; });
  listen(list, "change", (event) => {
    const input = event.target as HTMLInputElement;
    const key = input.closest<HTMLElement>("[data-cell]")?.dataset.cell;
    if (!key) return;
    if (input.checked) selected.add(key); else selected.delete(key);
    region = null;
    rowsStale = true;
  });
  listen(load, "click", () => {
    const keys = targets();
    if (busy || !keys.length) return;
    busy = true;
    refreshButtons();
    report(`Loading ${keys.length} cells…`);
    void (async () => {
      try {
        const ok = await streaming.load(keys);
        report(ok ? `Loaded and held ${keys.length} cells.` : "Some cells failed to load. See failed cell states.", ok ? "info" : "warning");
      } catch (error) {
        report(`Loading cells failed: ${error instanceof Error ? error.message : String(error)}`, "error");
      } finally {
        busy = false;
        cellsStale = true;
      }
    })();
  });
  listen(unload, "click", () => {
    const keys = targets();
    if (busy || !keys.length) return;
    streaming.unload(keys);
    report(`Unload requested for ${keys.length} cells; dirty cells stay loaded. Camera streaming may reload nearby cells.`);
  });
  listen(release, "click", () => {
    const keys = targets();
    if (busy) return;
    streaming.holdRegion(null); region = null;
    streaming.hold(keys, false);
    report(`Released holds on ${keys.length} cells. Camera streaming resumes.`);
  });
  listeners.push(streaming.onChange(() => { cellsStale = true; }));
  // Only accumulate elapsed time per frame. In particular, cells() computes
  // dirty state and must never be polled at requestAnimationFrame frequency.
  let elapsed = 0;
  paint();
  listeners.push(options.onFrame((dt) => {
    elapsed += Math.max(0, dt);
    if (elapsed < 0.1) return;
    elapsed = 0;
    paint();
  }));
  return {
    element,
    dispose() {
      if (disposed) return;
      disposed = true;
      const pointer = drag?.pointer;
      drag = null;
      for (const stop of listeners.splice(0)) stop();
      if (pointer !== undefined && canvas.hasPointerCapture(pointer)) canvas.releasePointerCapture(pointer);
    },
  };
}
