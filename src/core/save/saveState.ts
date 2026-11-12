// Game-wide save state (architecture §4.8, decision A7, the third place for
// game data): typed, versioned, with a migration chain, tied to no actor. The
// Unreal SaveGame / GameInstance subsystem counterpart. A game declares one per
// concern (`ridgebound.transport`) with the same DSL as a component and adds it
// to a feature; the save game stores it under its name, stamped
// `<name>@<version>` like a component (A2: one DSL, one normalize).

import { COMPONENT_NAME_PATTERN } from "../schema/component.ts";
import { checkFieldMap, deepFreeze, SchemaDefinitionError, type FieldMap, type FieldValues } from "../schema/fields.ts";
import { checkMigrations, type MigrationMap } from "../schema/migrate.ts";
import { assertDefaultsAreNormal } from "../schema/normalize.ts";
import { labelFromComponentName } from "../schema/label.ts";
import { checkPersistFlags } from "../schema/persist.ts";

export interface SaveStateOptions {
  /** English display name. Derived from the name when absent. */
  readonly label?: string;
  /** Turkish description. */
  readonly hint?: string;
  /** One step per earlier version, keyed by the version it migrates from. */
  readonly migrations?: MigrationMap;
}

export interface SaveStateDef<M extends FieldMap = FieldMap> {
  readonly kind: "saveState";
  readonly name: string;
  readonly version: number;
  readonly label: string;
  readonly hint: string | null;
  readonly fields: M;
  readonly migrations: MigrationMap;
}

/** The values a save state holds. */
export type SaveStateData<S extends SaveStateDef> = S extends SaveStateDef<infer M> ? FieldValues<M> : never;

/** `ridgebound.transport@1`: the stamp a stored save state carries. */
export type SaveStateTypeTag = `${string}@${number}`;

export function defineSaveState<M extends FieldMap>(
  name: string,
  version: number,
  fields: M,
  options: SaveStateOptions = {},
): SaveStateDef<M> {
  const what = `defineSaveState ${name}`;
  if (!COMPONENT_NAME_PATTERN.test(name)) {
    throw new SchemaDefinitionError(`defineSaveState: "${name}" must be a namespaced name such as "game.progress".`);
  }
  if (!Number.isInteger(version) || version < 1) {
    throw new SchemaDefinitionError(`${what}: version must be an integer >= 1.`);
  }
  checkFieldMap(what, fields);
  if (Object.hasOwn(fields, "type")) {
    throw new SchemaDefinitionError(`${what}: "type" is the stored version stamp and cannot be a field.`);
  }
  // Every field of a save state is saved; the flag would say nothing.
  checkPersistFlags(what, fields, "none");
  assertDefaultsAreNormal(what, fields);
  const migrations = { ...options.migrations };
  checkMigrations(what, version, migrations);
  return deepFreeze({
    kind: "saveState",
    name,
    version,
    label: options.label ?? labelFromComponentName(name),
    hint: options.hint ?? null,
    fields: { ...fields },
    migrations,
  }) as SaveStateDef<M>;
}

export function saveStateTypeTag(def: SaveStateDef): SaveStateTypeTag {
  return `${def.name}@${def.version}`;
}

