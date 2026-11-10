// Version migration chain (architecture §4.5, §4.6; lesson D6).
//
// A component at version N carries one function per earlier version, keyed by
// the version it migrates *from*: `{ 1: v1 -> v2, 2: v2 -> v3 }`. Loading
// always runs the chain from the stored version to the current one; saving
// always writes the current version.
//
// A migration sees the field values only. The envelope (`type`, `parent`,
// `local`) is not its business. It gets its own copy of the data and returns
// the data of the next version; what it returns is then normalised like any
// other input, so a key it forgets to rename shows up as an unknown field.
//
// Partial data (architecture §4.4, override version tag): a prefab override
// holds only the fields that differ from the class, and it runs through the
// same chain. So a migration must accept any subset of its fields: it changes
// only the keys it is given and never invents a key from one that is absent
// (a new field takes its default in normalisation, not in a migration). The
// definition-time check runs every step on `{}` and refuses one that throws
// or returns a defined value. A step that combines two fields cannot see the
// class value of the one an override leaves out; it sees only what is there.

import { isJsonObject, type JsonObject } from "../json.ts";
import { SchemaDefinitionError } from "./fields.ts";

export type Migration = (data: JsonObject) => JsonObject;

export interface MigrationMap {
  readonly [fromVersion: number]: Migration;
}

/** Definition-time check: version N needs exactly the steps 1..N-1. */
export function checkMigrations(what: string, version: number, migrations: MigrationMap): void {
  for (let from = 1; from < version; from += 1) {
    if (typeof migrations[from] !== "function") {
      throw new SchemaDefinitionError(
        `${what}: version ${version} needs a migration from version ${from} to ${from + 1}.`,
      );
    }
  }
  for (let from = 1; from < version; from += 1) {
    checkPartialSafe(what, from, migrations[from] as Migration);
  }
  for (const key of Object.keys(migrations)) {
    const from = Number(key);
    if (!Number.isInteger(from) || from < 1 || from >= version) {
      throw new SchemaDefinitionError(
        `${what}: migration "${key}" does not belong to a version below ${version}.`,
      );
    }
  }
}

function checkPartialSafe(what: string, from: number, step: Migration): void {
  let result: unknown;
  try {
    result = step({});
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new SchemaDefinitionError(
      `${what}: migration from version ${from} must accept partial data (an override holds only some fields); on {} it threw: ${detail}`,
    );
  }
  if (!isJsonObject(result) || Object.values(result).some((value) => value !== undefined)) {
    throw new SchemaDefinitionError(
      `${what}: migration from version ${from} must only change the keys it is given; on {} it returned ${JSON.stringify(result)}.`,
    );
  }
}

export type MigrationOutcome =
  | { readonly ok: true; readonly data: JsonObject }
  | { readonly ok: false; readonly reason: string };

/** Runs the steps `from` .. `to - 1` in order. Never throws; never mutates `data`. */
export function runMigrations(
  migrations: MigrationMap,
  from: number,
  to: number,
  data: JsonObject,
): MigrationOutcome {
  let current = structuredClone(data);
  for (let version = from; version < to; version += 1) {
    const step = migrations[version];
    if (!step) {
      return { ok: false, reason: `no migration from version ${version}` };
    }
    let next: unknown;
    try {
      next = step(current);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return { ok: false, reason: `migration from version ${version} threw: ${detail}` };
    }
    if (!isJsonObject(next)) {
      return { ok: false, reason: `migration from version ${version} did not return an object` };
    }
    current = next;
  }
  return { ok: true, data: current };
}
