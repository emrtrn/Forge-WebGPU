// Normalises a level document (`forge.level/1`). Loading and saving both call
// `normalizeLevel`: it is the load-time repair and the save-time validation,
// with no second allowlist (architecture §4.5, lesson D4).
//
// The output is the canonical document. Normalising it again returns the same
// document with no issues, so load -> save writes back what was read.
//
// A level is loaded cell by cell (A11). An actor's `parent` is always in the
// same file (a child is saved with its root), so it is checked here. An
// actor-ref field may point into a cell that is not loaded, a valid state at
// runtime; it is checked by the whole-level pass over every file.

import { isId, type ActorId } from "../id.ts";
import { isJsonObject, type JsonObject } from "../json.ts";
import { parseComponentTypeTag } from "../schema/component.ts";
import { IDENTITY_TRANSFORM } from "../schema/fields.ts";
import {
  childPath,
  createContext,
  finish,
  indexPath,
  reportFatal,
  reportLoss,
  type NormalizeContext,
  type NormalizeOptions,
  type NormalizeResult,
} from "../schema/issues.ts";
import { normalizeFieldMap, normalizeTransform, normalizeValue } from "../schema/normalize.ts";
import type { SchemaRegistry } from "../schema/registry.ts";
import { normalizeOverrides, type ClassResolver } from "./actorClass.ts";
import { normalizeComponentMap } from "./components.ts";
import { LEVEL_SCHEMA, type ActorDoc, type ComponentMap, type LevelDoc } from "./model.ts";
import { ActorStreamingFields, LevelSettingsFields, type LevelSettings } from "./settings.ts";

export const DEFAULT_ACTOR_NAME = "Actor";

export interface LevelNormalizeOptions extends NormalizeOptions {
  readonly registry: SchemaRegistry;
  /**
   * Finds an actor class by GUID; undefined when there is none. The classes it
   * returns must already be normalised (`normalizeActorClass`).
   */
  readonly resolveClass: ClassResolver;
}

const LEVEL_KEYS = ["schema", "id", "settings", "actors"];
const ACTOR_KEYS = ["id", "name", "class", "parent", "spatiallyLoaded", "transform", "components", "overrides"];

/** Null when the document cannot be read as a level at all. */
export function normalizeLevel(
  raw: unknown,
  options: LevelNormalizeOptions,
): NormalizeResult<LevelDoc | null> {
  const ctx = createContext(options);
  if (!isJsonObject(raw)) {
    reportFatal(ctx, "invalid-document", "", "A level must be a JSON object.");
    return finish(ctx, null);
  }
  if (raw.schema !== LEVEL_SCHEMA) {
    reportFatal(ctx, "invalid-document", "schema", `Expected "${LEVEL_SCHEMA}".`);
    return finish(ctx, null);
  }
  if (!isId(raw.id, "level")) {
    reportFatal(ctx, "invalid-document", "id", "A level needs a level id.");
    return finish(ctx, null);
  }

  const level: LevelDoc = {
    schema: LEVEL_SCHEMA,
    id: raw.id,
    settings: normalizeLevelSettings(raw.settings, ctx),
    actors: normalizeActorList(raw.actors, ctx, options),
  };
  reportUnknownKeys(raw, LEVEL_KEYS, "", ctx, "A level has no such field; dropped.");
  return finish(ctx, level);
}

/**
 * The `actors` array of a level part (the persistent layer or a cell file).
 * Ids and singletons are checked within the part; across parts, the whole
 * level check does it.
 */
export function normalizeActorList(
  raw: unknown,
  ctx: NormalizeContext,
  options: LevelNormalizeOptions,
): ActorDoc[] {
  const actors: ActorDoc[] = [];
  let rawActors: unknown[] = [];
  if (Array.isArray(raw)) {
    rawActors = raw;
  } else if (raw !== undefined) {
    reportLoss(ctx, "invalid-value", "actors", "Expected an array of actors; none kept.");
  }

  const seenIds = new Set<string>();
  const singletons = new Map<string, string>();
  const paths: string[] = [];
  rawActors.forEach((rawActor, index) => {
    const path = indexPath("actors", index);
    const actor = normalizeActor(rawActor, path, ctx, options);
    if (!actor) return;
    if (seenIds.has(actor.id)) {
      reportLoss(ctx, "duplicate-id", childPath(path, "id"), `Actor id ${actor.id} is already used; actor dropped.`);
      return;
    }
    seenIds.add(actor.id);
    checkSingletons(actor, path, ctx, options, singletons);
    actors.push(actor);
    paths.push(path);
  });
  checkActorParents(actors, paths, ctx);
  return actors;
}

/**
 * One actor on its own, as an edit hands it in. Its `parent` is not checked
 * here (there is no list); the caller checks it against the level.
 */
export function normalizeActorDoc(raw: unknown, options: LevelNormalizeOptions): NormalizeResult<ActorDoc | null> {
  const ctx = createContext(options);
  const actor = normalizeActor(raw, "", ctx, options);
  return finish(ctx, actor);
}

/**
 * A child actor is saved in the same file as its parent (A11), so `parent`
 * must name an actor of the same list and must not loop back. A broken link
 * is reported and the actor is attached to the level root.
 */
function checkActorParents(actors: ActorDoc[], paths: readonly string[], ctx: NormalizeContext): void {
  const byId = new Map<ActorId, ActorDoc>(actors.map((actor) => [actor.id, actor]));
  actors.forEach((actor, index) => {
    if (actor.parent === null) return;
    let problem: string | null = null;
    if (!byId.has(actor.parent)) {
      problem = `Actor ${actor.parent} is not in this file; a child actor is saved with its parent`;
    } else {
      const visited = new Set<ActorId>();
      let cursor: ActorId | null = actor.parent;
      while (cursor !== null && !visited.has(cursor)) {
        if (cursor === actor.id) {
          problem = "The parent chain loops back to this actor";
          break;
        }
        visited.add(cursor);
        cursor = byId.get(cursor)?.parent ?? null;
      }
    }
    if (problem) {
      reportLoss(ctx, "invalid-parent", childPath(paths[index]!, "parent"), `${problem}; attached to the level root.`);
      actor.parent = null;
    }
  });
}

function normalizeLevelSettings(raw: unknown, ctx: NormalizeContext): LevelSettings {
  let source: JsonObject = {};
  if (isJsonObject(raw)) {
    source = raw;
  } else if (raw !== undefined) {
    reportLoss(ctx, "invalid-value", "settings", "Expected an object of level settings; defaults used.");
  }
  return normalizeFieldMap(LevelSettingsFields, source, "settings", ctx) as LevelSettings;
}

function normalizeActor(
  raw: unknown,
  path: string,
  ctx: NormalizeContext,
  options: LevelNormalizeOptions,
): ActorDoc | null {
  if (!isJsonObject(raw)) {
    reportLoss(ctx, "invalid-value", path, "An actor must be an object; dropped.");
    return null;
  }
  if (!isId(raw.id, "actor")) {
    reportLoss(ctx, "invalid-value", childPath(path, "id"), "An actor needs an actor id; actor dropped.");
    return null;
  }
  const classId = raw.class ?? null;
  if (classId !== null && !isId(classId, "asset")) {
    reportLoss(ctx, "invalid-value", childPath(path, "class"), "Expected an asset id or null; actor dropped.");
    return null;
  }

  let name = DEFAULT_ACTOR_NAME;
  if (typeof raw.name === "string") {
    name = raw.name;
  } else if (raw.name !== undefined) {
    reportLoss(ctx, "invalid-value", childPath(path, "name"), "Expected a string; default used.");
  }

  let parent: ActorId | null = null;
  const rawParent = raw.parent ?? null;
  if (isId(rawParent, "actor") && rawParent !== raw.id) {
    parent = rawParent;
  } else if (rawParent !== null) {
    reportLoss(
      ctx,
      "invalid-value",
      childPath(path, "parent"),
      "Expected the id of another actor, or null; attached to the level root.",
    );
  }

  const base = {
    id: raw.id,
    name,
    class: classId,
    parent,
    spatiallyLoaded: normalizeValue(
      ActorStreamingFields.spatiallyLoaded,
      raw.spatiallyLoaded,
      childPath(path, "spatiallyLoaded"),
      ctx,
    ) as boolean,
    transform: normalizeTransform(raw.transform, IDENTITY_TRANSFORM, childPath(path, "transform"), ctx),
  };
  reportUnknownKeys(raw, ACTOR_KEYS, path, ctx, "An actor has no such field; dropped.");

  if (base.class === null) {
    if (raw.overrides !== undefined) {
      reportLoss(
        ctx,
        "unknown-field",
        childPath(path, "overrides"),
        "Only an actor with a class has overrides; dropped.",
      );
    }
    const components = normalizeComponentMap(raw.components, childPath(path, "components"), ctx, options.registry);
    return { ...base, class: null, components };
  }

  if (raw.components !== undefined) {
    reportLoss(
      ctx,
      "unknown-field",
      childPath(path, "components"),
      "An actor with a class takes its components from the class and cannot add its own; dropped.",
    );
  }
  const cls = options.resolveClass(base.class);
  const overridesPath = childPath(path, "overrides");
  if (!cls) {
    reportLoss(
      ctx,
      "dangling-reference",
      childPath(path, "class"),
      `Actor class ${base.class} was not found; its overrides are kept unchecked.`,
    );
    return { ...base, class: base.class, overrides: uncheckedOverrides(raw.overrides, overridesPath, ctx) };
  }
  const overrides = normalizeOverrides(raw.overrides, cls, overridesPath, ctx, options.registry);
  return { ...base, class: base.class, overrides };
}

/** Without the class there is nothing to check overrides against; keep what is object-shaped. */
function uncheckedOverrides(raw: unknown, path: string, ctx: NormalizeContext): Record<string, JsonObject> {
  const overrides: Record<string, JsonObject> = {};
  if (raw === undefined) return overrides;
  if (!isJsonObject(raw)) {
    reportLoss(ctx, "invalid-value", path, "Expected a map of overrides; none kept.");
    return overrides;
  }
  for (const [componentId, fields] of Object.entries(raw)) {
    if (isJsonObject(fields)) {
      overrides[componentId] = structuredClone(fields);
    } else {
      reportLoss(ctx, "invalid-value", childPath(path, componentId), "Expected an object of field overrides; dropped.");
    }
  }
  return overrides;
}

/** A component type marked `singleton` appears at most once per level. Nothing is dropped. */
function checkSingletons(
  actor: ActorDoc,
  path: string,
  ctx: NormalizeContext,
  options: LevelNormalizeOptions,
  seen: Map<string, string>,
): void {
  let components: ComponentMap;
  let where: (key: string) => string;
  if (actor.class === null) {
    components = actor.components;
    where = (key) => childPath(childPath(path, "components"), key);
  } else {
    components = options.resolveClass(actor.class)?.components ?? {};
    where = () => childPath(path, "class");
  }
  for (const [key, component] of Object.entries(components)) {
    const tag = parseComponentTypeTag(component.type);
    const def = tag ? options.registry.getComponent(tag.name) : undefined;
    if (!def?.singleton) continue;
    const first = seen.get(def.name);
    if (first === undefined) {
      seen.set(def.name, where(key));
    } else {
      reportLoss(
        ctx,
        "singleton-conflict",
        where(key),
        `A level has at most one ${def.name}; the first is at ${first}.`,
      );
    }
  }
}

export function reportUnknownKeys(
  raw: JsonObject,
  known: readonly string[],
  path: string,
  ctx: NormalizeContext,
  message: string,
): void {
  for (const key of Object.keys(raw)) {
    if (!known.includes(key)) {
      reportLoss(ctx, "unknown-field", childPath(path, key), message);
    }
  }
}
