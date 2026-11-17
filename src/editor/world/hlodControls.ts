import type { HlodBuildState } from "../../core/level/hlodBuild.ts";
import type { createHlodController } from "./hlodController.ts";
type HlodController = ReturnType<typeof createHlodController>;

const LABEL: Record<HlodBuildState, string> = {
  missing: "Not generated", checking: "Checking", stale: "Update required", building: "Generating", current: "Current", failed: "Failed",
};

/** Authoring controls live beside the existing map's source-hash diagnostics. */
export function createHlodControls(doc: Document, controller: HlodController) {
  const element = doc.createElement("section");
  element.className = "wp-hlod-controls";
  element.dataset.testid = "hlod-controls";
  element.style.cssText = "display:grid;gap:8px;padding:10px 0;border-top:1px solid var(--forge-border,#384454)";
  const heading = doc.createElement("strong"); heading.textContent = "HLOD";
  const label = doc.createElement("label"); label.className = "forge-checkbox";
  const auto = doc.createElement("input"); auto.type = "checkbox"; auto.dataset.testid = "hlod-auto";
  label.append(auto, doc.createTextNode(" Auto Generate HLOD"));
  const button = doc.createElement("button"); button.type = "button"; button.className = "forge-btn forge-btn-ghost";
  button.dataset.testid = "hlod-generate";
  const state = doc.createElement("p"); state.className = "wp-summary"; state.dataset.testid = "hlod-state";
  state.setAttribute("role", "status"); state.setAttribute("aria-live", "polite");
  const detail = doc.createElement("p"); detail.className = "wp-hint"; detail.dataset.testid = "hlod-detail";
  const render = (): void => {
    const view = controller.snapshot();
    auto.checked = view.auto; auto.disabled = !view.writable;
    button.disabled = !view.writable || view.busy;
    button.textContent = view.dirty ? "Save and Generate HLOD" : view.status.state === "missing" ? "Generate HLOD" : "Rebuild HLOD";
    state.dataset.state = view.status.state;
    state.textContent = view.writable ? `${LABEL[view.status.state]}${view.status.queued ? " · queued" : ""}${view.dirty ? " · unsaved changes" : ""}` : "Read-only level";
    const report = view.status.report;
    detail.textContent = [view.status.message,
      report ? `${report.cells} proxy cells · ${report.triangles.toLocaleString("en-US")} triangles · ${(report.totalMs / 1000).toFixed(1)} s` : "",
      report?.warnings.length ? `${report.warnings.length} warnings: ${report.warnings.slice(0, 3).join("; ")}${report.warnings.length > 3 ? "; …" : ""}` : "",
    ].filter(Boolean).join(" · ");
  };
  const toggle = (): void => controller.setAuto(auto.checked);
  const generate = (): void => { void controller.generate(); };
  auto.addEventListener("change", toggle); button.addEventListener("click", generate);
  const stop = controller.onChange(render);
  element.append(heading, label, button, state, detail); render();
  return { element, dispose() { stop(); auto.removeEventListener("change", toggle); button.removeEventListener("click", generate); } };
}
