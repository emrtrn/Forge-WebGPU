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
  gap: 6px;
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
