/**
 * Where each Forge WebGL level field goes (plan 2b importer, user decisions
 * 2026-11-12). A field the importer converts is listed in a `CONVERTED_*`
 * set; every other field is reported per level as "not converted: field ->
 * phase" and gains its converter in that phase, when the importer runs again.
 * A field in neither table is reported with phase `?`, so nothing is dropped
 * without a line in the report.
 *
 * Phases: 3 render (light, sky, post process, WES, materials), 4 editor,
 * 5a terrain surface, 5b streaming, 5c foliage, 6 gameplay runtime (collider,
 * splines, prefab instances, vehicles), 7 water and reflections, 8 fracture.
 * `-` is not ported (K12 or a model decision), with the reason.
 */

/** Level (and cell) fields the importer converts. */
export const CONVERTED_LEVEL_FIELDS: ReadonlySet<string> = new Set([
  "schema", "name", "type", "grid", "key", "instances", "worldCells", "landscapes", "heightFog",
]);

export const LEVEL_FIELD_PHASES: Readonly<Record<string, string>> = {
  worldSettings: "3",
  skyAtmosphere: "3",
  lights: "3",
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

/** Placement fields the importer converts (`placements.ts`). `color` only on a shape. */
export const CONVERTED_PLACEMENT_FIELDS: ReadonlySet<string> = new Set([
  "id", "role", "name", "position", "rotation", "rotationYDeg", "scale", "collision", "spatiallyLoaded",
]);

export const PLACEMENT_FIELD_PHASES: Readonly<Record<string, string>> = {
  color: "3",
  materialSlot: "3",
  castShadow: "3",
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

/** Landscape fields the importer converts: the definition places the terrain (Forge's rule). */
export const CONVERTED_LANDSCAPE_FIELDS: ReadonlySet<string> = new Set(["id", "name", "position", "rotation", "dataRef"]);

export const LANDSCAPE_FIELD_PHASES: Readonly<Record<string, string>> = {
  material: "3",
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
