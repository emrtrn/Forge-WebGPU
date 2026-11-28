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
  LevelSettingsKey,
  type EndPlayReason,
  type FeatureDef,
  type SubsystemContext,
  type SubsystemDef,
} from "../core/index.ts";
import type { BehaviorDefinition } from "../engine/behavior/worldBehavior.ts";

export interface GameModeDef {
  readonly id: string;
  readonly label: string;
  /** Activates the mode after the level and its persistent actors are present. */
  create(ctx: SubsystemContext): { tick?(dt: number): void; dispose?(): void };
}

export interface GameModuleDef {
  readonly kind: "gameModule";
  /** Namespaced, e.g. `ridgebound.game`. */
  readonly id: string;
  readonly features: readonly FeatureDef[];
  readonly behaviors: readonly BehaviorDefinition[];
  readonly gameModes: readonly GameModeDef[];
  readonly onBeginPlay?: (ctx: SubsystemContext) => void;
  readonly onEndPlay?: (ctx: SubsystemContext, reason: EndPlayReason) => void;
}

export function defineGameModule(module: Omit<GameModuleDef, "kind" | "features" | "behaviors" | "gameModes"> & {
  readonly features?: readonly FeatureDef[];
  readonly behaviors?: readonly BehaviorDefinition[];
  readonly gameModes?: readonly GameModeDef[];
}): GameModuleDef {
  if (!COMPONENT_NAME_PATTERN.test(module.id)) {
    throw new SchemaDefinitionError(`defineGameModule: "${module.id}" must be a namespaced id such as "mygame.main".`);
  }
  const behaviors = [...(module.behaviors ?? [])];
  if (behaviors.some(({ id }, index) => behaviors.findIndex((entry) => entry.id === id) !== index)) {
    throw new SchemaDefinitionError(`defineGameModule: "${module.id}" registers a behavior twice.`);
  }
  const gameModes = [...(module.gameModes ?? [])];
  const ids = new Set<string>();
  for (const { id, label } of gameModes) {
    if (!COMPONENT_NAME_PATTERN.test(id) || !label.trim() || ids.has(id)) {
      throw new SchemaDefinitionError(`defineGameModule: invalid or duplicate game mode "${id}".`);
    }
    ids.add(id);
  }
  return Object.freeze({ ...module, kind: "gameModule", features: Object.freeze([...(module.features ?? [])]),
    behaviors: Object.freeze(behaviors), gameModes: Object.freeze(gameModes) });
}

/** The module's hooks as a subsystem, to install after every feature. */
export function gameModuleSubsystem(module: GameModuleDef): SubsystemDef {
  return defineSubsystem({
    id: `${module.id}.module`,
    tickGroups: ["prePhysics"],
    create(ctx) {
      let mode: ReturnType<GameModeDef["create"]> | undefined;
      return {
        beginPlay() {
          module.onBeginPlay?.(ctx);
          const id = ctx.services.require(LevelSettingsKey).current.gameMode;
          mode = module.gameModes?.find((entry) => entry.id === id)?.create(ctx);
        },
        tick(_group, dt) { mode?.tick?.(dt); },
        endPlay(reason) {
          const ending = mode;
          mode = undefined;
          try { ending?.dispose?.(); }
          finally { module.onEndPlay?.(ctx, reason); }
        },
      };
    },
  });
}
