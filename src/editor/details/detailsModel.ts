// What Details shows and how its edits land (INV-A13, A14, A16; plan phase 4
// step 5b; architecture §4.4, §4.5): DOM-free and three-free, Node tests
// drive it. Forge's hand-written Details sections (specialActorDetails.ts,
// 2.397 lines @ forge-webgl-final) give way to the schema: every component
// shows the form its definition gives (`formOf`), except background metadata.
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
//
// The edits themselves (field, override, components) are engine/edit/actorFields.ts
// since step 9c: the agent's commands make them too (A12).

import {
  formFields,
  formOf,
  parseComponentTypeTag,
  transform as transformField,
  type ComponentDef,
  type ComponentRecord,
  type FormField,
  type SchemaRegistry,
} from "../../core/index.ts";
import type { DetailsTarget } from "../../engine/edit/actorFields.ts";
import { getAtPath, pathKey, type FormPath } from "../../engine/edit/formPath.ts";

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

/** World Builder metadata stays on the actor, outside the Details editing UI. */
export function visibleInDetails(def: ComponentDef): boolean {
  return def.name !== "forge.worldRole";
}

/** The visible components every target shares (same id, same type name), in the primary's order. */
export function componentSections(targets: readonly DetailsTarget[], registry: SchemaRegistry): ComponentSection[] {
  const primary = targets[0];
  if (!primary) return [];
  const sections: ComponentSection[] = [];
  for (const [id, component] of Object.entries(primary.components)) {
    const name = parseComponentTypeTag(component.type)?.name;
    const def = name === undefined ? undefined : registry.getComponent(name);
    if (!def || !visibleInDetails(def)) continue;
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
