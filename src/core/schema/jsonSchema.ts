// JSON Schema export for fields and components (architecture §4.5, A2).
//
// Generated from the DSL so level and asset files can be checked in VS Code
// and by agent tools without running engine code. Draft-07, because that is
// the draft VS Code's JSON service supports fully.
//
// What a generated schema accepts is what normalisation takes without a
// complaint: fields may be left out (they take defaults), but an unknown key,
// a wrong type or a number outside its limits fails. `type` must be the
// current version: files on disk are written by a save, which always writes
// the latest schema.

import { idPatternSource } from "../id.ts";
import { componentTypeTag, type ComponentDef } from "./component.ts";
import type { FieldDef, FieldMap, TextField } from "./fields.ts";
import { labelFromKey } from "./label.ts";
import { defaultValue } from "./normalize.ts";

export interface JsonSchemaObject {
  readonly [keyword: string]: unknown;
}

/** A JSON Schema node. `true` accepts anything, `false` nothing. */
export type JsonSchema = boolean | JsonSchemaObject;

export const JSON_SCHEMA_DRAFT = "http://json-schema.org/draft-07/schema#";

function numberList(length: number, limits: { min?: number; max?: number } = {}): JsonSchemaObject {
  return {
    type: "array",
    items: {
      type: "number",
      ...(limits.min !== undefined ? { minimum: limits.min } : {}),
      ...(limits.max !== undefined ? { maximum: limits.max } : {}),
    },
    minItems: length,
    maxItems: length,
  };
}

export function transformJsonSchema(): JsonSchemaObject {
  return {
    type: "object",
    properties: { p: numberList(3), r: numberList(4), s: numberList(3) },
    additionalProperties: false,
  };
}

/** An id of the given kind, or null. */
export function idJsonSchema(kind: "actor" | "asset" | "level", nullable: boolean): JsonSchemaObject {
  return { type: nullable ? ["string", "null"] : "string", pattern: idPatternSource(kind) };
}

function shapeOf(field: FieldDef): JsonSchemaObject {
  switch (field.kind) {
    case "number":
      return {
        type: "number",
        ...(field.min !== undefined ? { minimum: field.min } : {}),
        ...(field.max !== undefined ? { maximum: field.max } : {}),
      };
    case "bool":
      return { type: "boolean" };
    case "enum":
      return { type: "string", enum: [...field.values] };
    case "color":
      return { type: "string", pattern: "^#[0-9a-fA-F]{6}$" };
    case "text":
      return textShape(field);
    case "vector":
      return numberList(field.size, field);
    case "transform":
      return transformJsonSchema();
    case "assetRef":
      return idJsonSchema("asset", true);
    case "actorRef":
      return idJsonSchema("actor", true);
    case "array":
      return { type: "array", items: fieldJsonSchema(field.item) };
    case "object":
      return fieldMapJsonSchema(field.fields);
  }
}

/** A required text must not be blank; a non-empty value must match the pattern. */
function textShape(field: TextField): JsonSchemaObject {
  const parts: JsonSchemaObject[] = [];
  if (field.required) parts.push({ pattern: "\\S" });
  if (field.pattern !== undefined) {
    // Normalisation lets an empty optional text through without the pattern.
    parts.push({ pattern: field.required ? field.pattern : `^$|${field.pattern}` });
  }
  if (parts.length === 0) return { type: "string" };
  if (parts.length === 1) return { type: "string", ...parts[0] };
  return { type: "string", allOf: parts };
}

/** A field normalisation reports when it is missing: a required text, or a group holding one. */
function isRequired(field: FieldDef): boolean {
  if (field.kind === "text") return field.required === true;
  if (field.kind === "object") return Object.values(field.fields).some(isRequired);
  return false;
}

/** The only keys a map must have; the rest take defaults. */
function requiredKeysOf(fields: FieldMap): string[] {
  return Object.entries(fields)
    .filter(([, field]) => isRequired(field))
    .map(([key]) => key);
}

/** The schema of a group of fields: a nested object field, or a document body. */
export function fieldMapJsonSchema(fields: FieldMap): JsonSchemaObject {
  const required = requiredKeysOf(fields);
  return {
    type: "object",
    properties: propertiesOf(fields),
    ...(required.length > 0 ? { required } : {}),
    additionalProperties: false,
  };
}

function propertiesOf(fields: FieldMap): Record<string, JsonSchema> {
  const properties: Record<string, JsonSchema> = {};
  for (const [key, field] of Object.entries(fields)) {
    properties[key] = fieldJsonSchema(field, key);
  }
  return properties;
}

/** The schema of one field value. `key` supplies the title when the field has no label. */
export function fieldJsonSchema(field: FieldDef, key?: string): JsonSchema {
  const title = field.label ?? (key === undefined ? undefined : labelFromKey(key));
  return {
    ...(title !== undefined ? { title } : {}),
    ...(field.hint !== undefined ? { description: field.hint } : {}),
    ...shapeOf(field),
    default: defaultValue(field),
  };
}

/** The schema of a stored component: envelope + fields. */
export function componentJsonSchema(def: ComponentDef): JsonSchema {
  const envelope: Record<string, JsonSchema> = { type: { const: componentTypeTag(def) } };
  if (def.spatial) {
    envelope.parent = {
      type: ["string", "null"],
      description: "Local id of the parent component in the same actor; null for the actor root.",
    };
    envelope.local = transformJsonSchema();
  }
  return {
    title: def.label,
    ...(def.hint !== null ? { description: def.hint } : {}),
    type: "object",
    properties: { ...envelope, ...propertiesOf(def.fields) },
    required: ["type"],
    additionalProperties: false,
  };
}
