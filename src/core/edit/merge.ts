// Three-way merge of the editor's level with the level on disk (plan phase 4
// step 8; user decision 2026-11-15: field level). A save refused with a 409
// means someone else (an agent's command, another editor) wrote the level
// since this session read it. The session keeps the base (what it read or
// last saved), so each side's changes are known:
//
// - JSON values merge per object key, down to the leaves; arrays and leaves
//   are whole values. An actor's components (and a class actor's overrides)
//   are maps keyed by the component's local id, so one side moving an actor
//   and the other changing one of its components' fields both survive.
// - A place only one side changed takes that side. Both sides making the
//   same change is no conflict. Both changing it differently (deleting the
//   actor on one side counts) is a conflict, resolved by picking a side.
// - Actors match by id; the merged level keeps the disk's order, with the
//   session's new actors after it. Level settings merge the same way.
//
// Pure: the session (levelSession.ts) normalises the result and applies it.

import type { ActorId } from "../id.ts";
import type { ActorDoc, LevelDoc } from "../level/model.ts";
import type { LevelSettings } from "../level/settings.ts";

export type MergeSide = "mine" | "theirs";

/** One place both sides changed differently. `undefined` is absent (a removed key, a deleted actor). */
export interface FieldConflict {
  readonly path: readonly string[];
  readonly base: unknown;
  readonly mine: unknown;
  readonly theirs: unknown;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Deep equality of JSON values; key order does not matter. */
export function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((item, index) => jsonEqual(item, b[index]));
  if (isObject(a)) {
    if (!isObject(b)) return false;
    const keys = Object.keys(a).filter((key) => a[key] !== undefined);
    const other = Object.keys(b).filter((key) => b[key] !== undefined);
    return keys.length === other.length && keys.every((key) => jsonEqual(a[key], b[key]));
  }
  return false;
}

/**
 * Merges `mine` and `theirs`, both changed from `base`. Each conflict is
 * resolved by `pick` (default: mine) and listed.
 */
export function mergeJson(
  base: unknown,
  mine: unknown,
  theirs: unknown,
  pick: (conflict: FieldConflict) => MergeSide = () => "mine",
): { readonly value: unknown; readonly conflicts: readonly FieldConflict[] } {
  const conflicts: FieldConflict[] = [];
  const merge = (b: unknown, m: unknown, t: unknown, path: readonly string[]): unknown => {
    if (jsonEqual(m, t)) return m;
    if (jsonEqual(b, m)) return t;
    if (jsonEqual(b, t)) return m;
    if (isObject(b) && isObject(m) && isObject(t)) {
      const out: Record<string, unknown> = {};
      const keys = [...new Set([...Object.keys(m), ...Object.keys(t)])];
      for (const key of keys) {
        const value = merge(b[key], m[key], t[key], [...path, key]);
        if (value !== undefined) out[key] = value;
      }
      return out;
    }
    const conflict: FieldConflict = { path, base: b, mine: m, theirs: t };
    conflicts.push(conflict);
    return pick(conflict) === "mine" ? m : t;
  };
  const value = merge(base, mine, theirs, []);
  return { value, conflicts };
}

/** What a level merge is about: the level's settings or one actor. */
export type MergeKey = "settings" | ActorId;

/** The conflicts of one actor (or of the settings), for the Compare window. */
export interface LevelConflict {
  readonly key: MergeKey;
  /** The actor's name (either side's), or "Level settings". */
  readonly label: string;
  readonly fields: readonly FieldConflict[];
}

export interface LevelMergeInput {
  /** The level as the session read or last saved it. */
  readonly base: { readonly settings: LevelSettings; readonly actors: ReadonlyMap<ActorId, ActorDoc> };
  /** The session's level now. */
  readonly mine: LevelDoc;
  /** The level on disk now. */
  readonly theirs: LevelDoc;
}

export interface LevelMerge {
  readonly conflicts: readonly LevelConflict[];
  /** Actors only the session changed (kept) and only the disk changed (taken). */
  readonly fromMine: readonly ActorId[];
  readonly fromTheirs: readonly ActorId[];
  /** Whether the settings changed on disk alone. */
  readonly settingsFromTheirs: boolean;
  /**
   * The merged level, each conflict resolved by `pick` for its key (default:
   * mine). Actors are raw JSON (the session normalises them); null settings
   * never happen.
   */
  resolve(pick?: (key: MergeKey) => MergeSide): { readonly settings: unknown; readonly actors: readonly unknown[] };
}

export function planLevelMerge(input: LevelMergeInput): LevelMerge {
  const mine = new Map<ActorId, ActorDoc>(input.mine.actors.map((actor) => [actor.id, actor]));
  const theirs = new Map<ActorId, ActorDoc>(input.theirs.actors.map((actor) => [actor.id, actor]));
  const ids: ActorId[] = [...input.theirs.actors.map((actor) => actor.id)];
  for (const actor of input.mine.actors) if (!theirs.has(actor.id)) ids.push(actor.id);
  for (const id of input.base.actors.keys()) if (!mine.has(id) && !theirs.has(id)) ids.push(id);

  const conflicts: LevelConflict[] = [];
  const fromMine: ActorId[] = [];
  const fromTheirs: ActorId[] = [];
  const probe = mergeJson(input.base.settings, input.mine.settings, input.theirs.settings);
  if (probe.conflicts.length > 0) conflicts.push({ key: "settings", label: "Level settings", fields: probe.conflicts });
  const settingsFromTheirs = probe.conflicts.length === 0 && !jsonEqual(input.theirs.settings, input.base.settings) && jsonEqual(input.mine.settings, input.base.settings);
  for (const id of ids) {
    const b = input.base.actors.get(id);
    const m = mine.get(id);
    const t = theirs.get(id);
    const changedMine = !jsonEqual(b, m);
    const changedTheirs = !jsonEqual(b, t);
    if (!changedMine && !changedTheirs) continue;
    const result = mergeJson(b, m, t);
    if (result.conflicts.length > 0) conflicts.push({ key: id, label: m?.name ?? t?.name ?? b?.name ?? id, fields: result.conflicts });
    else if (changedMine && !jsonEqual(m, t)) fromMine.push(id);
    else if (changedTheirs && !jsonEqual(m, t)) fromTheirs.push(id);
  }

  return {
    conflicts,
    fromMine,
    fromTheirs,
    settingsFromTheirs,
    resolve(pick = () => "mine") {
      const settings = mergeJson(input.base.settings, input.mine.settings, input.theirs.settings, () => pick("settings")).value;
      const actors: unknown[] = [];
      for (const id of ids) {
        const value = mergeJson(input.base.actors.get(id), mine.get(id), theirs.get(id), () => pick(id)).value;
        if (value !== undefined) actors.push(value);
      }
      return { settings, actors };
    },
  };
}
