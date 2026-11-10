// Normalises a component map: the `components` of a plain actor or of an
// actor class. Each component goes through the schema registry; then the
// spatial hierarchy inside the map is checked.

import { isJsonObject } from "../json.ts";
import { childPath, reportLoss, type NormalizeContext } from "../schema/issues.ts";
import { normalizeRegisteredComponentInto, type SchemaRegistry } from "../schema/registry.ts";
import { LOCAL_ID_PATTERN, type ComponentMap, type ComponentRecord } from "./model.ts";

export function normalizeComponentMap(
  raw: unknown,
  path: string,
  ctx: NormalizeContext,
  registry: SchemaRegistry,
): ComponentMap {
  const map: ComponentMap = {};
  if (raw === undefined) return map;
  if (!isJsonObject(raw)) {
    reportLoss(ctx, "invalid-value", path, "Expected a map of components; none kept.");
    return map;
  }
  for (const [key, stored] of Object.entries(raw)) {
    const componentPath = childPath(path, key);
    if (!LOCAL_ID_PATTERN.test(key)) {
      reportLoss(
        ctx,
        "invalid-value",
        componentPath,
        "A component id must start with a letter and use letters, digits and underscores; component dropped.",
      );
      continue;
    }
    const component = normalizeRegisteredComponentInto(registry, stored, componentPath, ctx);
    if (component) {
      map[key] = component as ComponentRecord;
    }
  }
  checkSpatialParents(map, path, ctx);
  return map;
}

/**
 * A spatial component's `parent` must name another spatial component of the
 * same map and must not loop back to itself. A broken link is reported and
 * the component is attached to the actor root.
 */
function checkSpatialParents(map: ComponentMap, path: string, ctx: NormalizeContext): void {
  for (const [key, component] of Object.entries(map)) {
    if (typeof component.parent !== "string") continue;
    const problem = parentProblem(map, key, component.parent);
    if (problem) {
      reportLoss(
        ctx,
        "invalid-parent",
        childPath(childPath(path, key), "parent"),
        `${problem}; attached to the actor root.`,
      );
      component.parent = null;
    }
  }
}

function parentProblem(map: ComponentMap, key: string, parent: string): string | null {
  if (!Object.hasOwn(map, parent)) return `No component "${parent}" in this actor`;
  if (map[parent]?.parent === undefined) return `Component "${parent}" is not spatial`;

  const visited = new Set<string>();
  let cursor: string | null = parent;
  while (cursor !== null && !visited.has(cursor)) {
    if (cursor === key) return "The parent chain loops back to this component";
    visited.add(cursor);
    const next: unknown = Object.hasOwn(map, cursor) ? map[cursor]?.parent : null;
    cursor = typeof next === "string" ? next : null;
  }
  return null;
}
