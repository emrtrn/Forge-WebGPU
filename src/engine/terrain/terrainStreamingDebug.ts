// The `?debug` view of terrain streaming (plan phase 5a step 4, decision 6):
// Forge WebGL's TerrainStreamingSnapshot (src/scene/capabilities/
// worldStreamingModule.ts) and its readout lines (src/scene/debugStats.ts
// terrainStreamingText) @ forge-webgl-final (04b5fb23), pure. Forge built the
// snapshot in its world streaming module; here the terrain render binding owns
// the streams (phase 6 moves them to a subsystem shared with physics), so the
// panel gathers them from the scene (render/sync/debugTags.ts) and builds the
// snapshot with this function. No pawn: Forge's "holding pawn" flag is phase 6.

import { formatByteSize } from "../perf/perfBudget.ts";
import type { StreamingSource } from "../world/streamingPolicy.ts";
import type { TerrainRuntimeStreaming, TerrainStreamingDebugGrid } from "./terrainRuntimeStreaming.ts";

/** What the snapshot reads of one stream. */
export type TerrainStreamingView = Pick<TerrainRuntimeStreaming, "world" | "residentTiles" | "document" | "colliders" | "lastFrameMs" | "debugGrid">;

export interface TerrainStreamingSnapshot {
  loaded: number;
  active: number;
  queued: number;
  physics: number;
  bytesResident: number;
  lastFrameMs: number;
  activeKeys: string[];
  colliderKeys: string[];
  /** One per streamed terrain, for the `?debug` map. */
  grids: TerrainStreamingDebugGrid[];
  /** World X/Z of the last update's streaming sources. */
  sources: (readonly [number, number])[];
}

/** The streams summed (Forge's snapshot); null when nothing streams. */
export function terrainStreamingSnapshot(
  streams: readonly TerrainStreamingView[],
  sources: readonly StreamingSource[],
): TerrainStreamingSnapshot | null {
  if (streams.length === 0) return null;
  const result: TerrainStreamingSnapshot = {
    loaded: 0, active: 0, queued: 0, physics: 0, bytesResident: 0, lastFrameMs: 0, activeKeys: [], colliderKeys: [],
    grids: [], sources: sources.map(({ position }) => position),
  };
  for (const stream of streams) {
    const stats = stream.world.stats();
    result.loaded += stream.residentTiles.size;
    result.active += stream.document.tiles.size;
    result.queued += stats.queued + stats.inFlight;
    result.physics += stream.colliders.size;
    result.bytesResident += stats.bytesResident;
    result.lastFrameMs += stream.lastFrameMs;
    result.activeKeys.push(...stream.document.tiles.keys());
    result.colliderKeys.push(...stream.colliders.keys());
    result.grids.push(stream.debugGrid());
  }
  return result;
}

/** The readout lines (Forge's terrainStreamingText); the map legend when a grid is drawn. */
export function formatTerrainStreaming(snapshot: TerrainStreamingSnapshot): string[] {
  const lines = [
    `terrain streaming: loaded:${snapshot.loaded} active:${snapshot.active} queued:${snapshot.queued} physics:${snapshot.physics}`,
    `streaming: ${snapshot.lastFrameMs.toFixed(2)} ms/frame ${formatByteSize(snapshot.bytesResident)}`,
    `terrain active: ${snapshot.activeKeys.join(" ")}`,
    `terrain physics: ${snapshot.colliderKeys.join(" ")}`,
  ];
  if (snapshot.grids.length) lines.push("terrain map: grey idle, amber fetching, blue cached, green active, pale physics, red failed");
  return lines;
}
