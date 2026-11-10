// Asset types (architecture §4.3, §4.5, §4.6; decision A10).
//
// Every asset has a type, and every type is defined once and registered in the
// schema registry (`registerAssetType`). There are two kinds of storage:
//
// - binary: a GLB, texture, sound or terrain tile. Identity, type, licence and
//   source live next to it in `<file>.meta.json`. The type names the file
//   extensions it claims and the schema of its import settings, which is a
//   field map like a component's, with a version and a migration chain.
// - document: a JSON asset that carries its own `id` (level, actor class). It
//   is recognised by its `schema` tag. The engine's document types are built
//   in; game-defined JSON asset types join with the SDK.
//
// Definitions are frozen data, like component definitions. The one part that
// is code by nature is the migration chain of the import settings.

import type { IdKind } from "../id.ts";
import { ACTOR_CLASS_SCHEMA, LEVEL_SCHEMA } from "../level/model.ts";
import { COMPONENT_NAME_PATTERN } from "../schema/component.ts";
import { checkFieldMap, deepFreeze, SchemaDefinitionError, type FieldMap } from "../schema/fields.ts";
import { labelFromComponentName } from "../schema/label.ts";
import { checkMigrations, type MigrationMap } from "../schema/migrate.ts";
import { assertDefaultsAreNormal } from "../schema/normalize.ts";

/** Lower-case file suffix without the leading dot: `glb`, `png`, `r16.bin`. */
export const EXTENSION_PATTERN = /^[a-z0-9]+(\.[a-z0-9]+)*$/;

export interface BinaryAssetTypeDef<M extends FieldMap = FieldMap> {
  readonly kind: "assetType";
  readonly storage: "binary";
  /** Namespaced like a component, e.g. `forge.texture`. */
  readonly name: string;
  /** Version of the import settings schema. */
  readonly version: number;
  readonly label: string;
  readonly hint: string | null;
  /** File suffixes this type claims. Several types may claim the same one. */
  readonly extensions: readonly string[];
  /** Import settings stored in the meta file's `import`. */
  readonly importFields: M;
  readonly migrations: MigrationMap;
}

export interface DocumentAssetTypeDef {
  readonly kind: "assetType";
  readonly storage: "document";
  readonly name: string;
  readonly label: string;
  readonly hint: string | null;
  /** The `schema` tag a document of this type carries, e.g. `forge.level/1`. */
  readonly schema: string;
  /** Which id kind the document's `id` is: levels keep their `lvl_` ids. */
  readonly idKind: Extract<IdKind, "asset" | "level">;
}

export type AssetTypeDef = BinaryAssetTypeDef | DocumentAssetTypeDef;

export interface AssetTypeOptions {
  readonly label?: string;
  /** Turkish description shown in the editor. */
  readonly hint?: string;
  /** One step per earlier version of the import settings. */
  readonly migrations?: MigrationMap;
}

/** Defines a binary asset type. Document types are built in (see below). */
export function defineAssetType<M extends FieldMap>(
  name: string,
  version: number,
  definition: { readonly extensions: readonly string[]; readonly importFields?: M },
  options: AssetTypeOptions = {},
): BinaryAssetTypeDef<M> {
  const what = `defineAssetType ${name}`;
  if (!COMPONENT_NAME_PATTERN.test(name)) {
    throw new SchemaDefinitionError(
      `defineAssetType: "${name}" must be a namespaced name such as "forge.texture".`,
    );
  }
  if (!Number.isInteger(version) || version < 1) {
    throw new SchemaDefinitionError(`${what}: version must be an integer >= 1.`);
  }
  const extensions = [...definition.extensions];
  if (extensions.length === 0) {
    throw new SchemaDefinitionError(`${what}: at least one file extension is required.`);
  }
  for (const extension of extensions) {
    if (!EXTENSION_PATTERN.test(extension)) {
      throw new SchemaDefinitionError(
        `${what}: extension "${extension}" must be lower case, without the leading dot.`,
      );
    }
    if (extension === "json" || extension.endsWith(".json")) {
      throw new SchemaDefinitionError(`${what}: a JSON file is a document asset, not a binary one.`);
    }
  }
  if (new Set(extensions).size !== extensions.length) {
    throw new SchemaDefinitionError(`${what}: an extension is listed twice.`);
  }
  const importFields = { ...(definition.importFields ?? {}) } as M;
  checkFieldMap(what, importFields);
  assertDefaultsAreNormal(what, importFields);
  const migrations = { ...options.migrations };
  checkMigrations(what, version, migrations);

  return deepFreeze({
    kind: "assetType",
    storage: "binary",
    name,
    version,
    label: options.label ?? labelFromComponentName(name),
    hint: options.hint ?? null,
    extensions,
    importFields,
    migrations,
  }) as BinaryAssetTypeDef<M>;
}

/** `forge.texture@1`: the `type` tag a meta file carries. */
export function assetTypeTag(def: BinaryAssetTypeDef): `${string}@${number}` {
  return `${def.name}@${def.version}`;
}

/** True when `fileName` ends in one of the type's extensions. Case-insensitive. */
export function claimsFile(def: BinaryAssetTypeDef, fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return def.extensions.some((extension) => lower.endsWith(`.${extension}`));
}

export const LevelAssetType: DocumentAssetTypeDef = deepFreeze({
  kind: "assetType",
  storage: "document",
  name: "forge.level",
  label: "Level",
  hint: null,
  schema: LEVEL_SCHEMA,
  idKind: "level",
});

export const ActorClassAssetType: DocumentAssetTypeDef = deepFreeze({
  kind: "assetType",
  storage: "document",
  name: "forge.actorClass",
  label: "Actor Class",
  hint: null,
  schema: ACTOR_CLASS_SCHEMA,
  idKind: "asset",
});

/** Every schema registry starts with these: they are part of the data model, not features. */
export const BUILT_IN_ASSET_TYPES: readonly DocumentAssetTypeDef[] = [LevelAssetType, ActorClassAssetType];
