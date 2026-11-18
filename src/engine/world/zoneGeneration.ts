// Automatic zones (plan 5c R9b Z4): rooms and doors of a single-storey
// interior from its large opaque statics. A horizontal slice at eye height
// becomes a grid of solid / free cells. The Euclidean distance transform
// finds the cells far from any wall. Their border-connected core is outdoors;
// the other cores are rooms. Both grow back over free cells, leaving doorway
// boundaries between rooms and the outside. Deterministic: same inputs, same bytes. The
// output feeds `zones.ts` (axis-aligned room boxes, portal rectangles); the
// `forge zones` command and the editor's Generate Zones write it to a level.

import { invertQuat, quatFromAxisAngle, rotate } from "../math/affine.ts";
import type { ZoneQuat, ZoneVec3 } from "./zones.ts";

/** A large opaque static in world space: an oriented box. */
export interface ZoneOccluder {
  readonly center: ZoneVec3;
  readonly rotation: ZoneQuat;
  readonly halfExtents: ZoneVec3;
}

export interface ZoneGenerationOptions {
  /** World Y of the walkable floor. */
  readonly floorY: number;
  /** Grid cell edge, metres; must not exceed the thinnest wall. Default 0.25. */
  readonly cellSize?: number;
  /** Heights above floorY probed for solidity (the slice). Default [0.3, 1.0, 1.7]. */
  readonly probeHeights?: readonly number[];
  /** Openings up to this wide are doors (bottlenecks); wider ones join rooms. Default 2.0 m. */
  readonly maxDoorWidth?: number;
  /** Rooms with less floor area are dropped (their cells join neighbours). Default 4 m². */
  readonly minRoomArea?: number;
}

export interface GeneratedZone {
  /** Axis-aligned box (zones.ts rotation identity). */
  readonly center: ZoneVec3;
  readonly halfExtents: ZoneVec3;
  /** Floor cells of the room. */
  readonly cells: number;
}

export interface GeneratedPortal {
  readonly center: ZoneVec3;
  /** Local +Z is the portal normal: identity faces +Z, a +90° turn about Y faces +X. */
  readonly rotation: ZoneQuat;
  /** World half width (local X), half height (local Y). */
  readonly halfSize: readonly [number, number];
  /** Indices into `zones`, a < b; a is null for an exterior opening. */
  readonly a: number | null;
  readonly b: number;
}

export interface GeneratedZones {
  readonly zones: readonly GeneratedZone[];
  readonly portals: readonly GeneratedPortal[];
  /** Grid size in cells (X, Z) and the grid's world min corner (X, Z), for debugging. */
  readonly grid: { readonly width: number; readonly depth: number; readonly minX: number; readonly minZ: number };
}

type Grid = GeneratedZones["grid"];

export interface ZoneOccluderBounds {
  readonly min: ZoneVec3;
  readonly max: ZoneVec3;
}

type Box = ZoneOccluderBounds;

export function zoneOccluderBounds({ center, rotation, halfExtents: [hx, hy, hz] }: ZoneOccluder): Box {
  const x = rotate(rotation, [hx, 0, 0]);
  const y = rotate(rotation, [0, hy, 0]);
  const z = rotate(rotation, [0, 0, hz]);
  const extent = (axis: 0 | 1 | 2) => Math.abs(x[axis]) + Math.abs(y[axis]) + Math.abs(z[axis]);
  const [ex, ey, ez] = [extent(0), extent(1), extent(2)];
  return {
    min: [center[0] - ex, center[1] - ey, center[2] - ez],
    max: [center[0] + ex, center[1] + ey, center[2] + ez],
  };
}

function makeGrid(boxes: readonly Box[], c: number, maxDoorWidth: number): Grid {
  let lowX = Infinity, lowZ = Infinity, highX = -Infinity, highZ = -Infinity;
  for (const { min, max } of boxes) {
    lowX = Math.min(lowX, min[0]);
    lowZ = Math.min(lowZ, min[2]);
    highX = Math.max(highX, max[0]);
    highZ = Math.max(highZ, max[2]);
  }
  const margin = (Math.ceil(maxDoorWidth / (2 * c)) + 2) * c;
  const minX = Math.floor(lowX / c) * c - margin;
  const minZ = Math.floor(lowZ / c) * c - margin;
  const maxX = Math.ceil(highX / c) * c + margin;
  const maxZ = Math.ceil(highZ / c) * c + margin;
  return { width: Math.round((maxX - minX) / c), depth: Math.round((maxZ - minZ) / c), minX, minZ };
}

function markSolid(cells: Uint8Array, grid: Grid, c: number, probes: readonly number[], occluder: ZoneOccluder, box: Box): void {
  const { width, depth, minX, minZ } = grid;
  const epsilon = 1e-9;
  // Pad the search bounds to cover the OBB tolerance after rotation.
  const firstX = Math.max(0, Math.floor((box.min[0] - minX - 2 * epsilon) / c));
  const lastX = Math.min(width - 1, Math.floor((box.max[0] - minX + 2 * epsilon) / c));
  const firstZ = Math.max(0, Math.floor((box.min[2] - minZ - 2 * epsilon) / c));
  const lastZ = Math.min(depth - 1, Math.floor((box.max[2] - minZ + 2 * epsilon) / c));
  const [cx, cy, cz] = occluder.center;
  const [hx, hy, hz] = occluder.halfExtents;
  const inverse = invertQuat(occluder.rotation);
  for (let z = firstZ; z <= lastZ; z++) {
    const dz = minZ + (z + 0.5) * c - cz;
    for (let x = firstX; x <= lastX; x++) {
      const p = z * width + x;
      if (cells[p]) continue;
      const dx = minX + (x + 0.5) * c - cx;
      for (const probe of probes) {
        const [lx, ly, lz] = rotate(inverse, [dx, probe - cy, dz]);
        if (Math.abs(lx) <= hx + epsilon && Math.abs(ly) <= hy + epsilon && Math.abs(lz) <= hz + epsilon) {
          cells[p] = 1;
          break;
        }
      }
    }
  }
}

function flood({ width, depth }: Grid, queue: number[], claim: (from: number, to: number) => boolean): void {
  const size = width * depth;
  for (let head = 0; head < queue.length; head++) {
    const p = queue[head]!;
    const x = p % width;
    if (x > 0 && claim(p, p - 1)) queue.push(p - 1);
    if (x + 1 < width && claim(p, p + 1)) queue.push(p + 1);
    if (p >= width && claim(p, p - width)) queue.push(p - width);
    if (p + width < size && claim(p, p + width)) queue.push(p + width);
  }
}

const OUTSIDE_ROOM = -2;
const SMALL_CORE = -3;

function markOutside(roomOf: Int32Array, grid: Grid, isCore: (p: number) => boolean): void {
  const { width, depth } = grid;
  const border: number[] = [];
  function claim(p: number): boolean {
    if (roomOf[p] !== -1 || !isCore(p)) return false;
    roomOf[p] = OUTSIDE_ROOM;
    return true;
  }
  for (let p = 0; p < roomOf.length; p++) {
    const x = p % width;
    if ((x === 0 || x === width - 1 || p < width || p >= (depth - 1) * width) && claim(p)) border.push(p);
  }
  flood(grid, border, (_from, to) => claim(to));
}

function squaredDistances(cells: Uint8Array, { width, depth }: Grid): Float64Array {
  const distances = Float64Array.from(cells, (cell) => cell ? 0 : Infinity);
  const rows = new Float64Array(cells.length);
  const sites = new Int32Array(Math.max(width, depth));
  const starts = new Float64Array(sites.length);

  // The lower envelope of parabolas gives exact squared distances in cell units.
  function transform(input: Float64Array, output: Float64Array, start: number, stride: number, size: number): void {
    let count = 0;
    for (let q = 0; q < size; q++) {
      const height = input[start + q * stride]!;
      if (height === Infinity) continue;
      let intersection = -Infinity;
      while (count > 0) {
        const p = sites[count - 1]!;
        intersection = ((height - input[start + p * stride]!) / (q - p) + q + p) / 2;
        if (intersection > starts[count - 1]!) break;
        count--;
      }
      sites[count] = q;
      starts[count] = intersection;
      count++;
    }
    let site = 0;
    for (let q = 0; q < size; q++) {
      while (site + 1 < count && starts[site + 1]! < q) site++;
      const p = sites[site]!;
      output[start + q * stride] = count === 0 ? Infinity : (q - p) ** 2 + input[start + p * stride]!;
    }
  }

  for (let z = 0; z < depth; z++) transform(distances, rows, z * width, 1, width);
  for (let x = 0; x < width; x++) transform(rows, distances, x, width, depth);
  return distances;
}

function assignRooms(cells: Uint8Array, grid: Grid, c: number, maxDoorWidth: number, minRoomArea: number) {
  const distances = squaredDistances(cells, grid);
  const isCore = (p: number) => !cells[p] && Math.sqrt(distances[p]!) * c > maxDoorWidth / 2;
  const roomOf = new Int32Array(cells.length).fill(-1);
  markOutside(roomOf, grid, isCore);
  let count = 0;
  for (let p = 0; p < cells.length; p++) {
    if (roomOf[p] !== -1 || !isCore(p)) continue;
    const component = [p];
    roomOf[p] = count;
    flood(grid, component, (_from, to) => {
      if (roomOf[to] !== -1 || !isCore(to)) return false;
      roomOf[to] = count;
      return true;
    });
    if (component.length * c ** 2 >= minRoomArea) count++;
    else for (const cell of component) roomOf[cell] = SMALL_CORE;
  }

  // Seed in cell order so equal-distance claims have a stable winner.
  const queue: number[] = [];
  for (let p = 0; p < cells.length; p++) {
    if (roomOf[p]! >= 0 || roomOf[p] === OUTSIDE_ROOM) queue.push(p);
  }
  flood(grid, queue, (from, to) => {
    if (cells[to] || roomOf[to]! >= 0 || roomOf[to] === OUTSIDE_ROOM) return false;
    roomOf[to] = roomOf[from]!;
    return true;
  });
  return { roomOf, count };
}

function makeZones(roomOf: Int32Array, count: number, grid: Grid, c: number, floorY: number,
  highestProbe: number, walls: readonly Box[], boxes: readonly Box[]) {
  const rooms = Array.from({ length: count }, () => ({
    minX: Infinity, minZ: Infinity, maxX: -Infinity, maxZ: -Infinity, cells: 0,
  }));
  for (let p = 0; p < roomOf.length; p++) {
    const room = rooms[roomOf[p]!];
    if (!room) continue;
    const x = p % grid.width;
    const z = Math.floor(p / grid.width);
    room.minX = Math.min(room.minX, x);
    room.minZ = Math.min(room.minZ, z);
    room.maxX = Math.max(room.maxX, x + 1);
    room.maxZ = Math.max(room.maxZ, z + 1);
    room.cells++;
  }
  return rooms.map((room) => {
    const minX = grid.minX + room.minX * c, maxX = grid.minX + room.maxX * c;
    const minZ = grid.minZ + room.minZ * c, maxZ = grid.minZ + room.maxZ * c;
    let top = -Infinity;
    for (const { min, max } of walls) {
      if (min[0] <= maxX && max[0] >= minX && min[2] <= maxZ && max[2] >= minZ) top = Math.max(top, max[1]);
    }
    if (top === -Infinity) top = floorY + 3;
    // A floor above this room may also be its ceiling. Look for slabs above
    // the eye-height slice at the centre and just inside all four corners.
    const ceilingAt = (x: number, z: number): number => {
      let ceiling = Infinity;
      for (const { min, max } of boxes) {
        if (min[1] <= highestProbe || max[1] - min[1] > 0.5
          || x < min[0] || x > max[0] || z < min[2] || z > max[2]) continue;
        ceiling = Math.min(ceiling, min[1]);
      }
      return ceiling;
    };
    const roof = [
      ceilingAt((minX + maxX) / 2, (minZ + maxZ) / 2),
      ...[minX + c / 2, maxX - c / 2].flatMap(x => [minZ + c / 2, maxZ - c / 2].map(z => ceilingAt(x, z))),
    ];
    if (roof.every(Number.isFinite)) top = Math.min(top, ...roof);
    const halfExtents: ZoneVec3 = [(maxX - minX) / 2, (top - floorY) / 2, (maxZ - minZ) / 2];
    const zone: GeneratedZone = {
      center: [minX + halfExtents[0], floorY + halfExtents[1], minZ + halfExtents[2]],
      halfExtents,
      cells: room.cells,
    };
    return { zone, top, roofOpen: roof.every(height => height === Infinity) };
  });
}

interface Edge {
  readonly x: number;
  readonly z: number;
  readonly acrossX: boolean;
}

function edgeRuns(edges: readonly Edge[], stride: number): Iterable<readonly Edge[]> {
  const parents = edges.map((_edge, i) => i);
  const endpoints = new Map<number, number>();
  function root(i: number): number {
    while (parents[i] !== i) {
      parents[i] = parents[parents[i]!]!;
      i = parents[i]!;
    }
    return i;
  }
  function link(i: number, endpoint: number): void {
    const previous = endpoints.get(endpoint);
    if (previous === undefined) endpoints.set(endpoint, i);
    else parents[root(i)] = root(previous);
  }
  edges.forEach(({ x, z, acrossX }, i) => {
    const start = z * stride + x;
    link(i, start);
    link(i, start + (acrossX ? stride : 1));
  });
  const runs = new Map<number, Edge[]>();
  edges.forEach((edge, i) => {
    const id = root(i);
    const run = runs.get(id);
    if (run === undefined) runs.set(id, [edge]);
    else run.push(edge);
  });
  return runs.values();
}

function portalGeometry(run: readonly Edge[], grid: Grid, c: number) {
  let xEdges = 0, sumX = 0, sumZ = 0;
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const { x, z, acrossX } of run) {
    const endX = x + Number(!acrossX), endZ = z + Number(acrossX);
    xEdges += Number(acrossX);
    sumX += (x + endX) / 2;
    sumZ += (z + endZ) / 2;
    minX = Math.min(minX, x);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, endX);
    maxZ = Math.max(maxZ, endZ);
  }
  const normalX = xEdges * 2 >= run.length;
  return {
    x: grid.minX + sumX / run.length * c,
    z: grid.minZ + sumZ / run.length * c,
    width: (normalX ? maxZ - minZ : maxX - minX) * c,
    normalX,
  };
}

function makePortals(
  roomOf: Int32Array, grid: Grid, c: number, floorY: number, highestProbe: number,
  boxes: readonly Box[], rooms: readonly { readonly top: number }[],
): GeneratedPortal[] {
  const { width } = grid;
  const pairs = new Map<string, { a: number; b: number; edges: Edge[] }>();
  function addEdge(p: number, q: number, x: number, z: number, acrossX: boolean): void {
    const ra = roomOf[p]!, rb = roomOf[q]!;
    if (ra === rb || (ra < 0 && rb < 0) || ra === -1 || rb === -1 || ra === SMALL_CORE || rb === SMALL_CORE) return;
    const a = Math.min(ra, rb), b = Math.max(ra, rb);
    const key = `${a},${b}`;
    const edge = { x, z, acrossX };
    const pair = pairs.get(key);
    if (pair === undefined) pairs.set(key, { a, b, edges: [edge] });
    else pair.edges.push(edge);
  }
  for (let p = 0; p < roomOf.length; p++) {
    if (roomOf[p]! < 0 && roomOf[p] !== OUTSIDE_ROOM) continue;
    const x = p % width, z = Math.floor(p / width);
    if (x + 1 < width) addEdge(p, p + 1, x + 1, z, true);
    if (p + width < roomOf.length) addEdge(p, p + width, x, z + 1, false);
  }
  const portals: GeneratedPortal[] = [];
  for (const { a, b, edges } of pairs.values()) {
    for (const run of edgeRuns(edges, width + 1)) {
      const { x, z, width: span, normalX } = portalGeometry(run, grid, c);
      let top = Infinity;
      for (const { min, max } of boxes) {
        if (min[1] > highestProbe && min[0] <= x && x <= max[0] && min[2] <= z && z <= max[2]) {
          top = Math.min(top, min[1]);
        }
      }
      const room = rooms[a === OUTSIDE_ROOM ? b : a]!;
      top = Math.min(top, room.top);
      const halfHeight = (top - floorY) / 2;
      portals.push({
        center: [x, floorY + halfHeight, z],
        rotation: normalX ? quatFromAxisAngle([0, 1, 0], Math.PI / 2) : [0, 0, 0, 1],
        halfSize: [span / 2, halfHeight],
        a: a === OUTSIDE_ROOM ? null : a, b,
      });
    }
  }
  return portals.sort((p, q) => (p.a ?? -1) - (q.a ?? -1) || p.b - q.b || p.center[0] - q.center[0] || p.center[2] - q.center[2]);
}

/** Find elevated gaps across a wall that has a room on one side and outside on the other. */
function makeWindows(roomOf: Int32Array, cells: Uint8Array, grid: Grid, c: number, floorY: number,
  boxes: readonly Box[], rooms: readonly { readonly top: number }[], maxWallCells: number): GeneratedPortal[] {
  const groups = new Map<string, { room: number; bottom: number; top: number; edges: Edge[] }>();
  const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const;
  const { width, depth } = grid;

  const gapsAt = (x: number, z: number, top: number): [number, number][] => {
    const intervals = boxes.filter(({ min, max }) => x >= min[0] && x <= max[0] && z >= min[2] && z <= max[2]
      && max[1] > floorY && min[1] < top)
      .map(({ min, max }) => [Math.max(floorY, min[1]), Math.min(top, max[1])] as const)
      .sort(([a], [b]) => a - b);
    const gaps: [number, number][] = [];
    let covered = intervals[0]?.[1] ?? floorY;
    for (const [low, high] of intervals.slice(1)) {
      if (low - covered >= c && covered > floorY) gaps.push([covered, low]);
      covered = Math.max(covered, high);
    }
    return gaps;
  };

  for (let p = 0; p < roomOf.length; p++) {
    const room = roomOf[p]!;
    if (room < 0) continue;
    const x = p % width, z = Math.floor(p / width);
    for (const [dx, dz] of directions) {
      let wallCells = 0;
      let qx = x + dx, qz = z + dz;
      while (qx >= 0 && qx < width && qz >= 0 && qz < depth && cells[qz * width + qx] && wallCells <= maxWallCells) {
        wallCells++;
        qx += dx;
        qz += dz;
      }
      if (wallCells === 0 || wallCells > maxWallCells || qx < 0 || qx >= width || qz < 0 || qz >= depth
        || roomOf[qz * width + qx] !== OUTSIDE_ROOM) continue;
      const mid = (wallCells + 1) / 2;
      const acrossX = dx !== 0;
      const edge = { x: x + (acrossX ? 0.5 + dx * mid : 0), z: z + (acrossX ? 0 : 0.5 + dz * mid), acrossX };
      const worldX = grid.minX + (edge.x + Number(!acrossX) * 0.5) * c;
      const worldZ = grid.minZ + (edge.z + Number(acrossX) * 0.5) * c;
      for (const [bottom, top] of gapsAt(worldX, worldZ, rooms[room]!.top)) {
        const key = `${room}|${acrossX}|${acrossX ? edge.x : edge.z}|${bottom}|${top}`;
        const group = groups.get(key);
        if (group) group.edges.push(edge);
        else groups.set(key, { room, bottom, top, edges: [edge] });
      }
    }
  }
  const portals: GeneratedPortal[] = [];
  for (const { room, bottom, top, edges } of groups.values()) {
    for (const run of edgeRuns(edges, width + 1)) {
      const { x, z, width: span, normalX } = portalGeometry(run, grid, c);
      portals.push({ a: null, b: room, center: [x, (top + bottom) / 2, z],
        rotation: normalX ? quatFromAxisAngle([0, 1, 0], Math.PI / 2) : [0, 0, 0, 1],
        halfSize: [span / 2, (top - bottom) / 2] });
    }
  }
  return portals;
}

export function generateZones(occluders: readonly ZoneOccluder[], options: ZoneGenerationOptions): GeneratedZones {
  const { floorY, cellSize: c = 0.25, probeHeights = [0.3, 1.0, 1.7], maxDoorWidth = 2, minRoomArea = 4 } = options;
  const probes = probeHeights.map((height) => floorY + height);
  const boxes = occluders.map(zoneOccluderBounds);
  const slice = boxes.flatMap((box, i) =>
    probes.some((y) => box.min[1] <= y && y <= box.max[1]) ? [{ box, occluder: occluders[i]! }] : [],
  );
  if (slice.length === 0) return { zones: [], portals: [], grid: { width: 0, depth: 0, minX: 0, minZ: 0 } };

  const sliceBoxes = slice.map(({ box }) => box);
  const grid = makeGrid(sliceBoxes, c, maxDoorWidth);
  const cells = new Uint8Array(grid.width * grid.depth);
  for (const { box, occluder } of slice) markSolid(cells, grid, c, probes, occluder, box);
  const { roomOf, count } = assignRooms(cells, grid, c, maxDoorWidth, minRoomArea);
  const highestProbe = Math.max(...probes);
  const rooms = makeZones(roomOf, count, grid, c, floorY, highestProbe, sliceBoxes, boxes);
  const portals = [
    ...makePortals(roomOf, grid, c, floorY, highestProbe, boxes, rooms),
    ...makeWindows(roomOf, cells, grid, c, floorY, boxes, rooms, Math.ceil(maxDoorWidth / c)),
  ];
  const roofRotation = quatFromAxisAngle([1, 0, 0], -Math.PI / 2);
  rooms.forEach(({ zone, roofOpen, top }, index) => {
    if (!roofOpen) return;
    portals.push({ a: null, b: index, center: [zone.center[0], top, zone.center[2]], rotation: roofRotation,
      halfSize: [zone.halfExtents[0], zone.halfExtents[2]] });
  });
  return { zones: rooms.map(({ zone }) => zone), portals, grid };
}
