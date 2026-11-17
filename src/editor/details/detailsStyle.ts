// Details' own styles (plan phase 4 step 5b): the header rows, "Multiple
// Values", an overridden field (its name in the accent, the reset arrow), a
// component section's heading buttons, Add Component and the picker list.
// Forge's tokens and sizes; the rows themselves are the UI kit's.

export const DETAILS_CSS = `
.details-panel {
  display: grid;
  gap: 10px;
}

.details-header {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr);
  gap: 5px 10px;
  padding: 4px 0 12px;
  border-bottom: 1px solid var(--forge-border-soft);
}

.details-header > .detail-row,
.details-actor-kind {
  grid-column: 2;
}

.details-actor-icon {
  grid-column: 1;
  grid-row: 1 / 4;
  display: grid;
  place-items: center;
  align-self: start;
  height: 36px;
  border: 1px solid var(--forge-border-mid);
  border-radius: 5px;
  color: var(--forge-text-secondary);
  background: var(--forge-bg-2);
}

.details-actor-icon svg { width: 22px; height: 22px; }
.details-actor-kind { color: var(--forge-text-dim); font-size: 11px; }

.forge-kit .details-header .detail-row {
  grid-template-columns: 42px minmax(0, 1fr);
}

.forge-kit .details-header input[data-testid="detail-name"] {
  font-weight: 600;
  background: transparent;
  border-color: transparent;
}

.forge-kit .details-header input[data-testid="detail-name"]:hover,
.forge-kit .details-header input[data-testid="detail-name"]:focus {
  border-color: var(--forge-border-strong);
}

/* Narrow inspectors reserve their width for values, rather than repeated nested frames. */
.forge-kit .details-panel .detail-vector {
  grid-template-columns: 68px minmax(0, 1fr);
  gap: 6px;
}

.forge-kit .details-panel .vector-fields { gap: 4px; }
.forge-kit .details-panel .axis-field { height: 30px; }
.forge-kit .details-panel .axis-field .axis-tag { flex-basis: 13px; font-size: 10px; background: transparent; }
.forge-kit .details-panel .axis-x .axis-tag { color: #ef8d87; }
.forge-kit .details-panel .axis-y .axis-tag { color: #82c997; }
.forge-kit .details-panel .axis-z .axis-tag { color: #83b8f5; }
.forge-kit .details-panel .axis-field input {
  padding: 0 3px;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  appearance: textfield;
  -moz-appearance: textfield;
}
.details-panel .axis-field input::-webkit-inner-spin-button,
.details-panel .axis-field input::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }

.details-panel .detail-vector-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 2px;
  font-size: 11px;
}

.editor-shell .detail-scale-lock {
  display: inline-grid;
  place-items: center;
  flex: 0 0 22px;
  width: 22px;
  height: 24px;
  min-height: 0;
  padding: 2px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: var(--forge-text-dim);
}
.editor-shell .detail-scale-lock[aria-pressed="true"] {
  color: var(--forge-accent-hover);
  border-color: var(--forge-accent);
  background: var(--forge-accent-soft);
}
.editor-shell .detail-scale-lock:hover:not(:disabled) { color: var(--forge-text); }
.editor-shell .detail-scale-lock:disabled { opacity: 0.45; }
.detail-scale-lock svg { width: 14px; height: 14px; }

.detail-transform-summary {
  flex: 0 0 auto;
  padding-right: 5px;
  font-size: 10px;
  color: var(--forge-text-dim);
}
.detail-transform:not(.collapsed) .detail-transform-summary { display: none; }

.forge-kit .details-panel .detail-section .detail-section {
  border: 0;
  border-top: 1px solid var(--forge-border-soft);
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}
.forge-kit .details-panel .detail-section .detail-section > .detail-section-heading {
  background: transparent;
}
.forge-kit .details-panel .detail-section .detail-section > .detail-section-body { padding: 8px 0; }
.forge-kit .details-panel .detail-actions { margin-top: 0; gap: 8px; }

.details-placement-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}
.details-placement-toolbar[hidden] { display: none; }
.details-pivot-split { display: inline-flex; min-width: 0; }
.editor-shell .details-placement-toolbar .detail-action-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-height: 30px;
  padding: 0 8px;
  font-size: 11px;
  white-space: nowrap;
}
.details-placement-toolbar svg { width: 14px; height: 14px; flex-shrink: 0; }
.editor-shell .details-pivot-split > button:first-child { border-radius: 4px 0 0 4px; }
.editor-shell .details-pivot-split > button:last-child {
  width: 25px;
  padding: 0;
  margin-left: -1px;
  border-radius: 0 4px 4px 0;
}
.editor-shell .details-placement-toolbar button[aria-expanded="true"] {
  border-color: var(--forge-accent);
  color: var(--forge-accent-hover);
}
.details-action-popover {
  position: fixed;
  inset: auto;
  box-sizing: border-box;
  margin: 0;
  padding: 8px;
  max-height: calc(100vh - 16px);
  overflow: auto;
  border: 1px solid var(--forge-border-strong);
  border-radius: 6px;
  background: var(--forge-bg-2);
  color: var(--forge-text);
  box-shadow: 0 8px 24px #0008;
}
.details-action-popover:popover-open { display: grid; gap: 8px; }
.details-popover-heading { display: flex; align-items: center; justify-content: space-between; padding: 3px 5px; font-weight: 600; }
.details-action-list { display: grid; gap: 2px; padding-bottom: 8px; border-bottom: 1px solid var(--forge-border-soft); }
.editor-shell .details-action-popover .detail-action-button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 30px;
  padding: 0 8px;
  border: 0;
  border-radius: 3px;
  background: transparent;
  text-align: left;
}
.editor-shell .details-action-popover .detail-action-button:hover:not(:disabled) { background: var(--forge-accent-soft); }
.details-action-popover kbd { color: var(--forge-text-dim); font: inherit; font-size: 10px; }
.forge-kit .details-panel .details-action-popover .detail-vector { grid-template-columns: 36px minmax(0, 1fr); }

.forge-kit .details-panel .detail-reference { grid-template-columns: minmax(0, 1fr); gap: 5px; }
.forge-kit .details-panel .ref-control {
  padding: 4px;
  border: 1px solid var(--forge-border-mid);
  border-radius: 4px;
  background: #0d131a;
  gap: 4px;
}
.forge-kit .details-panel .ref-control output { padding-left: 4px; }
.forge-kit .details-panel .ref-control .detail-inline-button { height: 25px; padding: 0 5px; }
.forge-kit .details-panel .ref-control svg { width: 14px; height: 14px; }
.forge-kit .details-panel .details-add-component {
  min-height: 32px;
  border-style: dashed;
  color: var(--forge-text-secondary);
  background: transparent;
}

.forge-kit .detail-value {
  overflow: hidden;
  color: var(--forge-text-secondary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.forge-kit input.is-mixed::placeholder,
.forge-kit textarea.is-mixed::placeholder {
  color: var(--forge-text-dim);
  font-style: italic;
}

.forge-kit .color-control.is-mixed input[type="color"] {
  outline: 1px dashed var(--forge-text-dim);
  outline-offset: 1px;
}

.forge-kit .is-overridden > span:first-child,
.forge-kit .is-overridden > .detail-vector-label,
.forge-kit .is-overridden > .detail-section-heading .detail-section-toggle span {
  color: var(--forge-accent-hover);
  font-weight: 600;
}

.editor-shell .detail-reset-button {
  display: inline-grid;
  place-items: center;
  width: 20px;
  min-width: 20px;
  min-height: 0;
  height: 20px;
  margin-left: 4px;
  padding: 0;
  border: 0;
  vertical-align: middle;
  color: var(--forge-accent-hover);
  background: transparent;
}

.editor-shell .detail-reset-button:hover {
  background: var(--forge-accent-soft);
}

.editor-shell .detail-reset-button svg {
  width: 13px;
  height: 13px;
}

.editor-shell .details-add-component {
  width: 100%;
  margin-top: 4px;
}

.forge-kit .detail-hint {
  color: var(--forge-text-dim);
  font-size: 11px;
  line-height: 1.4;
}

.detail-extension {
  display: grid;
  gap: 6px;
  margin-top: 8px;
}

.detail-extension > .detail-action-button {
  justify-self: start;
}

.wes-preview-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.details-picker {
  position: absolute;
  z-index: 20;
  top: 40px;
  right: 8px;
  left: 8px;
  display: grid;
  gap: 6px;
  max-height: calc(100% - 56px);
  padding: 8px;
  border: 1px solid var(--forge-border-mid);
  border-radius: var(--forge-radius-md);
  background: var(--forge-bg-2);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.45);
}

.details-picker-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--forge-text);
  font-size: 12px;
}

.editor-shell .details-picker-search {
  width: 100%;
  height: 28px;
  border: 1px solid var(--forge-border-strong);
  border-radius: 6px;
  padding: 0 8px;
  color: #ffffff;
  background: #101316;
}

.details-picker-list {
  display: grid;
  align-content: start;
  min-height: 0;
  max-height: 50vh;
  overflow: auto;
}

.editor-shell .details-picker-item {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  min-height: 28px;
  border: 0;
  border-radius: var(--forge-radius-sm);
  padding: 0 8px;
  color: var(--forge-text);
  background: transparent;
  text-align: left;
}

.editor-shell .details-picker-item:hover:not(:disabled) {
  background: var(--forge-border-soft);
}

.details-picker-item small {
  overflow: hidden;
  color: var(--forge-text-dim);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.details-picker-empty {
  padding: 6px 8px;
  color: var(--forge-text-dim);
}
`;

const STYLE_ID = "forge-editor-details-style";

export function installDetailsStyle(document: Document): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = DETAILS_CSS;
  document.head.appendChild(style);
}
