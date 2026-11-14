// What Details shows and how its edits land (INV-A13, A14, A16; plan phase 4
// step 5b; architecture §4.4, §4.5): DOM-free and three-free, Node tests
// drive it. Forge's hand-written Details sections (specialActorDetails.ts,
// 2.397 lines @ forge-webgl-final) give way to the schema: every component
// shows the form its definition gives (`formOf`).
//
// - Selection: one actor or many. Many show the components they share (same
//   local id, same type); a value that differs between them is "mixed". An
//   edit writes the one field (the leaf the form reports) to every selected
//   actor and is one transaction (Forge: Details edits apply to the
//   multi-selection, one undo step).
// - A class actor (prefab) shows its effective values (class + overrides).
//   Editing a field writes an override of that field's whole top-level value
//   (override rule v1); a value equal to the class drops out in
//   normalisation. An overridden field has a reset (user decision
//   2026-11-14, Unreal's row arrow), a component its Reset All.
// - A plain actor adds and removes components (user decision 2026-11-14); a
//   class actor cannot (A1). A singleton component goes to a level that has
//   none yet.
// - A spatial component shows its `local` transform first.

import {
  componentTypeTag,
  createComponent,
  effectiveComponents,
  formFields,
  formOf,
  parseComponentTypeTag,
  transform as transformField,
  type ActorClassDoc,
  type ActorDoc,
  type ClassResolver,
  type ComponentDef,
  type ComponentMap,
  type ComponentRecord,
  type FormField,
  type JsonObject,
  type SchemaRegistry,
  type Transform,
} from "../../core/index.ts";
import { eulerDegreesToQuaternion, quaternionToEulerDegrees } from "../../engine/math/euler.ts";
import { getAtPath, pathKey, setAtPath, type FormPath } from "../ui/formPath.ts";

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

export interface ComponentSection {
  /** Local component id (the key in the actor's map). */
  readonly id: string;
  readonly def: ComponentDef;
  /** The form: `local` first for a spatial component, then the definition's fields. */
  readonly fields: readonly FormField[];
  /** The primary actor's values (fields, and `local` when spatial). */
  readonly value: Record<string, unknown>;
  /** Paths (`pathKey`) whose value differs between the selected actors. */
  readonly mixed: ReadonlySet<string>;
  /** Top-level keys some selected class actor overrides. */
  readonly overridden: ReadonlySet<string>;
  /** The component comes from a class: no Remove, overrides instead. */
  readonly fromClass: boolean;
}

const LOCAL_FIELD = formFields({
  local: transformField({ label: "Local Transform", hint: "Bileşenin aktöre göre konumu, dönüşü ve ölçeği." }),
})[0]!;

/** The value a form edits for a stored component: its fields, plus `local` when spatial. */
function formValue(component: ComponentRecord, def: ComponentDef): Record<string, unknown> {
  const value: Record<string, unknown> = {};
  if (def.spatial) value.local = component.local;
  for (const key of Object.keys(def.fields)) value[key] = component[key];
  return value;
}

const equal = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** The paths under `values[0]` whose leaves differ between the values (a mixed object marks itself and its differing leaves). */
export function mixedPaths(values: readonly unknown[], prefix: FormPath = []): Set<string> {
  const mixed = new Set<string>();
  if (values.length < 2) return mixed;
  const walk = (path: FormPath, here: readonly unknown[]): void => {
    if (here.every((value) => equal(value, here[0]))) return;
    mixed.add(pathKey(path));
    const first = here[0];
    if (first === null || typeof first !== "object") return;
    if (Array.isArray(first)) {
      if (!here.every((value) => Array.isArray(value) && value.length === first.length)) return;
      first.forEach((_, index) => walk([...path, index], here.map((value) => (value as unknown[])[index])));
      return;
    }
    for (const key of Object.keys(first)) walk([...path, key], here.map((value) => getAtPath(value, [key])));
  };
  walk(prefix, values);
  if (prefix.length === 0) mixed.delete("");
  return mixed;
}

/** The components every target shares (same id, same type name), in the primary's order. */
export function componentSections(targets: readonly DetailsTarget[], registry: SchemaRegistry): ComponentSection[] {
  const primary = targets[0];
  if (!primary) return [];
  const sections: ComponentSection[] = [];
  for (const [id, component] of Object.entries(primary.components)) {
    const name = parseComponentTypeTag(component.type)?.name;
    const def = name === undefined ? undefined : registry.getComponent(name);
    if (!def) continue;
    const all = targets.map((target) => target.components[id]);
    if (!all.every((one) => one !== undefined && parseComponentTypeTag(one.type)?.name === name)) continue;
    const values = all.map((one) => formValue(one!, def));
    const overridden = new Set<string>();
    for (const target of targets) {
      if (target.doc.class === null) continue;
      for (const key of Object.keys(target.doc.overrides[id] ?? {})) if (key !== "type") overridden.add(key);
    }
    sections.push({
      id,
      def,
      fields: def.spatial ? [LOCAL_FIELD, ...formOf(def).fields] : formOf(def).fields,
      value: values[0]!,
      mixed: mixedPaths(values),
      overridden,
      fromClass: primary.doc.class !== null,
    });
  }
  return sections;
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
