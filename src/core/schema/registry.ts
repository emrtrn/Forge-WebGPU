// Schema registry (architecture §4.5): the one place that knows every
// component type of a running editor, game, dev server or tool.
//
// A registry is an instance, never a module-level singleton (A6: two worlds on
// one page must not share mutable state). Engine features and game projects
// register into the same instance through `registerComponent`.

import { isJsonObject, type JsonObject } from "../json.ts";
import { parseComponentTypeTag, type ComponentDef } from "./component.ts";
import { SchemaDefinitionError } from "./fields.ts";
import { childPath, reportLoss, type NormalizeContext } from "./issues.ts";
import { normalizeComponentInto } from "./normalizeComponent.ts";

export interface SchemaRegistry {
  /** Registration point. A name can be registered once. */
  registerComponent(def: ComponentDef): void;
  getComponent(name: string): ComponentDef | undefined;
  /** In registration order. */
  components(): readonly ComponentDef[];
}

export function createSchemaRegistry(): SchemaRegistry {
  const byName = new Map<string, ComponentDef>();
  return {
    registerComponent(def) {
      if (def.kind !== "component") {
        throw new SchemaDefinitionError("registerComponent: not a component definition.");
      }
      if (byName.has(def.name)) {
        throw new SchemaDefinitionError(`registerComponent: "${def.name}" is already registered.`);
      }
      byName.set(def.name, def);
    },
    getComponent(name) {
      return byName.get(name);
    },
    components() {
      return [...byName.values()];
    },
  };
}

/** The definition a stored component's `type` tag names, if it is registered. */
export function componentDefOf(registry: SchemaRegistry, stored: unknown): ComponentDef | undefined {
  if (!isJsonObject(stored)) return undefined;
  const tag = parseComponentTypeTag(stored.type);
  return tag ? registry.getComponent(tag.name) : undefined;
}

/**
 * Normalises a stored component of whatever registered type its `type` tag
 * names. Returns null when it cannot be kept; an unregistered type is a loss
 * like an unknown field.
 */
export function normalizeRegisteredComponentInto(
  registry: SchemaRegistry,
  raw: unknown,
  path: string,
  ctx: NormalizeContext,
): JsonObject | null {
  if (!isJsonObject(raw)) {
    reportLoss(ctx, "invalid-value", path, "A component must be an object; dropped.");
    return null;
  }
  const tag = parseComponentTypeTag(raw.type);
  if (!tag) {
    reportLoss(
      ctx,
      "invalid-value",
      childPath(path, "type"),
      'Expected a "<name>@<version>" type tag; component dropped.',
    );
    return null;
  }
  const def = registry.getComponent(tag.name);
  if (!def) {
    reportLoss(
      ctx,
      "unknown-component-type",
      childPath(path, "type"),
      `No component type "${tag.name}" is registered; component dropped.`,
    );
    return null;
  }
  return normalizeComponentInto(def, raw, path, ctx);
}
