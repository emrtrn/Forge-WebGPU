// The drawn terrains of a world, for the bindings that grow on them (plan 5c
// F1: the procedural foliage ring). The terrain binding owns each terrain's
// view and stream (features/terrain/render.ts); it publishes here what the
// ring needs, and the foliage binding reads it by the terrain's actor. Keyed
// by the world's scene, so two worlds never see each other's terrains.
//
// `tiles` is live: a streamed terrain's resident tiles come and go behind the
// same lookup. `version` changes when the terrain is shown again (a reload
// after an edit): the ring then regenerates its cells.

import type { Object3D } from "three/webgpu";
import type { ActorId } from "../../core/index.ts";
import type { TerrainGlobalAttributes } from "../../engine/terrain/terrainRenderSource.ts";
import type { TerrainTileLookup } from "../../engine/terrain/terrainHeightQuery.ts";
import type { WorldTerrainDef } from "../../engine/terrain/terrainTypes.ts";
import type { TerrainFarTint } from "../materials/terrain.ts";

export interface TerrainSurface {
  readonly def: WorldTerrainDef;
  /** Resident tiles, live. */
  readonly tiles: TerrainTileLookup;
  /** Tile slots that exist on disk (`"x_z"`); a slot outside it is a hole. */
  readonly existingTiles: ReadonlySet<string>;
  /** The always-resident far map (heights in the terrain's local frame, relative to the datum). */
  readonly global: TerrainGlobalAttributes;
  /**
   * The stream has nothing queued or in flight and the view no tile waiting
   * (the terrain's own readiness): a binding growing on the tiles holds its
   * readiness while this is false, since tiles still arrive.
   */
  settled(): boolean;
  /** Sets (null: clears) the far foliage tint on this terrain's view (plan 5c F3). */
  setFarTint(tint: (TerrainFarTint & { readonly coverage: Float32Array }) | null): void;
  readonly version: number;
}

const surfaces = new WeakMap<Object3D, Map<ActorId, TerrainSurface>>();
let nextVersion = 1;

/** The terrain binding shows `actor`'s terrain (replacing what it showed before). */
export function publishTerrainSurface(scene: Object3D, actor: ActorId, surface: Omit<TerrainSurface, "version">): void {
  let map = surfaces.get(scene);
  if (!map) surfaces.set(scene, (map = new Map()));
  map.set(actor, { ...surface, version: nextVersion++ });
}

/** The terrain binding no longer shows `actor`'s terrain. */
export function withdrawTerrainSurface(scene: Object3D, actor: ActorId): void {
  surfaces.get(scene)?.delete(actor);
}

/** `actor`'s drawn terrain in this world's scene; undefined until its data loaded. */
export function terrainSurface(scene: Object3D, actor: ActorId): TerrainSurface | undefined {
  return surfaces.get(scene)?.get(actor);
}
