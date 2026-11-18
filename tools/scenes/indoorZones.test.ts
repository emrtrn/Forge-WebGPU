// Automatic zones (plan 5c R9b Z4) on the synthetic interior: `engine/world/zoneGeneration.ts`
// against `indoorScene` (here because `src` never imports `tools`).
import { expect, test } from "vitest";
import { multiplyQuat, quatFromAxisAngle, rotate, scale } from "../../src/engine/math/affine.ts";
import { generateZones, type ZoneOccluder } from "../../src/engine/world/zoneGeneration.ts";
import { indoorScene, SHAPE_SIZE, type IndoorActor, type IndoorSceneOptions } from "./indoorScene.ts";

const floor = { floorY: 0 };
const cellSize = 0.25;

function toOccluders(actors: readonly IndoorActor[]): ZoneOccluder[] {
  return actors.filter(({ name }) => /^(Wall|Lintel|Floor)/.test(name)).map(({ transform }) => ({
    center: transform.p,
    rotation: transform.r,
    halfExtents: scale(transform.s, SHAPE_SIZE / 2),
  }));
}

function sceneOccluders(options: IndoorSceneOptions = {}): ZoneOccluder[] {
  return toOccluders(indoorScene({ ...options, propsPerRoom: 0 }).actors);
}

test("finds all rooms and doorway rectangles in the default building", () => {
  const { zones, portals } = generateZones(sceneOccluders(), floor);
  expect(zones).toHaveLength(64);
  expect(portals).toHaveLength(112);

  const rooms = zones.map(({ center: [cx, , cz], halfExtents: [hx, , hz] }) => {
    const x = Math.floor(cx / 8), z = Math.floor(cz / 8);
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x).toBeLessThan(8);
    expect(z).toBeGreaterThanOrEqual(0);
    expect(z).toBeLessThan(8);
    expect(cx - hx).toBeGreaterThanOrEqual(x * 8 + 0.15 - cellSize);
    expect(cx + hx).toBeLessThanOrEqual((x + 1) * 8 - 0.15 + cellSize);
    expect(cz - hz).toBeGreaterThanOrEqual(z * 8 + 0.15 - cellSize);
    expect(cz + hz).toBeLessThanOrEqual((z + 1) * 8 - 0.15 + cellSize);
    expect(Math.abs(cx - (x * 8 + 4))).toBeLessThanOrEqual(hx);
    expect(Math.abs(cz - (z * 8 + 4))).toBeLessThanOrEqual(hz);
    return { x, z, id: z * 8 + x };
  });
  expect(new Set(rooms.map(({ id }) => id)).size).toBe(64);

  const expectedPairs = new Set<string>();
  for (let id = 0; id < 64; id++) {
    if (id % 8 < 7) expectedPairs.add(`${id},${id + 1}`);
    if (id < 56) expectedPairs.add(`${id},${id + 8}`);
  }
  const normalX = quatFromAxisAngle([0, 1, 0], Math.PI / 2);
  for (const { a, b, center: [x, y, z], rotation, halfSize: [hw, hh] } of portals) {
    expect(a).toBeLessThan(b);
    const left = rooms[a]!, right = rooms[b]!;
    const pair = [Math.min(left.id, right.id), Math.max(left.id, right.id)].join(",");
    expect(expectedPairs.delete(pair), pair).toBe(true);
    const acrossX = left.x !== right.x;
    const doorX = acrossX ? Math.max(left.x, right.x) * 8 : left.x * 8 + 4;
    const doorZ = acrossX ? left.z * 8 + 4 : Math.max(left.z, right.z) * 8;
    expect(Math.abs(x - doorX)).toBeLessThanOrEqual(cellSize);
    expect(Math.abs(z - doorZ)).toBeLessThanOrEqual(cellSize);
    expect(Math.abs(2 * hw - 1.6)).toBeLessThanOrEqual(2 * cellSize);
    expect(Math.abs(2 * hh - 2.2)).toBeLessThanOrEqual(1e-9);
    expect(Math.abs(y - hh)).toBeLessThanOrEqual(1e-9);
    expect(rotation).toEqual(acrossX ? normalX : [0, 0, 0, 1]);
  }
  expect(expectedPairs.size).toBe(0);
});

test("finds six rooms in a building translated away from the origin", () => {
  const { zones, portals, grid } = generateZones(sceneOccluders({ roomsX: 3, roomsZ: 2, origin: [300, 0, 300] }), floor);
  expect(zones).toHaveLength(6);
  expect(portals).toHaveLength(7);
  expect(grid).toEqual({ width: 102, depth: 70, minX: 299.25, minZ: 299.25 });
});

test("a wide opening joins the rooms on either side", () => {
  const { zones, portals } = generateZones(sceneOccluders({ roomsX: 2, roomsZ: 1, doorWidth: 6 }), floor);
  expect(zones).toHaveLength(1);
  expect(portals).toEqual([]);
});

test("a closed room excludes the exterior", () => {
  const { zones, portals } = generateZones(sceneOccluders({ roomsX: 1, roomsZ: 1 }), floor);
  expect(zones).toEqual([{ center: [4, 1.5, 4], halfExtents: [3.75, 1.5, 3.75], cells: 900 }]);
  expect(portals).toEqual([]);
});

test("floors below all probes produce an empty grid", () => {
  const { actors } = indoorScene({ roomsX: 1, roomsZ: 1, propsPerRoom: 0 });
  const floors = toOccluders(actors.filter(({ name }) => name.startsWith("Floor")));
  expect(generateZones(floors, floor)).toEqual({
    zones: [], portals: [], grid: { width: 0, depth: 0, minX: 0, minZ: 0 },
  });
});

test("repeated calls and a copy of the same ordered inputs serialize identically", () => {
  const occluders = sceneOccluders();
  const first = JSON.stringify(generateZones(occluders, floor));
  expect(JSON.stringify(generateZones(occluders, floor))).toBe(first);
  expect(JSON.stringify(generateZones([...occluders], floor))).toBe(first);
});

test("rotated walls still enclose two rooms joined by a portal", () => {
  const yaw = quatFromAxisAngle([0, 1, 0], Math.PI / 6);
  const { actors } = indoorScene({ roomsX: 2, roomsZ: 1, propsPerRoom: 0 });
  const rotated = actors.map((actor) => ({
    ...actor,
    transform: { ...actor.transform, p: rotate(yaw, actor.transform.p), r: multiplyQuat(yaw, actor.transform.r) },
  }));
  const { zones, portals } = generateZones(toOccluders(rotated), floor);
  expect(zones).toHaveLength(2);
  expect(portals).toHaveLength(1);
});
