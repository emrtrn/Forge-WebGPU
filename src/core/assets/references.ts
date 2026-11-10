// Asset references, found by walking the schema (architecture §4.6, A10).
//
// Nothing keeps a hand-written list of "fields that point at assets". An
// asset reference is any value of an `assetRef` field, at any depth (arrays,
// nested objects), in:
// - a level: the components of plain actors, the overrides of class actors
//   (walked against the class component's schema) and each actor's `class`;
// - an actor class: its components;
// - an asset meta file: its import settings.
// A component whose type is not registered has no schema to walk; it was
// already reported by normalisation.

import { isId, type AssetId } from "../id.ts";
import { isJsonObject, type JsonObject } from "../json.ts";
import type { ClassResolver } from "../level/actorClass.ts";
import type { ActorClassDoc, ComponentMap, LevelDoc } from "../level/model.ts";
import type { FieldDef, FieldMap } from "../schema/fields.ts";
import { childPath, indexPath } from "../schema/issues.ts";
import { componentDefOf, type SchemaRegistry } from "../schema/registry.ts";
import { ActorClassAssetType } from "./assetType.ts";
import { metaTypeOf, type AssetMetaDoc } from "./meta.ts";

/** One asset reference inside a document. */
export interface FoundReference {
  /** Where in the document, e.g. `actors[2].overrides.body.mesh`. */
  readonly path: string;
  readonly target: AssetId;
  /** The asset type the field accepts; null for any. */
  readonly assetType: string | null;
  /** `class`: an actor's class link. `field`: an `assetRef` field value. */
  readonly via: "class" | "field";
}

/** Walks `value` against `fields`. Keys the value lacks are skipped (overrides are partial). */
export function collectFieldReferences(
  fields: FieldMap,
  value: JsonObject,
  path: string,
  out: FoundReference[],
): void {
  for (const [key, field] of Object.entries(fields)) {
    if (Object.hasOwn(value, key)) walk(field, value[key], childPath(path, key), out);
  }
}

function walk(field: FieldDef, value: unknown, path: string, out: FoundReference[]): void {
  switch (field.kind) {
    case "assetRef":
      if (isId(value, "asset")) out.push({ path, target: value, assetType: field.assetType ?? null, via: "field" });
      return;
    case "array":
      if (Array.isArray(value)) {
        value.forEach((element: unknown, index) => walk(field.item, element, indexPath(path, index), out));
      }
      return;
    case "object":
      if (isJsonObject(value)) collectFieldReferences(field.fields, value, path, out);
      return;
    default:
      return;
  }
}

function collectComponentMap(
  registry: SchemaRegistry,
  components: ComponentMap,
  path: string,
  out: FoundReference[],
): void {
  for (const [key, component] of Object.entries(components)) {
    const def = componentDefOf(registry, component);
    if (def) collectFieldReferences(def.fields, component, childPath(path, key), out);
  }
}

export function actorClassReferences(registry: SchemaRegistry, cls: ActorClassDoc): FoundReference[] {
  const out: FoundReference[] = [];
  collectComponentMap(registry, cls.components, "components", out);
  return out;
}

export function levelReferences(
  registry: SchemaRegistry,
  level: LevelDoc,
  resolveClass: ClassResolver,
): FoundReference[] {
  const out: FoundReference[] = [];
  level.actors.forEach((actor, index) => {
    const path = indexPath("actors", index);
    if (actor.class === null) {
      collectComponentMap(registry, actor.components, childPath(path, "components"), out);
      return;
    }
    out.push({
      path: childPath(path, "class"),
      target: actor.class,
      assetType: ActorClassAssetType.name,
      via: "class",
    });
    // Without the class there is no schema for the overrides; the dangling
    // class is reported by normalisation.
    const cls = resolveClass(actor.class);
    if (!cls) return;
    for (const [componentId, fields] of Object.entries(actor.overrides)) {
      const component = Object.hasOwn(cls.components, componentId) ? cls.components[componentId] : undefined;
      const def = component ? componentDefOf(registry, component) : undefined;
      if (def) collectFieldReferences(def.fields, fields, childPath(childPath(path, "overrides"), componentId), out);
    }
  });
  return out;
}

export function metaReferences(registry: SchemaRegistry, meta: AssetMetaDoc): FoundReference[] {
  const out: FoundReference[] = [];
  const def = metaTypeOf(registry, meta);
  if (def) collectFieldReferences(def.importFields, meta.import, "import", out);
  return out;
}
