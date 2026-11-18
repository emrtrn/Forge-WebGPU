// The `?debug` panel of the level viewer (plan phase 3 step 8, INV-H18; user
// decision 2026-11-13: the readout and the tables now, Forge's GPU sweep,
// frame capture, terrain map and speed control with their systems in 5a / 6).
// Forge WebGL's src/scene/debugPanel.ts + debugStats.ts, rewritten for the
// viewer: a control strip over a monospace readout, and the table modal.
//
// - Loaded only behind `?debug`, through a dynamic import from `main.ts`, so a
//   page without it carries none of this (Forge's rule).
// - The readout is rebuilt every 0.5 s (never per frame): frame time, stalls,
//   GPU time (timestamp queries), draw calls and triangles, the drawing
//   buffer, the scene cost walk, quality, the pipeline's passes and MRT, the
//   Sky Light captures, memory, the budget and the World Environment. The
//   lines are Forge's pure formatters (engine/perf/perfReadout.ts).
// - A streamed terrain adds Forge's streaming lines and its tile map (phase
//   5a step 4): the streams are read from the scene's debug tags
//   (render/sync/debugTags.ts); without one the map stays hidden.
// - "Scene cost" opens the shadow-caster inventory by scene source as a
//   frozen table (copyable); "Inspect text" lets the readout be scrolled and
//   selected, otherwise it never takes a click from the game.

import type { WorldEnvironmentState } from "../../../engine/environment/environmentResolve.ts";
import { withClipboardText, type DebugTableView } from "../../../engine/perf/debugTableView.ts";
import { DEFAULT_PERF_BUDGET, evaluatePerfBudget } from "../../../engine/perf/perfBudget.ts";
import {
  compactCount,
  formatAdaptiveQuality,
  formatDrawingBuffer,
  formatFrameMetrics,
  formatFrameSpikes,
  formatGpuFrameStats,
  formatMemory,
  formatPerfBudget,
  formatSceneCost,
  formatWorldEnvironment,
  groupThousands,
} from "../../../engine/perf/perfReadout.ts";
import { formatTerrainStreaming, terrainStreamingSnapshot, type TerrainStreamingSnapshot } from "../../../engine/terrain/terrainStreamingDebug.ts";
import { buildSceneCostSnapshot, type SceneCostObject, type SceneCostSnapshot } from "../../../engine/perf/sceneCost.ts";
import type { RenderHost } from "../../host/renderHost.ts";
import { foliageProbe, terrainStreamingProbes, type FoliageProbe } from "../../sync/debugTags.ts";
import { DebugTableModal } from "./debugTableModal.ts";
import { DEBUG_PANEL_CSS } from "./debugStyle.ts";
import { DebugTerrainMap } from "./debugTerrainMap.ts";
import type { ZoneDrawingStats } from "../../sync/zoneDrawing.ts";

const UPDATE_INTERVAL_MS = 500;

export interface DebugPanelAction {
  /** Stable id, also the `data-forge-debug-action` hook a smoke test drives. */
  readonly id: string;
  readonly label: string;
  readonly hint: string;
  readonly run: () => void;
}

export interface DebugPanelSources {
  /** The viewer's render host; null until it exists. */
  readonly host: () => RenderHost | null;
  /** The live World Environment; null without one. */
  readonly environment?: () => Readonly<WorldEnvironmentState> | null;
}

export interface DebugPanel {
  readonly root: HTMLElement;
  readonly readout: HTMLElement;
  addAction(action: DebugPanelAction): void;
  showTable(view: DebugTableView): void;
  /** Rebuilds the readout now (the panel also does it every 0.5 s). */
  refresh(): void;
  dispose(): void;
}

/** The shadow-caster inventory as a table (frozen when it is opened). */
export function sceneCostTable(snapshot: SceneCostSnapshot): DebugTableView {
  const total = snapshot.shadows.reduce((sum, bucket) => sum + bucket.triangles, 0);
  return withClipboardText({
    title: "Scene cost",
    meta: `graph ${groupThousands(snapshot.graph.objects)} nodes, ${groupThousands(snapshot.graph.meshes)} meshes walked per pass; shadow casters by scene source`,
    columns: [
      { label: "Source", align: "left" },
      { label: "Meshes", align: "right" },
      { label: "Triangles", align: "right" },
      { label: "Share", align: "right" },
    ],
    rows: snapshot.shadows.map((bucket) => ({
      cells: [bucket.source, groupThousands(bucket.meshes), compactCount(bucket.triangles), total > 0 ? `${Math.round((bucket.triangles / total) * 100)}%` : "-"],
      share: total > 0 ? bucket.triangles / total : 0,
      kind: "region",
    })),
    notes: [
      "Meshes count drawn copies: an instanced batch counts every instance, as the shadow pass draws them.",
      "Each shadow-casting light walks these again; draw calls (the readout) say how much reached the GPU.",
    ],
  });
}

function perfExtras(canvas: HTMLCanvasElement): Record<string, unknown> {
  try {
    return JSON.parse(canvas.dataset.forgePerf ?? "{}") as Record<string, unknown>;
  } catch {
    return {};
  }
}

function heap(): { used: number | null; limit: number | null } {
  const memory = (performance as unknown as { memory?: { usedJSHeapSize?: number; jsHeapSizeLimit?: number } }).memory;
  return { used: memory?.usedJSHeapSize ?? null, limit: memory?.jsHeapSizeLimit ?? null };
}

/** The streamed terrains of the host's world, summed; null when none streams. */
export function hostTerrainStreaming(host: RenderHost): TerrainStreamingSnapshot | null {
  const scene = host.world?.scene;
  if (!scene) return null;
  const probes = terrainStreamingProbes(scene);
  return terrainStreamingSnapshot(probes.map((probe) => probe.stream), probes.flatMap((probe) => probe.sources()));
}

/** Zones (plan 5c R9b): the camera's zone, how many zones show, and the static batches hidden or casting only. */
export function formatZones(zones: ZoneDrawingStats): string[] {
  const camera = zones.cameraZone === null ? "outside" : zones.cameraZone.slice(0, 12);
  return [
    `zones ${zones.zones}, portals ${zones.portals}, camera zone ${camera}`,
    `zones visible ${zones.visible} / ${zones.zones}, zoned batches ${zones.tracked}: hidden ${zones.hidden}, shadow only ${zones.shadowOnly}`,
    `portal tests ${zones.portalTests}, exterior projections ${zones.exteriorPortalTests}${zones.portalBudgetExceeded ? " (budget exceeded)" : ""}`,
    ...(zones.streaming ? [
      `buildings ${zones.streaming.buildings}, active ${zones.streaming.active}, prefetch ${zones.streaming.prefetched}, queued ${zones.streaming.queued}`,
      `interior placements ready ${zones.streaming.ready} / ${zones.streaming.resident}, camera building ${zones.streaming.cameraBuilding ?? "outside"}`,
    ] : []),
  ];
}

/** Foliage (plan 5c F1 / F4): the ring's cells and instances, and the painted cells streamed. */
export function formatFoliage(probe: FoliageProbe): string[] {
  const ring = probe.ring();
  const painted = probe.painted();
  const lines: string[] = [];
  if (ring.rings > 0) lines.push(`foliage ring ${ring.rings}: ${groupThousands(ring.cells)} cells, ${groupThousands(ring.instances)} instances, ${ring.pending} pending`);
  if (painted) {
    lines.push(`foliage painted: ${painted.activeCells} / ${painted.totalCells} cells active, ${painted.fetchedCells} fetched, ${painted.fetching} fetching, ${groupThousands(painted.instances)} instances`);
  }
  if (lines.length > 0) lines.push(`foliage batches ${probe.batches().length}`);
  return lines;
}

/** The readout text for the host as it is now. */
export function debugReadout(host: RenderHost, environment: Readonly<WorldEnvironmentState> | null, terrain: TerrainStreamingSnapshot | null = null): string {
  const metrics = host.perf.metrics();
  const fps = metrics.averageFrameTimeMs > 0 ? 1000 / metrics.averageFrameTimeMs : 0;
  // three counts no indirect draw (phase 5c step 5): the GPU-driven batches' draws and
  // (read back from the GPU, at most twice a second) their triangles are added.
  const triangles = host.renderer.info.render.triangles + host.gpuDriven.uncountedTriangles();
  const drawCalls = host.renderer.info.render.drawCalls + host.gpuDriven.lastDraws;
  const memory = host.renderer.info.memory as { geometries: number; textures: number; programs?: number };
  const extras = perfExtras(host.canvas);
  const lines = [`${fps.toFixed(0)} fps`, `${groupThousands(drawCalls)} draw calls`, `${groupThousands(triangles)} tris`];
  if (metrics.sampleCount > 0) lines.push(...formatFrameMetrics(metrics), ...formatFrameSpikes(host.perf.spikes()));
  const gpu = host.perf.gpu();
  if (gpu) lines.push(...formatGpuFrameStats(gpu));
  lines.push(...formatDrawingBuffer({ width: host.canvas.clientWidth, height: host.canvas.clientHeight, pixelRatio: host.renderer.getPixelRatio() }));
  if (host.world) lines.push(...formatSceneCost(buildSceneCostSnapshot(host.world.scene as unknown as SceneCostObject)));
  lines.push(...formatAdaptiveQuality({ qualityLevel: host.quality.level, adaptiveEnabled: host.quality.adaptive, reductionDepth: host.quality.reductionDepth, lastChange: null }));
  lines.push(`backend ${String(extras.backend ?? host.proof.backend)}`);
  if (typeof extras.pipeline === "string") lines.push(`pipeline ${extras.pipeline}`);
  if (typeof extras.mrt === "string") lines.push(`mrt ${extras.mrt === "" ? "-" : extras.mrt} (${String(extras.mrtBytes ?? 0)} B)`);
  lines.push(`sky captures ${host.captures.count}`);
  const { used, limit } = heap();
  lines.push(...formatMemory({ render: { geometries: memory.geometries, textures: memory.textures, programs: memory.programs ?? 0 }, jsHeapBytes: used, jsHeapLimitBytes: limit }));
  lines.push(...formatPerfBudget(evaluatePerfBudget({ drawCalls, triangles, textures: memory.textures }, DEFAULT_PERF_BUDGET)));
  if (environment) lines.push(formatWorldEnvironment(environment));
  const casters = host.gpuDriven.shadowCasterStats();
  for (let i = 0; i < Math.max(casters.instanced.length, casters.driven.length); i += 1) {
    const bound = casters.instanced[i], driven = casters.driven[i], foliage = casters.foliage[i];
    lines.push(`shadow cascade ${i + 1}: instanced eligible ${bound?.batches ?? 0} / ${groupThousands(bound?.instances ?? 0)}, driven visible ${driven?.batches ?? 0} / ${groupThousands(driven?.instances ?? 0)}, foliage ${foliage?.batches ?? 0} / ${groupThousands(foliage?.instances ?? 0)} (batches / instances)`);
  }
  if (terrain) lines.push(...formatTerrainStreaming(terrain));
  const zones = host.world?.zones?.stats();
  if (zones && zones.zones > 0) lines.push(...formatZones(zones));
  const foliage = host.world ? foliageProbe(host.world.scene) : null;
  if (foliage) lines.push(...formatFoliage(foliage));
  return lines.join("\n");
}

/** Mounts the panel (`#debug-stats`) and starts the readout. */
export function attachDebugPanel(document: Document, sources: DebugPanelSources): DebugPanel {
  const style = document.createElement("style");
  style.textContent = DEBUG_PANEL_CSS;
  document.head.appendChild(style);

  const root = document.createElement("div");
  root.id = "debug-stats";
  root.classList.add("forge-debug-panel");
  const controls = document.createElement("div");
  controls.className = "forge-debug-panel-controls ui-interactive";
  const readout = document.createElement("pre");
  readout.className = "forge-debug-panel-readout";
  readout.id = "debug-stats-readout";
  readout.tabIndex = -1;
  readout.setAttribute("aria-label", "Performance diagnostics");
  // Forge's view slot: between the controls and the readout.
  const terrainMap = new DebugTerrainMap(document);
  root.replaceChildren(controls, terrainMap.element, readout);
  document.body.appendChild(root);

  // Forge: passive diagnostics never take a click; reading the text is an explicit mode.
  const inspect = document.createElement("button");
  inspect.type = "button";
  inspect.className = "forge-debug-panel-button";
  inspect.dataset.forgeDebugAction = "inspect-readout";
  inspect.textContent = "Inspect text";
  inspect.title = "Scroll and select diagnostic text. Turn off to click through it.";
  inspect.setAttribute("aria-controls", readout.id);
  inspect.setAttribute("aria-pressed", "false");
  const setInspecting = (enabled: boolean): void => {
    root.classList.toggle("is-inspecting", enabled);
    inspect.classList.toggle("is-active", enabled);
    inspect.setAttribute("aria-pressed", String(enabled));
    readout.tabIndex = enabled ? 0 : -1;
  };
  inspect.addEventListener("click", () => setInspecting(inspect.getAttribute("aria-pressed") !== "true"));
  readout.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    setInspecting(false);
    inspect.focus();
  });
  controls.appendChild(inspect);

  const modal = new DebugTableModal({ host: document.body });
  const refresh = (): void => {
    const host = sources.host();
    if (!host) return;
    const terrain = hostTerrainStreaming(host);
    readout.textContent = debugReadout(host, sources.environment?.() ?? null, terrain);
    terrainMap.update(terrain);
  };
  const timer = (document.defaultView ?? window).setInterval(refresh, UPDATE_INTERVAL_MS);

  const panel: DebugPanel = {
    root,
    readout,
    addAction(action) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "forge-debug-panel-button";
      button.dataset.forgeDebugAction = action.id;
      button.textContent = action.label;
      button.title = action.hint;
      button.addEventListener("click", () => action.run());
      controls.appendChild(button);
    },
    showTable: (view) => modal.show(view),
    refresh,
    dispose() {
      (document.defaultView ?? window).clearInterval(timer);
      modal.dispose();
      root.remove();
      style.remove();
    },
  };
  panel.addAction({
    id: "scene-cost",
    label: "Scene cost",
    hint: "Shadow casters by scene source, drawn copies and triangles (one walk of the scene).",
    run: () => {
      const world = sources.host()?.world;
      if (world) modal.show(sceneCostTable(buildSceneCostSnapshot(world.scene as unknown as SceneCostObject, { maxBuckets: 0 })));
    },
  });
  refresh();
  return panel;
}
