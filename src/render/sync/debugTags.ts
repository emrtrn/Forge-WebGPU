// What the `?debug` panel reads from the scene (plan phase 5a step 4). A render
// binding tags the object it adds; the panel (render/viewer/debug) walks the
// world's scene for the tags and never knows a binding, as a picker reads
// pickTags.ts.
//
// - `tagTerrainStreaming`: a streamed terrain's stream and the sources its
//   last update used (Forge's world streaming module kept both; here the
//   terrain binding owns the stream until phase 6).

import type { Object3D } from "three/webgpu";
import type { TerrainStreamingView } from "../../engine/terrain/terrainStreamingDebug.ts";
import type { StreamingSource } from "../../engine/world/streamingPolicy.ts";

const TERRAIN_STREAMING = "forgeDebugTerrainStreaming";

export interface TerrainStreamingProbe {
  readonly stream: TerrainStreamingView;
  /** The sources of the stream's last update. */
  sources(): readonly StreamingSource[];
}

export function tagTerrainStreaming(object: Object3D, probe: TerrainStreamingProbe): void {
  object.userData[TERRAIN_STREAMING] = probe;
}

/** Every tagged stream under `root`, in graph order (hidden objects included: a stream runs while its terrain is hidden). */
export function terrainStreamingProbes(root: Object3D): TerrainStreamingProbe[] {
  const probes: TerrainStreamingProbe[] = [];
  root.traverse((object) => {
    const probe = object.userData[TERRAIN_STREAMING] as TerrainStreamingProbe | undefined;
    if (probe) probes.push(probe);
  });
  return probes;
}
