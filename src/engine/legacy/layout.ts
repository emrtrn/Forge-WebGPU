// Ported from Forge WebGL engine/scene/layout.ts (Vec3, LayoutPhysicsAxisLocks, LayoutLandscape) @ forge-webgl-final (04b5fb23); docs/PORT_LOG.md §2.
// TRANSITION (plan 2b, user decision 2026-11-11): Forge WebGL's old entity and
// component model, only the part ported subsystems read. Faz 6 replaces it with
// schema components (each subsystem binds to the world with its feature) and
// deletes src/engine/legacy. Kept inside src/engine (engine-legacy-stays-in-engine).

export type Vec3 = [number, number, number];

export type LayoutPhysicsAxisLocks = [boolean, boolean, boolean];

/**
 * Placed Landscape actor (à la Unreal's Landscape): a level-owned heightfield
 * terrain. Faz 1 models only the placed actor + a reference to its height/layer
 * sidecar data (`dataRef`); sculpt/paint tools are later phases. Unlike the other
 * placed actors there is no `scale` field — terrain size is fixed by the sidecar's
 * `size` (vertex grid + spacing), not a transform scale. Optional fields read
 * defaults from `engine/scene/landscape.ts`.
 */
export interface LayoutLandscape {
  id: string;
  name?: string;
  hidden?: boolean;
  locked?: boolean;
  scaleLocked?: boolean;
  groupId?: string;
  nodeId?: string;
  parentId?: string;
  position: Vec3;
  /** Full Euler rotation (XYZ order) in degrees. */
  rotation?: Vec3;
  /** Public-root-relative `*.terrain.json` World Terrain definition. */
  dataRef: string;
  /** Landscape material asset id, unused until Faz 3 (layer paint + landscape material). */
  material?: string;
  /** Runtime collision. Absent means true (statically collidable, rebuilt on Save/Play). */
  collision?: boolean;
}
