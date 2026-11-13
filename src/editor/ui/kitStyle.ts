// The editor UI kit's styles (K7). Ported from Forge WebGL
// src/editor/editorUi.css @ forge-webgl-final (04b5fb23): the design tokens
// (`:root`) and the rules the kit's rows use — the Details row (name 30 %,
// control 70 %), the bounded parameter (range under the name, slider + 62 px
// number box), the X / Y / Z axis fields, sections, inline buttons. Values are
// Forge's `.editor-details` variants; class names are Forge's, so panels ported
// later read the same. No redesign (plan phase 4).
//
// Injected once as a <style> by the editor (`installKitStyle`), which is only
// reached through a dev-only dynamic import: none of it is in a game page.

export const KIT_CSS = `
:root {
  --forge-bg-0: #101316;
  --forge-bg-1: #15171A;
  --forge-bg-2: #1B1E22;
  --forge-bg-3: #262A30;
  --forge-surface-raise: #313640;
  --forge-border-soft: rgba(255,255,255,0.08);
  --forge-border: rgba(255,255,255,0.12);
  --forge-border-mid: rgba(255,255,255,0.14);
  --forge-border-strong: rgba(255,255,255,0.18);
  --forge-text: #F2F5F7;
  --forge-text-secondary: #AEB8BD;
  --forge-text-dim: #8A949A;
  --forge-accent: #2f6fed;
  --forge-accent-hover: #3b82f6;
  --forge-accent-active: #2560d8;
  --forge-accent-soft: rgba(47, 111, 237, 0.18);
  --forge-accent-text: #ffffff;
  --forge-success: #5BD6A0;
  --forge-success-text: #9AF0C8;
  --forge-warning: #F0A54A;
  --forge-warning-text: #F0C070;
  --forge-error: #ff6b6b;
  --forge-error-text: #ff9a9a;
  --forge-axis-x: #E5615F;
  --forge-axis-y: #5BD6A0;
  --forge-axis-z: #4A90D9;
  --forge-radius-sm: 4px;
  --forge-radius-md: 6px;
  --forge-radius-lg: 8px;
  --forge-space-1: 4px;
  --forge-space-2: 8px;
  --forge-space-3: 12px;
  --forge-space-4: 16px;
}

.forge-kit {
  color: var(--forge-text);
  font: 13px/1.35 system-ui, -apple-system, "Segoe UI", sans-serif;
}

.forge-kit,
.forge-kit *,
.forge-kit *::before,
.forge-kit *::after {
  box-sizing: border-box;
}

.forge-kit .details-body {
  display: grid;
  gap: 9px;
}

/* Parameter name 30 %, control 70 % (user decision 2026-10-31). */
.forge-kit .detail-row {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(0, 7fr);
  align-items: center;
  gap: 9px;
}

.forge-kit .detail-row > span,
.forge-kit .detail-vector-label {
  color: #b7c2cc;
  font-size: 12px;
  overflow-wrap: anywhere;
}

.forge-kit .detail-row input,
.forge-kit .detail-row select,
.forge-kit .detail-row textarea {
  width: 100%;
  min-width: 0;
  height: 29px;
  border: 1px solid #2e3a47;
  border-radius: 4px;
  padding: 0 8px;
  color: #ffffff;
  background: #0d131a;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.025);
  font: inherit;
}

.forge-kit .detail-row textarea {
  height: auto;
  min-height: 58px;
  padding: 6px 8px;
  resize: vertical;
}

.forge-kit .detail-row input:hover,
.forge-kit .detail-row select:hover,
.forge-kit .detail-row textarea:hover,
.forge-kit .axis-field:hover {
  border-color: #465568;
}

.forge-kit .detail-row input:focus,
.forge-kit .detail-row select:focus,
.forge-kit .detail-row textarea:focus,
.forge-kit .axis-field:focus-within {
  border-color: var(--forge-accent);
  box-shadow: 0 0 0 1px rgba(47, 135, 255, 0.25);
  outline: none;
}

.forge-kit .detail-row input[aria-invalid="true"] {
  border-color: var(--forge-error);
}

.forge-kit .detail-row input:disabled,
.forge-kit .detail-row select:disabled {
  opacity: 0.5;
}

.forge-kit .detail-row input[type="checkbox"] {
  justify-self: start;
  width: 16px;
  height: 16px;
  padding: 0;
  accent-color: var(--forge-accent);
  box-shadow: none;
}

.forge-kit .detail-row input[type="color"] {
  width: 44px;
  padding: 2px;
}

/* Bounded parameters: range under the name, slider + compact number box. The
   number box comes first in the DOM so the label targets it; order shows the
   slider first. */
.forge-kit .detail-row > span .param-range {
  display: block;
  margin-top: 1px;
  color: var(--forge-text-secondary);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}

.forge-kit .param-control,
.forge-kit .ref-control,
.forge-kit .color-control {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.forge-kit .param-control input.param-slider {
  order: 0;
  flex: 1 1 auto;
  width: auto;
  min-width: 0;
  height: 16px;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  box-shadow: none;
  accent-color: var(--forge-accent);
  cursor: pointer;
}

.forge-kit .param-control input[type="number"] {
  order: 1;
  flex: 0 0 62px;
  width: 62px;
  padding: 0 4px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.forge-kit .ref-control output {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  color: var(--forge-text-secondary);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.forge-kit .color-control.is-empty input[type="color"] {
  opacity: 0.35;
}

.forge-kit .detail-vector {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(0, 7fr);
  align-items: center;
  gap: 9px;
}

.forge-kit .vector-fields {
  display: grid;
  grid-template-columns: repeat(var(--axis-count, 3), minmax(0, 1fr));
  gap: 6px;
  align-items: center;
}

.forge-kit .axis-field {
  display: flex;
  align-items: stretch;
  min-width: 0;
  height: 29px;
  border: 1px solid #2e3a47;
  border-radius: 4px;
  background: #0d131a;
  overflow: hidden;
}

.forge-kit .axis-field .axis-tag {
  display: flex;
  flex: 0 0 18px;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  font-size: 11px;
  font-weight: 600;
}

.forge-kit .axis-field.axis-x .axis-tag { background: #b8403a; }
.forge-kit .axis-field.axis-y .axis-tag { background: #2f8f43; }
.forge-kit .axis-field.axis-z .axis-tag { background: #2f6fb8; }
.forge-kit .axis-field.axis-w .axis-tag { background: #5b6470; }

.forge-kit .axis-field input {
  width: 100%;
  min-width: 0;
  border: none;
  padding: 0 8px;
  color: #ffffff;
  background: transparent;
  font: inherit;
}

.forge-kit .axis-field input:focus {
  outline: none;
  background: rgba(255, 255, 255, 0.06);
}

.forge-kit .detail-section {
  display: grid;
  gap: 0;
  margin: 0;
  padding: 0;
  overflow: hidden;
  border: 1px solid #2a3541;
  border-radius: 5px;
  background: #141c25;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.018);
}

.forge-kit .detail-section-heading {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  min-height: 34px;
  padding: 0 5px 0 8px;
  border-bottom: 1px solid #26323e;
  background: #18212c;
}

.forge-kit .detail-section.collapsed .detail-section-heading {
  border-bottom: 0;
}

.forge-kit .detail-section-toggle {
  display: flex;
  flex: 1;
  align-items: center;
  min-width: 0;
  gap: 7px;
  padding: 0;
  border: 0;
  color: #e1e7ed;
  background: transparent;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
}

.forge-kit .detail-section-toggle:hover {
  color: #ffffff;
}

.forge-kit .detail-section-chevron {
  display: grid;
  width: 14px;
  height: 14px;
  place-items: center;
  transition: transform 120ms ease;
}

.forge-kit .detail-section-chevron svg {
  width: 12px;
  height: 12px;
}

.forge-kit .detail-section.collapsed .detail-section-chevron {
  transform: rotate(-90deg);
}

.forge-kit .detail-section-body {
  display: grid;
  gap: 8px;
  padding: 9px;
}

.forge-kit .detail-section.collapsed .detail-section-body {
  display: none;
}

.forge-kit .detail-inline-button {
  height: 29px;
  min-width: 26px;
  flex: 0 0 auto;
  border: 1px solid var(--forge-border-strong);
  border-radius: 4px;
  padding: 0 8px;
  color: #c8d0d4;
  background: #101316;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.forge-kit .detail-inline-button:hover:not(:disabled) {
  color: #ffffff;
  border-color: #465568;
}

.forge-kit .detail-inline-button:disabled {
  opacity: 0.45;
  cursor: default;
}

.forge-kit .array-items {
  display: grid;
  gap: 6px;
}

.forge-kit .array-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: 6px;
}

.forge-kit .array-empty {
  color: var(--forge-text-dim);
  font-size: 12px;
}
`;

const STYLE_ID = "forge-kit-style";

/** Adds the kit's <style> to `document` once. */
export function installKitStyle(document: Document): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = KIT_CSS;
  document.head.appendChild(style);
}
