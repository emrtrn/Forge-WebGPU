// The single normalise function for field values (architecture §4.5, A2).
//
// Loading and saving both go through here; there is no second allowlist.
// Rules:
// - missing field        -> its default (a missing required text is a loss)
// - number out of range  -> clamped to the limit (warning)
// - unknown field        -> dropped; error under `strict`, warning otherwise
// - wrong type           -> default; error under `strict`, warning otherwise
//
// Output is canonical: every field present, keys in definition order, and no
// object shared with the input or with a definition's default.

import { isId } from "../id.ts";
import { isJsonObject, jsonEquals, type JsonObject } from "../json.ts";
import {
  SchemaDefinitionError,
  type FieldDef,
  type FieldMap,
  type FieldValues,
  type Transform,
  type Vec3,
  type Vec4,
} from "./fields.ts";
import {
  childPath,
  createContext,
  finish,
  indexPath,
  reportAdjustment,
  reportLoss,
  type NormalizeContext,
  type NormalizeOptions,
  type NormalizeResult,
} from "./issues.ts";

const COLOR_INPUT_PATTERN = /^#[0-9a-fA-F]{6}$/;

function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  if (typeof value === "number" && !Number.isFinite(value)) return String(value);
  return `a ${typeof value}`;
}

function invalid(ctx: NormalizeContext, path: string, expected: string, raw: unknown): void {
  reportLoss(ctx, "invalid-value", path, `Expected ${expected}, got ${describe(raw)}; default used.`);
}

function clamp(
  value: number,
  min: number | undefined,
  max: number | undefined,
  path: string,
  ctx: NormalizeContext,
): number {
  if (min !== undefined && value < min) {
    reportAdjustment(ctx, "clamped", path, `${value} is below the minimum; clamped to ${min}.`);
    return min;
  }
  if (max !== undefined && value > max) {
    reportAdjustment(ctx, "clamped", path, `${value} is above the maximum; clamped to ${max}.`);
    return max;
  }
  return value;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNumberList(value: unknown, length: number): value is number[] {
  return Array.isArray(value) && value.length === length && value.every(isFiniteNumber);
}

/** A fresh, mutable copy of a field's default value. */
export function defaultValue(field: FieldDef): unknown {
  if (field.kind === "object") {
    const value: JsonObject = {};
    for (const [key, child] of Object.entries(field.fields)) {
      value[key] = defaultValue(child);
    }
    return value;
  }
  return structuredClone(field.default);
}

/**
 * Normalises a transform. Parts the input leaves out come from `fallback`.
 * Used for transform fields, a spatial component's `local` and an actor's
 * `transform`.
 */
export function normalizeTransform(
  raw: unknown,
  fallback: Readonly<Transform>,
  path: string,
  ctx: NormalizeContext,
): Transform {
  let source: JsonObject = {};
  if (isJsonObject(raw)) {
    source = raw;
  } else if (raw !== undefined) {
    invalid(ctx, path, "a transform object", raw);
  }
  const part = (key: keyof Transform, length: number): number[] => {
    const given = source[key];
    if (isNumberList(given, length)) return [...given];
    if (given !== undefined) {
      invalid(ctx, childPath(path, key), `${length} finite numbers`, given);
    }
    return [...fallback[key]];
  };
  const value: Transform = {
    p: part("p", 3) as Vec3,
    r: part("r", 4) as Vec4,
    s: part("s", 3) as Vec3,
  };
  for (const key of Object.keys(source)) {
    if (key !== "p" && key !== "r" && key !== "s") {
      reportLoss(ctx, "unknown-field", childPath(path, key), "A transform has only p, r and s; dropped.");
    }
  }
  return value;
}

/** Normalises one value against its field definition. `undefined` means missing. */
export function normalizeValue(
  field: FieldDef,
  raw: unknown,
  path: string,
  ctx: NormalizeContext,
): unknown {
  if (raw === undefined) {
    // A missing group is normalised field by field so a required field inside
    // it is reported; the value is the same as its default.
    if (field.kind === "object") return normalizeFieldMap(field.fields, {}, path, ctx);
    if (field.kind === "text" && field.required) {
      reportLoss(ctx, "missing-required", path, "A value is required.");
    }
    return defaultValue(field);
  }

  switch (field.kind) {
    case "number":
      if (!isFiniteNumber(raw)) {
        invalid(ctx, path, "a finite number", raw);
        return field.default;
      }
      return clamp(raw, field.min, field.max, path, ctx);

    case "bool":
      if (typeof raw !== "boolean") {
        invalid(ctx, path, "a boolean", raw);
        return field.default;
      }
      return raw;

    case "enum":
      if (typeof raw !== "string" || !field.values.includes(raw)) {
        invalid(ctx, path, `one of ${field.values.join(", ")}`, raw);
        return field.default;
      }
      return raw;

    case "color":
      if (typeof raw !== "string" || !COLOR_INPUT_PATTERN.test(raw)) {
        invalid(ctx, path, "a #rrggbb color", raw);
        return field.default;
      }
      return raw.toLowerCase();

    case "text":
      if (typeof raw !== "string") {
        invalid(ctx, path, "a string", raw);
        return field.default;
      }
      if (field.required && raw.trim() === "") {
        reportLoss(ctx, "missing-required", path, "A value is required; it is blank.");
        return raw;
      }
      if (field.pattern !== undefined && raw !== "" && !new RegExp(field.pattern).test(raw)) {
        reportLoss(ctx, "invalid-value", path, `"${raw}" does not match ${field.pattern}; default used.`);
        return field.default;
      }
      return raw;

    case "vector":
      if (!isNumberList(raw, field.size)) {
        invalid(ctx, path, `${field.size} finite numbers`, raw);
        return [...field.default];
      }
      return raw.map((element, index) =>
        clamp(element, field.min, field.max, indexPath(path, index), ctx),
      );

    case "transform":
      return normalizeTransform(raw, field.default, path, ctx);

    case "assetRef":
      if (raw !== null && !isId(raw, "asset")) {
        invalid(ctx, path, "an asset id or null", raw);
        return null;
      }
      return raw;

    case "actorRef":
      if (raw !== null && !isId(raw, "actor")) {
        invalid(ctx, path, "an actor id or null", raw);
        return null;
      }
      return raw;

    case "array":
      if (!Array.isArray(raw)) {
        invalid(ctx, path, "an array", raw);
        return defaultValue(field);
      }
      // Array.from visits holes too. A hole or an undefined element cannot come
      // from JSON and is not "missing": it is an invalid element.
      return Array.from(raw, (element: unknown, index) => {
        if (element === undefined) {
          invalid(ctx, indexPath(path, index), "a value", element);
        }
        return normalizeValue(field.item, element, indexPath(path, index), ctx);
      });

    case "object":
      if (!isJsonObject(raw)) {
        invalid(ctx, path, "an object", raw);
        return defaultValue(field);
      }
      return normalizeFieldMap(field.fields, raw, path, ctx);
  }
}

/** Normalises the keys of `raw` against a field map. */
export function normalizeFieldMap(
  fields: FieldMap,
  raw: JsonObject,
  path: string,
  ctx: NormalizeContext,
): JsonObject {
  const value: JsonObject = {};
  for (const [key, field] of Object.entries(fields)) {
    value[key] = normalizeValue(field, raw[key], childPath(path, key), ctx);
  }
  for (const key of Object.keys(raw)) {
    if (!Object.hasOwn(fields, key)) {
      reportLoss(ctx, "unknown-field", childPath(path, key), "The schema has no such field; dropped.");
    }
  }
  return value;
}

/** Normalises a bare set of field values (no component envelope). */
export function normalizeFields<M extends FieldMap>(
  fields: M,
  raw: unknown,
  options: NormalizeOptions,
): NormalizeResult<FieldValues<M>> {
  const ctx = createContext(options);
  let source: JsonObject = {};
  if (isJsonObject(raw)) {
    source = raw;
  } else {
    invalid(ctx, "", "an object", raw);
  }
  return finish(ctx, normalizeFieldMap(fields, source, "", ctx) as FieldValues<M>);
}

/**
 * Definition-time check: every default must already be in normal form, so a
 * freshly created component saves without issues. Throws on the first default
 * that is not.
 */
export function assertDefaultsAreNormal(what: string, fields: FieldMap): void {
  const ctx = createContext({ strict: true });
  for (const [key, field] of Object.entries(fields)) {
    const given = defaultValue(field);
    const normal = normalizeValue(field, given, key, ctx);
    const issue = ctx.issues[0];
    if (issue) {
      throw new SchemaDefinitionError(`${what}: default of "${issue.path}" is not valid. ${issue.message}`);
    }
    if (!jsonEquals(given, normal)) {
      throw new SchemaDefinitionError(`${what}: default of "${key}" is not in normal form.`);
    }
  }
}
