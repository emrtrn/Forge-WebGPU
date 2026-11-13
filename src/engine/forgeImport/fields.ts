/**
 * Where each Forge WebGL level field goes (plan 2b importer, user decisions
 * 2026-11-12). A field the importer converts is listed in a `CONVERTED_*`
 * set; every other field is reported per level as "not converted: field ->
 * phase" and gains its converter in that phase, when the importer runs again.
 * A field in neither table is reported with phase `?`, so nothing is dropped
 * without a line in the report.
 *
 * Lights have their own table (`lights.ts`).
 *
 * Phases: 3 render (light, sky, post process, WES, materials), 4 editor,
 * 5a terrain surface, 5b streaming, 5c foliage, 6 gameplay runtime (collider,
 * splines, prefab instances, vehicles), 7 water and reflections, 8 fracture.
 * `-` is not ported (K12 or a model decision), with the reason.
 */

/** Level (and cell) fields the importer converts. */
export const CONVERTED_LEVEL_FIELDS: ReadonlySet<string> = new Set([
  "schema", "name", "type", "grid", "key", "instances", "worldCells", "landscapes", "heightFog", "lights",
]);

export const LEVEL_FIELD_PHASES: Readonly<Record<string, string>> = {
  skyAtmosphere: "3",
  cloudLayer: "3",
  postProcess: "3",
  worldEnvironment: "3",
  reflection: "3",
  puddleWaters: "5a",
  blockingVolumes: "6",
  aiNavigationVolumes: "6",
  targetPoints: "6",
  splines: "6",
  actors: "6",
  characters: "6",
  worldWidgets: "6",
  reflectionPlanes: "7",
  reflectiveSurfaces: "7",
  riverWaters: "7",
  waterBodies: "7",
  oceanWaters: "7",
  reflectionCaptures: "- (sphere reflection capture taşınmaz, INV-D12)",
  loadGroups: "- (asset ön yükleme grupları; başvurular GUID)",
};

/**
 * `worldSettings` fields the importer converts: the main grid's cell size
 * (`partition`), and the static shadow switch, resolved into every
 * placement's `castShadow` (user decision 2026-11-13). Each other field is
 * reported on its own (`worldSettings.<field>`), with the phase of the
 * singleton that takes it (phase 3 decision 7).
 */
export const CONVERTED_WORLD_SETTINGS_FIELDS: ReadonlySet<string> = new Set(["partition", "staticObjectsCastShadow"]);

export const WORLD_SETTINGS_FIELD_PHASES: Readonly<Record<string, string>> = {
  staticObjectsReceiveShadow: "- (gölge almak hep açık, kullanıcı kararı 2026-11-13)",
  backgroundColor: "3",
  ambientColor: "3",
  ambientIntensity: "3",
  viewDistance: "5b",
  wind: "5c",
  gravity: "6",
  killZ: "6",
  gameMode: "6",
  hudWidget: "6",
  pauseMenuWidget: "6",
  winScreenWidget: "6",
  loseScreenWidget: "6",
  gameRules: "6",
};

/** Forge's `staticObjectsCastShadow` when a level does not say (`SceneRuntimeCore` default). */
export const FORGE_STATIC_OBJECTS_CAST_SHADOW = false;

/**
 * Placement fields the importer converts (`placements.ts`): `color` (a
 * shape's colour, a mesh's tint), `castShadow` (else the level's static
 * shadow switch) and `materialSlot` (a mesh's override on every slot).
 */
export const CONVERTED_PLACEMENT_FIELDS: ReadonlySet<string> = new Set([
  "id", "role", "name", "position", "rotation", "rotationYDeg", "scale", "collision", "spatiallyLoaded",
  "color", "castShadow", "materialSlot",
]);

export const PLACEMENT_FIELD_PHASES: Readonly<Record<string, string>> = {
  hidden: "4",
  locked: "4",
  groupId: "4",
  nodeId: "4",
  parentId: "4",
  pivot: "4",
  scaleLocked: "4",
  collisionPreset: "6",
  collisionEnabled: "6",
  objectType: "6",
  responses: "6",
  physicalMaterialId: "6",
  navigationRole: "6",
  generateOverlapEvents: "6",
  simulationGeneratesHitEvents: "6",
  sensor: "6",
  simulatePhysics: "6",
  physics: "6",
  metadata: "6",
  behavior: "6",
  interaction: "6",
  particle: "6",
  fracture: "8",
  audio: "- (ses bileşeni, K12)",
  movingPlatform: "- (hareketli platform, K12)",
};

/** Landscape fields the importer converts: the definition places the terrain (Forge's rule); `material` -> `forge.terrain.material`. */
export const CONVERTED_LANDSCAPE_FIELDS: ReadonlySet<string> = new Set(["id", "name", "position", "rotation", "dataRef", "material"]);

export const LANDSCAPE_FIELD_PHASES: Readonly<Record<string, string>> = {
  collision: "6",
  hidden: "4",
  locked: "4",
  scaleLocked: "4",
  groupId: "4",
  nodeId: "4",
  parentId: "4",
};

/** Height Fog fields beside the component's own: the actor's name is converted, `hidden` is not. */
export const HEIGHT_FOG_FIELD_PHASES: Readonly<Record<string, string>> = {
  hidden: "4",
};

/** Phase of a field, `?` when no table knows it. */
export function fieldPhase(table: Readonly<Record<string, string>>, field: string): string {
  return Object.hasOwn(table, field) ? table[field]! : "?";
}
