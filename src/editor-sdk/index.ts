// @forge/editor-sdk: what a game project's editor extensions import
// (architecture §4.8, A8), and what the engine's own `features/*/editor.ts`
// use. A feature's editor side default-exports `defineFeatureEditor(...)`;
// the editor host collects those files (the game never names them). It
// follows the SDK's version.

export { SDK_VERSION } from "../sdk/version.ts";
export {
  defineFeatureEditor,
  OUTLINER_TYPES,
  type ActorTypeIcon,
  type ComponentPresentation,
  type FeatureEditorDef,
  type FeatureEditorOptions,
  type OutlinerType,
} from "../editor/host/featureEditor.ts";
