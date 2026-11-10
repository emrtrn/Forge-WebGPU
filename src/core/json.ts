// Small helpers for JSON-shaped values.

export type JsonObject = Record<string, unknown>;

/** A non-null, non-array object. */
export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Structural equality of JSON-shaped values. Object key order does not matter. */
export function jsonEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((element, index) => jsonEquals(element, b[index]));
  }
  if (isJsonObject(a) && isJsonObject(b)) {
    const keys = Object.keys(a);
    if (keys.length !== Object.keys(b).length) return false;
    return keys.every((key) => Object.hasOwn(b, key) && jsonEquals(a[key], b[key]));
  }
  return false;
}
