import { BUILDING_LOAD_RANGE, buildingDistance, nextBuildingState, streamingBuildings, type BuildingState, type StreamingBuilding } from "../../engine/world/buildingStreaming.ts";
import { zoneAt, type ZoneSet, type ZoneVec3 } from "../../engine/world/zones.ts";

const FRAME_BUDGET_MS = 3;

interface Placement {
  readonly zone: string;
  readonly setResident: (resident: boolean) => void;
  readonly ready: () => boolean;
  resident: boolean;
}

export function createBuildingResidency(multiplier: () => number, now = () => performance.now()) {
  let graph: ZoneSet | null = null;
  let buildings: StreamingBuilding[] = [];
  let byZone = new Map<string, string>();
  let states = new Map<string, BuildingState>();
  let dirty = false;
  let cameraBuilding: string | undefined;
  const placements = new Map<string, Set<Placement>>();
  const queued = new Set<Placement>();

  const stateOf = (zone: string) => states.get(byZone.get(zone) ?? "");
  const wanted = (zone: string) => !byZone.has(zone) || (stateOf(zone)?.phase ?? "cold") !== "cold";
  const schedule = (entry: Placement) => {
    if (wanted(entry.zone) !== entry.resident) queued.add(entry);
    else queued.delete(entry);
  };
  return {
    range() { return BUILDING_LOAD_RANGE * multiplier(); },
    rebuild(set: ZoneSet | null) {
      graph = set;
      buildings = set ? streamingBuildings(set) : [];
      byZone = new Map(buildings.flatMap((building) => building.zones.map((zone) => [zone, building.id])));
      states = new Map(buildings.flatMap(({ id }) => states.has(id) ? [[id, states.get(id)!]] : []));
      dirty = true;
    },
    track(zone: string, setResident: Placement["setResident"], ready: Placement["ready"]): () => void {
      const entry = { zone, setResident, ready, resident: !byZone.has(zone) };
      let entries = placements.get(zone);
      if (!entries) placements.set(zone, entries = new Set());
      entries.add(entry);
      if (entry.resident) setResident(true);
      else schedule(entry);
      return () => {
        queued.delete(entry);
        entries.delete(entry);
        if (entries.size === 0) placements.delete(zone);
      };
    },
    update(point: ZoneVec3) {
      const cameraZone = graph ? zoneAt(graph, point) : null;
      cameraBuilding = cameraZone === null ? undefined : byZone.get(cameraZone);
      const range = this.range();
      for (const building of buildings) {
        const previous = states.get(building.id);
        const next = nextBuildingState(previous, buildingDistance(building, point), building.id === cameraBuilding, range);
        states.set(building.id, next);
        if (!dirty && ((previous?.phase ?? "cold") === "cold") !== (next.phase === "cold")) {
          for (const zone of building.zones) for (const entry of placements.get(zone) ?? []) schedule(entry);
        }
      }
      if (dirty) {
        for (const entries of placements.values()) for (const entry of entries) schedule(entry);
        dirty = false;
      }
      if (queued.size === 0) return;
      const distance = (zone: string) => byZone.get(zone) === cameraBuilding ? -1 : stateOf(zone)?.distance ?? 0;
      const work = [...queued].sort((a, b) => Number(b.resident) - Number(a.resident) || distance(a.zone) - distance(b.zone));
      const deadline = now() + FRAME_BUDGET_MS;
      for (const entry of work) {
        if (!queued.delete(entry)) continue;
        entry.resident = wanted(entry.zone);
        entry.setResident(entry.resident);
        if (now() >= deadline) break;
      }
    },
    owns(zone: string): boolean { return byZone.has(zone); },
    draws(zone: string): boolean {
      return !byZone.has(zone) || stateOf(zone)?.phase === "active";
    },
    inspect(zone: string) {
      const id = byZone.get(zone);
      const building = buildings.find((candidate) => candidate.id === id);
      if (!building) return null;
      let placementsCount = 0, resident = 0, ready = 0;
      for (const member of building.zones) {
        for (const entry of placements.get(member) ?? []) {
          placementsCount += 1;
          if (!entry.resident) continue;
          resident += 1;
          if (entry.ready()) ready += 1;
        }
      }
      return { ...states.get(building.id), id: building.id, placements: placementsCount, resident, ready };
    },
    stats() {
      let active = 0, prefetched = 0, resident = 0, ready = 0;
      for (const state of states.values()) {
        if (state.phase === "active") active += 1;
        else if (state.phase === "prefetch") prefetched += 1;
      }
      for (const [zone, entries] of placements) {
        if (!byZone.has(zone)) continue;
        for (const entry of entries) {
          if (!entry.resident) continue;
          resident += 1;
          if (entry.ready()) ready += 1;
        }
      }
      return { buildings: buildings.length, active, prefetched, queued: queued.size, resident, ready, cameraBuilding: cameraBuilding ?? null };
    },
  };
}
