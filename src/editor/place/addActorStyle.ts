// The Add Actor menu's styles. Ported from Forge WebGL src/editor/editorUi.css
// @ forge-webgl-final (04b5fb23): `.add-actor-menu`, its hover popover with
// the close grace, the category flyouts, the search row, results and item
// rows, and `force-closed`. No redesign.

export const ADD_ACTOR_CSS = `
.add-actor-menu {
  position: relative;
  flex: 0 0 auto;
}

.editor-shell .add-actor-menu > .topbar-menu-button {
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

.editor-shell .add-actor-menu > .topbar-menu-button.primary {
  border-color: var(--forge-accent);
  color: #ffffff;
  background: var(--forge-accent);
}

.editor-shell .add-actor-menu > .topbar-menu-button.primary:hover {
  background: var(--forge-accent-hover);
}

.add-actor-popover {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 80;
  min-width: 180px;
  display: grid;
  gap: 4px;
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

.add-actor-menu:hover .add-actor-popover {
  visibility: visible;
  opacity: 1;
  transition-delay: 0s;
}

.add-actor-popover::before {
  content: "";
  position: absolute;
  top: -7px;
  left: -1px;
  right: -1px;
  height: 7px;
}

.editor-shell .add-actor-menu.force-closed .add-actor-popover {
  visibility: hidden;
  opacity: 0;
  transition: none;
}

.editor-shell .add-actor-popover button {
  width: 100%;
  justify-content: flex-start;
  text-align: left;
}

.add-actor-category {
  position: relative;
}

.add-actor-categories {
  display: grid;
  gap: 0;
  padding: 1px 0;
}

.add-actor-categories[hidden],
.add-actor-results[hidden] {
  display: none;
}

.editor-shell .add-actor-category > .add-actor-category-label {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 29px;
  padding: 0 8px;
  border: 0;
  border-radius: 3px;
  color: #dce3e8;
  background: transparent;
  box-shadow: none;
  font-weight: 400;
}

.add-actor-category > .add-actor-category-label::after {
  content: "›";
  margin-left: auto;
  color: #9aa4a9;
  font-weight: 700;
}

.add-actor-category:hover > .add-actor-category-label {
  background: rgba(255, 255, 255, 0.08);
}

.add-actor-submenu {
  position: absolute;
  top: -6px;
  left: 100%;
  margin-left: 4px;
  z-index: 81;
  min-width: 200px;
  display: none;
  padding: 6px;
  border: 1px solid var(--forge-border-mid);
  border-radius: 6px;
  background: rgba(19, 22, 25, 0.98);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.35);
}

.add-actor-submenu::before {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  left: -5px;
  width: 5px;
}

.add-actor-category:hover > .add-actor-submenu {
  display: grid;
  gap: 4px;
}

.add-actor-search-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
  margin-bottom: 2px;
  border: 1px solid var(--forge-border-mid);
  border-radius: 5px;
  background: rgba(0, 0, 0, 0.25);
  color: #9aa4a9;
}

.add-actor-search-row svg {
  flex: 0 0 auto;
  width: 14px;
  height: 14px;
}

.editor-shell input.add-actor-search {
  flex: 1 1 auto;
  min-width: 0;
  height: 22px;
  border: none;
  background: transparent;
  color: var(--forge-text, #e6e9eb);
  font-size: 12px;
}

.editor-shell input.add-actor-search:focus {
  outline: none;
}

.add-actor-results {
  display: grid;
  gap: 4px;
  min-width: 220px;
  max-height: 320px;
  overflow-y: auto;
}

.editor-shell .add-actor-item {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 29px;
  padding: 0 8px;
  border: 0;
  border-radius: 3px;
  color: #dce3e8;
  background: transparent;
  box-shadow: none;
  font-weight: 400;
}

.editor-shell .add-actor-item:hover {
  background: rgba(255, 255, 255, 0.08);
}

.add-actor-item > svg,
.add-actor-category-label > svg {
  flex: 0 0 auto;
  width: 14px;
  height: 14px;
  color: #9aa4a9;
}

.add-actor-item-label {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.add-actor-item-cat {
  flex: 0 0 auto;
  margin-left: auto;
  padding-left: 8px;
  color: #7c868c;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.add-actor-empty {
  padding: 8px 10px;
  color: #9aa4a9;
  font-size: 12px;
}
`;

const STYLE_ID = "forge-editor-add-actor-style";

export function installAddActorStyle(document: Document): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = ADD_ACTOR_CSS;
  document.head.appendChild(style);
}
