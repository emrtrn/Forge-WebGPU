// Forge WebGL's `.forge-window` and `.random-world` styles (editorUi.css @
// forge-webgl-final) for the World Builder window; the rows are the kit's.

export const WORLD_BUILDER_CSS = `
.forge-window {
  position: absolute;
  z-index: 45;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  box-sizing: border-box;
  min-width: 0;
  background: #111820;
  border: 1px solid var(--forge-border);
  border-radius: 6px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
  pointer-events: auto;
  overflow: hidden;
}
.forge-window[hidden] { display: none; }
.forge-window-titlebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 34px;
  padding: 0 6px 0 12px;
  border-bottom: 1px solid var(--forge-border);
  background: #121922;
  cursor: move;
  user-select: none;
  touch-action: none;
}
.forge-window-title { color: #f5f8fb; font-size: 12px; font-weight: 700; }
.editor-shell .forge-window-close { width: 26px; height: 26px; padding: 0; border: 0; background: transparent; color: inherit; font-size: 16px; line-height: 1; cursor: pointer; }
.forge-window-body { min-height: 0; padding: 10px 12px 18px; overflow-x: hidden; overflow-y: auto; container-type: inline-size; }
.forge-window-resize {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 14px;
  height: 14px;
  cursor: nwse-resize;
  touch-action: none;
  background: linear-gradient(135deg, transparent 50%, var(--forge-border) 50%);
}

.random-world { display: grid; gap: 12px; grid-template-columns: minmax(0, 1fr); }
@container (min-width: 660px) {
  .random-world { grid-template-columns: minmax(0, 1fr) 320px; }
  .random-world-pack, .random-world-create { grid-column: 1 / -1; }
}
.random-world-options { display: grid; gap: 9px; align-content: start; }
.random-world-settlements { display: grid; gap: 4px; min-width: 0; }
.random-world-chips, .random-world-add { display: flex; flex-wrap: wrap; gap: 4px; }
.random-world-chip { display: inline-flex; align-items: center; gap: 2px; height: 22px; padding: 0 2px 0 8px; border: 1px solid var(--forge-border-strong); border-radius: 11px; background: var(--forge-bg-3); color: var(--forge-text); font-size: 12px; }
.editor-shell .random-world-chip > button { width: 18px; height: 18px; padding: 0; border: 0; border-radius: 9px; background: transparent; color: var(--forge-text-secondary); line-height: 1; cursor: pointer; }
.editor-shell .random-world-chip > button:hover:not(:disabled) { background: var(--forge-border); color: var(--forge-text); }
.random-world-chip > button:disabled { opacity: 0.35; cursor: default; }
.random-world-preview { display: grid; gap: 6px; align-content: start; justify-items: start; }
.random-world-preview canvas { width: 320px; max-width: 100%; aspect-ratio: 1; height: auto; border: 1px solid var(--forge-border); border-radius: var(--forge-radius-md); background: var(--forge-bg-0); }
.random-world[data-preview-state="pending"] .random-world-preview canvas { opacity: 0.75; }
.random-world-summary { color: var(--forge-text); font-size: 12px; }
.random-world-hint { color: var(--forge-text-dim); font-size: 11px; line-height: 1.4; }
.random-world-water { color: var(--forge-warning-text); font-size: 11px; line-height: 1.4; }
.random-world-error { color: var(--forge-error-text); font-size: 12px; }
.random-world-notes { margin: 0; padding-left: 16px; color: var(--forge-warning-text); font-size: 11px; }
.random-world [hidden] { display: none; }
.random-world-pack { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 8px 10px; border: 1px solid var(--forge-border-mid); border-radius: var(--forge-radius-md); color: var(--forge-warning-text); font-size: 12px; }
.random-world-create { display: grid; gap: 6px; padding: 10px 0 8px; border-top: 1px solid var(--forge-border-mid); position: sticky; bottom: -18px; z-index: 1; background: #111820; }
.random-world-actions { display: flex; align-items: center; justify-content: flex-end; gap: 10px; }
.editor-shell .random-world-actions > .forge-btn-primary { min-width: 96px; height: 29px; border: 0; border-radius: 4px; background: var(--forge-accent); color: var(--forge-accent-text); font-weight: 600; cursor: pointer; }
.editor-shell .random-world-actions > .forge-btn-primary:hover:not(:disabled) { background: var(--forge-accent-hover); }
.editor-shell .random-world-actions > .forge-btn-primary:disabled { opacity: 0.5; cursor: default; }
.random-world-path { flex: 1; min-width: 0; overflow: hidden; color: var(--forge-text); font-size: 12px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.random-world-progress { display: flex; align-items: center; gap: 8px; color: var(--forge-text-secondary); font-size: 12px; }
.random-world-progress progress { flex: 0 0 160px; height: 8px; }
`;

const STYLE_ID = "forge-world-builder-style";

/** Adds the window's <style> to `document` once. */
export function installWorldBuilderStyle(document: Document): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = WORLD_BUILDER_CSS;
  document.head.append(style);
}
