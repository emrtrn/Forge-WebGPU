// Paths into a form's value: object keys and array indices from the
// component root. The kit reports every edit as (path, value); a panel turns
// it into its own change (Details: a transaction on the actor). Values are
// never mutated: `setAtPath` copies along the path.

export type FormPath = readonly (string | number)[];

/** `wheel.radius`, `waypoints[2]`, `layers[0].tint` — the text form for test ids and messages. */
export function pathKey(path: FormPath): string {
  let text = "";
  for (const segment of path) {
    if (typeof segment === "number") text += `[${segment}]`;
    else text += text === "" ? segment : `.${segment}`;
  }
  return text;
}

export function getAtPath(root: unknown, path: FormPath): unknown {
  let current = root;
  for (const segment of path) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string | number, unknown>)[segment];
  }
  return current;
}

/** A copy of `root` with `value` at `path`; containers on the path are copied, the rest shared. */
export function setAtPath<T>(root: T, path: FormPath, value: unknown): T {
  if (path.length === 0) return value as T;
  const [head, ...rest] = path;
  if (typeof head === "number") {
    const array = Array.isArray(root) ? [...(root as unknown[])] : [];
    array[head] = setAtPath(array[head], rest, value);
    return array as T;
  }
  const object = root !== null && typeof root === "object" && !Array.isArray(root) ? { ...(root as Record<string, unknown>) } : {};
  object[head!] = setAtPath(object[head!], rest, value);
  return object as T;
}
