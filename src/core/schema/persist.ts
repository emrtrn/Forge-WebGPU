// What a save game keeps of a component (architecture §4.8, decision A7: actor
// state lives in `persist`-flagged component fields, keyed by actor GUID +
// component id + field; no untyped bag).
//
// Two places, one rule each (user decision 2026-11-12):
// - `persist: true` on a top-level field: an authored value that play changes
//   (a door's `open`). The level holds the authored value; a save holds the
//   value when it differs from the level's.
// - The component's `state` section: values that exist only at run time (a
//   car's gear, its dents). Never written to a level, always saved when they
//   differ from their defaults. Same DSL, same version and migration chain as
//   the component.
// A nested field (array item, object member) carries no flag: the top-level
// field is saved whole.

import { fail, type FieldDef, type FieldMap } from "./fields.ts";

function nestedFields(field: FieldDef): readonly FieldDef[] {
  if (field.kind === "array") return [field.item];
  if (field.kind === "object") return Object.values(field.fields);
  return [];
}

function flaggedInside(field: FieldDef): boolean {
  return nestedFields(field).some((inner) => inner.persist === true || flaggedInside(inner));
}

/**
 * Definition-time check. `topLevel`: the flag is allowed on the map's own
 * fields; `none`: everything in the map is saved anyway (a `state` section, a
 * save state), so the flag would say nothing and is refused.
 */
export function checkPersistFlags(what: string, fields: FieldMap, allowed: "topLevel" | "none"): void {
  for (const [key, field] of Object.entries(fields)) {
    if (field.persist === true && allowed === "none") {
      fail(`${what}: "${key}" is saved as a whole; drop its persist flag.`);
    }
    if (flaggedInside(field)) {
      fail(`${what}: "${key}" has a persist flag inside it; flag the top-level field instead.`);
    }
  }
}

/** The keys of the `persist`-flagged fields, in definition order. */
export function persistFieldKeys(fields: FieldMap): string[] {
  return Object.entries(fields).flatMap(([key, field]) => (field.persist === true ? [key] : []));
}
