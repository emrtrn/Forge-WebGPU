import type { ActorId } from "../../core/index.ts";
import type { ZoneDrawing } from "./zoneDrawing.ts";

interface Placement {
  readonly key: string;
  readonly zone: string | null;
}

interface Entry extends Placement {
  readonly actor: ActorId;
  readonly ready: () => boolean;
  untrack?: () => void;
}

/** The desired batch assignment is retained even while its render resources are absent. */
export function createStreamedPlacements(zones: ZoneDrawing | undefined, detach: (id: string) => void) {
  const entries = new Map<string, Entry>();
  const byActor = new Map<ActorId, Set<Entry>>();
  const remove = (id: string) => {
    const entry = entries.get(id);
    if (!entry) return;
    entry.untrack?.();
    entries.delete(id);
    const owned = byActor.get(entry.actor)!;
    owned.delete(entry);
    if (owned.size === 0) byActor.delete(entry.actor);
    detach(id);
  };
  return {
    ids: () => entries.keys(),
    matches(id: string, { key, zone }: Placement): boolean {
      const current = entries.get(id);
      return current?.key === key && current.zone === zone;
    },
    set(id: string, actor: ActorId, placement: Placement, attach: () => void, ready: () => boolean) {
      remove(id);
      const entry: Entry = { ...placement, actor, ready };
      let owned = byActor.get(actor);
      if (!owned) byActor.set(actor, owned = new Set());
      owned.add(entry);
      entries.set(id, entry);
      if (placement.zone !== null && zones?.residency) {
        entry.untrack = zones.residency.track(placement.zone, (resident) => {
          if (resident) attach();
          else detach(id);
        }, ready);
      } else {
        attach();
      }
    },
    isActorReady(actor: ActorId): boolean {
      const owned = byActor.get(actor);
      if (!owned) return true;
      for (const entry of owned) {
        // HLOD excluded building interiors at bake time. Their warmup must
        // not hold back the cell's exterior and its HLOD handover.
        if (entry.zone !== null && zones?.residency?.owns(entry.zone)) continue;
        if (!entry.ready()) return false;
      }
      return true;
    },
    remove,
    dispose() {
      for (const entry of entries.values()) entry.untrack?.();
      entries.clear();
      byActor.clear();
    },
  };
}
