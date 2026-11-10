// Game modules (architecture §4.7, §4.8). A game project hands the engine one
// module: its own features (components, asset types, subsystems) and hooks
// for the start and end of play. The host runs the hooks as one more
// subsystem, installed after every feature's, so they follow the same
// lifecycle and see the world in its final shape. Loading the module from a
// project path is the project contract's work (`@forge/sdk`, A8).

import {
  defineSubsystem,
  SchemaDefinitionError,
  COMPONENT_NAME_PATTERN,
  type EndPlayReason,
  type FeatureDef,
  type SubsystemContext,
  type SubsystemDef,
} from "../core/index.ts";

export interface GameModuleDef {
  readonly kind: "gameModule";
  /** Namespaced, e.g. `ridgebound.game`. */
  readonly id: string;
  readonly features: readonly FeatureDef[];
  readonly onBeginPlay?: (ctx: SubsystemContext) => void;
  readonly onEndPlay?: (ctx: SubsystemContext, reason: EndPlayReason) => void;
}

export function defineGameModule(module: Omit<GameModuleDef, "kind" | "features"> & { readonly features?: readonly FeatureDef[] }): GameModuleDef {
  if (!COMPONENT_NAME_PATTERN.test(module.id)) {
    throw new SchemaDefinitionError(`defineGameModule: "${module.id}" must be a namespaced id such as "mygame.main".`);
  }
  return Object.freeze({ ...module, kind: "gameModule", features: Object.freeze([...(module.features ?? [])]) });
}

/** The module's hooks as a subsystem, to install after every feature. */
export function gameModuleSubsystem(module: GameModuleDef): SubsystemDef {
  return defineSubsystem({
    id: `${module.id}.module`,
    create: (ctx) => ({
      beginPlay: () => module.onBeginPlay?.(ctx),
      endPlay: (reason) => module.onEndPlay?.(ctx, reason),
    }),
  });
}
