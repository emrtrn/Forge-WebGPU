// Level data model, `forge.level/1` (architecture §4.4, decision A1).
//
// One kind of thing: an actor with a persistent GUID and a map of schema'd
// components keyed by a local id. There is no separate placement array, light
// list or environment block; all of those are actors.
//
// - A plain actor (`class: null`) owns its `components`.
// - A class actor (`class: <asset id>`) is an instance of an actor class
//   (prefab): its components come from the class and it stores only the
//   differences, in `overrides`, addressed by component id + field. Each
//   entry carries the component's type tag so it can be migrated.
// - A spatial component carries `parent` (the local id of another spatial
//   component of the same actor, null for the actor root) and `local`.
//
// These types describe the normal form that `normalizeLevel` produces: every
// field present, keys in a fixed order.

import type { ActorId, AssetId, LevelId } from "../id.ts";
import type { JsonObject } from "../json.ts";
import type { ComponentTypeTag } from "../schema/component.ts";
import type { Transform } from "../schema/fields.ts";

export const LEVEL_SCHEMA = "forge.level/1";
export const ACTOR_CLASS_SCHEMA = "forge.actorClass/1";

/** Local component ids are map keys and part of override and save-game addresses. */
export const LOCAL_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;

/** A stored component of any registered type. */
export interface ComponentRecord {
  type: ComponentTypeTag;
  /** Spatial components only. */
  parent?: string | null;
  /** Spatial components only. */
  local?: Transform;
  [field: string]: unknown;
}

export type ComponentMap = Record<string, ComponentRecord>;

/**
 * Component id -> the fields (and `local`) that differ from the class, plus
 * `type`: the component's type tag the entry was written at (a version stamp).
 */
export type OverrideMap = Record<string, JsonObject>;

interface ActorBase {
  id: ActorId;
  name: string;
  parent: ActorId | null;
  transform: Transform;
}

export interface PlainActor extends ActorBase {
  class: null;
  components: ComponentMap;
}

export interface ClassActor extends ActorBase {
  class: AssetId;
  overrides: OverrideMap;
}

export type ActorDoc = PlainActor | ClassActor;

export interface LevelDoc {
  schema: typeof LEVEL_SCHEMA;
  id: LevelId;
  actors: ActorDoc[];
}

/** An actor class (prefab): a named, GUID'd set of components. */
export interface ActorClassDoc {
  schema: typeof ACTOR_CLASS_SCHEMA;
  id: AssetId;
  name: string;
  components: ComponentMap;
}
