// @forge/editor-sdk: what a game project's editor extensions import
// (architecture §4.8, A8), and what the engine's own `features/*/editor.ts`
// use. A feature's editor side default-exports `defineFeatureEditor(...)`;
// the editor host collects those files (the game never names them). It
// follows the SDK's version.

export { SDK_VERSION } from "../sdk/version.ts";
export {
  ADD_ACTOR_CATEGORIES,
  defineFeatureEditor,
  OUTLINER_TYPES,
  type ActorTypeIcon,
  type AddActorEntry,
  type ComponentPresentation,
  type DetailsExtension,
  type DetailsExtensionContext,
  type FeatureEditorDef,
  type FeatureEditorOptions,
  type NewAssetTemplate,
  type OutlinerType,
} from "../editor/host/featureEditor.ts";
