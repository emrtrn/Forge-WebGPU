import assert from "node:assert/strict";
import { test } from "vitest";
import type { TerrainStreamingDebugGrid } from "./terrainRuntimeStreaming.ts";
import { formatTerrainStreaming, terrainStreamingSnapshot, type TerrainStreamingView } from "./terrainStreamingDebug.ts";

function stream(active: string[], colliders: string[], resident: number, stats: { queued: number; inFlight: number; bytesResident: number }, lastFrameMs: number): TerrainStreamingView {
  const grid: TerrainStreamingDebugGrid = { tilesX: 2, tilesZ: 1, origin: [0, 0], tileSize: 64, cells: ["active", "unloaded"] };
  return {
    world: { stats: () => stats } as unknown as TerrainStreamingView["world"],
    residentTiles: new Set(Array.from({ length: resident }, () => ({}))) as unknown as TerrainStreamingView["residentTiles"],
    document: { tiles: new Map(active.map((key) => [key, {}])) } as unknown as TerrainStreamingView["document"],
    colliders: new Map(colliders.map((key) => [key, {}])) as unknown as TerrainStreamingView["colliders"],
    lastFrameMs,
    debugGrid: () => grid,
  };
}

test("terrain streaming snapshot: streams sum, grids in order, sources as X/Z; none streams gives null", () => {
  assert.equal(terrainStreamingSnapshot([], [{ position: [1, 2] }]), null);
  const snapshot = terrainStreamingSnapshot(
    [
      stream(["0_0", "1_0"], [], 3, { queued: 1, inFlight: 2, bytesResident: 2500 }, 0.5),
      stream(["4_4"], ["4_4"], 1, { queued: 0, inFlight: 0, bytesResident: 500 }, 0.25),
    ],
    [{ position: [10, -4] }],
  )!;
  assert.deepEqual(
    { ...snapshot, grids: snapshot.grids.length },
    {
      loaded: 4, active: 3, queued: 3, physics: 1, bytesResident: 3000, lastFrameMs: 0.75,
      activeKeys: ["0_0", "1_0", "4_4"], colliderKeys: ["4_4"], grids: 2, sources: [[10, -4]],
    },
  );
  // Forge's readout lines, with the map legend.
  assert.deepEqual(formatTerrainStreaming(snapshot), [
    "terrain streaming: loaded:4 active:3 queued:3 physics:1",
    "streaming: 0.75 ms/frame 3.0 kB",
    "terrain active: 0_0 1_0 4_4",
    "terrain physics: 4_4",
    "terrain map: grey idle, amber fetching, blue cached, green active, pale physics, red failed",
  ]);
});
