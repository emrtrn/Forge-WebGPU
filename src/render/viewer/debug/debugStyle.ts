// Ported from Forge WebGL src/style.css (the `?debug` panel and table rules) @ forge-webgl-final (04b5fb23); docs/PORT_LOG.md §2.
// Injected by the panel as one <style>, so none of it is in a game page without `?debug`.

export const DEBUG_PANEL_CSS = `
/* ---------------------------------------------------------------------------
   ?debug panel (F2). The panel takes over #debug-stats, so the rule above still
   places it; these rules only lay out its inside. All debug-only — none of it
   ships, because the module that adds these class names is behind a dynamic
   import that a game build never reaches.
   --------------------------------------------------------------------------- */

/* The readout is the only part that must keep the monospace pre-wrap layout;
   the root now also holds buttons, which must not inherit \`white-space: pre\`.

   Bounded to the viewport, with the readout scrolling inside it. The readout
   runs to ninety-odd lines in a busy scene and used to spill two screens past
   the bottom of the window, where none of it could be read and where it
   confused pointer hit-testing for anything trying to click the controls.
   Keeping the control strip outside the scroller is the other half of the
   reason it sits above the readout. */
.forge-debug-panel {
  /* Above the game UI layers. A diagnostic surface a menu screen can cover is
     not a diagnostic surface: opening a screen is exactly the moment you get the
     cursor back and want to reach these controls. The table modal sits one
     higher again, over the panel that opened it. */
  z-index: 45;
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 16px);
  white-space: normal;
  pointer-events: none;
}

.forge-debug-panel-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
  margin-bottom: 4px;
  pointer-events: none;
}

/* Reserved, and reserved even while empty: a persistent control (the speed
   picker) belongs leftmost, and an action added later must not take its place. */
.forge-debug-panel-control-slot {
  display: flex;
  gap: 4px;
  align-items: center;
}

.forge-debug-panel-button {
  pointer-events: auto;
  appearance: none;
  cursor: pointer;
  padding: 2px 8px;
  border: 1px solid rgba(127, 255, 127, 0.35);
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.55);
  color: #7fff7f;
  font: 11px/1.6 monospace;
}

.forge-debug-panel-button:hover {
  border-color: #7fff7f;
  background: rgba(127, 255, 127, 0.15);
}

.forge-debug-panel-readout {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  /* Passive text lets menu clicks through. Inspect text explicitly enables
     scrolling/selection while the control buttons always remain interactive. */
  pointer-events: none;
  user-select: none;
  margin: 0;
  font: inherit;
  color: inherit;
  white-space: pre;
}

.forge-debug-panel.is-inspecting .forge-debug-panel-readout {
  pointer-events: auto;
  user-select: text;
}

.forge-debug-panel-readout:focus-visible {
  outline: 1px solid #7fff7f;
}

/* World Terrain streaming map: fixed size, never scrolls with the readout, and
   passive like it so a menu click lands through. */
.forge-debug-panel-map {
  flex: 0 0 auto;
  align-self: flex-start;
  margin: 4px 0;
  pointer-events: none;
  image-rendering: pixelated;
}

.forge-debug-panel-map[hidden] {
  display: none;
}

/* The speed picker lives in the reserved slot; \`is-active\` marks the state the
   world is actually in, which is not always the one this control asked for. */
.forge-debug-speed {
  display: flex;
  gap: 3px;
  align-items: center;
}

.forge-debug-panel-button.is-active {
  border-color: #7fff7f;
  background: rgba(127, 255, 127, 0.25);
  color: #eaffea;
}

/* Paused by something else as well: this control cannot resume the world, and
   an amber tint says so rather than offering a Resume that does nothing. */
.forge-debug-panel-button[data-forge-debug-held="other"] {
  border-color: #ffd54a;
  color: #ffd54a;
}

/* --- the frozen table modal ------------------------------------------------ */

.forge-debug-table {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 46;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: min(860px, calc(100vw - 32px));
  max-height: min(80vh, 720px);
  padding: 14px 16px;
  border: 1px solid rgba(127, 255, 127, 0.25);
  border-radius: 8px;
  background: rgba(8, 12, 10, 0.96);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6);
  color: #d8f5d8;
  font: 12px/1.5 monospace;
}

.forge-debug-table[hidden] {
  display: none;
}

.forge-debug-table-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.forge-debug-table-header h2 {
  margin: 0;
  font: 600 14px/1.3 monospace;
  color: #7fff7f;
}

.forge-debug-table-close {
  appearance: none;
  cursor: pointer;
  width: 24px;
  height: 24px;
  border: 1px solid rgba(216, 245, 216, 0.25);
  border-radius: 4px;
  background: transparent;
  color: inherit;
  font: 14px/1 monospace;
}

.forge-debug-table-close:hover {
  border-color: #7fff7f;
  color: #7fff7f;
}

.forge-debug-table-meta {
  margin: 0;
  opacity: 0.75;
}

.forge-debug-table-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
}

.forge-debug-table-grid {
  width: 100%;
  border-collapse: collapse;
}

.forge-debug-table-grid th,
.forge-debug-table-grid td {
  padding: 2px 8px;
  font-weight: 400;
  text-align: left;
  white-space: pre;
}

.forge-debug-table-grid th[data-align="right"],
.forge-debug-table-grid td[data-align="right"] {
  text-align: right;
}

.forge-debug-table-grid thead th {
  position: sticky;
  top: 0;
  background: rgba(8, 12, 10, 0.96);
  border-bottom: 1px solid rgba(216, 245, 216, 0.2);
  opacity: 0.7;
}

/* The share bar: a gradient behind the row, so finding the expensive one costs
   no element and no reading. --forge-table-share is set per row by the modal. */
.forge-debug-table-grid tbody tr {
  background-image: linear-gradient(
    to right,
    rgba(127, 255, 127, 0.16) 0 var(--forge-table-share, 0%),
    transparent var(--forge-table-share, 0%) 100%
  );
}

/* Leftovers read dimmer than measurements: they are what is not accounted for,
   and must never be mistaken for something that was timed on its own. */
.forge-debug-table-grid tbody tr[data-forge-table-kind="residual"] {
  opacity: 0.62;
  font-style: italic;
}

/* Diagnostic-only cost, marked rather than hidden — the shipped build never
   pays it, and a reader comparing the two has to see which rows those are. */
.forge-debug-table-grid tbody tr[data-forge-table-kind="debug"] {
  color: #ffd54a;
}

.forge-debug-table-footer {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
}

.forge-debug-table-notes {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
  opacity: 0.7;
  font-size: 11px;
}

.forge-debug-table-notes p {
  margin: 0;
}

.forge-debug-table-copy {
  appearance: none;
  cursor: pointer;
  flex: 0 0 auto;
  padding: 4px 10px;
  border: 1px solid rgba(127, 255, 127, 0.35);
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.55);
  color: #7fff7f;
  font: 11px/1.6 monospace;
}

.forge-debug-table-copy:hover {
  border-color: #7fff7f;
  background: rgba(127, 255, 127, 0.15);
}

/* Lightweight perf readout (qa-poki measurement standard). Debug-only. */
#debug-stats[hidden] {
  display: none;
}

#debug-stats {
  position: absolute;
  top: calc(env(safe-area-inset-top) + 4px);
  left: 4px;
  max-width: min(620px, calc(100vw - 8px));
  padding: 6px 8px;
  background: rgba(0, 0, 0, 0.45);
  border-radius: 4px;
  color: #7fff7f;
  font: 12px/1.4 monospace;
  text-shadow: 0 0 2px #000;
  white-space: pre;
  overflow: hidden;
}
`;
