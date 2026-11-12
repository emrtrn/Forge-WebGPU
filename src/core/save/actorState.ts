// One actor's save state: what a save keeps of it (capture) and how a saved
// entry comes back onto it (apply). Pure; the run time calls capture when it
// saves or when the actor's cell unloads, apply before the actor joins the
// world (a loaded cell, a restored save), so play starts from the saved state.
//
// `authored` is what the actor is without play: its effective components (the
// level's, or its class's with overrides) and its level transform; for a
// spawned actor, its spawned document. Capture keeps what differs from it.

import { jsonEquals } from "../json.ts";
import type { ComponentMap } from "../level/model.ts";
import { componentTypeTag, parseComponentTypeTag } from "../schema/component.ts";
import type { Transform } from "../schema/fields.ts";
import { reportLoss, type NormalizeContext } from "../schema/issues.ts";
import { defaultValue } from "../schema/normalize.ts";
import { persistFieldKeys } from "../schema/persist.ts";
import { componentDefOf, type SchemaRegistry } from "../schema/registry.ts";
import type { SavedActor, SavedEntry } from "./saveGame.ts";

export interface ActorStateSnapshot {
  readonly transform: Transform;
  readonly components: ComponentMap;
}

/**
 * The components with every `state` value their definition declares and the
 * record lacks set to its default: the run-time shape of a component. A fresh
 * copy; unregistered components are copied as they are.
 */
export function withComponentState(components: ComponentMap, registry: SchemaRegistry): ComponentMap {
  const out = structuredClone(components);
  for (const record of Object.values(out)) {
    const def = componentDefOf(registry, record);
    if (!def) continue;
    for (const [key, field] of Object.entries(def.state)) {
      if (record[key] === undefined) record[key] = defaultValue(field);
    }
  }
  return out;
}

/** What a save keeps of an actor; null when nothing differs from `authored`. */
export function captureActorState(
  authored: ActorStateSnapshot,
  live: ActorStateSnapshot,
  registry: SchemaRegistry,
): SavedActor | null {
  const components: Record<string, SavedEntry> = {};
  let keepsTransform = false;
  for (const [key, record] of Object.entries(live.components)) {
    const def = componentDefOf(registry, record);
    if (!def) continue;
    keepsTransform ||= def.persistTransform;
    const base = Object.hasOwn(authored.components, key) ? authored.components[key] : undefined;
    const sameType = base !== undefined && parseComponentTypeTag(base.type)?.name === def.name;
    const entry: Record<string, unknown> = {};
    for (const field of persistFieldKeys(def.fields)) {
      if (record[field] === undefined) continue;
      const level = sameType ? base[field] : defaultValue(def.fields[field]!);
      if (!jsonEquals(record[field], level)) entry[field] = structuredClone(record[field]);
    }
    for (const [field, definition] of Object.entries(def.state)) {
      if (record[field] === undefined) continue;
      if (!jsonEquals(record[field], defaultValue(definition))) entry[field] = structuredClone(record[field]);
    }
    if (Object.keys(entry).length > 0) components[key] = { type: componentTypeTag(def), ...entry };
  }
  const moved = keepsTransform && !jsonEquals(live.transform, authored.transform);
  if (!moved && Object.keys(components).length === 0) return null;
  return { ...(moved ? { transform: structuredClone(live.transform) } : {}), components };
}

/**
 * The actor with its saved entry on it (components in their run-time shape,
 * {@link withComponentState}). An entry for a component the actor no longer
 * has, or has under another type, is reported at `path` and dropped: the
 * level changed since the save. `saved` comes from `normalizeSaveGame`, so its
 * entries are at the current versions.
 */
export function applyActorState(
  authored: ActorStateSnapshot,
  saved: SavedActor | undefined,
  registry: SchemaRegistry,
  path: string,
  ctx: NormalizeContext,
): ActorStateSnapshot {
  const components = withComponentState(authored.components, registry);
  const transform = structuredClone(saved?.transform ?? authored.transform);
  for (const [key, entry] of Object.entries(saved?.components ?? {})) {
    const target = Object.hasOwn(components, key) ? components[key] : undefined;
    const name = parseComponentTypeTag(entry.type)?.name;
    if (!target || componentDefOf(registry, target)?.name !== name) {
      reportLoss(ctx, "invalid-override", `${path}.components.${key}`, `The actor has no ${name} "${key}" now; its saved state is dropped.`);
      continue;
    }
    for (const [field, value] of Object.entries(entry)) {
      if (field !== "type") target[field] = structuredClone(value);
    }
  }
  return { transform, components };
}
