// The save-game document, `forge.saveGame/1` (architecture §4.6, §4.8,
// decision A7; plan 2b save-game, user decisions 2026-11-12).
//
// A save names everything by GUID: the level by its id, an actor by its id, a
// component by its local id in the actor, a value by its field key. No actor
// index, no level path, no untyped `flags`.
//
//   { "schema": "forge.saveGame/1", "level": "lvl_…",
//     "actors":  { "act_…": { "transform": {…}, "components": { "door": { "type": "game.door@1", "open": true } } } },
//     "removed": ["act_…"],            authored actors play destroyed
//     "spawned": [ <actor document> ], actors play created, with their GUIDs
//     "states":  { "game.progress": { "type": "game.progress@1", … } } }
//
// A component entry follows the override rules (§4.4): stamped with the type
// it was written at, brought to the current version by the component's
// migration chain on partial data, holding only what differs. What it may hold
// is the component's `persist` fields and its `state` section (`persist.ts`).
// A spawned actor's state is an `actors` entry like any other, against its
// spawned document. A save state is stored whole.
//
// Normalising a save does not need the level; applying it does
// (`actorState.ts`), and an entry whose actor or component is gone is reported
// and dropped there.

import { isId, type ActorId, type LevelId } from "../id.ts";
import { isJsonObject, type JsonObject } from "../json.ts";
import { normalizeActorDoc, type LevelNormalizeOptions } from "../level/normalizeLevel.ts";
import type { ActorDoc } from "../level/model.ts";
import { componentTypeTag, parseComponentTypeTag, type ComponentDef } from "../schema/component.ts";
import { IDENTITY_TRANSFORM, type FieldDef, type Transform } from "../schema/fields.ts";
import {
  childPath,
  createContext,
  finish,
  indexPath,
  reportFatal,
  reportLoss,
  type NormalizeContext,
  type NormalizeResult,
} from "../schema/issues.ts";
import { runMigrations, type MigrationMap } from "../schema/migrate.ts";
import { normalizeFieldMap, normalizeTransform, normalizeValue } from "../schema/normalize.ts";
import { persistFieldKeys } from "../schema/persist.ts";
import type { SchemaRegistry } from "../schema/registry.ts";
import { saveStateTypeTag } from "./saveState.ts";

export const SAVE_GAME_SCHEMA = "forge.saveGame/1";

/** A stamped entry: a component's saved values, or a save state. */
export interface SavedEntry {
  type: `${string}@${number}`;
  [key: string]: unknown;
}

export interface SavedActor {
  /** Only for an actor with a `persistTransform` component that moved. */
  transform?: Transform;
  /** Component local id -> its saved values. */
  components: Record<string, SavedEntry>;
}

export interface SaveGameDoc {
  schema: typeof SAVE_GAME_SCHEMA;
  level: LevelId;
  /** By actor id, sorted. */
  actors: Record<ActorId, SavedActor>;
  /** Sorted, unique. */
  removed: ActorId[];
  spawned: ActorDoc[];
  /** By save state name, sorted. */
  states: Record<string, SavedEntry>;
}

const SAVE_KEYS = ["schema", "level", "actors", "removed", "spawned", "states"];
const ACTOR_KEYS = ["transform", "components"];

/** The keys a component's save entry may carry: its `persist` fields, then its `state`, in definition order. */
export function savedKeys(def: ComponentDef): string[] {
  return [...persistFieldKeys(def.fields), ...Object.keys(def.state)];
}

function savedField(def: ComponentDef, key: string): FieldDef | undefined {
  if (Object.hasOwn(def.state, key)) return def.state[key];
  const field = Object.hasOwn(def.fields, key) ? def.fields[key] : undefined;
  return field?.persist === true ? field : undefined;
}

const byKey = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** An empty save of a level. */
export function createSaveGame(level: LevelId): SaveGameDoc {
  return { schema: SAVE_GAME_SCHEMA, level, actors: {}, removed: [], spawned: [], states: {} };
}

/** Null when the document cannot be read as a save at all. */
export function normalizeSaveGame(raw: unknown, options: LevelNormalizeOptions): NormalizeResult<SaveGameDoc | null> {
  const ctx = createContext(options);
  if (!isJsonObject(raw)) {
    reportFatal(ctx, "invalid-document", "", "A save game must be a JSON object.");
    return finish(ctx, null);
  }
  if (raw.schema !== SAVE_GAME_SCHEMA) {
    reportFatal(ctx, "invalid-document", "schema", `Expected "${SAVE_GAME_SCHEMA}".`);
    return finish(ctx, null);
  }
  if (!isId(raw.level, "level")) {
    reportFatal(ctx, "invalid-document", "level", "A save names its level by GUID.");
    return finish(ctx, null);
  }
  for (const key of Object.keys(raw)) {
    if (!SAVE_KEYS.includes(key)) reportLoss(ctx, "unknown-field", key, "Not part of a save game; dropped.");
  }

  const doc = createSaveGame(raw.level);
  const actors = objectAt(raw, "actors", ctx);
  for (const id of Object.keys(actors).sort(byKey)) {
    const path = childPath("actors", id);
    if (!isId(id, "actor")) {
      reportLoss(ctx, "invalid-value", path, "Expected an actor GUID; entry dropped.");
      continue;
    }
    const saved = normalizeSavedActor(actors[id], path, ctx, options.registry);
    if (saved) doc.actors[id] = saved;
  }

  const removed = arrayAt(raw, "removed", ctx);
  const gone = new Set<ActorId>();
  removed.forEach((id, index) => {
    if (isId(id, "actor")) gone.add(id);
    else reportLoss(ctx, "invalid-value", indexPath("removed", index), "Expected an actor GUID; dropped.");
  });
  doc.removed = [...gone].sort(byKey);

  const spawnedIds = new Set<ActorId>();
  arrayAt(raw, "spawned", ctx).forEach((entry, index) => {
    const path = indexPath("spawned", index);
    const result = normalizeActorDoc(entry, options);
    for (const issue of result.issues) ctx.issues.push({ ...issue, path: childPath(path, issue.path) });
    const actor = result.value;
    if (!actor) return;
    if (spawnedIds.has(actor.id)) {
      reportLoss(ctx, "duplicate-id", childPath(path, "id"), "Another spawned actor has this GUID; dropped.");
      return;
    }
    spawnedIds.add(actor.id);
    doc.spawned.push(actor);
  });

  const states = objectAt(raw, "states", ctx);
  for (const name of Object.keys(states).sort(byKey)) {
    const saved = normalizeSavedState(name, states[name], childPath("states", name), ctx, options.registry);
    if (saved) doc.states[name] = saved;
  }
  return finish(ctx, doc);
}

function objectAt(raw: JsonObject, key: string, ctx: NormalizeContext): JsonObject {
  const value = raw[key];
  if (value === undefined) return {};
  if (isJsonObject(value)) return value;
  reportLoss(ctx, "invalid-value", key, "Expected an object; dropped.");
  return {};
}

function arrayAt(raw: JsonObject, key: string, ctx: NormalizeContext): readonly unknown[] {
  const value = raw[key];
  if (value === undefined) return [];
  if (Array.isArray(value)) return value;
  reportLoss(ctx, "invalid-value", key, "Expected an array; dropped.");
  return [];
}

/** Null when nothing is left to keep. */
function normalizeSavedActor(raw: unknown, path: string, ctx: NormalizeContext, registry: SchemaRegistry): SavedActor | null {
  if (!isJsonObject(raw)) {
    reportLoss(ctx, "invalid-value", path, "Expected an object; entry dropped.");
    return null;
  }
  for (const key of Object.keys(raw)) {
    if (!ACTOR_KEYS.includes(key)) reportLoss(ctx, "unknown-field", childPath(path, key), "Not part of a saved actor; dropped.");
  }
  const saved: SavedActor = { components: {} };
  if (raw.transform !== undefined) {
    saved.transform = normalizeTransform(raw.transform, IDENTITY_TRANSFORM, childPath(path, "transform"), ctx);
  }
  const components = objectAt(raw, "components", ctx);
  for (const key of Object.keys(components).sort(byKey)) {
    const entry = normalizeSavedComponent(components[key], childPath(childPath(path, "components"), key), ctx, registry);
    if (entry) saved.components[key] = entry;
  }
  return saved.transform !== undefined || Object.keys(saved.components).length > 0 ? saved : null;
}

/**
 * The entry's data at the current version of `def` (its `type` stamp read and
 * the migration chain run on the partial data). Null when it cannot be used.
 */
function currentData(
  given: JsonObject,
  def: { readonly name: string; readonly version: number; readonly migrations: MigrationMap },
  version: number,
  path: string,
  ctx: NormalizeContext,
): JsonObject | null {
  const { type: _type, ...rest } = given;
  if (version > def.version) {
    reportLoss(ctx, "unsupported-version", childPath(path, "type"), `Version ${version} of ${def.name} is newer than this build (${def.version}); dropped.`);
    return null;
  }
  if (version === def.version) return rest;
  const outcome = runMigrations(def.migrations, version, def.version, rest);
  if (!outcome.ok) {
    reportLoss(ctx, "migration-failed", path, `${def.name}: ${outcome.reason}; dropped.`);
    return null;
  }
  const migrated: JsonObject = {};
  for (const [key, value] of Object.entries(outcome.data)) if (value !== undefined) migrated[key] = value;
  return migrated;
}

/** A component's save entry, or null when nothing is left. Only `persist` fields and `state` keys survive. */
export function normalizeSavedComponent(
  raw: unknown,
  path: string,
  ctx: NormalizeContext,
  registry: SchemaRegistry,
): SavedEntry | null {
  if (!isJsonObject(raw)) {
    reportLoss(ctx, "invalid-value", path, "Expected an object; dropped.");
    return null;
  }
  const tag = parseComponentTypeTag(raw.type);
  if (!tag) {
    reportLoss(ctx, "invalid-value", childPath(path, "type"), 'Expected a "<name>@<version>" type stamp; dropped.');
    return null;
  }
  const def = registry.getComponent(tag.name);
  if (!def) {
    reportLoss(ctx, "unknown-component-type", childPath(path, "type"), `"${tag.name}" is not registered; dropped.`);
    return null;
  }
  const data = currentData(raw, def, tag.version, path, ctx);
  if (!data) return null;
  const kept: JsonObject = {};
  for (const key of savedKeys(def)) {
    if (data[key] === undefined) continue;
    const fieldPath = childPath(path, key);
    const reported = ctx.issues.length;
    const value = normalizeValue(savedField(def, key)!, data[key], fieldPath, ctx);
    // A value of the wrong type is not kept: the actor keeps its level value.
    const rejected = ctx.issues.slice(reported).some((issue) => issue.code === "invalid-value" && issue.path === fieldPath);
    if (!rejected) kept[key] = value;
  }
  for (const key of Object.keys(data)) {
    if (savedField(def, key) === undefined) {
      reportLoss(ctx, "unknown-field", childPath(path, key), `${def.name} does not save "${key}"; dropped.`);
    }
  }
  return Object.keys(kept).length > 0 ? { type: componentTypeTag(def), ...kept } : null;
}

function normalizeSavedState(
  name: string,
  raw: unknown,
  path: string,
  ctx: NormalizeContext,
  registry: SchemaRegistry,
): SavedEntry | null {
  const def = registry.getSaveState(name);
  if (!def) {
    reportLoss(ctx, "unknown-save-state", path, `"${name}" is not a registered save state; dropped.`);
    return null;
  }
  if (!isJsonObject(raw)) {
    reportLoss(ctx, "invalid-value", path, "Expected an object; dropped.");
    return null;
  }
  const tag = parseComponentTypeTag(raw.type);
  if (!tag || tag.name !== name) {
    reportLoss(ctx, "invalid-value", childPath(path, "type"), `Expected the stamp "${name}@<version>"; dropped.`);
    return null;
  }
  const data = currentData(raw, def, tag.version, path, ctx);
  if (!data) return null;
  return { type: saveStateTypeTag(def), ...normalizeFieldMap(def.fields, data, path, ctx) };
}

/**
 * A save restores into its own level only (Forge `consumeRestoreForLoadedLevel`,
 * by GUID instead of path): while another level is loaded it stays pending.
 */
export function consumeSaveForLoadedLevel(
  pending: SaveGameDoc | null,
  loaded: LevelId,
): { readonly restore: SaveGameDoc | null; readonly pending: SaveGameDoc | null } {
  if (!pending) return { restore: null, pending: null };
  if (pending.level !== loaded) return { restore: null, pending };
  return { restore: pending, pending: null };
}
