// The backend badge (architecture §4.9): always on in development; in a
// production build only when the renderer fell back to WebGL2, because such a
// run is not a WebGPU run and must not pass for one. Plain DOM, text only.

import type { BackendProof } from "./backendProof.ts";

export function badgeText(proof: BackendProof): string {
  if (!proof.isWebGPUBackend) return "WebGL2 fallback: not a WebGPU run";
  const adapter = proof.adapter ? [proof.adapter.vendor, proof.adapter.architecture].filter(Boolean).join(" ") : "";
  return adapter === "" ? "WebGPU" : `WebGPU · ${adapter}`;
}

export function shouldShowBadge(proof: BackendProof, dev: boolean): boolean {
  return dev || !proof.isWebGPUBackend;
}

/** Adds the badge to `parent` when it should show; returns it or null. */
export function mountBadge(document: Document, parent: HTMLElement, proof: BackendProof, dev: boolean): HTMLElement | null {
  if (!shouldShowBadge(proof, dev)) return null;
  const badge = document.createElement("div");
  badge.setAttribute("data-testid", "forge-backend-badge");
  badge.textContent = badgeText(proof);
  const warn = !proof.isWebGPUBackend;
  badge.style.cssText = [
    "position: absolute",
    "left: 8px",
    "bottom: 8px",
    "padding: 2px 8px",
    "border-radius: 4px",
    "font: 12px/1.5 system-ui, sans-serif",
    "pointer-events: none",
    `color: ${warn ? "#1a1a1a" : "#e6e6e6"}`,
    `background: ${warn ? "#ffb74d" : "rgba(22, 24, 28, 0.7)"}`,
  ].join("; ");
  parent.append(badge);
  return badge;
}
