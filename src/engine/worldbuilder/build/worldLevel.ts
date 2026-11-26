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
 * - The ground cover's plants are `forge.landscapeFoliage` rules on it (5d step 8).
 * - The Player Start is an actor of that name without components until the
 *   Player Start feature (Faz 6).
 * - Every placement is in an Outliner folder by its role (`World/Fences`; user
 *   decision 2026-11-25): a label only, so cells stay spatial.
 * - Built into a level that exists (`keep`), its settings and scene settings
 *   actors stay (`sceneSettings.ts`); the greybox look below is then added only
 *   to a level without a sky, Sky Light or sun.
 * - Forge's greybox look (tools/world/worldBriefBuild.ts `GREYBOX_LOOK`: a sun,
 *   a sky, its Sky Light with Forge's background and ambient world settings)
 *   until the user sets light and colour in the editor; never tuned here. It
 *   goes through the importer's light and environment converters (phase 3
 *   steps 3 and 5), so it is written as Forge would have read it.
 * - Ids are derived from the level id: an actor's from its placement id, the
 *   terrain's and the recipe's asset ids from their names. A rebuild of the
 *   same level gives the same GUIDs.
 */
import type { ActorDoc, ActorId, AssetId, DataDocument, LevelDoc, LevelId, LevelSettings } from "../../../core/index.ts";
import { LEVEL_SCHEMA, LevelSettingsFields, TerrainAssetType, WorldRecipeAssetType, dataDocument } from "../../../core/index.ts";
import { environmentActors } from "../../forgeImport/environment.ts";
import { convertLandscapeFoliageRule, LANDSCAPE_FOLIAGE_TAG } from "../../forgeImport/foliage.ts";
import { stableHex } from "../../forgeImport/ids.ts";
import { forgeLightSources, lightActors } from "../../forgeImport/lights.ts";
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

/** Forge's greybox look (`GREYBOX_LOOK`), in Forge's level fields; never tuned here. */
export const WORLD_GREYBOX_LOOK = {
  worldSettings: { backgroundColor: "#a9c9df", ambientColor: "#ece6da", ambientIntensity: 1.1 },
  skyAtmosphere: { rayleigh: 1.4, turbidity: 3, mie: 0.003, mieDirectionalG: 0.8, skyLightCapture: { intensity: 0.5 } },
  lights: [{ id: "sun", type: "directional", position: [3, 9, 4], name: "Sun", rotation: [-48, 35, 0], color: "#fff4e6", intensity: 4.2, castShadow: true }],
} as const;

/**
 * A World Environment World Builder writes lets the weather drive the surface
 * (plan phase W, HK2). The greybox look has none today (the brief's season,
 * weather and hour are not written yet), so this only matters once it does.
 */
function weatherDrivesSurface(actor: ActorDoc): ActorDoc {
  if (actor.class !== null) return actor;
  const entry = Object.entries(actor.components).find(([, component]) => String(component.type).startsWith("forge.worldEnvironment@"));
  if (!entry) return actor;
  const [key, component] = entry;
  const own = (component as Record<string, unknown>).surface;
  const surface = typeof own === "object" && own !== null ? own as Record<string, unknown> : {};
  return { ...actor, components: { ...actor.components, [key]: { ...component, surface: { ...surface, weatherDrivesSurface: true } } } };
}

/** The Outliner folder of everything World Builder places. */
export const WORLD_FOLDER = "World";

/** A placement's Outliner folder, from its role (and its stage, for the props a stage owns). */
export function worldFolder(role: string, stage: string): string {
  const family = role.split(".")[0];
  const name = family === "building" || family === "open" ? "Buildings"
    : family === "structure" ? "Structures"
    : family === "vegetation" ? "Vegetation"
    : family === "marker" ? "Markers"
    : role.startsWith("prop.rock") ? "Rocks"
    : stage === "fences" || role.startsWith("prop.fence") ? "Fences"
    : family === "prop" ? "Furniture"
    : "Other";
  return `${WORLD_FOLDER}/${name}`;
}

/** Default level grid (A11). */
export const WORLD_LEVEL_CELL_SIZE = 128;

export interface WorldLevelOptions {
  levelId: LevelId;
  /** The terrain's id in the brief (`terrain.id`): its file stem and the key of its ids. */
  terrainId: string;
  cellSize?: number;
  /** What stays of the level built into (`sceneSettingsActors`); `look`: it has a sky or a sun of its own. */
  keep?: { readonly settings: LevelSettings; readonly actors: readonly ActorDoc[]; readonly look: boolean } | undefined;
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
  const { levelId, terrainId, keep } = options;
  const actorId = (key: string): ActorId => `act_${stableHex(`${levelId}/actor/${key}`)}`;
  const assetId = (key: string): AssetId => `ast_${stableHex(`${levelId}/asset/${key}`)}`;
  const terrainAsset = assetId(`terrain/${terrainId}`);
  const recipeAsset = assetId("recipe");
  const stageOf = build.recipe.generatedBy.placements;
  const terrain = terrainActor(actorId(`terrain/${terrainId}`), build.def.name, build.def, terrainAsset);
  if (terrain.class === null && build.foliage.length) {
    const rules = build.foliage.map(({ edge, stand, groundRadius, ...rule }) => ({
      ...convertLandscapeFoliageRule({ ...rule }, rule.foliageTypeId),
      ...(groundRadius ? { groundRadius } : {}),
      ...(edge ? { edge } : {}), ...(stand ? { stand: { enabled: true, ...stand } } : {}),
    }));
    terrain.components = { ...terrain.components, foliage: { type: LANDSCAPE_FOLIAGE_TAG, rules } };
  }
  const actors: ActorDoc[] = [terrain];
  if (build.playerStart) {
    actors.push(playerStartActor(actorId("playerStart"), { p: [...build.playerStart], r: [0, 0, 0, 1], s: [1, 1, 1] }));
  }
  const placed = placementGroupActors(build.groups, { actorId, stageOf: (id) => stageOf[id]?.stage });
  for (const actor of placed.actors) {
    const role = actor.class === null ? actor.components.role : undefined;
    actors.push({ ...actor, folder: worldFolder(String(role?.role ?? ""), String(role?.stage ?? "")) });
  }
  const look = structuredClone(WORLD_GREYBOX_LOOK) as unknown as Parameters<typeof environmentActors>[0];
  const built = new Set(actors.map((actor) => actor.id));
  actors.push(...(keep?.actors ?? []).filter((actor) => !built.has(actor.id)));
  if (!keep?.look) actors.push(...environmentActors(look, actorId).actors.map(weatherDrivesSurface), ...lightActors(forgeLightSources(look, []), actorId).actors);
  const { placements, placeholders, meshes } = placed.counts;

  const recipe: WorldRecipe = { ...structuredClone(build.recipe), generatedBy: { placements: {}, splines: {} } };
  return {
    level: {
      schema: LEVEL_SCHEMA,
      id: levelId,
      settings: keep ? structuredClone(keep.settings) : {
        cellSize: options.cellSize ?? WORLD_LEVEL_CELL_SIZE,
        wind: { directionDeg: 45, strength: .3, gust: .3 },
        viewDistance: LevelSettingsFields.viewDistance.default,
        loadRange: LevelSettingsFields.loadRange.default,
        landmarkDistance: LevelSettingsFields.landmarkDistance.default,
      },
      actors,
    },
    terrain: dataDocument(TerrainAssetType, terrainAsset, structuredClone(build.def) as unknown as Record<string, unknown>),
    terrainFile: `terrain/${terrainId}.terrain.json`,
    recipe: dataDocument(WorldRecipeAssetType, recipeAsset, recipe as unknown as Record<string, unknown>),
    counts: { placements, placeholders, meshes },
  };
}
