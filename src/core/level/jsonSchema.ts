// JSON Schema export for level, level cell, cell index and actor class documents (architecture §4.5).
//
// One schema per document kind, generated from a schema registry, so it covers
// the components of the engine and of the game project that registered them.
//
// Overrides are the one part a static schema cannot check: their valid keys
// depend on the class the actor points at. They are checked by `normalizeLevel`.

import { COMPONENT_NAME_PATTERN, componentTypeTag } from "../schema/component.ts";
import {
  componentJsonSchema,
  fieldJsonSchema,
  fieldMapJsonSchema,
  idJsonSchema,
  JSON_SCHEMA_DRAFT,
  transformJsonSchema,
  type JsonSchema,
} from "../schema/jsonSchema.ts";
import type { SchemaRegistry } from "../schema/registry.ts";
import { CELL_KEY_PATTERN } from "./cells.ts";
import {
  ACTOR_CLASS_SCHEMA,
  LEVEL_CELL_INDEX_SCHEMA,
  LEVEL_CELL_SCHEMA,
  LEVEL_SCHEMA,
  LOCAL_ID_PATTERN,
  REVISION_PATTERN,
} from "./model.ts";
import { ActorStreamingFields, LevelSettingsFields } from "./settings.ts";

const COMPONENT_REF = { $ref: "#/definitions/component" };
const OVERRIDE_TAG_PATTERN = `${COMPONENT_NAME_PATTERN.source.slice(0, -1)}@[1-9][0-9]*$`;

/** Definitions shared by both document kinds: one per component type, plus their union. */
function componentDefinitions(registry: SchemaRegistry): Record<string, JsonSchema> {
  const components = registry.components();
  const definitions: Record<string, JsonSchema> = {};
  for (const def of components) {
    definitions[def.name] = componentJsonSchema(def);
  }
  // Dispatch on the `type` tag with if / then instead of oneOf: a validator
  // then reports the offending field, not "matches no schema".
  definitions.component =
    components.length === 0
      ? false
      : {
          type: "object",
          properties: { type: { enum: components.map(componentTypeTag) } },
          required: ["type"],
          allOf: components.map((def) => ({
            if: { properties: { type: { const: componentTypeTag(def) } }, required: ["type"] },
            then: { $ref: `#/definitions/${def.name}` },
          })),
        };
  return definitions;
}

function componentMapSchema(): JsonSchema {
  return {
    type: "object",
    propertyNames: { pattern: LOCAL_ID_PATTERN.source },
    additionalProperties: COMPONENT_REF,
  };
}

function actorSchema(): JsonSchema {
  return {
    type: "object",
    properties: {
      id: idJsonSchema("actor", false),
      name: { type: "string" },
      class: {
        ...idJsonSchema("asset", true),
        description: "Asset id of the actor class (prefab), or null for a plain actor.",
      },
      parent: idJsonSchema("actor", true),
      spatiallyLoaded: fieldJsonSchema(ActorStreamingFields.spatiallyLoaded, "spatiallyLoaded"),
      transform: transformJsonSchema(),
      components: componentMapSchema(),
      overrides: {
        type: "object",
        propertyNames: { pattern: LOCAL_ID_PATTERN.source },
        additionalProperties: {
          type: "object",
          properties: {
            type: {
              type: "string",
              pattern: OVERRIDE_TAG_PATTERN,
              description: "Type tag of the class component the entry was written at (a version stamp).",
            },
          },
        },
        description: "Component id -> the fields that differ from the class, stamped with the component's type tag.",
      },
    },
    required: ["id"],
    additionalProperties: false,
    // A class actor stores overrides, a plain actor components; never both.
    if: { properties: { class: { type: "string" } }, required: ["class"] },
    then: { properties: { components: false } },
    else: { properties: { overrides: false } },
  };
}

export function levelJsonSchema(registry: SchemaRegistry): JsonSchema {
  return {
    $schema: JSON_SCHEMA_DRAFT,
    title: "Forge level",
    type: "object",
    properties: {
      schema: { const: LEVEL_SCHEMA },
      id: idJsonSchema("level", false),
      settings: { title: "Settings", ...fieldMapJsonSchema(LevelSettingsFields) },
      actors:{ type: "array", items: { $ref: "#/definitions/actor" } },
    },
    required: ["schema", "id"],
    additionalProperties: false,
    definitions: { actor: actorSchema(), ...componentDefinitions(registry) },
  };
}

export function actorClassJsonSchema(registry: SchemaRegistry): JsonSchema {
  return {
    $schema: JSON_SCHEMA_DRAFT,
    title: "Forge actor class",
    type: "object",
    properties: {
      schema: { const: ACTOR_CLASS_SCHEMA },
      id: idJsonSchema("asset", false),
      name: { type: "string" },
      components: componentMapSchema(),
    },
    required: ["schema", "id"],
    additionalProperties: false,
    definitions: componentDefinitions(registry),
  };
}

export function levelCellJsonSchema(registry: SchemaRegistry): JsonSchema {
  return {
    $schema: JSON_SCHEMA_DRAFT,
    title: "Forge level cell",
    type: "object",
    properties: {
      schema: { const: LEVEL_CELL_SCHEMA },
      level: idJsonSchema("level", false),
      cell: { type: "string", pattern: CELL_KEY_PATTERN.source, description: 'Grid coordinates, "<x>_<z>".' },
      actors: { type: "array", items: { $ref: "#/definitions/actor" } },
    },
    required: ["schema", "level", "cell"],
    additionalProperties: false,
    definitions: { actor: actorSchema(), ...componentDefinitions(registry) },
  };
}

export function levelCellIndexJsonSchema(): JsonSchema {
  const revision = { type: "string", pattern: REVISION_PATTERN.source };
  return {
    $schema: JSON_SCHEMA_DRAFT,
    title: "Forge level cell index",
    type: "object",
    properties: {
      schema: { const: LEVEL_CELL_INDEX_SCHEMA },
      level: idJsonSchema("level", false),
      persistent: { ...revision, description: "Revision of level.json." },
      cells: {
        type: "object",
        propertyNames: { pattern: CELL_KEY_PATTERN.source },
        additionalProperties: revision,
        description: "Cell key -> revision of its file.",
      },
    },
    required: ["schema", "level", "persistent"],
    additionalProperties: false,
  };
}
