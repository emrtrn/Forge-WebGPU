/** Compact World Partition view for the Outliner's existing narrow pane. */
export const WORLD_PARTITION_CSS = `
.world-partition-panel {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 7px;
  width: 100%;
  min-width: 0;
  min-height: 0;
  padding: 9px;
  overflow: auto;
}

.world-partition-panel[hidden] { display: none; }

.world-partition-panel .wp-summary,
.world-partition-panel .wp-hint,
.world-partition-panel .wp-hlod,
.world-partition-panel .wp-status,
.world-partition-panel .wp-count {
  margin: 0;
  color: var(--forge-text-secondary);
  font-size: 11px;
  overflow-wrap: anywhere;
}

.world-partition-panel .wp-hlod {
  flex: 0 0 auto;
  max-height: 90px;
  overflow: auto;
}

.world-partition-panel .world-partition-map {
  display: block;
  flex: 0 0 auto;
  width: 100%;
  height: auto;
  aspect-ratio: 1;
  border: 1px solid var(--forge-border-mid);
  border-radius: var(--forge-radius-sm);
  background: var(--forge-bg-1);
  cursor: crosshair;
  touch-action: none;
}

.world-partition-panel .wp-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.world-partition-panel .wp-toolbar .forge-btn {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 27px;
  padding: 4px 6px;
  font-size: 11px;
}

.world-partition-panel .wp-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 3px 9px;
  margin: 0;
  padding: 0;
  list-style: none;
  color: var(--forge-text-secondary);
  font-size: 10px;
}

.world-partition-panel .wp-legend li { display: flex; align-items: center; gap: 4px; }
.world-partition-panel .wp-legend i { width: 9px; height: 9px; border: 1px solid; }
.world-partition-panel .wp-legend .wp-occupied { color: #6ec8e6; }
.world-partition-panel .wp-legend .wp-loaded { color: #5bd6a0; background: #315b50; }
.world-partition-panel .wp-legend .wp-dirty { color: #ff9b52; }
.world-partition-panel .wp-legend .wp-held { color: #b48cff; }
.world-partition-panel .wp-legend .wp-loading { color: #f0c070; background: #69582c; }
.world-partition-panel .wp-legend .wp-failed { color: #ff6b6b; background: #71373b; }
.world-partition-panel .wp-legend .wp-camera { color: #fff; border-radius: 50%; background: #fff; }

.world-partition-panel .wp-search-label { display: grid; gap: 4px; font-size: 11px; }
.world-partition-panel .wp-search {
  width: 100%;
  min-width: 0;
  height: 29px;
  padding: 0 8px;
  border: 1px solid var(--forge-border-strong);
  border-radius: var(--forge-radius-sm);
  color: var(--forge-text);
  background: var(--forge-bg-0);
  font: inherit;
}

.world-partition-panel .wp-cell-list {
  flex: 0 0 auto;
  max-height: 240px;
  overflow: auto;
  border-top: 1px solid var(--forge-border-soft);
}

.world-partition-panel .wp-cell {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 37px;
  padding: 4px;
  border-bottom: 1px solid var(--forge-border-soft);
  cursor: pointer;
}

.world-partition-panel .wp-cell:has(input:checked) { background: var(--forge-accent-soft); }
.world-partition-panel .wp-cell input { flex: 0 0 auto; accent-color: var(--forge-accent); }
.world-partition-panel .wp-cell span { min-width: 0; overflow-wrap: anywhere; }
.world-partition-panel .wp-cell strong { display: block; font-size: 11px; }
.world-partition-panel .wp-cell small { display: block; color: var(--forge-text-secondary); font-size: 10px; }
.world-partition-panel .wp-status[data-tone="warning"] { color: var(--forge-warning-text); }
.world-partition-panel .wp-status[data-tone="error"] { color: var(--forge-error-text); }
.world-partition-panel :is(button, input, canvas):focus-visible {
  outline: 2px solid var(--forge-accent-hover);
  outline-offset: -2px;
}
`;

export function installWorldPartitionStyle(doc: Document): void {
  const id = "forge-editor-world-partition-style";
  if (doc.getElementById(id)) return;
  const style = doc.createElement("style");
  style.id = id;
  style.textContent = WORLD_PARTITION_CSS;
  doc.head.append(style);
}
