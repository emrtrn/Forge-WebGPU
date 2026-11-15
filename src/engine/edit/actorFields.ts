// An actor's fields as Details edits them (INV-A13, A14; plan phase 4 step
// 5b, moved here in step 9c so the agent's commands run them too, A12):
// documents in, documents out.
//
// - A plain actor's field edit writes the leaf; a class actor's writes an
//   override of the field's whole top-level value (override rule v1); a value
//   equal to the class drops out in normalisation. An override is reset per
//   field or per component.
// - A plain actor adds and removes components; a class actor cannot (A1). A
//   singleton component goes to a level that has none yet.

import {
  componentTypeTag,
  createComponent,
  effectiveComponents,
  parseComponentTypeTag,
  type ActorClassDoc,
  type ActorDoc,
  type ClassResolver,
  type ComponentDef,
  type ComponentMap,
  type ComponentRecord,
  type JsonObject,
  type Transform,
} from "../../core/index.ts";
import { eulerDegreesToQuaternion, quaternionToEulerDegrees } from "../math/euler.ts";
import { getAtPath, setAtPath, type FormPath } from "./formPath.ts";

/** One selected actor as Details reads it. */
export interface DetailsTarget {
  readonly doc: ActorDoc;
  /** The actor's class; undefined for a plain actor (or a missing class). */
  readonly cls: ActorClassDoc | undefined;
  /** Its effective components (class + overrides, or its own). */
  readonly components: ComponentMap;
}

export function detailsTarget(doc: ActorDoc, resolveClass: ClassResolver): DetailsTarget {
  const cls = doc.class === null ? undefined : resolveClass(doc.class);
  return { doc, cls, components: doc.class === null ? doc.components : effectiveComponents(doc, cls) };
}

/** The actor with `value` at `path` of component `id` (`path` starts at a field key or `local`). */
export function editComponent(target: DetailsTarget, id: string, path: FormPath, value: unknown): ActorDoc {
  const { doc } = target;
  if (doc.class === null) {
    const component = doc.components[id];
    if (!component) return doc;
    return { ...doc, components: { ...doc.components, [id]: setAtPath(component, path, value) } };
  }
  const effective = target.components[id];
  const classComponent = target.cls?.components[id];
  if (!effective || !classComponent || path.length === 0) return doc;
  const key = path[0] as string;
  // Override rule v1: an override carries the field's whole value.
  const whole = setAtPath(getAtPath(effective, [key]), path.slice(1), value);
  const entry: JsonObject = { ...(doc.overrides[id] ?? {}), type: classComponent.type, [key]: whole as JsonObject[string] };
  return { ...doc, overrides: { ...doc.overrides, [id]: entry } };
}

/** The class actor without its override of `key` (null: every override of the component). */
export function resetOverride(doc: ActorDoc, id: string, key: string | null): ActorDoc {
  if (doc.class === null || !doc.overrides[id]) return doc;
  const overrides = { ...doc.overrides };
  if (key === null) {
    delete overrides[id];
  } else {
    const entry = { ...overrides[id]! };
    delete entry[key];
    if (Object.keys(entry).every((one) => one === "type")) delete overrides[id];
    else overrides[id] = entry;
  }
  return { ...doc, overrides };
}

/** The actor with `value` at an actor-level path (`transform.p[0]`, `spatiallyLoaded`, `pivot[2]`, `name`). */
export function editActor(doc: ActorDoc, path: FormPath, value: unknown): ActorDoc {
  return setAtPath(doc, path, value);
}

/** One Euler axis (degrees) of a transform's rotation, the other two axes the transform's own. */
export function withRotationAxis(transform: Transform, axis: 0 | 1 | 2, degrees: number): Transform {
  const euler = quaternionToEulerDegrees(transform.r);
  euler[axis] = degrees;
  return { ...transform, r: eulerDegreesToQuaternion(euler) };
}

/** A local id for a new component of `def` in `components`: the name's last part, numbered when taken (`pointLight`, `pointLight2`). */
export function newComponentId(def: ComponentDef, components: ComponentMap): string {
  const base = def.name.slice(def.name.lastIndexOf(".") + 1);
  if (!Object.hasOwn(components, base)) return base;
  for (let n = 2; ; n += 1) if (!Object.hasOwn(components, `${base}${n}`)) return `${base}${n}`;
}

/** Why `def` cannot be added to the actor, or null when it can. */
export function cannotAdd(doc: ActorDoc, def: ComponentDef, level: readonly ActorDoc[], resolveClass: ClassResolver): string | null {
  if (doc.class !== null) return "A class actor takes its components from its class.";
  if (!def.singleton) return null;
  // A class actor carries its class's components.
  const componentsOf = (actor: ActorDoc): ComponentMap => (actor.class === null ? actor.components : (resolveClass(actor.class)?.components ?? {}));
  const taken = level.some((actor) => Object.values(componentsOf(actor)).some((component) => parseComponentTypeTag(component.type)?.name === def.name));
  return taken ? `The level already has a ${def.label}; there is one per level.` : null;
}

/** The plain actor with a new component of `def` at its defaults (a spatial one at the actor's root). */
export function addComponent(doc: ActorDoc, def: ComponentDef): ActorDoc {
  if (doc.class !== null) return doc;
  const component = createComponent(def) as ComponentRecord;
  if (def.spatial) {
    component.parent = null;
    component.local = { p: [0, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] };
  }
  component.type = componentTypeTag(def);
  return { ...doc, components: { ...doc.components, [newComponentId(def, doc.components)]: component } };
}

/** The plain actor without component `id`; its spatial children move to its parent. */
export function removeComponent(doc: ActorDoc, id: string): ActorDoc {
  if (doc.class !== null || !doc.components[id]) return doc;
  const removed = doc.components[id]!;
  const components: ComponentMap = {};
  for (const [key, component] of Object.entries(doc.components)) {
    if (key === id) continue;
    components[key] = component.parent === id ? { ...component, parent: removed.parent ?? null } : component;
  }
  return { ...doc, components };
}
