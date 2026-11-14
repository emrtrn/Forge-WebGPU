// The Outliner's styles. Ported from Forge WebGL src/editor/editorUi.css @
// forge-webgl-final (04b5fb23): `.outliner-pane`, the search row and its
// filter popover, `.outliner-list`, `.outliner-summary`, `.outliner-row` and
// its kind icon, meta, actions and toggles. No redesign. Two changes the
// virtualised list needs: rows sit absolutely in a sizer as tall as the whole
// list (fixed 40 px, Forge's row height), and a row with children has a
// collapse chevron in front of its icon.

export const OUTLINER_CSS = `
.outliner-pane {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  flex: 1 1 auto;
  min-height: 0;
  padding: 10px 9px 18px;
}

.outliner-search-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}

.outliner-search-actions {
  position: relative;
  display: flex;
  align-items: center;
}

.outliner-search-wrap {
  position: relative;
  display: block;
  width: 100%;
}

.outliner-search-wrap > svg {
  position: absolute;
  top: 50%;
  left: 9px;
  width: 14px;
  height: 14px;
  color: var(--forge-text-secondary);
  pointer-events: none;
  transform: translateY(-50%);
}

.editor-shell .outliner-search {
  width: 100%;
  height: 30px;
  margin: 0;
  border: 1px solid var(--forge-border-strong);
  border-radius: 6px;
  padding: 0 8px 0 30px;
  color: #ffffff;
  background: #101316;
}

.editor-shell .outliner-filter-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  min-width: 30px;
  height: 30px;
  padding: 0;
  border: 1px solid transparent;
  color: var(--forge-text-secondary);
  background: transparent;
}

.editor-shell .outliner-filter-button:hover {
  background: var(--forge-border-soft);
  color: var(--forge-text);
}

.editor-shell .outliner-filter-button svg {
  width: 14px;
  height: 14px;
}

.editor-shell .outliner-filter-button.is-filtered,
.editor-shell .outliner-filter-button[aria-expanded="true"] {
  border-color: var(--forge-accent);
  color: var(--forge-accent-hover);
  background: var(--forge-accent-soft);
}

.outliner-filter-popover {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 12;
  display: grid;
  gap: 4px;
  min-width: 156px;
  padding: 8px;
  border: 1px solid var(--forge-border-mid);
  border-radius: var(--forge-radius-md);
  color: var(--forge-text-secondary);
  background: var(--forge-bg-2);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.35);
}

.outliner-filter-popover[hidden] {
  display: none;
}

.outliner-filter-popover strong {
  padding: 2px 4px 5px;
  color: var(--forge-text);
  font-size: 11px;
  text-transform: uppercase;
}

.outliner-filter-popover label {
  display: flex;
  align-items: center;
  gap: 7px;
  min-height: 25px;
  padding: 0 4px;
  border-radius: var(--forge-radius-sm);
  cursor: pointer;
}

.outliner-filter-popover label:hover {
  background: var(--forge-border-soft);
}

.editor-outliner .outliner-list {
  position: relative;
  min-height: 0;
  overflow: auto;
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.editor-outliner .outliner-list::-webkit-scrollbar {
  display: none;
}

.outliner-sizer {
  position: relative;
  width: 100%;
}

.outliner-list > .empty-details[hidden] {
  display: none;
}

.outliner-summary {
  display: flex;
  align-items: center;
  min-height: 24px;
  margin-top: 8px;
  padding-top: 7px;
  border-top: 1px solid var(--forge-border-soft);
  color: var(--forge-text-dim);
  font-size: 11px;
}

.outliner-row {
  position: absolute;
  left: 0;
  right: 0;
  height: 40px;
  display: grid;
  grid-template-columns: 12px 20px minmax(0, 1fr) auto;
  align-items: center;
  gap: 6px;
  text-align: left;
  border-bottom: 1px solid var(--forge-border-soft);
  padding: 0 6px 0 8px;
  color: var(--forge-text);
  background: transparent;
  cursor: pointer;
  user-select: none;
}

.outliner-row[hidden] {
  display: none;
}

.outliner-row:hover {
  background: var(--forge-bg-3);
}

.outliner-row.active {
  background: var(--forge-accent-soft);
  box-shadow: inset 2px 0 0 var(--forge-accent);
}

.outliner-row.is-hidden .outliner-meta {
  opacity: 0.45;
}

.outliner-row.is-dragging {
  opacity: 0.5;
}

.outliner-row.drop-target {
  box-shadow: inset 0 0 0 1px var(--forge-accent-hover);
  background: var(--forge-accent-soft);
}

.editor-shell .outliner-expander {
  display: grid;
  place-items: center;
  width: 12px;
  min-width: 12px;
  min-height: 0;
  height: 20px;
  padding: 0;
  border: 0;
  color: var(--forge-text-secondary);
  background: transparent;
}

.editor-shell .outliner-expander:hover {
  color: var(--forge-text);
  background: transparent;
}

.editor-shell .outliner-expander svg {
  width: 10px;
  height: 10px;
}

.outliner-actions {
  display: inline-flex;
  align-items: center;
  justify-self: end;
  gap: 4px;
}

.editor-shell .outliner-toggle {
  min-height: 22px;
  min-width: 22px;
  padding: 0;
  line-height: 1;
  border-color: transparent;
  background: transparent;
  opacity: 0.5;
}

.editor-shell .outliner-toggle svg {
  width: 14px;
  height: 14px;
}

.editor-shell .outliner-toggle:hover {
  background: #444c52;
  opacity: 1;
}

.editor-shell .outliner-toggle.on {
  opacity: 1;
  border-color: rgba(241, 195, 107, 0.55);
  color: #f1c36b;
}

.outliner-kind {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  color: var(--forge-text-secondary);
}

.outliner-row.active .outliner-kind {
  color: var(--forge-text);
}

.outliner-kind svg {
  width: 14px;
  height: 14px;
}

.outliner-meta {
  display: block;
  min-width: 0;
}

.outliner-meta strong,
.outliner-meta small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.outliner-meta strong {
  font-size: 12px;
}

.outliner-meta small {
  display: none;
}
`;

const STYLE_ID = "forge-editor-outliner-style";

export function installOutlinerStyle(document: Document): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = OUTLINER_CSS;
  document.head.appendChild(style);
}
