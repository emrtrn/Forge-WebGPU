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
// - `details` (step 5e, user decision 2026-11-14): what a component's Details
//   section shows below its schema form where Forge had more than fields (a
//   preset button, a preview strip). It builds DOM with the context's
//   document; its edits go through `edit` (one undo step on every selected
//   actor), a preview through the editor world's services, never the level.
// - `newAssets` (step 6d, user decision 2026-11-14): starting points the
//   Content Browser's New menu offers for a JSON asset type the feature
//   defines (Forge's material presets): a label and the fields that differ
//   from the type's defaults. A JSON asset type without one is created from
//   its defaults; the template is not stored in the asset.
// - `assets` (step 6f, user decision 2026-11-14): what an asset of a type
//   dragged from the Content Browser into the viewport does: `place` makes
//   a new actor where it is dropped (a model -> a static mesh), `assign`
//   writes it into a component of the actor it is dropped on (a material ->
//   the static mesh slot under the pointer). Forge did both in its shell.

import { COMPONENT_NAME_PATTERN, SchemaDefinitionError, type ActorId, type ServiceKey } from "../../core/index.ts";
import { ACTOR_TYPE_ICONS, type ActorTypeIcon } from "../ui/icons.ts";
import type { AssetEditorPresentation } from "./assetEditorTypes.ts";

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
  /**
   * `tool` (Forge's Landscape): the actor's Details are this component's
   * Details extension, the other components, and this component's own fields
   * last in a closed section. No name, Class row, transform, pivot, placement,
   * Remove, Advanced or Add Component: the actor is placed by its data, not its
   * transform. `embedded`: on a tool actor this component has no section of its
   * own; the tool's extension edits it.
   */
  readonly details?: "tool" | "embedded";
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

/** What a component's Details extension works with. */
export interface DetailsExtensionContext {
  readonly document: Document;
  /** The component's fields as the primary selected actor has them (a class actor's effective values). */
  value(): Readonly<Record<string, unknown>>;
  /** Writes these top-level fields into the component of every selected actor: one undo step. */
  edit(label: string, fields: Readonly<Record<string, unknown>>): void;
  /** The primary selected actor and this component's key in it; null when none. */
  target(): { readonly actor: ActorId; readonly key: string } | null;
  /** A service of the editor's world (what the viewport shows); undefined when absent. */
  service<T>(key: ServiceKey<T>): T | undefined;
  /** Every editor frame with its seconds; returns the unsubscribe. Dropped when the section goes. */
  onFrame(listener: (dt: number) => void): () => void;
  status(message: string, tone?: "info" | "warning" | "error"): void;
}

/** A starting point for a new asset of a JSON asset type (the Content Browser's New menu). */
export interface NewAssetTemplate {
  /** The JSON asset type, e.g. `forge.material`. */
  readonly type: string;
  /** English, shown in the picker (`Metal`). */
  readonly label: string;
  /** A line under the label. */
  readonly description?: string;
  /** Fields that differ from the type's defaults. */
  readonly values: Readonly<Record<string, unknown>>;
}

/** An asset dragged from the Content Browser. */
export interface DroppedAsset {
  readonly guid: string;
  /** Its name (the file's up to the first dot): a new actor's name. */
  readonly name: string;
}

/** The actor an asset makes where it is dropped, placed like an Add Actor entry. */
export interface AssetPlacement {
  readonly components: AddActorEntry["components"];
  readonly icon?: ActorTypeIcon;
  readonly rotation?: readonly [number, number, number];
  readonly lift?: number;
  readonly restOnSurface?: boolean;
}

/** What an asset type does when dragged into the viewport. */
export interface AssetDropRule {
  readonly assetType: string;
  /** Dropped where no actor takes it: a new actor. */
  readonly place?: (asset: DroppedAsset) => AssetPlacement;
  /**
   * Dropped on an actor carrying `component`: the fields to write in it (one
   * undo step), null when it does not take this one. `slot` is the model
   * material slot under the pointer, when the renderer knows one.
   */
  readonly assign?: {
    readonly component: string;
    readonly fields: (data: Readonly<Record<string, unknown>>, asset: DroppedAsset, hit: { readonly slot: number | null }) => Readonly<Record<string, unknown>> | null;
  };
}

/** Builds what goes below a component's form; `dispose` runs when Details draws again. */
export type DetailsExtension = (context: DetailsExtensionContext) => { readonly element: HTMLElement; dispose?(): void };

export interface FeatureEditorDef {
  readonly kind: "featureEditor";
  /** The feature this belongs to (its `defineFeature` id). */
  readonly feature: string;
  /** Component name (`forge.light`) -> how it shows. */
  readonly components: Readonly<Record<string, ComponentPresentation>>;
  readonly addActor: readonly AddActorEntry[];
  /** Component name -> its Details extension. */
  readonly details: Readonly<Record<string, DetailsExtension>>;
  /** New asset templates of its JSON asset types, in menu order. */
  readonly newAssets: readonly NewAssetTemplate[];
  /** What its asset types do when dragged into the viewport. */
  readonly assets: readonly AssetDropRule[];
  readonly assetEditors: readonly AssetEditorPresentation[];
}

export interface FeatureEditorOptions {
  readonly feature: string;
  readonly components?: Readonly<Record<string, ComponentPresentation>>;
  readonly addActor?: readonly AddActorEntry[];
  readonly details?: Readonly<Record<string, DetailsExtension>>;
  readonly newAssets?: readonly NewAssetTemplate[];
  readonly assets?: readonly AssetDropRule[];
  readonly assetEditors?: readonly AssetEditorPresentation[];
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
    if (presentation.details !== undefined && presentation.details !== "tool" && presentation.details !== "embedded") {
      throw new SchemaDefinitionError(`${where}: no Details layout "${String(presentation.details)}".`);
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
  const details = { ...options.details };
  for (const [name, extension] of Object.entries(details)) {
    const where = `defineFeatureEditor ${options.feature}: Details of ${name}`;
    if (!COMPONENT_NAME_PATTERN.test(name)) throw new SchemaDefinitionError(`${where}: not a namespaced component name.`);
    if (typeof extension !== "function") throw new SchemaDefinitionError(`${where} is a function of its context.`);
  }
  for (const template of options.newAssets ?? []) {
    const where = `defineFeatureEditor ${options.feature}: new asset template ${String(template.label)}`;
    if (typeof template.type !== "string" || !COMPONENT_NAME_PATTERN.test(template.type)) throw new SchemaDefinitionError(`${where} names a namespaced asset type.`);
    if (typeof template.label !== "string" || template.label === "") throw new SchemaDefinitionError(`${where} needs a label.`);
    if (template.values === null || typeof template.values !== "object" || Array.isArray(template.values)) throw new SchemaDefinitionError(`${where}: values is an object of fields.`);
  }
  for (const rule of options.assets ?? []) {
    const where = `defineFeatureEditor ${options.feature}: asset rule ${String(rule.assetType)}`;
    if (typeof rule.assetType !== "string" || !COMPONENT_NAME_PATTERN.test(rule.assetType)) throw new SchemaDefinitionError(`${where} names a namespaced asset type.`);
    if (rule.place === undefined && rule.assign === undefined) throw new SchemaDefinitionError(`${where} needs place or assign.`);
    if (rule.place !== undefined && typeof rule.place !== "function") throw new SchemaDefinitionError(`${where}: place is a function of the asset.`);
    if (rule.assign !== undefined && (!COMPONENT_NAME_PATTERN.test(rule.assign.component) || typeof rule.assign.fields !== "function")) {
      throw new SchemaDefinitionError(`${where}: assign names a component and gives a function of its fields.`);
    }
  }
  for (const editor of options.assetEditors ?? []) {
    if (!COMPONENT_NAME_PATTERN.test(editor.assetType)) throw new SchemaDefinitionError("Asset editor needs a namespaced asset type.");
    if (editor.preview !== undefined && !COMPONENT_NAME_PATTERN.test(editor.preview)) throw new SchemaDefinitionError("Asset preview needs a namespaced key.");
    if (editor.tools !== undefined && typeof editor.tools !== "function") throw new SchemaDefinitionError("Asset tools must be a function.");
    if (editor.publish && (!editor.publish.label?.trim() || typeof editor.publish.run !== "function")) throw new SchemaDefinitionError("Asset publication requires a label and a callback.");
  }
  return Object.freeze({
    kind: "featureEditor",
    feature: options.feature,
    components: Object.freeze(components),
    addActor: Object.freeze([...(options.addActor ?? [])]),
    details: Object.freeze(details),
    newAssets: Object.freeze([...(options.newAssets ?? [])]),
    assets: Object.freeze([...(options.assets ?? [])]),
    assetEditors: Object.freeze([...(options.assetEditors ?? [])]),
  });
}
