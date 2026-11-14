// Editor helper bindings (plan phase 4 step 3, INV-G27; phase 4 decision 1):
// what a feature draws only in the editor (a light's icon and reach, later a
// camera's frustum, a volume's brush) lives in `features/<name>/editorRender.ts`,
// which default-exports `defineEditorRenderBinding({ feature, create })`. The
// editor collects those files itself (nothing in the game names them, a layer
// rule) and hands them to its viewport, which runs them in the editor's world
// through one `forge.editorHelpers` subsystem, the way the render host runs
// render bindings:
//
// - a binding adds its objects under `ctx.root`, a group in the drawing layer
//   (drawn after the frame, unjittered, tested against the scene's depth
//   through `ctx.sceneVisibility` when it wants to be);
// - what it adds for an actor carries that actor (render/sync/pickTags.ts), so
//   a click on an icon selects it; helper hits win over the scene's, as they
//   are drawn over it;
// - `ctx.selected()` is the editor's selection (Forge shows a light's reach
//   only while it is selected);
// - edits arrive as `actorsChanged`, or as removed + added without the hook.

import { Group, type Camera, type Node } from "three/webgpu";
import { COMPONENT_NAME_PATTERN, defineFeature, defineSubsystem, SchemaDefinitionError, type ActorId, type FeatureDef, type SubsystemContext, type WorldActor, type WorldActorChange } from "../../core/index.ts";
import type { RenderWorldView } from "../sync/renderBinding.ts";
import type { ActorIcons } from "./actorIcon.ts";

export const EDITOR_HELPERS_FEATURE_ID = "forge.editorHelpers";

export interface EditorHelperContext {
  readonly world: RenderWorldView;
  /** Parent of what the binding draws: a group in the drawing layer. */
  readonly root: Group;
  /** The editor's selection now. */
  selected(): ReadonlySet<ActorId>;
  /** 1 in front of the scene's surface, 0 behind it (multiply an opacity by it). */
  readonly sceneVisibility: Node<"float">;
  /** Billboard icons (Forge's actor icons), shared per glyph. */
  readonly icons: ActorIcons;
}

export interface EditorHelperFrame {
  readonly camera: Camera | null;
}

export interface EditorHelperInstance {
  actorsAdded?(actors: readonly WorldActor[]): void;
  actorsRemoved?(actors: readonly WorldActor[]): void;
  actorsChanged?(changes: readonly WorldActorChange[]): void;
  /** Once per frame, in the world's `renderSync` group. */
  sync?(frame: EditorHelperFrame): void;
  dispose?(): void;
}

export interface EditorRenderBindingDef {
  readonly kind: "editorRenderBinding";
  readonly feature: string;
  readonly create: (ctx: EditorHelperContext) => EditorHelperInstance;
}

export function defineEditorRenderBinding(definition: {
  readonly feature: string;
  readonly create: (ctx: EditorHelperContext) => EditorHelperInstance;
}): EditorRenderBindingDef {
  if (!COMPONENT_NAME_PATTERN.test(definition.feature)) {
    throw new SchemaDefinitionError(`defineEditorRenderBinding: "${definition.feature}" must be a feature id such as "forge.light".`);
  }
  return Object.freeze({ kind: "editorRenderBinding", feature: definition.feature, create: definition.create });
}

export interface EditorHelpersOptions {
  readonly bindings: readonly EditorRenderBindingDef[];
  /** The world's features: a binding runs only when its feature is installed. */
  readonly features: readonly FeatureDef[];
  readonly root: Group;
  readonly selected: () => ReadonlySet<ActorId>;
  readonly sceneVisibility: Node<"float">;
  readonly icons: ActorIcons;
  readonly camera: () => Camera | null;
}

/** The `forge.editorHelpers` feature: runs the editor bindings in the editor's world. */
export function createEditorHelpersFeature(options: EditorHelpersOptions): FeatureDef {
  const installed = new Set(options.features.map((feature) => feature.id));
  const bindings = options.bindings.filter((binding) => installed.has(binding.feature));
  const subsystem = defineSubsystem({
    id: EDITOR_HELPERS_FEATURE_ID,
    tickGroups: ["renderSync"],
    inEditor: true,
    create(ctx: SubsystemContext) {
      const view: RenderWorldView = { services: ctx.services, actor: (id) => ctx.actor(id), componentsOf: (type) => ctx.componentsOf(type) };
      const group = new Group();
      group.name = "editor helpers";
      options.root.add(group);
      const instances = bindings.map((binding) => binding.create({ world: view, root: group, selected: options.selected, sceneVisibility: options.sceneVisibility, icons: options.icons }));
      return {
        actorsAdded(actors) {
          for (const instance of instances) instance.actorsAdded?.(actors);
        },
        actorsRemoved(actors) {
          for (const instance of instances) instance.actorsRemoved?.(actors);
        },
        actorsChanged(changes) {
          for (const instance of instances) {
            if (instance.actorsChanged) instance.actorsChanged(changes);
            else {
              instance.actorsRemoved?.(changes.map((change) => change.previous));
              instance.actorsAdded?.(changes.map((change) => change.actor));
            }
          }
        },
        tick() {
          const frame = { camera: options.camera() };
          for (const instance of instances) instance.sync?.(frame);
        },
        dispose() {
          for (const instance of [...instances].reverse()) instance.dispose?.();
          instances.length = 0;
          group.removeFromParent();
          group.clear();
        },
      };
    },
  });
  return defineFeature({ id: EDITOR_HELPERS_FEATURE_ID, subsystems: [subsystem] });
}
