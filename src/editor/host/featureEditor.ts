// A feature's editor side (architecture §4.3, plan phase 4 step 5):
// `features/<name>/editor.ts` default-exports `defineFeatureEditor({ ... })`.
// The editor host collects those files itself (`feature.ts` never names them,
// a layer rule), so the game build never carries them. Games get the same
// function from `@forge/editor-sdk`.
//
// What a feature tells the editor:
// - `components` (step 5a): how its components show in the Outliner, Forge's
//   actor-type icon and the Outliner's type filter group (`outlinerPanel.ts`
//   @ forge-webgl-final, OUTLINER_FILTER_TYPES). An actor shows as the first
//   of its components the editor knows; one it does not know shows as a
//   generic actor.
// - `addActor` (step 5d, architecture §4.3 `registerAddActorEntry`): its Add
//   Actor menu entries (Forge's `buildAddActorEntries`): label, category, icon
//   and the components the new actor carries (stored form; normalisation
//   fills the defaults), with Forge's placement: a rotation, a lift above the
//   surface (lights 1,5 m) or the base resting on it (meshes). An entry whose
//   component is a singleton is clicked, never dragged (Forge).

import { COMPONENT_NAME_PATTERN, SchemaDefinitionError } from "../../core/index.ts";
import { ACTOR_TYPE_ICONS, type ActorTypeIcon } from "../ui/icons.ts";

export type { ActorTypeIcon } from "../ui/icons.ts";

/** The Outliner's type filter groups, in Forge's order (OUTLINER_FILTER_TYPES). */
export const OUTLINER_TYPES = [
  { type: "mesh", label: "Meshes" },
  { type: "character", label: "Characters" },
  { type: "light", label: "Lights" },
  { type: "environment", label: "Environment" },
  { type: "volume", label: "Volumes" },
  { type: "terrain", label: "Terrain" },
  { type: "gameplay", label: "Gameplay" },
  { type: "widget", label: "Widgets" },
] as const;

export type OutlinerType = (typeof OUTLINER_TYPES)[number]["type"];

/** How actors carrying a component show in the editor. */
export interface ComponentPresentation {
  /** Forge's actor-type icon; a function picks it from the component's fields (a shape's primitive). */
  readonly icon: ActorTypeIcon | ((data: Readonly<Record<string, unknown>>) => ActorTypeIcon);
  /** The Outliner's type filter group. */
  readonly outliner: OutlinerType;
}

/** Forge's Add Actor categories, in its order; a game's own categories come after them. */
export const ADD_ACTOR_CATEGORIES = [
  { label: "Lights", icon: "light" },
  { label: "Shapes", icon: "shape" },
  { label: "Volumes", icon: "volume" },
  { label: "Visual Effects", icon: "reflection" },
  { label: "Terrain", icon: "terrain" },
  { label: "Sounds", icon: "sound" },
  { label: "UI", icon: "widget" },
  { label: "Gameplay", icon: "gameplay" },
  { label: "Vehicles", icon: "vehicle" },
] as const satisfies readonly { readonly label: string; readonly icon: ActorTypeIcon }[];

/** One placeable actor in the Add Actor menu. */
export interface AddActorEntry {
  /** Unique across the editor, e.g. `forge.light:point`. */
  readonly key: string;
  /** English; also the new actor's name. */
  readonly label: string;
  readonly category: string;
  readonly icon: ActorTypeIcon;
  /** Local id -> stored component (`type` tag and any fields that differ from the defaults). */
  readonly components: Readonly<Record<string, Readonly<{ type: string } & Record<string, unknown>>>>;
  /** XYZ degrees (Forge's lights: -55, 35, 0). */
  readonly rotation?: readonly [number, number, number];
  /** Metres above the surface it is dropped on (Forge's lights: 1,5). */
  readonly lift?: number;
  /** Its base rests on the surface (Forge's meshes); otherwise its origin does. */
  readonly restOnSurface?: boolean;
}

export interface FeatureEditorDef {
  readonly kind: "featureEditor";
  /** The feature this belongs to (its `defineFeature` id). */
  readonly feature: string;
  /** Component name (`forge.light`) -> how it shows. */
  readonly components: Readonly<Record<string, ComponentPresentation>>;
  readonly addActor: readonly AddActorEntry[];
}

export interface FeatureEditorOptions {
  readonly feature: string;
  readonly components?: Readonly<Record<string, ComponentPresentation>>;
  readonly addActor?: readonly AddActorEntry[];
}

const OUTLINER_TYPE_SET: ReadonlySet<string> = new Set(OUTLINER_TYPES.map((entry) => entry.type));

export function defineFeatureEditor(options: FeatureEditorOptions): FeatureEditorDef {
  if (typeof options.feature !== "string" || options.feature === "") {
    throw new SchemaDefinitionError("defineFeatureEditor: `feature` names the feature it belongs to.");
  }
  const components = { ...options.components };
  for (const [name, presentation] of Object.entries(components)) {
    const where = `defineFeatureEditor ${options.feature}: component ${name}`;
    if (!COMPONENT_NAME_PATTERN.test(name)) throw new SchemaDefinitionError(`${where} is not a namespaced component name.`);
    if (typeof presentation.icon === "string" && !Object.hasOwn(ACTOR_TYPE_ICONS, presentation.icon)) {
      throw new SchemaDefinitionError(`${where}: no icon "${presentation.icon}".`);
    }
    if (typeof presentation.icon !== "string" && typeof presentation.icon !== "function") {
      throw new SchemaDefinitionError(`${where}: the icon is an icon name or a function.`);
    }
    if (!OUTLINER_TYPE_SET.has(presentation.outliner)) {
      throw new SchemaDefinitionError(`${where}: no Outliner type "${String(presentation.outliner)}".`);
    }
  }
  const keys = new Set<string>();
  for (const entry of options.addActor ?? []) {
    const where = `defineFeatureEditor ${options.feature}: Add Actor entry ${String(entry.key)}`;
    if (typeof entry.key !== "string" || entry.key === "" || keys.has(entry.key)) throw new SchemaDefinitionError(`${where} needs a key of its own.`);
    keys.add(entry.key);
    if (typeof entry.label !== "string" || entry.label === "" || typeof entry.category !== "string" || entry.category === "") {
      throw new SchemaDefinitionError(`${where} needs a label and a category.`);
    }
    if (!Object.hasOwn(ACTOR_TYPE_ICONS, entry.icon)) throw new SchemaDefinitionError(`${where}: no icon "${entry.icon}".`);
    for (const [id, component] of Object.entries(entry.components)) {
      if (typeof component?.type !== "string" || !/@\d+$/.test(component.type)) throw new SchemaDefinitionError(`${where}: component ${id} needs its type tag (name@version).`);
    }
  }
  return Object.freeze({
    kind: "featureEditor",
    feature: options.feature,
    components: Object.freeze(components),
    addActor: Object.freeze([...(options.addActor ?? [])]),
  });
}
