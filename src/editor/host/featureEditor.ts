// A feature's editor side (architecture §4.3, plan phase 4 step 5):
// `features/<name>/editor.ts` default-exports `defineFeatureEditor({ ... })`.
// The editor host collects those files itself (`feature.ts` never names them,
// a layer rule), so the game build never carries them. Games get the same
// function from `@forge/editor-sdk`.
//
// What a feature tells the editor (step 5a): how its components show in the
// Outliner, Forge's actor-type icon and the Outliner's type filter group
// (`outlinerPanel.ts` @ forge-webgl-final, OUTLINER_FILTER_TYPES). An actor
// shows as the first of its components the editor knows; one it does not know
// shows as a generic actor.

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

export interface FeatureEditorDef {
  readonly kind: "featureEditor";
  /** The feature this belongs to (its `defineFeature` id). */
  readonly feature: string;
  /** Component name (`forge.light`) -> how it shows. */
  readonly components: Readonly<Record<string, ComponentPresentation>>;
}

export interface FeatureEditorOptions {
  readonly feature: string;
  readonly components?: Readonly<Record<string, ComponentPresentation>>;
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
  return Object.freeze({ kind: "featureEditor", feature: options.feature, components: Object.freeze(components) });
}
