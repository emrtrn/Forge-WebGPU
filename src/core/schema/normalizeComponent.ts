// Normalises a stored component: envelope (`type`, and for spatial components
// `parent` + `local`) plus field values. Loading and saving both call this.
//
// Output key order is fixed: type, parent, local, then fields in definition
// order. A component stored at an older version is migrated first; `type` in
// the output is always the definition's current version, so a load always runs
// the chain and a save always writes the latest schema.

import { isJsonObject, type JsonObject } from "../json.ts";
import {
  componentTypeTag,
  parseComponentTypeTag,
  type ComponentDef,
  type StoredComponent,
} from "./component.ts";
import { IDENTITY_TRANSFORM } from "./fields.ts";
import {
  childPath,
  createContext,
  finish,
  reportLoss,
  type NormalizeContext,
  type NormalizeOptions,
  type NormalizeResult,
} from "./issues.ts";
import { runMigrations } from "./migrate.ts";
import { normalizeFieldMap, normalizeTransform } from "./normalize.ts";

/**
 * Returns null when the component cannot be kept at all (not an object, a
 * `type` that is not this definition's, a version this build does not know).
 * The reason is in the context's issues.
 */
export function normalizeComponentInto(
  def: ComponentDef,
  raw: unknown,
  path: string,
  ctx: NormalizeContext,
): JsonObject | null {
  if (!isJsonObject(raw)) {
    reportLoss(ctx, "invalid-value", path, "A component must be an object; dropped.");
    return null;
  }
  const tag = parseComponentTypeTag(raw.type);
  if (!tag || tag.name !== def.name) {
    reportLoss(
      ctx,
      "invalid-value",
      childPath(path, "type"),
      `Expected a "${def.name}@<version>" type tag; component dropped.`,
    );
    return null;
  }
  if (tag.version > def.version) {
    reportLoss(
      ctx,
      "unsupported-version",
      childPath(path, "type"),
      `Version ${tag.version} of ${def.name} is newer than this build (${def.version}); component dropped.`,
    );
    return null;
  }

  const { type: _type, parent, local, ...stored } = raw;
  let data: JsonObject = stored;
  if (tag.version < def.version) {
    const outcome = runMigrations(def.migrations, tag.version, def.version, stored);
    if (!outcome.ok) {
      reportLoss(ctx, "migration-failed", path, `${def.name}: ${outcome.reason}; component dropped.`);
      return null;
    }
    data = outcome.data;
  }

  const value: JsonObject = { type: componentTypeTag(def) };
  if (def.spatial) {
    value.parent = normalizeParent(parent, childPath(path, "parent"), ctx);
    value.local = normalizeTransform(local, IDENTITY_TRANSFORM, childPath(path, "local"), ctx);
  } else {
    // Not envelope keys here: let them be reported as unknown fields.
    if (parent !== undefined) data = { ...data, parent };
    if (local !== undefined) data = { ...data, local };
  }
  return Object.assign(value, normalizeFieldMap(def.fields, data, path, ctx));
}

/** The local id of the parent component, or null for the actor root. */
function normalizeParent(raw: unknown, path: string, ctx: NormalizeContext): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string") {
    reportLoss(ctx, "invalid-value", path, "Expected a component id or null; attached to the actor root.");
    return null;
  }
  return raw;
}

export function normalizeComponent<C extends ComponentDef>(
  def: C,
  raw: unknown,
  options: NormalizeOptions,
): NormalizeResult<StoredComponent<C> | null> {
  const ctx = createContext(options);
  return finish(ctx, normalizeComponentInto(def, raw, "", ctx) as StoredComponent<C> | null);
}

/** A new component with every field at its default. */
export function createComponent<C extends ComponentDef>(def: C): StoredComponent<C> {
  const ctx = createContext({ strict: true });
  return normalizeComponentInto(def, { type: componentTypeTag(def) }, "", ctx) as StoredComponent<C>;
}
