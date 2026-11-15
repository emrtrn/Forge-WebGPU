// Ported from Forge WebGL src/scene/debugTerrainMap.ts @ forge-webgl-final (04b5fb23); docs/PORT_LOG.md §2.
// Unchanged but for its snapshot type (engine/terrain/terrainStreamingDebug.ts)
// and the document it draws in (the panel's).
/**
 * The `?debug` World Terrain streaming map: one square per tile, coloured by
 * its streaming state, with the streaming sources (the pawn, else the camera)
 * as dots. +X runs right and +Z down, a top-down view with -Z at the top.
 *
 * Debug-only: `debugPanel.ts` mounts it, and that module is reached through the
 * `?debug` dynamic import, so a game build never carries it.
 */
import type { TerrainTileDebugState } from "../../../engine/terrain/terrainRuntimeStreaming.ts";
import type { TerrainStreamingSnapshot } from "../../../engine/terrain/terrainStreamingDebug.ts";

export const TERRAIN_TILE_DEBUG_COLORS: Readonly<Record<TerrainTileDebugState, string>> = {
  undeclared: "transparent",
  unloaded: "#3a4049",
  fetching: "#d9a43a",
  loaded: "#4a78c2",
  active: "#2f8f4e",
  physics: "#8fe39e",
  failed: "#d0504a",
};

/** Largest side of the map in CSS pixels; a tile never draws smaller than 2 px. */
const MAP_SIZE_PX = 160;

/** The `data-tiles` tally: `state:count` per state present, sorted. */
export function terrainTileTally(cells: readonly TerrainTileDebugState[]): string {
  const counts = new Map<TerrainTileDebugState, number>();
  for (const state of cells) counts.set(state, (counts.get(state) ?? 0) + 1);
  return [...counts].map(([state, count]) => `${state}:${count}`).sort().join(" ");
}

export class DebugTerrainMap {
  readonly element: HTMLCanvasElement;

  constructor(document: Document) {
    this.element = document.createElement("canvas");
    this.element.className = "forge-debug-panel-map";
    this.element.hidden = true;
  }

  /** Draws the first streamed terrain; hides the map when nothing streams. */
  update(snapshot: TerrainStreamingSnapshot | null): void {
    const grid = snapshot?.grids[0];
    const context = grid ? this.element.getContext("2d") : null;
    if (!grid || !context) {
      this.element.hidden = true;
      return;
    }
    const cell = Math.max(2, Math.floor(MAP_SIZE_PX / Math.max(grid.tilesX, grid.tilesZ)));
    const width = grid.tilesX * cell;
    const height = grid.tilesZ * cell;
    const view = this.element.ownerDocument.defaultView;
    const scale = typeof view?.devicePixelRatio === "number" ? view.devicePixelRatio : 1;
    if (this.element.width !== width * scale || this.element.height !== height * scale) {
      this.element.width = width * scale;
      this.element.height = height * scale;
      this.element.style.width = `${width}px`;
      this.element.style.height = `${height}px`;
    }
    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.clearRect(0, 0, width, height);
    grid.cells.forEach((state, index) => {
      if (state === "undeclared") return;
      context.fillStyle = TERRAIN_TILE_DEBUG_COLORS[state];
      // A 1 px gap keeps neighbouring tiles of the same state readable as a grid.
      context.fillRect((index % grid.tilesX) * cell, Math.floor(index / grid.tilesX) * cell, cell - (cell > 3 ? 1 : 0), cell - (cell > 3 ? 1 : 0));
    });
    context.fillStyle = "#ffffff";
    for (const [x, z] of snapshot!.sources) {
      const px = ((x - grid.origin[0]) / grid.tileSize) * cell;
      const pz = ((z - grid.origin[1]) / grid.tileSize) * cell;
      context.beginPath();
      context.arc(px, pz, Math.max(2, cell / 4), 0, Math.PI * 2);
      context.fill();
    }
    // The tally doubles as the smoke hook: a canvas has no text to read.
    this.element.dataset.tiles = terrainTileTally(grid.cells);
    this.element.hidden = false;
  }
}
