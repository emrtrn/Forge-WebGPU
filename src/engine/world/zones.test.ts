import { expect, test } from "vitest";
import { cross, dot, IDENTITY_QUAT, multiplyMat4, normalize, quatFromAxisAngle } from "../math/affine.ts";
import {
  buildZoneSet, visibleZones, zoneAt,
  type PortalInput, type ZoneInput, type ZoneVec3, type ZoneView,
} from "./zones.ts";

const facePositiveX = quatFromAxisAngle([0, 1, 0], Math.PI / 2);

function box(id: string, center: ZoneVec3, halfExtents: ZoneVec3): ZoneInput {
  return { id, center, rotation: IDENTITY_QUAT, halfExtents };
}

function door(id: string, center: ZoneVec3): PortalInput {
  return { id, center, rotation: facePositiveX, halfSize: [0.5, 1], zoneA: null, zoneB: null };
}

function camera(position: ZoneVec3, direction: ZoneVec3): ZoneView {
  const backward = normalize([-direction[0], -direction[1], -direction[2]]);
  const right = normalize(cross([0, 1, 0], backward));
  const up = cross(backward, right);
  const view = [
    right[0], up[0], backward[0], 0,
    right[1], up[1], backward[1], 0,
    right[2], up[2], backward[2], 0,
    -dot(right, position), -dot(up, position), -dot(backward, position), 1,
  ];
  // 90-degree vertical field of view, square aspect ratio, and zero-to-one depth.
  const near = 0.1;
  const far = 100;
  const depth = far / (near - far);
  const projection = [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, depth, -1,
    0, 0, depth * near, 0,
  ];
  return { position, viewProjection: multiplyMat4(projection, view) };
}

const rowRooms = [
  box("A", [0, 0, 0], [1.9, 2, 3.5]),
  box("B", [4, 0, 0], [1.9, 2, 3.5]),
  box("C", [8, 0, 0], [1.9, 2, 3.5]),
];
const doorAB = door("AB", [2, 0, 0]);
const doorBC = door("BC", [6, 0, 0]);
const forward = camera([0, 0, 0], [1, 0, 0]);

test("orders zones by volume then id and finds the smallest containing zone", () => {
  const set = buildZoneSet([
    box("big", [0, 0, 0], [4, 4, 4]),
    box("small-z", [0, 0, 0], [1, 1, 1]),
    box("small-a", [0, 0, 0], [1, 1, 1]),
  ], []);

  expect(set.zones.map((zone) => zone.id)).toEqual(["small-a", "small-z", "big"]);
  expect(zoneAt(set, [0, 0, 0])).toBe("small-a");
  expect(zoneAt(set, [2, 0, 0])).toBe("big");
  expect(zoneAt(set, [5, 0, 0])).toBeNull();
  expect(zoneAt(set, [1, 1, 1])).toBe("small-a");
  expect(zoneAt(set, [4 + 5e-7, 0, 0])).toBe("big");
  expect(zoneAt(set, [4 + 2e-6, 0, 0])).toBeNull();
});

test("rotated containment excludes a point inside the world-axis bounds", () => {
  const set = buildZoneSet([{
    ...box("angled", [0, 0, 0], [2, 1, 0.5]),
    rotation: quatFromAxisAngle([0, 1, 0], Math.PI / 4),
  }], []);

  expect(zoneAt(set, [1, 0, -1])).toBe("angled");
  expect(zoneAt(set, [1.4, 0, 1.4])).toBeNull();
});

test("links wall-gap portals in input order using probes and valid pins", () => {
  const rooms = rowRooms.slice(0, 2);
  const set = buildZoneSet(rooms, [
    doorAB,
    door("exterior", [-2, 0, 0]),
    { ...doorAB, id: "pinned-a", zoneA: "B" },
    { ...doorAB, id: "pinned-b", zoneA: "missing", zoneB: "A" },
    { ...doorAB, id: "both-pinned", zoneA: "A", zoneB: "B" },
    { ...doorAB, id: "same-zone", zoneA: "A", zoneB: "A" },
  ]);

  expect(set.links).toEqual([
    { portal: "AB", a: "B", b: "A" },
    { portal: "pinned-a", a: "B", b: "A" },
    { portal: "pinned-b", a: "B", b: "A" },
    { portal: "both-pinned", a: "A", b: "B" },
  ]);
  expect(set.unlinked).toEqual(["exterior", "same-zone"]);
  expect(buildZoneSet(rooms, [doorAB], { probeSteps: [0.05] }).unlinked).toEqual(["AB"]);
});

test("aligned doors reveal adjacent rooms only when the camera faces them", () => {
  const set = buildZoneSet(rowRooms, [doorAB, doorBC]);
  expect(visibleZones(set, forward)).toEqual({
    cameraZone: "A", zones: new Set(["A", "B", "C"]), portalTests: 2, portalsPassed: 2,
  });
  expect(visibleZones(set, camera([0, 0, 0], [-1, 0, 0])).zones).toEqual(new Set(["A"]));
});

test("narrowing hides an offset door until the camera lines up both openings", () => {
  const set = buildZoneSet(rowRooms, [doorAB, door("BC", [6, 0, 3])]);
  expect(visibleZones(set, forward).zones).toEqual(new Set(["A", "B"]));
  expect(visibleZones(set, camera([0, 0, -1.5], [1, 0, 0])).zones).toEqual(new Set(["A", "B", "C"]));
});

test("authored and frame-specific closures both prevent traversal", () => {
  const closed = buildZoneSet(rowRooms, [{ ...doorAB, open: false }, doorBC]);
  const open = buildZoneSet(rowRooms, [doorAB, doorBC]);
  const expected = { cameraZone: "A", zones: new Set(["A"]), portalTests: 0, portalsPassed: 0 };

  expect(visibleZones(closed, forward)).toEqual(expected);
  expect(visibleZones(open, forward, { closed: new Set(["AB"]) })).toEqual(expected);
});

test("a camera outside every zone sees everything without testing portals", () => {
  const set = buildZoneSet(rowRooms, [doorAB, doorBC]);
  expect(visibleZones(set, camera([-3, 0, 0], [1, 0, 0]))).toEqual({
    cameraZone: null, zones: null, portalTests: 0, portalsPassed: 0,
  });
});

test("the doorway exception works along the wall within reach of the finite opening", () => {
  const set = buildZoneSet(rowRooms, [doorAB, doorBC]);
  // The camera looks along the wall from just past the edge of the opening.
  const doorway = camera([1.9, 0, 0.6], [0, 0, 1]);

  expect(visibleZones(set, doorway).cameraZone).toBe("A");
  expect(visibleZones(set, doorway).zones).toEqual(new Set(["A", "B"]));
  expect(visibleZones(set, doorway, { nearPortal: 0 }).zones).toEqual(new Set(["A"]));
  expect(visibleZones(set, camera([1.9, 0, 1], [0, 0, 1])).zones).toEqual(new Set(["A"]));
});

test("clipping preserves a portal that has two corners behind the camera", () => {
  const rooms = [
    box("A", [0, 0, -1], [3, 2, 1.9]),
    box("B", [0, 0, 3], [3, 2, 1.9]),
  ];
  const portal: PortalInput = {
    ...door("AB", [0, 0, 1]), rotation: IDENTITY_QUAT, halfSize: [2, 0.5],
  };
  const set = buildZoneSet(rooms, [portal]);

  // The two front corners have the same NDC x. The clipped edges add width.
  expect(visibleZones(set, forward, { nearPortal: 0 })).toEqual({
    cameraZone: "A", zones: new Set(["A", "B"]), portalTests: 1, portalsPassed: 1,
  });
});

test("exceeding the portal test budget makes every zone visible", () => {
  const set = buildZoneSet(rowRooms, [doorAB, doorBC]);
  expect(visibleZones(set, forward, { maxPortalTests: 1 })).toEqual({
    cameraZone: "A", zones: null, portalTests: 2, portalsPassed: 1,
  });
  expect(visibleZones(set, forward, { maxPortalTests: 2 }).zones).toEqual(new Set(["A", "B", "C"]));
});

test("a ring terminates, explores both paths to C, and respects maximum depth", () => {
  const rooms = [
    box("A", [0, 0, 0], [1.9, 2, 1.9]),
    box("B", [4, 0, 0], [1.9, 2, 1.9]),
    box("C", [4, 0, 4], [1.9, 2, 1.9]),
    box("D", [0, 0, 4], [1.9, 2, 1.9]),
  ];
  const set = buildZoneSet(rooms, [
    { ...door("AB", [2, 0, 1.3]), halfSize: [0.6, 1] },
    { ...door("BC", [2.7, 0, 2]), halfSize: [0.6, 1], rotation: IDENTITY_QUAT },
    { ...door("CD", [2, 0, 2.7]), halfSize: [0.6, 1] },
    { ...door("DA", [1.3, 0, 2]), halfSize: [0.6, 1], rotation: IDENTITY_QUAT },
  ]);
  const view = camera([0, 0, 0], [1, 0, 1]);

  const result = visibleZones(set, view);
  expect([...result.zones!]).toEqual(["A", "B", "C", "D"]);
  expect(result.portalTests).toBe(6);
  expect(result.portalsPassed).toBe(4);
  expect(visibleZones(set, view, { maxDepth: 1 })).toEqual({
    cameraZone: "A", zones: new Set(["A", "B", "D"]), portalTests: 2, portalsPassed: 2,
  });
});

test("repeating the same visibility query produces a deep-equal result", () => {
  const set = buildZoneSet(rowRooms, [doorAB, doorBC]);
  expect(visibleZones(set, forward)).toEqual(visibleZones(set, forward));
});
