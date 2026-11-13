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
import { buildSceneCostSnapshot, type SceneCostObject, type SceneCostSnapshot } from "../../../engine/perf/sceneCost.ts";
import type { RenderHost } from "../../host/renderHost.ts";
import { DebugTableModal } from "./debugTableModal.ts";
import { DEBUG_PANEL_CSS } from "./debugStyle.ts";

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

/** The readout text for the host as it is now. */
export function debugReadout(host: RenderHost, environment: Readonly<WorldEnvironmentState> | null): string {
  const metrics = host.perf.metrics();
  const fps = metrics.averageFrameTimeMs > 0 ? 1000 / metrics.averageFrameTimeMs : 0;
  const { drawCalls, triangles } = host.renderer.info.render;
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
  root.replaceChildren(controls, readout);
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
    readout.textContent = debugReadout(host, sources.environment?.() ?? null);
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
