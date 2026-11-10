// Test helper: a validator for exactly the JSON Schema keywords the export
// emits. It lets the tests check what a generated schema accepts and rejects
// without adding a validation library (A2). It throws on a keyword it does not
// know, so a new keyword in the export cannot go untested. Not part of the
// core surface.

import { isJsonObject, jsonEquals } from "../json.ts";
import type { JsonSchema } from "./jsonSchema.ts";

const ANNOTATIONS = new Set(["$schema", "title", "description", "default", "definitions"]);

function typeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

/** Returns one `path: reason` line per failure; empty when the value is valid. */
export function validateJsonSchema(schema: JsonSchema, value: unknown): string[] {
  const errors: string[] = [];
  check(schema, value, "", schema, errors);
  return errors;
}

function resolve(ref: string, root: JsonSchema): JsonSchema {
  const prefix = "#/definitions/";
  if (!ref.startsWith(prefix) || !isJsonObject(root) || !isJsonObject(root.definitions)) {
    throw new Error(`test validator: cannot resolve ${ref}`);
  }
  const target = root.definitions[ref.slice(prefix.length)];
  if (target === undefined) throw new Error(`test validator: no definition for ${ref}`);
  return target as JsonSchema;
}

function check(schema: JsonSchema, value: unknown, path: string, root: JsonSchema, errors: string[]): void {
  if (schema === true) return;
  if (schema === false) {
    errors.push(`${path}: not allowed`);
    return;
  }
  const at = (key: string | number): string => (path === "" ? String(key) : `${path}.${key}`);

  for (const [keyword, rule] of Object.entries(schema)) {
    switch (keyword) {
      case "$ref":
        check(resolve(rule as string, root), value, path, root, errors);
        break;
      case "type": {
        const allowed = Array.isArray(rule) ? rule : [rule];
        if (!allowed.includes(typeOf(value))) errors.push(`${path}: type`);
        break;
      }
      case "const":
        if (!jsonEquals(value, rule)) errors.push(`${path}: const`);
        break;
      case "enum":
        if (!(rule as unknown[]).some((option) => jsonEquals(option, value))) errors.push(`${path}: enum`);
        break;
      case "pattern":
        if (typeof value === "string" && !new RegExp(rule as string).test(value)) errors.push(`${path}: pattern`);
        break;
      case "minimum":
        if (typeof value === "number" && value < (rule as number)) errors.push(`${path}: minimum`);
        break;
      case "maximum":
        if (typeof value === "number" && value > (rule as number)) errors.push(`${path}: maximum`);
        break;
      case "minItems":
        if (Array.isArray(value) && value.length < (rule as number)) errors.push(`${path}: minItems`);
        break;
      case "maxItems":
        if (Array.isArray(value) && value.length > (rule as number)) errors.push(`${path}: maxItems`);
        break;
      case "items":
        if (Array.isArray(value)) {
          value.forEach((element, index) => check(rule as JsonSchema, element, at(index), root, errors));
        }
        break;
      case "properties":
        if (isJsonObject(value)) {
          for (const [key, child] of Object.entries(rule as Record<string, JsonSchema>)) {
            if (Object.hasOwn(value, key)) check(child, value[key], at(key), root, errors);
          }
        }
        break;
      case "required":
        if (isJsonObject(value)) {
          for (const key of rule as string[]) {
            if (!Object.hasOwn(value, key)) errors.push(`${at(key)}: required`);
          }
        }
        break;
      case "additionalProperties":
        if (isJsonObject(value)) {
          const known = isJsonObject(schema.properties) ? schema.properties : {};
          for (const key of Object.keys(value)) {
            if (!Object.hasOwn(known, key)) check(rule as JsonSchema, value[key], at(key), root, errors);
          }
        }
        break;
      case "propertyNames":
        if (isJsonObject(value)) {
          for (const key of Object.keys(value)) {
            check(rule as JsonSchema, key, at(key), root, errors);
          }
        }
        break;
      case "allOf":
        for (const part of rule as JsonSchema[]) {
          check(part, value, path, root, errors);
        }
        break;
      case "if": {
        const probe: string[] = [];
        check(rule as JsonSchema, value, path, root, probe);
        const branch = probe.length === 0 ? schema.then : schema.else;
        if (branch !== undefined) check(branch as JsonSchema, value, path, root, errors);
        break;
      }
      case "then":
      case "else":
        break; // handled with "if"
      default:
        if (!ANNOTATIONS.has(keyword)) {
          throw new Error(`test validator: unsupported keyword "${keyword}"`);
        }
    }
  }
}
