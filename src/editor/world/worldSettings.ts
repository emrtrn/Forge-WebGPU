// World Settings (INV-A30, plan phase 4 step 5e; user decision 2026-11-14).
// Forge's World Settings held the level's environment values; here they live
// on their owners' singleton components (phase 3 decision), so the panel is
// the level's own settings (Cell Size, read only: changing it rewrites every
// cell, a world-wide operation) and the list of the one-per-level actors the
// level has or lacks: a present one is selected and edited in Details, a
// missing one is added from its Add Actor entry. DOM-free (Node tests).

import { parseComponentTypeTag, type ActorDoc, type ClassResolver, type ComponentMap, type SchemaRegistry } from "../../core/index.ts";
import type { PlacerEntry } from "../place/actorPlacer.ts";

export interface EnvironmentRow {
  /** The singleton component's name (`forge.skyAtmosphere`). */
  readonly component: string;
  readonly label: string;
  /** The level's actor carrying it; null when the level has none. */
  readonly actor: ActorDoc | null;
  /** The Add Actor entry that places it; null when no feature offers one. */
  readonly entry: string | null;
}

/** Every singleton component, in the Add Actor menu's order (then the rest by label), with the actor that has it. */
export function environmentRows(registry: SchemaRegistry, actors: readonly ActorDoc[], resolveClass: ClassResolver, entries: readonly PlacerEntry[]): EnvironmentRow[] {
  const holders = new Map<string, ActorDoc>();
  for (const actor of actors) {
    const components: ComponentMap = actor.class === null ? actor.components : (resolveClass(actor.class)?.components ?? {});
    for (const component of Object.values(components)) {
      const name = parseComponentTypeTag(component.type)?.name;
      if (name !== undefined && !holders.has(name)) holders.set(name, actor);
    }
  }
  const entryOf = new Map<string, { key: string; at: number }>();
  entries.forEach((entry, at) => {
    if (entry.classId) return;
    for (const component of Object.values(entry.components)) {
      const name = parseComponentTypeTag(component.type)?.name;
      if (name !== undefined && !entryOf.has(name)) entryOf.set(name, { key: entry.key, at });
    }
  });
  return registry
    .components()
    .filter((def) => def.singleton)
    .sort((a, b) => (entryOf.get(a.name)?.at ?? Infinity) - (entryOf.get(b.name)?.at ?? Infinity) || a.label.localeCompare(b.label))
    .map((def) => ({ component: def.name, label: def.label, actor: holders.get(def.name) ?? null, entry: entryOf.get(def.name)?.key ?? null }));
}
