// Actor classes (prefabs) and the overrides an instance stores (A1).
//
// Override rule, v1:
// - The address is component id + field. An override holds the whole value of
//   that field; `local` counts as a field of a spatial component.
// - Every field of a class component can be overridden. `parent` cannot. An
//   instance cannot add or remove components.
// - Only differences are stored: an override equal to the class value is
//   dropped, an empty component entry is dropped.
// - Version tag: a component entry carries `type`, the class component's type
//   tag at the time it was written. It is a stamp, not an override. A save
//   always writes the current tag; a missing tag reads as current. An older
//   version runs the component's migration chain on the partial data (every
//   step is partial-safe, see migrate.ts); a tag naming another component
//   type means the class swapped the component under this id, and the entry
//   is dropped with a report.

import { isId, type AssetId } from "../id.ts";
import { isJsonObject, jsonEquals, type JsonObject } from "../json.ts";
import { componentTypeTag, parseComponentTypeTag, type ComponentDef } from "../schema/component.ts";
import { IDENTITY_TRANSFORM } from "../schema/fields.ts";
import {
  childPath,
  createContext,
  finish,
  reportFatal,
  reportLoss,
  type NormalizeContext,
  type NormalizeOptions,
  type NormalizeResult,
} from "../schema/issues.ts";
import { runMigrations } from "../schema/migrate.ts";
import { normalizeTransform, normalizeValue } from "../schema/normalize.ts";
import type { SchemaRegistry } from "../schema/registry.ts";
import { normalizeComponentMap } from "./components.ts";
import {
  ACTOR_CLASS_SCHEMA,
  type ActorClassDoc,
  type ActorDoc,
  type ComponentMap,
  type ComponentRecord,
  type OverrideMap,
} from "./model.ts";

export const DEFAULT_CLASS_NAME = "Actor Class";

export interface ActorClassNormalizeOptions extends NormalizeOptions {
  readonly registry: SchemaRegistry;
}

/** Loading and saving an actor class both call this. Null when it cannot be read at all. */
export function normalizeActorClass(
  raw: unknown,
  options: ActorClassNormalizeOptions,
): NormalizeResult<ActorClassDoc | null> {
  const ctx = createContext(options);
  if (!isJsonObject(raw)) {
    reportFatal(ctx, "invalid-document", "", "An actor class must be a JSON object.");
    return finish(ctx, null);
  }
  if (raw.schema !== ACTOR_CLASS_SCHEMA) {
    reportFatal(ctx, "invalid-document", "schema", `Expected "${ACTOR_CLASS_SCHEMA}".`);
    return finish(ctx, null);
  }
  if (!isId(raw.id, "asset")) {
    reportFatal(ctx, "invalid-document", "id", "An actor class needs an asset id.");
    return finish(ctx, null);
  }

  let name = DEFAULT_CLASS_NAME;
  if (typeof raw.name === "string") {
    name = raw.name;
  } else if (raw.name !== undefined) {
    reportLoss(ctx, "invalid-value", "name", "Expected a string; default used.");
  }
  const value: ActorClassDoc = {
    schema: ACTOR_CLASS_SCHEMA,
    id: raw.id,
    name,
    components: normalizeComponentMap(raw.components, "components", ctx, options.registry),
  };
  for (const key of Object.keys(raw)) {
    if (!["schema", "id", "name", "components"].includes(key)) {
      reportLoss(ctx, "unknown-field", key, "An actor class has no such field; dropped.");
    }
  }
  return finish(ctx, value);
}

/** Finds an actor class by GUID. The asset index (A10) provides it. */
export type ClassResolver = (id: AssetId) => ActorClassDoc | undefined;

function definitionOf(registry: SchemaRegistry, component: ComponentRecord): ComponentDef | undefined {
  const tag = parseComponentTypeTag(component.type);
  return tag ? registry.getComponent(tag.name) : undefined;
}

/**
 * Normalises the overrides of a class actor against its class. Output order
 * follows the class: components in class order, `local` first, then fields in
 * definition order.
 */
export function normalizeOverrides(
  raw: unknown,
  cls: ActorClassDoc,
  path: string,
  ctx: NormalizeContext,
  registry: SchemaRegistry,
): OverrideMap {
  const overrides: OverrideMap = {};
  if (raw === undefined) return overrides;
  if (!isJsonObject(raw)) {
    reportLoss(ctx, "invalid-value", path, "Expected a map of overrides; none kept.");
    return overrides;
  }

  for (const [componentId, classComponent] of Object.entries(cls.components)) {
    if (!Object.hasOwn(raw, componentId)) continue;
    const componentPath = childPath(path, componentId);
    const given = raw[componentId];
    if (!isJsonObject(given)) {
      reportLoss(ctx, "invalid-value", componentPath, "Expected an object of field overrides; dropped.");
      continue;
    }
    const def = definitionOf(registry, classComponent);
    if (!def) {
      reportLoss(
        ctx,
        "unknown-component-type",
        componentPath,
        `The class component's type "${classComponent.type}" is not registered; overrides dropped.`,
      );
      continue;
    }
    const current = currentOverrideData(given, def, componentPath, ctx);
    if (!current) continue;
    const kept = normalizeComponentOverrides(current, classComponent, def, componentPath, ctx);
    if (Object.keys(kept).length > 0) {
      overrides[componentId] = { type: componentTypeTag(def), ...kept };
    }
  }

  for (const componentId of Object.keys(raw)) {
    if (!Object.hasOwn(cls.components, componentId)) {
      reportLoss(
        ctx,
        "invalid-override",
        childPath(path, componentId),
        `The class has no component "${componentId}"; an instance cannot add one. Dropped.`,
      );
    }
  }
  return overrides;
}

/**
 * Reads the entry's version tag and brings its fields to the current version.
 * Null when the entry cannot be used; the reason is reported.
 */
function currentOverrideData(
  given: JsonObject,
  def: ComponentDef,
  path: string,
  ctx: NormalizeContext,
): JsonObject | null {
  const { type, ...rest } = given;
  if (type === undefined) return rest;
  const typePath = childPath(path, "type");
  const tag = parseComponentTypeTag(type);
  if (!tag) {
    reportLoss(ctx, "invalid-value", typePath, 'Expected a "<name>@<version>" type tag; overrides dropped.');
    return null;
  }
  if (tag.name !== def.name) {
    reportLoss(
      ctx,
      "invalid-override",
      typePath,
      `Written for ${tag.name}; the class component is a ${def.name} now. Overrides dropped.`,
    );
    return null;
  }
  if (tag.version > def.version) {
    reportLoss(
      ctx,
      "unsupported-version",
      typePath,
      `Version ${tag.version} of ${def.name} is newer than this build (${def.version}); overrides dropped.`,
    );
    return null;
  }
  if (tag.version === def.version) return rest;

  // The envelope does not go through migrations, as for a stored component.
  const { local, parent, ...fields } = rest;
  const outcome = runMigrations(def.migrations, tag.version, def.version, fields);
  if (!outcome.ok) {
    reportLoss(ctx, "migration-failed", path, `${def.name}: ${outcome.reason}; overrides dropped.`);
    return null;
  }
  const migrated: JsonObject = {};
  for (const [key, value] of Object.entries(outcome.data)) {
    if (value !== undefined) migrated[key] = value;
  }
  if (local !== undefined) migrated.local = local;
  if (parent !== undefined) migrated.parent = parent;
  return migrated;
}

function normalizeComponentOverrides(
  given: JsonObject,
  classComponent: ComponentRecord,
  def: ComponentDef,
  path: string,
  ctx: NormalizeContext,
): JsonObject {
  const kept: JsonObject = {};
  const keep = (key: string, value: unknown): void => {
    if (!jsonEquals(value, classComponent[key])) kept[key] = value;
  };

  if (def.spatial && given.local !== undefined) {
    const fallback = classComponent.local ?? IDENTITY_TRANSFORM;
    keep("local", normalizeTransform(given.local, fallback, childPath(path, "local"), ctx));
  }
  for (const [key, field] of Object.entries(def.fields)) {
    if (given[key] === undefined) continue;
    const fieldPath = childPath(path, key);
    const reported = ctx.issues.length;
    const value = normalizeValue(field, given[key], fieldPath, ctx);
    // A value of the wrong type falls back to the schema default elsewhere.
    // Here the fallback is the class value: the override is simply not kept.
    const rejected = ctx.issues
      .slice(reported)
      .some((issue) => issue.code === "invalid-value" && issue.path === fieldPath);
    if (!rejected) keep(key, value);
  }

  for (const key of Object.keys(given)) {
    if (key === "parent") {
      reportLoss(ctx, "invalid-override", childPath(path, key), `"${key}" cannot be overridden; dropped.`);
    } else if (!(Object.hasOwn(def.fields, key) || (key === "local" && def.spatial))) {
      reportLoss(ctx, "unknown-field", childPath(path, key), "The schema has no such field; dropped.");
    }
  }
  return kept;
}

/**
 * The components an actor actually has: its own for a plain actor, the class
 * components with the overrides applied for a class actor. Always a fresh
 * copy. `cls` is the resolved class of a class actor.
 */
export function effectiveComponents(actor: ActorDoc, cls: ActorClassDoc | undefined): ComponentMap {
  if (actor.class === null) return structuredClone(actor.components);
  if (!cls) return {};
  const components = structuredClone(cls.components);
  for (const [componentId, fields] of Object.entries(actor.overrides)) {
    const component = Object.hasOwn(components, componentId) ? components[componentId] : undefined;
    if (!component) continue;
    for (const [key, value] of Object.entries(fields)) {
      if (key !== "type" && key !== "parent") {
        component[key] = structuredClone(value);
      }
    }
  }
  return components;
}
