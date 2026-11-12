/**
 * A built world as a level of the new format (architecture §4.4, A1, A11; plan
 * 2b `tools/world`, user decisions 2026-11-12). Pure: `tools/world` normalises,
 * splits into cells and writes what this returns.
 *
 * - Placements become actors through the converter World Builder shares with
 *   the Forge WebGL importer (`src/engine/forgeImport/placements.ts`):
 *   `forge.shape` / `forge.staticMesh` + `forge.worldRole`, whose stage
 *   replaces `recipe.generatedBy` on disk: the written recipe's ledger is empty.
 * - The terrain is an actor with `forge.terrain` in the persistent layer; its
 *   definition is a `forge.terrain` data document with the tiles and global
 *   map as parts.
 * - The Player Start is an actor of that name without components until the
 *   Player Start feature (Faz 6).
 * - Ids are derived from the level id: an actor's from its placement id, the
 *   terrain's and the recipe's asset ids from their names. A rebuild of the
 *   same level gives the same GUIDs.
 */
import type { ActorDoc, ActorId, AssetId, DataDocument, LevelDoc, LevelId } from "../../../core/index.ts";
import { LEVEL_SCHEMA, TerrainAssetType, WorldRecipeAssetType, dataDocument } from "../../../core/index.ts";
import { stableHex } from "../../forgeImport/ids.ts";
import { placementGroupActors, playerStartActor, terrainActor } from "../../forgeImport/placements.ts";
import type { WorldRecipe } from "../recipe.ts";
import type { WorldBuild } from "./worldBuild.ts";

export { stableHex } from "../../forgeImport/ids.ts";
export {
  eulerXyzQuaternion,
  placementTransform,
  SHAPE_TAG,
  STATIC_MESH_TAG,
  TERRAIN_TAG,
  WORLD_ROLE_TAG,
} from "../../forgeImport/placements.ts";

/** Default level grid (A11). */
export const WORLD_LEVEL_CELL_SIZE = 128;

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
  const actors: ActorDoc[] = [terrainActor(actorId(`terrain/${terrainId}`), build.def.name, build.def, terrainAsset)];
  if (build.playerStart) {
    actors.push(playerStartActor(actorId("playerStart"), { p: [...build.playerStart], r: [0, 0, 0, 1], s: [1, 1, 1] }));
  }
  const placed = placementGroupActors(build.groups, { actorId, stageOf: (id) => stageOf[id]?.stage });
  actors.push(...placed.actors);
  const { placements, placeholders, meshes } = placed.counts;

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
    counts: { placements, placeholders, meshes },
  };
}
