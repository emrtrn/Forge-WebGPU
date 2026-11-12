/**
 * A built world as a level of the new format (architecture §4.4, A1, A11; plan
 * 2b `tools/world`, user decisions 2026-11-12). Pure: `tools/world` normalises,
 * splits into cells and writes what this returns.
 *
 * - Every placement becomes a plain actor. A `shape:<type>` group (World
 *   Builder's placeholders) gives a `forge.shape` component with the
 *   placement's colour, any other group a `forge.staticMesh` of that asset.
 *   `forge.worldRole` carries the role and the stage that placed it, which
 *   replaces `recipe.generatedBy` on disk: the written recipe's ledger is empty.
 * - The transform is the placement's: position, Euler XYZ degrees (or the
 *   legacy `rotationYDeg`) as a quaternion, uniform or per-axis scale.
 * - The terrain is an actor with `forge.terrain`, kept in the persistent layer
 *   (`spatiallyLoaded: false`, larger than a cell); its definition is a
 *   `forge.terrain` data document with the tiles and global map as parts.
 * - The Player Start is an actor of that name without components until the
 *   Player Start feature (Faz 6).
 * - Ids are derived from the level id: an actor's from its placement id, the
 *   terrain's and the recipe's asset ids from their names. A rebuild of the
 *   same level gives the same GUIDs.
 *
 * Engine code cannot import a feature (layers), so the component type tags
 * are written here as text; `tools/world` normalises them against the
 * registry, which refuses an unknown one.
 */
import type { ActorDoc, ActorId, AssetId, ComponentMap, DataDocument, LevelDoc, LevelId, Transform } from "../../../core/index.ts";
import { LEVEL_SCHEMA, TerrainAssetType, WorldRecipeAssetType, dataDocument } from "../../../core/index.ts";
import type { LayoutPlacement } from "../../legacy/layout.ts";
import { SHAPE_PRIMITIVE_TYPES } from "../../legacy/shapes.ts";
import { worldTerrainActorPosition } from "../../terrain/worldTerrainActor.ts";
import type { WorldRecipe } from "../recipe.ts";
import type { WorldBuild } from "./worldBuild.ts";

export const STATIC_MESH_TAG = "forge.staticMesh@1";
export const SHAPE_TAG = "forge.shape@1";
export const WORLD_ROLE_TAG = "forge.worldRole@1";
export const TERRAIN_TAG = "forge.terrain@1";
/** Default level grid (A11). */
export const WORLD_LEVEL_CELL_SIZE = 128;

const SHAPE_PREFIX = "shape:";
const IDENTITY_LOCAL: Transform = { p: [0, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] };

export interface WorldLevelOptions {
  levelId: LevelId;
  /** The terrain's id in the brief (`terrain.id`): its file stem and the key of its ids. */
  terrainId: string;
  cellSize?: number;
}

export interface WorldLevel {
  /** Every actor; `tools/world` splits it into the persistent layer and cells. */
  level: LevelDoc;
  terrain: DataDocument;
  /** File of the terrain definition, relative to the level folder; its parts sit beside it. */
  terrainFile: string;
  /** The recipe without its `generatedBy` ledger. */
  recipe: DataDocument;
  counts: { placements: number; placeholders: number; meshes: number };
}

export function worldLevel(build: WorldBuild, options: WorldLevelOptions): WorldLevel {
  const { levelId, terrainId } = options;
  const actorId = (key: string): ActorId => `act_${stableHex(`${levelId}/actor/${key}`)}`;
  const assetId = (key: string): AssetId => `ast_${stableHex(`${levelId}/asset/${key}`)}`;
  const terrainAsset = assetId(`terrain/${terrainId}`);
  const recipeAsset = assetId("recipe");
  const stageOf = build.recipe.generatedBy.placements;
  const actors: ActorDoc[] = [];
  const counts = { placements: 0, placeholders: 0, meshes: 0 };

  actors.push({
    id: actorId(`terrain/${terrainId}`),
    name: build.def.name,
    class: null,
    parent: null,
    spatiallyLoaded: false,
    transform: { p: worldTerrainActorPosition(build.def), r: [0, 0, 0, 1], s: [1, 1, 1] },
    components: { terrain: { type: TERRAIN_TAG, parent: null, local: structuredClone(IDENTITY_LOCAL), data: terrainAsset } },
  });
  if (build.playerStart) {
    actors.push({
      id: actorId("playerStart"),
      name: "Player Start",
      class: null,
      parent: null,
      spatiallyLoaded: true,
      transform: { p: [...build.playerStart], r: [0, 0, 0, 1], s: [1, 1, 1] },
      components: {},
    });
  }

  for (const group of build.groups) {
    const shape = group.assetId.startsWith(SHAPE_PREFIX) ? group.assetId.slice(SHAPE_PREFIX.length) : null;
    if (shape !== null && !(SHAPE_PRIMITIVE_TYPES as readonly string[]).includes(shape)) {
      throw new Error(`placement group ${group.assetId}: not a shape primitive`);
    }
    group.placements.forEach((placement, index) => {
      const key = placement.id ?? `${group.assetId}#${index}`;
      const collision = placement.collision !== false;
      const components: ComponentMap = shape !== null
        ? {
          shape: {
            type: SHAPE_TAG, parent: null, local: structuredClone(IDENTITY_LOCAL), primitive: shape,
            ...(placement.color === undefined ? {} : { color: placement.color.toLowerCase() }), collision,
          },
        }
        : { mesh: { type: STATIC_MESH_TAG, parent: null, local: structuredClone(IDENTITY_LOCAL), mesh: group.assetId, collision } };
      const stage = placement.id === undefined ? undefined : stageOf[placement.id]?.stage;
      if (placement.role !== undefined || stage !== undefined) {
        components.role = { type: WORLD_ROLE_TAG, role: placement.role ?? "", stage: stage ?? "" };
      }
      actors.push({
        id: actorId(key),
        name: placement.name ?? placement.role ?? key,
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

  const recipe: WorldRecipe = { ...structuredClone(build.recipe), generatedBy: { placements: {}, splines: {} } };
  return {
    level: {
      schema: LEVEL_SCHEMA,
      id: levelId,
      settings: { cellSize: options.cellSize ?? WORLD_LEVEL_CELL_SIZE },
      actors,
    },
    terrain: dataDocument(TerrainAssetType, terrainAsset, structuredClone(build.def) as unknown as Record<string, unknown>),
    terrainFile: `terrain/${terrainId}.terrain.json`,
    recipe: dataDocument(WorldRecipeAssetType, recipeAsset, recipe as unknown as Record<string, unknown>),
    counts,
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

/** 32 hex digits from text: four FNV-1a hashes of differently salted copies. Stable, not random. */
export function stableHex(text: string): string {
  let hex = "";
  for (let round = 0; round < 4; round += 1) {
    let hash = 0x811c9dc5 ^ Math.imul(round + 1, 0x9e3779b1);
    const salted = `${round}:${text}`;
    for (let index = 0; index < salted.length; index += 1) {
      hash = Math.imul(hash ^ salted.charCodeAt(index), 0x01000193);
    }
    hash ^= hash >>> 15;
    hash = Math.imul(hash, 0x2c1b3c6d);
    hash ^= hash >>> 12;
    hex += (hash >>> 0).toString(16).padStart(8, "0");
  }
  return hex;
}
