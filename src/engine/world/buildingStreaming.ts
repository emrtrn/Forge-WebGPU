import { OUTSIDE, portalDistance, type PortalInput, type ZoneSet, type ZoneVec3 } from "./zones.ts";

export const BUILDING_LOAD_RANGE = 40;
export const BUILDING_PREFETCH_FACTOR = 1.5;
export const BUILDING_RETAIN_FACTOR = 1.25;

export interface StreamingBuilding {
  readonly id: string;
  readonly zones: readonly string[];
  readonly entrances: readonly PortalInput[];
}

/** Interior links define components. The outside node only supplies entrances. */
export function streamingBuildings(set: ZoneSet): StreamingBuilding[] {
  const buildings: StreamingBuilding[] = [];
  const visited = new Set<string>();
  for (const zone of set.zones) {
    if (visited.has(zone.id)) continue;
    const zones = [zone.id];
    const entrances: PortalInput[] = [];
    visited.add(zone.id);
    for (const id of zones) {
      for (const link of set.portalsByZone.get(id) ?? []) {
        if (link.next === OUTSIDE) entrances.push(link.portal);
        else if (!visited.has(link.next)) {
          visited.add(link.next);
          zones.push(link.next);
        }
      }
    }
    if (entrances.length > 0) {
      zones.sort();
      buildings.push({ id: zones[0]!, zones, entrances });
    }
  }
  return buildings;
}

export function buildingDistance(building: StreamingBuilding, point: ZoneVec3): number {
  let distance = Infinity;
  for (const portal of building.entrances) distance = Math.min(distance, portalDistance(portal, point));
  return distance;
}

export type BuildingPhase = "cold" | "prefetch" | "active";

export interface BuildingState {
  readonly phase: BuildingPhase;
  readonly distance: number;
  /** Once inside the retain band, an outward crossing releases prefetched work as well. */
  readonly reachedRetain: boolean;
}

export function nextBuildingState(
  previous: BuildingState | undefined,
  distance: number,
  inside: boolean,
  range: number,
): BuildingState {
  const retain = range * BUILDING_RETAIN_FACTOR;
  const prefetch = range * BUILDING_PREFETCH_FACTOR;
  if (inside || distance <= range || (previous?.phase === "active" && distance <= retain)) {
    return { distance, phase: "active", reachedRetain: true };
  }
  const canKeep = previous?.phase === "prefetch" && (!previous.reachedRetain || distance <= retain);
  const approaching = previous === undefined || distance < previous.distance;
  if (distance <= prefetch && (distance <= retain || canKeep || approaching)) {
    return { distance, phase: "prefetch", reachedRetain: distance <= retain };
  }
  return { distance, phase: "cold", reachedRetain: false };
}
