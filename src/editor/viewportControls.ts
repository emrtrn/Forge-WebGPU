// The viewport's view controls behind the shell's menus (plan phase 4 step 3;
// INV-A03, INV-A09): Camera and View Mode are the viewport's; Quality and the
// Show flags are kept here.
//
// - Quality (Forge's Quality menu, Unreal's Scalability): one choice for the
//   viewport and Play, written to the player's graphics preferences (the
//   game page's `forge.userSettings`, same origin): a profile is a manual
//   choice; Auto gives the choice back to Play's calibration, and the
//   viewport then draws at Ultra (Forge's applyEditorQuality).
// - Show: Grid (the drawing layer's), Stats (the `?debug` panel, inside the
//   viewport). Forge's Collision and AI Navigation flags come with those
//   systems (phase 6).

import { QUALITY_LEVELS, resolveQualitySettings, type QualityLevel } from "../engine/perf/qualityProfiles.ts";
import { UserSettingsStore } from "../engine/persistence/userSettingsStore.ts";
import { CAMERA_VIEWS, type CameraView } from "../render/editor/editorCamera.ts";
import { VIEW_MODES, type EditorViewport, type ViewMode } from "../render/editor/editorViewport.ts";
import type { DebugPanel } from "../render/viewer/debug/debugPanel.ts";
import { createLocalStorageAdapter } from "../runtime/persistence/localStorageAdapter.ts";
import type { MenuChoice, ViewportMenus } from "./shell/shell.ts";

const VIEW_LABELS: Readonly<Record<CameraView, string>> = { perspective: "Perspective", top: "Top", left: "Left", front: "Front" };
const MODE_LABELS: Readonly<Record<ViewMode, string>> = { lit: "Lit", wireframe: "Wireframe" };
const QUALITY_LABELS: Readonly<Record<string, string>> = { auto: "Auto", ultra: "Ultra", high: "High", medium: "Medium", low: "Low" };
/** The profile the viewport draws with under Auto (Forge). */
const AUTO_LEVEL: QualityLevel = "ultra";
const FLAGS: readonly MenuChoice[] = [
  ["grid", "Grid"],
  ["stats", "Stats (FPS)"],
];

export interface ViewportControlsOptions {
  readonly document: Document;
  readonly viewport: EditorViewport;
  /** The page's storage; null keeps the quality choice for this page only. */
  readonly storage: Storage | null;
  readonly status: (message: string, tone?: "info" | "warning" | "error") => void;
  /** Where the Stats panel sits. */
  readonly statsContainer: HTMLElement;
}

export function createViewportControls(options: ViewportControlsOptions): ViewportMenus {
  const { viewport } = options;
  let store: UserSettingsStore | null = null;
  try {
    store = options.storage ? new UserSettingsStore({ storage: createLocalStorageAdapter(options.storage) }) : null;
  } catch {
    store = null;
  }
  let choice: string = (() => {
    const graphics = store?.read().graphics;
    return graphics?.manuallySelected && (QUALITY_LEVELS as readonly string[]).includes(graphics.selectedQualityLevel) ? graphics.selectedQualityLevel : "auto";
  })();
  const applyQuality = (): void => {
    const level = choice === "auto" ? AUTO_LEVEL : (choice as QualityLevel);
    viewport.setQuality({ settings: resolveQualitySettings(level), level, adaptive: false, reductionDepth: 0 });
  };
  applyQuality();

  let stats: DebugPanel | null = null;
  let statsWanted = false;
  let statsLoading = false;
  const setStats = (on: boolean): void => {
    statsWanted = on;
    if (!on) {
      stats?.dispose();
      stats = null;
      return;
    }
    if (stats || statsLoading) return;
    statsLoading = true;
    void import("../render/viewer/debug/debugPanel.ts").then(({ attachDebugPanel }) => {
      statsLoading = false;
      // Turned off again while the panel was loading.
      if (!statsWanted || stats) return;
      stats = attachDebugPanel(options.document, { host: () => viewport.host });
      options.statsContainer.append(stats.root);
    });
  };

  return {
    views: CAMERA_VIEWS.map((view) => [view, VIEW_LABELS[view]] as const),
    view: () => viewport.view,
    setView: (view) => viewport.setView(view as CameraView),
    onViewChange: (listener) => viewport.onViewChange(listener),
    focusSelection: () => {
      if (!viewport.focusSelection()) options.status("No selected object to focus.", "warning");
    },
    viewModes: VIEW_MODES.map((mode) => [mode, MODE_LABELS[mode]] as const),
    viewMode: () => viewport.viewMode,
    setViewMode: (mode) => viewport.setViewMode(mode as ViewMode),
    onViewModeChange: (listener) => viewport.onViewModeChange(listener),
    qualities: ["auto", ...QUALITY_LEVELS].map((level) => [level, QUALITY_LABELS[level] ?? level] as const),
    quality: () => choice,
    setQuality(next) {
      choice = next;
      if (store) {
        const graphics = store.read().graphics;
        store.setGraphics(next === "auto" ? { ...graphics, manuallySelected: false } : { ...graphics, selectedQualityLevel: next as QualityLevel, manuallySelected: true });
      }
      applyQuality();
      options.status(`Graphics quality: ${next === "auto" ? "Auto (Play calibrates)" : next}.`);
    },
    flags: FLAGS,
    flag: (id) => (id === "grid" ? viewport.gridVisible : id === "stats" ? statsWanted : false),
    setFlag(id, on) {
      if (id === "grid") viewport.setGridVisible(on);
      else if (id === "stats") setStats(on);
    },
  };
}
