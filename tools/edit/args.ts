// The agent's edit commands as words (A12; plan phase 4 step 9d, decision 5).
//
//   find [--name <text>] [--component <type>] [--class <class>] [--near x,y,z --radius r] [--limit n]
//   show <id> [--effective]
//   add [--class <class> | --component <local id>=<type> ...] [--name <name>] [--at x,y,z] [--rot x,y,z]
//       [--scale x,y,z | s] [--parent <id>] [--set <path>=<value> ...]
//   move <id...> [--to x,y,z | --by x,y,z] [--rot x,y,z] [--scale x,y,z | s] [--parent <id> | none]
//   delete <id...>
//   set <id...> <path>=<value> ...
//   reset <id...> <component>[.<field>]
//
// An id is an actor GUID or a prefix of one that names a single actor
// (`act_3fa2`). A class is its GUID or its file (`content/classes/door.actorclass.json`).
// A path starts at a component's local id (`light.intensity`,
// `shape.local.p[1]`) or at `actor.` for the actor's own fields
// (`actor.name`, `actor.locked`). A value is JSON; anything that does not
// parse as JSON is a string (`color=#ff8800`, `primitive=cube`). Rotations
// are XYZ degrees. Transforms are the actor's own (in its parent's space, as
// Details shows them; at the level root that is the world).
//
// Several commands in one run (`edit … -`, user decision 2026-11-15) come one
// per line from stdin and are one transaction and one save; `#` starts a
// comment line.

import type { Vec3 } from "../../src/core/index.ts";

export type Command =
  | {
      readonly kind: "find";
      readonly name?: string;
      readonly component?: string;
      readonly cls?: string;
      readonly near?: { readonly at: Vec3; readonly radius: number };
      readonly limit: number;
    }
  | { readonly kind: "show"; readonly id: string; readonly effective: boolean }
  | {
      readonly kind: "add";
      readonly cls?: string;
      readonly components: readonly { readonly id: string; readonly type: string }[];
      readonly name?: string;
      readonly at?: Vec3;
      readonly rot?: Vec3;
      readonly scale?: Vec3;
      readonly parent?: string;
      readonly sets: readonly Assignment[];
    }
  | {
      readonly kind: "move";
      readonly ids: readonly string[];
      readonly to?: Vec3;
      readonly by?: Vec3;
      readonly rot?: Vec3;
      readonly scale?: Vec3;
      /** null: to the level root. */
      readonly parent?: string | null;
    }
  | { readonly kind: "delete"; readonly ids: readonly string[] }
  | { readonly kind: "set"; readonly ids: readonly string[]; readonly sets: readonly Assignment[] }
  | { readonly kind: "reset"; readonly ids: readonly string[]; readonly component: string; readonly field: string | null };

export interface Assignment {
  /** As written: `light.intensity`. */
  readonly text: string;
  readonly path: readonly (string | number)[];
  readonly value: unknown;
}

export class CommandError extends Error {}

export const DEFAULT_FIND_LIMIT = 50;

export const COMMAND_USAGE = [
  "find [--name <text>] [--component <type>] [--class <class>] [--near x,y,z --radius r] [--limit n]",
  "show <id> [--effective]",
  "add [--class <class> | --component <local id>=<type> ...] [--name <name>] [--at x,y,z] [--rot x,y,z] [--scale x,y,z|s] [--parent <id>] [--set <path>=<value> ...]",
  "move <id...> [--to x,y,z | --by x,y,z] [--rot x,y,z] [--scale x,y,z|s] [--parent <id>|none]",
  "delete <id...>",
  "set <id...> <path>=<value> ...",
  "reset <id...> <component>[.<field>]",
];

/** Splits a command line into words: spaces separate, "double" and 'single' quotes group, a backslash escapes. */
export function splitWords(line: string): string[] {
  const words: string[] = [];
  let word = "";
  let started = false;
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]!;
    if (quote !== null) {
      if (char === quote) quote = null;
      else if (char === "\\" && quote === '"' && i + 1 < line.length) word += line[(i += 1)]!;
      else word += char;
    } else if (char === '"' || char === "'") {
      quote = char;
      started = true;
    } else if (char === "\\" && i + 1 < line.length) {
      word += line[(i += 1)]!;
      started = true;
    } else if (/\s/.test(char)) {
      if (started) words.push(word);
      word = "";
      started = false;
    } else {
      word += char;
      started = true;
    }
  }
  if (quote !== null) throw new CommandError(`Unclosed ${quote} in: ${line}`);
  if (started) words.push(word);
  return words;
}

/** `wheel.radius`, `layers[0].tint` -> ["wheel", "radius"], ["layers", 0, "tint"]. */
export function parsePath(text: string): (string | number)[] {
  const path: (string | number)[] = [];
  for (const match of text.matchAll(/([^.[\]]+)|\[(\d+)\]/g)) path.push(match[1] !== undefined ? match[1] : Number(match[2]));
  // Strict: the path written back must read as given (no `a..b`, `a[x]`, trailing dot).
  const rebuilt = path.map((segment, index) => (typeof segment === "number" ? `[${segment}]` : index === 0 ? segment : `.${segment}`)).join("");
  if (path.length === 0 || rebuilt !== text) throw new CommandError(`Not a field path: ${text} (e.g. light.intensity, shape.local.p[1])`);
  return path;
}

/** JSON, else the text itself. */
export function parseValue(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export function parseAssignment(text: string): Assignment {
  const at = text.indexOf("=");
  if (at <= 0) throw new CommandError(`Expected <path>=<value>, got: ${text}`);
  const pathText = text.slice(0, at);
  return { text: pathText, path: parsePath(pathText), value: parseValue(text.slice(at + 1)) };
}

export function parseVec3(text: string, what: string, uniform = false): Vec3 {
  const parts = text.split(",").map((part) => part.trim());
  if (uniform && parts.length === 1) parts.push(parts[0]!, parts[0]!);
  const numbers = parts.map(Number);
  if (numbers.length !== 3 || numbers.some((value, index) => parts[index] === "" || !Number.isFinite(value))) {
    throw new CommandError(`${what} takes x,y,z${uniform ? " or one number" : ""}, got: ${text}`);
  }
  return [numbers[0]!, numbers[1]!, numbers[2]!];
}

function parseNumber(text: string, what: string): number {
  const value = Number(text);
  if (text.trim() === "" || !Number.isFinite(value)) throw new CommandError(`${what} takes a number, got: ${text}`);
  return value;
}

/** Options (`--name value`, repeatable ones collected) and positional words. */
function readOptions(words: readonly string[], known: Readonly<Record<string, "value" | "flag" | "list">>): { positional: string[]; values: Map<string, string[]> } {
  const positional: string[] = [];
  const values = new Map<string, string[]>();
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i]!;
    if (!word.startsWith("--")) {
      positional.push(word);
      continue;
    }
    const name = word.slice(2);
    const kind = known[name];
    if (kind === undefined) throw new CommandError(`Unknown option ${word}; options: ${Object.keys(known).map((key) => `--${key}`).join(", ") || "none"}`);
    if (kind === "flag") {
      values.set(name, ["true"]);
      continue;
    }
    const value = words[i + 1];
    if (value === undefined) throw new CommandError(`${word} needs a value.`);
    i += 1;
    if (kind === "value" && values.has(name)) throw new CommandError(`${word} is given twice.`);
    values.set(name, [...(values.get(name) ?? []), value]);
  }
  return { positional, values };
}

const one = (values: Map<string, string[]>, name: string): string | undefined => values.get(name)?.[0];

function needIds(ids: readonly string[], kind: string): void {
  if (ids.length === 0) throw new CommandError(`${kind} needs at least one actor id.`);
}

/** One command from its words; throws `CommandError` with the usage line when it does not read. */
export function parseCommand(words: readonly string[]): Command {
  const [kind, ...rest] = words;
  try {
    switch (kind) {
      case "find": {
        const { positional, values } = readOptions(rest, { name: "value", component: "value", class: "value", near: "value", radius: "value", limit: "value" });
        if (positional.length > 0) throw new CommandError(`find takes options only, got: ${positional.join(" ")}`);
        const near = one(values, "near");
        const radius = one(values, "radius");
        if ((near === undefined) !== (radius === undefined)) throw new CommandError("--near and --radius go together.");
        const limit = one(values, "limit");
        const name = one(values, "name");
        const component = one(values, "component");
        const cls = one(values, "class");
        return {
          kind,
          ...(name === undefined ? {} : { name }),
          ...(component === undefined ? {} : { component }),
          ...(cls === undefined ? {} : { cls }),
          ...(near === undefined ? {} : { near: { at: parseVec3(near, "--near"), radius: parseNumber(radius!, "--radius") } }),
          limit: limit === undefined ? DEFAULT_FIND_LIMIT : Math.max(1, Math.floor(parseNumber(limit, "--limit"))),
        };
      }
      case "show": {
        const { positional, values } = readOptions(rest, { effective: "flag" });
        if (positional.length !== 1) throw new CommandError("show takes one actor id.");
        return { kind, id: positional[0]!, effective: values.has("effective") };
      }
      case "add": {
        const { positional, values } = readOptions(rest, { class: "value", component: "list", name: "value", at: "value", rot: "value", scale: "value", parent: "value", set: "list" });
        if (positional.length > 0) throw new CommandError(`add takes options only, got: ${positional.join(" ")}`);
        const cls = one(values, "class");
        const components = (values.get("component") ?? []).map((text) => {
          const at = text.indexOf("=");
          if (at <= 0 || at === text.length - 1) throw new CommandError(`--component takes <local id>=<type>, got: ${text}`);
          return { id: text.slice(0, at), type: text.slice(at + 1) };
        });
        if (cls !== undefined && components.length > 0) throw new CommandError("add takes --class or --component, not both (a class actor takes its components from its class).");
        const name = one(values, "name");
        const at = one(values, "at");
        const rot = one(values, "rot");
        const scale = one(values, "scale");
        const parent = one(values, "parent");
        return {
          kind,
          ...(cls === undefined ? {} : { cls }),
          components,
          ...(name === undefined ? {} : { name }),
          ...(at === undefined ? {} : { at: parseVec3(at, "--at") }),
          ...(rot === undefined ? {} : { rot: parseVec3(rot, "--rot") }),
          ...(scale === undefined ? {} : { scale: parseVec3(scale, "--scale", true) }),
          ...(parent === undefined ? {} : { parent }),
          sets: (values.get("set") ?? []).map(parseAssignment),
        };
      }
      case "move": {
        const { positional, values } = readOptions(rest, { to: "value", by: "value", rot: "value", scale: "value", parent: "value" });
        needIds(positional, "move");
        const to = one(values, "to");
        const by = one(values, "by");
        if (to !== undefined && by !== undefined) throw new CommandError("move takes --to or --by, not both.");
        const rot = one(values, "rot");
        const scale = one(values, "scale");
        const parent = one(values, "parent");
        if ([to, by, rot, scale, parent].every((value) => value === undefined)) throw new CommandError("move needs --to, --by, --rot, --scale or --parent.");
        return {
          kind,
          ids: positional,
          ...(to === undefined ? {} : { to: parseVec3(to, "--to") }),
          ...(by === undefined ? {} : { by: parseVec3(by, "--by") }),
          ...(rot === undefined ? {} : { rot: parseVec3(rot, "--rot") }),
          ...(scale === undefined ? {} : { scale: parseVec3(scale, "--scale", true) }),
          ...(parent === undefined ? {} : { parent: parent === "none" ? null : parent }),
        };
      }
      case "delete": {
        const { positional } = readOptions(rest, {});
        needIds(positional, "delete");
        return { kind, ids: positional };
      }
      case "set": {
        const { positional } = readOptions(rest, {});
        const ids = positional.filter((word) => !word.includes("="));
        const sets = positional.filter((word) => word.includes("="));
        needIds(ids, "set");
        if (sets.length === 0) throw new CommandError("set needs at least one <path>=<value>.");
        if (positional.findIndex((word) => word.includes("=")) < ids.length) throw new CommandError("set takes the ids first, then <path>=<value> ...");
        return { kind, ids, sets: sets.map(parseAssignment) };
      }
      case "reset": {
        const { positional } = readOptions(rest, {});
        if (positional.length < 2) throw new CommandError("reset takes actor ids and <component>[.<field>].");
        const target = positional[positional.length - 1]!;
        const path = parsePath(target);
        if (path.length > 2 || typeof path[1] === "number") throw new CommandError(`reset takes <component> or <component>.<field>, got: ${target}`);
        return { kind, ids: positional.slice(0, -1), component: String(path[0]), field: path.length === 2 ? String(path[1]) : null };
      }
      default:
        throw new CommandError(kind === undefined ? "No command." : `Unknown command: ${kind}.`);
    }
  } catch (error) {
    if (!(error instanceof CommandError)) throw error;
    const usage = COMMAND_USAGE.find((line) => line.startsWith(`${kind} `));
    throw new CommandError(usage ? `${error.message}\n  usage: ${usage}` : `${error.message}\n  commands:\n    ${COMMAND_USAGE.join("\n    ")}`);
  }
}

/** The commands of a batch (`edit … -`): one per line, blank and `#` lines skipped. */
export function parseBatch(text: string): { line: number; command: Command }[] {
  const commands: { line: number; command: Command }[] = [];
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) return;
    try {
      commands.push({ line: index + 1, command: parseCommand(splitWords(line)) });
    } catch (error) {
      if (error instanceof CommandError) throw new CommandError(`line ${index + 1}: ${error.message}`);
      throw error;
    }
  });
  return commands;
}
