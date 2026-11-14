// The editor shell's layout and chrome. Ported from Forge WebGL
// src/editor/editorUi.css @ forge-webgl-final (04b5fb23): the desktop shell
// (`@media (min-width: 761px)` block: gap, top bar height, Outliner and
// Details widths), the top bar with its brand and history buttons, the tool
// buttons, the side panels, the viewport host panel, Outliner rows and the
// status toast; the view controls' hover menus (Camera, step 3). Only the
// rules the shell uses so far (and the Stats panel's place in the viewport); the panels' own rules come with them (step 5: outliner/outlinerStyle.ts).
// No redesign.

export const SHELL_CSS = `
html, body {
  margin: 0;
  height: 100%;
  overflow: hidden;
  background: #0b1014;
}

.editor-shell {
  --editor-gap: 6px;
  --editor-topbar-height: 44px;
  --editor-outliner-width: 300px;
  --editor-details-width: 410px;
  --content-drawer-collapsed-h: 42px;
  position: absolute;
  inset: 0;
  color: var(--forge-text);
  font: 13px/1.35 system-ui, -apple-system, "Segoe UI", sans-serif;
}

.editor-shell,
.editor-shell *,
.editor-shell *::before,
.editor-shell *::after {
  box-sizing: border-box;
}

.editor-shell button,
.editor-shell input {
  font: inherit;
}

.editor-topbar {
  position: absolute;
  z-index: 50;
  inset: var(--editor-gap) var(--editor-gap) auto;
  height: var(--editor-topbar-height);
  display: grid;
  grid-template-columns: var(--editor-outliner-width) minmax(0, 1fr);
  align-items: center;
  border: 1px solid #2d3740;
  border-radius: 4px;
  background: linear-gradient(180deg, #171e24 0%, #12181e 100%);
  box-shadow: 0 5px 13px rgba(0, 0, 0, 0.26);
}

.editor-lead {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 36px;
  min-width: 0;
  padding: 0 8px;
  overflow: hidden;
  border-right: 1px solid rgba(255, 255, 255, 0.055);
}

.editor-workbar {
  position: relative;
  height: 36px;
  display: flex;
  align-items: center;
  gap: 18px;
  min-width: 0;
  padding: 0 14px;
}

.editor-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.editor-brand-text {
  display: grid;
  min-width: 0;
}

.editor-brand strong {
  overflow: hidden;
  font-size: 13px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.editor-brand-text span {
  overflow: hidden;
  color: var(--forge-text-secondary);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.editor-logo {
  width: 24px;
  height: 24px;
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--forge-border-strong);
  border-radius: 6px;
  background: linear-gradient(135deg, #13b98a, #46a2ff);
  color: #06110e;
  font-size: 14px;
  font-weight: 800;
  line-height: 1;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.26);
}

.editor-history-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 4px;
  margin-left: auto;
}

.editor-shell button {
  min-height: 30px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 6px;
  padding: 0 10px;
  color: #edf2f4;
  background: #2b3136;
  cursor: pointer;
}

.editor-shell button:hover {
  background: #394148;
}

.editor-shell button:disabled {
  color: #788187;
  background: #20252a;
  cursor: default;
}

.editor-shell .tool-button {
  width: 28px;
  min-width: 28px;
  height: 26px;
  min-height: 26px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #c8d0d5;
}

.editor-shell .tool-button svg {
  width: 14px;
  height: 14px;
  display: block;
  pointer-events: none;
}

/* The transform tools and snap widgets (Forge's editor-tools / editor-snaps). */
.editor-tools,
.editor-snaps {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 6px;
}

.editor-shell .editor-tools .tool-button.active,
.editor-shell .editor-tools .tool-button.active:hover {
  border-color: var(--forge-accent);
  background: var(--forge-accent);
  color: var(--forge-accent-text);
}

.editor-shell .tool-button.space-toggle {
  margin-left: 2px;
}

.editor-snaps {
  gap: 8px;
}

/* A grid-icon toggle joined to a value list (UE5's snap control). */
.editor-snaps .snap-widget {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
}

/* The checkbox keeps the state; the icon (inside the label) toggles it. */
.editor-snaps .snap-widget input[type="checkbox"] {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.editor-snaps .snap-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: 1px solid var(--forge-border-strong);
  border-right: none;
  border-radius: 5px 0 0 5px;
  background: var(--forge-bg-3);
  color: var(--forge-text-dim);
}

.editor-snaps .snap-icon svg {
  width: 14px;
  height: 14px;
  display: block;
  pointer-events: none;
}

.editor-snaps .snap-widget:hover .snap-icon {
  background: var(--forge-surface-raise);
  color: var(--forge-text-secondary);
}

.editor-snaps .snap-widget input:checked + .snap-icon {
  border-color: var(--forge-accent);
  background: var(--forge-accent-soft);
  color: var(--forge-accent-hover);
}

.editor-snaps select {
  height: 26px;
  min-height: 26px;
  min-width: 52px;
  border: 1px solid var(--forge-border-strong);
  border-radius: 0 5px 5px 0;
  padding: 0 5px;
  color: var(--forge-text);
  font-size: 12px;
  background: var(--forge-bg-3);
}

/* Details' Pivot and Placement actions (Forge's detail-actions-row). */
.detail-actions {
  display: grid;
  gap: 6px;
  margin-top: 8px;
}

.detail-actions-title {
  margin-top: 4px;
  color: var(--forge-text-secondary);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.detail-actions-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.editor-shell .detail-action-button {
  min-height: 26px;
  padding: 0 8px;
  font-size: 12px;
}

.detail-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #c8d0d4;
  font-size: 13px;
  cursor: pointer;
}

.detail-toggle input {
  width: 16px;
  height: 16px;
  accent-color: #3f7fd0;
  cursor: pointer;
}

.editor-shell .detail-action-button.on {
  border-color: var(--forge-accent);
  background: var(--forge-accent-soft);
  color: var(--forge-accent-hover);
}

.editor-view-controls {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  min-width: 0;
  margin-left: auto;
  /* Above the viewport, ending at the Details panel's left edge (Forge). */
  margin-right: var(--editor-details-width);
}

.editor-shell .topbar-menu-button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 26px;
  min-height: 26px;
  padding: 0 8px;
  border-radius: 5px;
  font-size: 12px;
  white-space: nowrap;
}

.editor-shell .topbar-menu-button svg:not(.menu-chevron) {
  width: 14px;
  height: 14px;
}

.menu-chevron {
  color: #9aa4a9;
  flex: 0 0 auto;
}

.topbar-menu {
  position: relative;
}

.topbar-popover {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 80;
  min-width: 150px;
  display: grid;
  gap: 0;
  padding: 6px;
  border: 1px solid var(--forge-border-mid);
  border-radius: 6px;
  background: rgba(19, 22, 25, 0.98);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.35);
  visibility: hidden;
  opacity: 0;
  transition:
    visibility 0s linear 0.2s,
    opacity 0.12s linear 0.2s;
}

.topbar-menu:hover .topbar-popover {
  visibility: visible;
  opacity: 1;
  transition-delay: 0s;
}

.editor-shell .topbar-popover button {
  width: 100%;
  min-height: 29px;
  justify-content: flex-start;
  padding: 0 8px;
  border: 0;
  border-radius: 3px;
  background: transparent;
  box-shadow: none;
  font-weight: 400;
  text-align: left;
}

.editor-shell .topbar-popover button:hover {
  background: rgba(255, 255, 255, 0.08);
}

.editor-shell .topbar-popover button.active {
  color: var(--forge-accent-text);
  background: var(--forge-accent);
}

.editor-shell .topbar-menu.force-closed .topbar-popover {
  visibility: hidden;
  opacity: 0;
  transition: none;
}

.editor-panel {
  position: absolute;
  z-index: 40;
  top: calc(var(--editor-gap) + var(--editor-topbar-height) + var(--editor-gap));
  bottom: var(--editor-gap);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid #2d3740;
  border-radius: 4px;
  background: linear-gradient(180deg, #171e24 0%, #111820 100%);
  box-shadow: 0 8px 18px rgba(0, 0, 0, 0.28);
}

.editor-outliner {
  left: var(--editor-gap);
  width: var(--editor-outliner-width);
}

.editor-details {
  right: var(--editor-gap);
  width: var(--editor-details-width);
}

.editor-panel-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 34px;
  padding: 0 10px;
  border-bottom: 1px solid #26323e;
  color: #e1e7ed;
  font-size: 12px;
  font-weight: 600;
}

.editor-panel-heading small {
  color: var(--forge-text-dim);
  font-weight: 400;
}

.details-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: 10px 9px;
}

.empty-details {
  display: grid;
  gap: 4px;
  padding: 12px 4px;
  color: var(--forge-text-secondary);
}

.editor-viewport-host {
  position: absolute;
  z-index: 1;
  top: calc(var(--editor-gap) + var(--editor-topbar-height) + var(--editor-gap));
  right: calc(var(--editor-details-width) + (var(--editor-gap) * 2));
  bottom: var(--editor-gap);
  left: calc(var(--editor-outliner-width) + (var(--editor-gap) * 2));
  overflow: hidden;
  border: 1px solid #303a43;
  border-radius: 4px;
  background: #111820;
}

.editor-viewport-host #debug-stats {
  /* Show > Stats: the ?debug panel inside the viewport panel. */
  max-height: calc(100% - 16px);
  max-width: calc(100% - 8px);
}

.editor-viewport-host canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.editor-status {
  display: none;
}

.editor-toast {
  position: absolute;
  top: 64px;
  left: 50%;
  z-index: 60;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  max-width: min(720px, calc(100vw - 48px));
  padding: 10px 12px 10px 14px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-left-width: 3px;
  border-radius: 6px;
  background: #1b2128;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.45);
  font-size: 12px;
  line-height: 1.45;
  transform: translateX(-50%);
  user-select: text;
}

.editor-toast[hidden] {
  display: none;
}

.editor-toast[data-tone="error"] {
  border-left-color: #ff6b5e;
  color: #ffb3ab;
}

.editor-toast[data-tone="warning"] {
  border-left-color: var(--forge-warning);
  color: var(--forge-warning-text);
}

.editor-shell .editor-toast-close {
  min-height: 0;
  border: 0;
  padding: 0 2px;
  color: inherit;
  background: transparent;
}
`;

const STYLE_ID = "forge-editor-shell-style";

export function installShellStyle(document: Document): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = SHELL_CSS;
  document.head.appendChild(style);
}
