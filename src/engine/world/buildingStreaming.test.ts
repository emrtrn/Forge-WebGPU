import { expect, test } from "vitest";
import { nextBuildingState, streamingBuildings } from "./buildingStreaming.ts";
import { buildZoneSet, type PortalInput, type ZoneInput } from "./zones.ts";

test("exterior portals identify components without joining buildings through outside", () => {
  const zones: ZoneInput[] = ["ground", "upper", "other", "sealed"].map((id, index) => ({
    id, center: [100 * index, 0, 0], rotation: [0, 0, 0, 1], halfExtents: [2, 2, 2],
  }));
  const portal = (id: string, zoneA: string, zoneB: string | null): PortalInput =>
    ({ id, zoneA, zoneB, center: [0, 0, 50], rotation: [0, 0, 0, 1], halfSize: [1, 1] });
  const set = buildZoneSet(zones, [portal("stairs", "ground", "upper"), portal("door", "ground", null), portal("window", "other", null)]);
  expect(streamingBuildings(set).map((building) => [building.zones, building.entrances.map(({ id }) => id)]))
    .toEqual([[["ground", "upper"], ["door"]], [["other"], ["window"]]]);
});

test("approach prefetches, retreat releases, and a distant camera inside forces residency", () => {
  let state = nextBuildingState(undefined, 65, false, 40);
  const at = (distance: number, inside = false) => (state = nextBuildingState(state, distance, inside, 40)).phase;
  expect(state.phase).toBe("cold");
  expect(at(60)).toBe("prefetch");
  expect(at(40)).toBe("active");
  expect(at(50)).toBe("active");
  expect(at(51)).toBe("cold");
  expect(at(51)).toBe("cold");
  expect(at(52)).toBe("cold");
  expect(at(51)).toBe("prefetch");
  expect(at(140, true)).toBe("active");
  expect(at(140)).toBe("cold");
});
