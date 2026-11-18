import { expect, test } from "vitest";
import { buildZoneSet } from "../../engine/world/zones.ts";
import { createBuildingResidency } from "./buildingResidency.ts";

test("the frame budget defers remaining requests and cancels abandoned work", () => {
  let time = 0;
  const residency = createBuildingResidency(() => 1, () => time);
  residency.rebuild(buildZoneSet(
    [{ id: "room", center: [1, 0, 0], rotation: [0, 0, 0, 1], halfExtents: [1, 1, 1] }],
    [{ id: "door", zoneA: "room", zoneB: null, center: [1, 0, -1], rotation: [0, 0, 0, 1], halfSize: [1, 1] }],
  ));
  const applied: string[] = [];
  const track = (label: string) => residency.track("room", (resident) => {
    time += 3;
    applied.push(`${label}:${resident}`);
  }, () => true);
  track("first");
  const cancel = track("removed by WP");
  track("third");
  residency.update([0, 0, -55]);
  expect(applied).toEqual(["first:true"]);
  expect(residency.stats()).toMatchObject({ prefetched: 1, queued: 2, resident: 1, ready: 1 });
  expect(residency.draws("room")).toBe(false);
  cancel();
  residency.update([1, 0, 0]);
  expect(applied).toEqual(["first:true", "third:true"]);
  expect(residency.draws("room")).toBe(true);
  residency.update([0, 0, -65]);
  expect(residency.draws("room")).toBe(false);
  residency.update([0, 0, -65]);
  expect(applied).toEqual(["first:true", "third:true", "first:false", "third:false"]);
  expect(residency.stats()).toMatchObject({ active: 0, queued: 0, resident: 0 });
});
