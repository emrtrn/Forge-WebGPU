// Subsystems: the runtime behaviour of features (architecture §4.3, §4.7;
// application shell decisions 1A–1C).
//
// Components are data; subsystems act on them. A feature lists its
// subsystems in `defineFeature({ subsystems })`; the world (src/runtime)
// creates them and drives one lifecycle:
//
//   create (init) -> actorsAdded* -> beginPlay -> tick* / actorsAdded* /
//   actorsRemoved* -> endPlay -> dispose
//
// Actors from the level and actors spawned during play arrive through the
// same `actorsAdded`, in batches (a level, a cell, a spawn) (F11). There is
// no per-actor callback in core.
//
// Each tick runs the groups in order; inside a group, subsystems run in the
// order their features were installed. Only the groups a subsystem lists
// call its `tick`.
//
// This file is the contract only. The world that honours it is in
// src/runtime; a feature's runtime.ts needs nothing but core.

import type { ActorId } from "../id.ts";
import type { ComponentMap, ComponentRecord } from "../level/model.ts";
import { COMPONENT_NAME_PATTERN } from "../schema/component.ts";
import { SchemaDefinitionError, type Transform } from "../schema/fields.ts";
import type { Services } from "./services.ts";

export const TICK_GROUPS = ["prePhysics", "physics", "postPhysics", "renderSync"] as const;
export type TickGroup = (typeof TICK_GROUPS)[number];

export type WorldState = "created" | "initialized" | "playing" | "ended" | "disposed";

/** Why play ended. */
export type EndPlayReason = "stopped" | "error";

/** An actor as the running world holds it. Transform and component data are the world's own copies. */
export interface WorldActor {
  readonly id: ActorId;
  readonly name: string;
  readonly parent: ActorId | null;
  /** Relative to the parent actor; the level root when there is none. */
  transform: Transform;
  /** Effective components: the class's with the overrides applied, or the actor's own. */
  readonly components: ComponentMap;
  /** From the level (or a loaded cell), or spawned at runtime. */
  readonly origin: "level" | "spawned";
}

export interface ComponentEntry {
  readonly actor: WorldActor;
  /** The component's local id in the actor. */
  readonly key: string;
  readonly component: ComponentRecord;
}

/** What a subsystem sees of its world. */
export interface SubsystemContext {
  readonly state: WorldState;
  readonly services: Services;
  actor(id: ActorId): WorldActor | undefined;
  actors(): Iterable<WorldActor>;
  /** Every component of a type (by name, e.g. `forge.heightFog`), in actor order. */
  componentsOf(type: string): ComponentEntry[];
  /**
   * Adds actors at runtime. Each is an actor document (normalised like a
   * level's actors); they reach every subsystem through `actorsAdded`.
   */
  spawnActors(actors: readonly unknown[]): WorldActor[];
  /** Removes actors and their child actors; subsystems hear `actorsRemoved`. */
  destroyActors(ids: readonly ActorId[]): void;
}

export interface SubsystemInstance {
  actorsAdded?(actors: readonly WorldActor[]): void;
  actorsRemoved?(actors: readonly WorldActor[]): void;
  beginPlay?(): void;
  tick?(group: TickGroup, dt: number): void;
  endPlay?(reason: EndPlayReason): void;
  dispose?(): void;
}

export interface SubsystemDef {
  readonly kind: "subsystem";
  /** Namespaced, e.g. `forge.heightFog`. */
  readonly id: string;
  /** The groups whose tick calls this subsystem. */
  readonly tickGroups: readonly TickGroup[];
  /** Init: called once when the world is initialised. */
  readonly create: (ctx: SubsystemContext) => SubsystemInstance;
}

export function defineSubsystem(definition: {
  readonly id: string;
  readonly tickGroups?: readonly TickGroup[];
  readonly create: (ctx: SubsystemContext) => SubsystemInstance;
}): SubsystemDef {
  if (!COMPONENT_NAME_PATTERN.test(definition.id)) {
    throw new SchemaDefinitionError(`defineSubsystem: "${definition.id}" must be a namespaced id such as "forge.heightFog".`);
  }
  const tickGroups = [...(definition.tickGroups ?? [])];
  for (const group of tickGroups) {
    if (!(TICK_GROUPS as readonly string[]).includes(group)) {
      throw new SchemaDefinitionError(`defineSubsystem ${definition.id}: unknown tick group "${group}".`);
    }
  }
  if (new Set(tickGroups).size !== tickGroups.length) {
    throw new SchemaDefinitionError(`defineSubsystem ${definition.id}: a tick group is listed twice.`);
  }
  return Object.freeze({ kind: "subsystem", id: definition.id, tickGroups: Object.freeze(tickGroups), create: definition.create });
}
