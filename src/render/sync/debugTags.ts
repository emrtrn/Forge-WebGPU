// What the `?debug` panel and the development measurements read from the
// scene (plan phase 5a steps 4-5). A render binding tags the object it adds;
// the reader (render/viewer/debug) walks the world's scene for the tags and
// never knows a binding, as a picker reads pickTags.ts.
//
// - `tagTerrainStreaming`: a streamed terrain's stream and the sources its
//   last update used (Forge's world streaming module kept both; here the
//   terrain binding owns the stream until phase 6).
// - `tagTerrainView`: a drawn terrain's view and definition, for the G8
//   collider match (render/viewer/debug/terrainColliderMatch.ts).

import type { Object3D } from "three/webgpu";
import type { TerrainStreamingView } from "../../engine/terrain/terrainStreamingDebug.ts";
import type { WorldTerrainDef } from "../../engine/terrain/terrainTypes.ts";
import type { StreamingSource } from "../../engine/world/streamingPolicy.ts";
import type { TerrainView } from "./terrainView.ts";

const TERRAIN_STREAMING = "forgeDebugTerrainStreaming";
const TERRAIN_VIEW = "forgeDebugTerrainView";

export interface TaggedTerrainView {
  readonly view: TerrainView;
  readonly def: WorldTerrainDef;
}

export function tagTerrainView(object: Object3D, tagged: TaggedTerrainView): void {
  object.userData[TERRAIN_VIEW] = tagged;
}

/** Every tagged terrain view under `root`, in graph order. */
export function taggedTerrainViews(root: Object3D): TaggedTerrainView[] {
  const views: TaggedTerrainView[] = [];
  root.traverse((object) => {
    const tagged = object.userData[TERRAIN_VIEW] as TaggedTerrainView | undefined;
    if (tagged) views.push(tagged);
  });
  return views;
}

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
