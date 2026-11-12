/**
 * Forge WebGL placements as actors of the new level format (architecture
 * §4.4, A1; plan 2b, user decisions 2026-11-12). Pure, and shared by the two
 * writers of converted content: World Builder (`worldbuilder/build/worldLevel`)
 * and the Forge WebGL importer (`forgeLevel`).
 *
 * - Every placement becomes a plain actor. A `shape:<type>` group (World
 *   Builder's placeholders, Add Actor primitives) gives a `forge.shape`
 *   component with the placement's colour, a model group a `forge.staticMesh`
 *   of that asset. `forge.worldRole` carries the role and the World Builder
 *   stage that placed it.
 * - A `marker:playerStart` placement is an actor named "Player Start" without
 *   components until the Player Start feature (Faz 6). Another marker is left
 *   out and counted.
 * - The transform is the placement's: position, Euler XYZ degrees (or the
 *   legacy `rotationYDeg`) as a quaternion, uniform or per-axis scale.
 * - The terrain is an actor with `forge.terrain`, kept in the persistent layer
 *   (`spatiallyLoaded: false`, larger than a cell), at the centre of its tile
 *   grid: the definition wins over an authored position, as in Forge.
 *
 * Engine code cannot import a feature (layers), so the component type tags
 * are written here as text; the writers normalise them against the registry,
 * which refuses an unknown one.
 */
import type { ActorDoc, ActorId, AssetId, ComponentMap, Transform } from "../../core/index.ts";
import type { LayoutPlacement } from "../legacy/layout.ts";
import { SHAPE_PRIMITIVE_TYPES } from "../legacy/shapes.ts";
import type { WorldTerrainDef } from "../terrain/terrainTypes.ts";
import { worldTerrainActorPosition } from "../terrain/worldTerrainActor.ts";

export const STATIC_MESH_TAG = "forge.staticMesh@1";
export const SHAPE_TAG = "forge.shape@1";
export const WORLD_ROLE_TAG = "forge.worldRole@1";
export const TERRAIN_TAG = "forge.terrain@1";
export const HEIGHT_FOG_TAG = "forge.heightFog@1";

export const SHAPE_PREFIX = "shape:";
export const MARKER_PREFIX = "marker:";
export const PLAYER_START_MARKER = "marker:playerStart";
export const PLAYER_START_NAME = "Player Start";

const IDENTITY_LOCAL: Transform = { p: [0, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] };

/** One `instances` entry of a Forge level: an asset id and its placements. */
export interface PlacementGroup {
  readonly assetId: string;
  readonly placements: readonly LayoutPlacement[];
}

export interface PlacementActorsOptions {
  /** Actor id of a placement key: the placement's `id`, else `<keyPrefix><asset id>#<index>`. */
  readonly actorId: (key: string) => ActorId;
  /** Keeps the keys of id-less placements apart when one group is split over files (cells). */
  readonly keyPrefix?: string;
  /** The World Builder stage that placed a placement (by its id), if any. */
  readonly stageOf?: (placementId: string) => string | undefined;
  /** Mesh asset of a model group; null leaves the group out (counted in `skipped`). Default: the group's asset id. */
  readonly meshAsset?: (assetId: string) => string | null;
}

export interface PlacementCounts {
  placements: number;
  placeholders: number;
  meshes: number;
  playerStarts: number;
}

export interface PlacementActors {
  readonly actors: ActorDoc[];
  readonly counts: PlacementCounts;
  /** Placements left out, by group asset id: an asset nothing resolves, a marker without a converter. */
  readonly skipped: Map<string, number>;
}

export function emptyPlacementCounts(): PlacementCounts {
  return { placements: 0, placeholders: 0, meshes: 0, playerStarts: 0 };
}

/** Actors of placement groups, in group and placement order. Throws on a `shape:` group that is no primitive. */
export function placementGroupActors(groups: readonly PlacementGroup[], options: PlacementActorsOptions): PlacementActors {
  const actors: ActorDoc[] = [];
  const counts = emptyPlacementCounts();
  const skipped = new Map<string, number>();
  const skip = (assetId: string, count: number): void => {
    if (count > 0) skipped.set(assetId, (skipped.get(assetId) ?? 0) + count);
  };
  for (const group of groups) {
    const shape = group.assetId.startsWith(SHAPE_PREFIX) ? group.assetId.slice(SHAPE_PREFIX.length) : null;
    if (shape !== null && !(SHAPE_PRIMITIVE_TYPES as readonly string[]).includes(shape)) {
      throw new Error(`placement group ${group.assetId}: not a shape primitive`);
    }
    const marker = group.assetId.startsWith(MARKER_PREFIX);
    if (marker && group.assetId !== PLAYER_START_MARKER) {
      skip(group.assetId, group.placements.length);
      continue;
    }
    const mesh = shape === null && !marker ? (options.meshAsset ? options.meshAsset(group.assetId) : group.assetId) : null;
    if (shape === null && !marker && mesh === null) {
      skip(group.assetId, group.placements.length);
      continue;
    }
    group.placements.forEach((placement, index) => {
      const ownKey = placement.id ?? `${group.assetId}#${index}`;
      const key = placement.id ?? `${options.keyPrefix ?? ""}${ownKey}`;
      if (marker) {
        actors.push(playerStartActor(options.actorId(key), placementTransform(placement)));
        counts.playerStarts += 1;
        return;
      }
      const collision = placement.collision !== false;
      const components: ComponentMap = shape !== null
        ? {
          shape: {
            type: SHAPE_TAG, parent: null, local: structuredClone(IDENTITY_LOCAL), primitive: shape,
            ...(placement.color === undefined ? {} : { color: placement.color.toLowerCase() }), collision,
          },
        }
        : { mesh: { type: STATIC_MESH_TAG, parent: null, local: structuredClone(IDENTITY_LOCAL), mesh: mesh!, collision } };
      const stage = placement.id === undefined ? undefined : options.stageOf?.(placement.id);
      if (placement.role !== undefined || stage !== undefined) {
        components.role = { type: WORLD_ROLE_TAG, role: placement.role ?? "", stage: stage ?? "" };
      }
      actors.push({
        id: options.actorId(key),
        name: placement.name ?? placement.role ?? ownKey,
        class: null,
        parent: null,
        spatiallyLoaded: placement.spatiallyLoaded !== false,
        transform: placementTransform(placement),
        components,
      });
      counts.placements += 1;
      if (shape !== null) counts.placeholders += 1;
      else counts.meshes += 1;
    });
  }
  return { actors, counts, skipped };
}

/** The Player Start: an actor of that name without components until the Player Start feature (Faz 6). */
export function playerStartActor(id: ActorId, transform: Transform): ActorDoc {
  return { id, name: PLAYER_START_NAME, class: null, parent: null, spatiallyLoaded: true, transform, components: {} };
}

/** A terrain actor in the persistent layer, at the centre of its tile grid. */
export function terrainActor(
  id: ActorId,
  name: string,
  def: Pick<WorldTerrainDef, "tileQuads" | "spacing" | "tilesX" | "tilesZ" | "origin">,
  data: AssetId,
): ActorDoc {
  return {
    id,
    name,
    class: null,
    parent: null,
    spatiallyLoaded: false,
    transform: { p: worldTerrainActorPosition(def), r: [0, 0, 0, 1], s: [1, 1, 1] },
    components: { terrain: { type: TERRAIN_TAG, parent: null, local: structuredClone(IDENTITY_LOCAL), data } },
  };
}

/** A placement's transform: Euler XYZ degrees (Forge's `rotation`, else `rotationYDeg`) as a quaternion. */
export function placementTransform(placement: LayoutPlacement): Transform {
  const [x, y, z] = placement.rotation ?? [0, placement.rotationYDeg ?? 0, 0];
  const scale = placement.scale ?? 1;
  return {
    p: [...placement.position],
    r: eulerXyzQuaternion(x, y, z),
    s: typeof scale === "number" ? [scale, scale, scale] : [...scale],
  };
}

/** Quaternion [x, y, z, w] of an XYZ-order Euler rotation in degrees (three.js order), 7 decimals. */
export function eulerXyzQuaternion(xDeg: number, yDeg: number, zDeg: number): [number, number, number, number] {
  const half = Math.PI / 360;
  const [c1, c2, c3] = [Math.cos(xDeg * half), Math.cos(yDeg * half), Math.cos(zDeg * half)];
  const [s1, s2, s3] = [Math.sin(xDeg * half), Math.sin(yDeg * half), Math.sin(zDeg * half)];
  const round = (value: number): number => {
    const rounded = Number(value.toFixed(7));
    return rounded === 0 ? 0 : rounded;
  };
  return [
    round(s1 * c2 * c3 + c1 * s2 * s3),
    round(c1 * s2 * c3 - s1 * c2 * s3),
    round(c1 * c2 * s3 + s1 * s2 * c3),
    round(c1 * c2 * c3 - s1 * s2 * s3),
  ];
}
