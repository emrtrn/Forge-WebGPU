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

import { isId, type ActorId, type AssetId } from "../id.ts";
import { isJsonObject, type JsonObject } from "../json.ts";
import type { ClassResolver } from "../level/actorClass.ts";
import type { ActorClassDoc, ActorDoc, ComponentMap } from "../level/model.ts";
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
  visitFields(fields, value, path, (field, found, at) => {
    if (field.kind === "assetRef" && isId(found, "asset")) {
      out.push({ path: at, target: found, assetType: field.assetType ?? null, via: "field" });
    }
  });
}

type Visitor = (field: FieldDef, value: unknown, path: string) => void;

/** Calls `visit` for every field value present in `value`, at any depth. */
function visitFields(fields: FieldMap, value: JsonObject, path: string, visit: Visitor): void {
  for (const [key, field] of Object.entries(fields)) {
    if (Object.hasOwn(value, key)) visitValue(field, value[key], childPath(path, key), visit);
  }
}

function visitValue(field: FieldDef, value: unknown, path: string, visit: Visitor): void {
  visit(field, value, path);
  if (field.kind === "array" && Array.isArray(value)) {
    value.forEach((element: unknown, index) => visitValue(field.item, element, indexPath(path, index), visit));
  } else if (field.kind === "object" && isJsonObject(value)) {
    visitFields(field.fields, value, path, visit);
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

/**
 * The asset references of a level part (the persistent layer or a cell):
 * paths are `actors[i]...` of the given list.
 */
export function levelReferences(
  registry: SchemaRegistry,
  level: { readonly actors: readonly ActorDoc[] },
  resolveClass: ClassResolver,
): FoundReference[] {
  const out: FoundReference[] = [];
  level.actors.forEach((actor, index) => {
    const path = indexPath("actors", index);
    if (actor.class !== null) {
      out.push({
        path: childPath(path, "class"),
        target: actor.class,
        assetType: ActorClassAssetType.name,
        via: "class",
      });
    }
    forEachActorFieldMap(registry, actor, path, resolveClass, (fields, value, at) =>
      collectFieldReferences(fields, value, at, out),
    );
  });
  return out;
}

/** An `actorRef` field value inside a level part. */
export interface FoundActorReference {
  readonly path: string;
  readonly target: ActorId;
}

/**
 * The actor references of a level part. Within a level a reference may point
 * into another cell; whether its target exists is checked over all the files.
 */
export function actorReferences(
  registry: SchemaRegistry,
  level: { readonly actors: readonly ActorDoc[] },
  resolveClass: ClassResolver,
): FoundActorReference[] {
  const out: FoundActorReference[] = [];
  level.actors.forEach((actor, index) => {
    forEachActorFieldMap(registry, actor, indexPath("actors", index), resolveClass, (fields, value, at) =>
      visitFields(fields, value, at, (field, found, foundAt) => {
        if (field.kind === "actorRef" && isId(found, "actor")) out.push({ path: foundAt, target: found });
      }),
    );
  });
  return out;
}

/**
 * The stored field maps of one actor with their schemas: a plain actor's
 * components, or a class actor's overrides walked against the class
 * component's schema. Without the class there is no schema for the overrides;
 * the dangling class is reported by normalisation.
 */
function forEachActorFieldMap(
  registry: SchemaRegistry,
  actor: ActorDoc,
  path: string,
  resolveClass: ClassResolver,
  visit: (fields: FieldMap, value: JsonObject, path: string) => void,
): void {
  if (actor.class === null) {
    for (const [key, component] of Object.entries(actor.components)) {
      const def = componentDefOf(registry, component);
      if (def) visit(def.fields, component, childPath(childPath(path, "components"), key));
    }
    return;
  }
  const cls = resolveClass(actor.class);
  if (!cls) return;
  for (const [componentId, fields] of Object.entries(actor.overrides)) {
    const component = Object.hasOwn(cls.components, componentId) ? cls.components[componentId] : undefined;
    const def = component ? componentDefOf(registry, component) : undefined;
    if (def) visit(def.fields, fields, childPath(childPath(path, "overrides"), componentId));
  }
}

export function metaReferences(registry: SchemaRegistry, meta: AssetMetaDoc): FoundReference[] {
  const out: FoundReference[] = [];
  const def = metaTypeOf(registry, meta);
  if (def) collectFieldReferences(def.importFields, meta.import, "import", out);
  return out;
}
