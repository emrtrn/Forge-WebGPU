// What the Content Browser's New menu creates (plan phase 4 step 6d; Forge
// WebGL's CONTENT_NEW_ITEMS and createDefaultLevel @ forge-webgl-final; user
// decisions 2026-11-14):
// - Level: Forge's default level, built from the features' Add Actor entries
//   (the editor names entries, never components): the environment's
//   singletons, the sun (a directional light marked `atmosphereSun`, casting
//   cascaded shadows), a 4 m floor and a 1 m cube on it. An entry that is not
//   there (a feature left out) is skipped.
// - Actor Class: an empty class (components are added in its editor, step 7).
// - every registered JSON asset type (materials, a game's data assets, A13):
//   its defaults, or one of the templates its feature's editor offers
//   (`defineFeatureEditor({ newAssets })`, Forge's material presets).
// Forge's Particle, Script, Sound Cue, Dialogue, UI and AI items are not here
// (K12; particles and UI come with their phases).

import { createId, isJsonAssetType, type SchemaRegistry, type Vec3 } from "../../core/index.ts";
import { eulerDegreesToQuaternion } from "../../engine/math/euler.ts";
import type { AddActorEntry, FeatureEditorDef, NewAssetTemplate } from "../host/featureEditor.ts";

export interface NewAssetItem {
  readonly kind: "level" | "actorClass" | "asset";
  /** Menu label (`Level`, `Material`). */
  readonly label: string;
  /** A JSON asset's type. */
  readonly type?: string;
  readonly templates: readonly NewAssetTemplate[];
}

/** Level, Actor Class, then the JSON asset types by label. */
export function newAssetItems(registry: SchemaRegistry, editors: readonly FeatureEditorDef[]): NewAssetItem[] {
  const templates = editors.flatMap((editor) => editor.newAssets);
  const json = registry
    .assetTypes()
    .filter(isJsonAssetType)
    .map((def): NewAssetItem => ({ kind: "asset", label: def.label, type: def.name, templates: templates.filter((template) => template.type === def.name) }))
    .sort((a, b) => a.label.localeCompare(b.label));
  return [{ kind: "level", label: "Level", templates: [] }, { kind: "actorClass", label: "Actor Class", templates: [] }, ...json];
}

interface TemplateActor {
  readonly entry: string;
  readonly name?: string;
  readonly position?: Vec3;
  readonly scale?: Vec3;
  /** Component id -> fields over the entry's. */
  readonly fields?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
}

/** Environment tuned in content/levels/test (2026-11-16), plus Forge's floor and cube.
 * Only new levels use these overrides; schema defaults also serve existing levels.
 */
export const NEW_LEVEL_TEMPLATE: readonly TemplateActor[] = [
  { entry: "forge.sky:atmosphere", fields: { sky: { rayleigh: 1, turbidity: 2, mie: 0.002, mieDirectionalG: 0.7 } } },
  { entry: "forge.sky:light" },
  { entry: "forge.heightFog" },
  { entry: "forge.cloudLayer", fields: { clouds: { coverage: 0.4, density: 0.4, scale: 8, speed: 0.2 } } },
  { entry: "forge.worldEnvironment", fields: { environment: { hour: 9, surface: { weatherDrivesSurface: true } } } },
  { entry: "forge.postProcess", fields: { post: { antialias: "smaa", bloom: { enabled: true, threshold: 1, intensity: 1, radius: 1 }, ao: { enabled: true, radius: 1, intensity: 1 } } } },
  { entry: "forge.light:directional", name: "Sun", position: [3, 9, 4], fields: { light: { atmosphereSun: true, castShadow: true, cascadedShadows: true } } },
  { entry: "forge.shape:plane", name: "Floor", scale: [4, 1, 4] },
  // Shape solids are 0,5 m: scale 2 is Forge's 1 m cube, resting on the floor.
  { entry: "forge.shape:cube", name: "Cube", position: [0, 0.5, 0], scale: [2, 2, 2] },
];

/** The new level's actors in stored form (the save's check normalises them). */
export function newLevelActors(entries: readonly AddActorEntry[], newId: () => string = () => createId("actor")): unknown[] {
  const byKey = new Map(entries.map((entry) => [entry.key, entry]));
  const actors: unknown[] = [];
  for (const template of NEW_LEVEL_TEMPLATE) {
    const entry = byKey.get(template.entry);
    if (!entry) continue;
    const components: Record<string, unknown> = {};
    for (const [id, component] of Object.entries(entry.components)) components[id] = { ...component, ...template.fields?.[id] };
    actors.push({
      id: newId(),
      name: template.name ?? entry.label,
      class: null,
      parent: null,
      spatiallyLoaded: false,
      transform: { p: template.position ?? [0, 0, 0], r: eulerDegreesToQuaternion(entry.rotation ?? [0, 0, 0]), s: template.scale ?? [1, 1, 1] },
      components,
    });
  }
  return actors;
}
