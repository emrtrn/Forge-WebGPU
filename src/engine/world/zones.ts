// Zones and portals (plan 5c R9b Z2): which indoor zones the camera can see.
// Pure data, no three; the renderer (`render/sync/zoneDrawing.ts`) feeds world
// boxes and rectangles and asks once per frame. A placement belongs to the
// smallest zone holding it (`zoneAt`); a portal joins the zones its probes
// find on either side unless pinned by hand. Visibility walks the portal
// graph from the camera's zone, narrowing the screen rectangle to each
// portal's projected bounds (classic portal culling): no precomputation, so
// it stays valid while the level is edited. A camera in no zone, or a frame
// whose portal budget runs out, sees everything.

import { add, invertQuat, rotate, scale, sub } from "../math/affine.ts";

export type ZoneVec3 = readonly [number, number, number];
export type ZoneQuat = readonly [number, number, number, number];

/** A zone in world space: an oriented box. */
export interface ZoneInput {
  readonly id: string;
  readonly center: ZoneVec3;
  readonly rotation: ZoneQuat;
  readonly halfExtents: ZoneVec3;
}

/** A portal in world space: a rectangle in its local X / Y plane, normal = local +Z. */
export interface PortalInput {
  readonly id: string;
  readonly center: ZoneVec3;
  readonly rotation: ZoneQuat;
  readonly halfSize: readonly [number, number];
  /** Zones pinned by hand. Null sides are linked automatically. */
  readonly zoneA: string | null;
  readonly zoneB: string | null;
  /** A closed portal is never traversed. Default true. */
  readonly open?: boolean;
}

export interface PortalLink {
  readonly portal: string;
  readonly a: string;
  readonly b: string;
}

interface PortalConnection {
  readonly next: string;
  readonly portal: PortalInput;
}

export interface ZoneSet {
  /** Zones sorted by volume ascending, ties by id. */
  readonly zones: readonly ZoneInput[];
  /** Portals that join two different zones, in input order. */
  readonly links: readonly PortalLink[];
  /** Portal ids that could not be linked, in input order. */
  readonly unlinked: readonly string[];
  readonly portalsByZone: ReadonlyMap<string, readonly PortalConnection[]>;
}

export interface ZoneSetOptions {
  /** Distances along the portal normal in both directions. */
  readonly probeSteps?: readonly number[];
}

export const PORTAL_PROBE_STEPS: readonly number[] = [0.05, 0.25, 0.5, 1, 2];

function volume(zone: ZoneInput): number {
  const [hx, hy, hz] = zone.halfExtents;
  return 8 * hx * hy * hz;
}

/** The smallest zone containing the point, including the boundary. */
export function zoneAt(set: ZoneSet, point: ZoneVec3): string | null {
  const epsilon = 1e-6;
  for (const zone of set.zones) {
    const [x, y, z] = rotate(invertQuat(zone.rotation), sub(point, zone.center));
    const [hx, hy, hz] = zone.halfExtents;
    if (Math.abs(x) <= hx + epsilon && Math.abs(y) <= hy + epsilon && Math.abs(z) <= hz + epsilon) {
      return zone.id;
    }
  }
  return null;
}

function probeZone(set: ZoneSet, center: ZoneVec3, direction: ZoneVec3, steps: readonly number[]): string | null {
  for (const step of steps) {
    const id = zoneAt(set, add(center, scale(direction, step)));
    if (id !== null) return id;
  }
  return null;
}

export function buildZoneSet(
  zones: readonly ZoneInput[],
  portals: readonly PortalInput[],
  options?: ZoneSetOptions,
): ZoneSet {
  const sortedZones = [...zones].sort((a, b) => {
    const volumeOrder = volume(a) - volume(b);
    if (volumeOrder || a.id === b.id) return volumeOrder;
    return a.id < b.id ? -1 : 1;
  });
  const links: PortalLink[] = [];
  const unlinked: string[] = [];
  const portalsByZone = new Map<string, PortalConnection[]>();
  for (const zone of sortedZones) portalsByZone.set(zone.id, []);
  const set: ZoneSet = { zones: sortedZones, links, unlinked, portalsByZone };
  const steps = options?.probeSteps ?? PORTAL_PROBE_STEPS;

  for (const portal of portals) {
    let a = portal.zoneA !== null && portalsByZone.has(portal.zoneA) ? portal.zoneA : null;
    let b = portal.zoneB !== null && portalsByZone.has(portal.zoneB) ? portal.zoneB : null;
    if (a === null || b === null) {
      const normal = rotate(portal.rotation, [0, 0, 1]);
      const front = probeZone(set, portal.center, normal, steps);
      const back = probeZone(set, portal.center, scale(normal, -1), steps);
      const pinned = a ?? b;
      if (pinned === null) {
        a = front;
        b = back;
      } else {
        const other = [front, back].find((id) => id !== null && id !== pinned) ?? null;
        a ??= other;
        b ??= other;
      }
    }

    if (a === null || b === null || a === b) {
      unlinked.push(portal.id);
    } else {
      links.push({ portal: portal.id, a, b });
      portalsByZone.get(a)!.push({ next: b, portal });
      portalsByZone.get(b)!.push({ next: a, portal });
    }
  }
  return set;
}

export interface ZoneView {
  /** Camera position in world space. */
  readonly position: ZoneVec3;
  /** Column-major view-projection matrix. Clip depth does not affect visibility. */
  readonly viewProjection: readonly number[];
}

export interface VisibleZoneOptions {
  /** Maximum portals along a path. Default 8. */
  readonly maxDepth?: number;
  /** Frame budget. Exceeding it makes all zones visible. Default 256. */
  readonly maxPortalTests?: number;
  /** Cameras closer to the portal rectangle pass without narrowing. Default 0.3 m. */
  readonly nearPortal?: number;
  /** Additional portal ids closed this frame. */
  readonly closed?: ReadonlySet<string>;
}

export interface VisibleZones {
  readonly cameraZone: string | null;
  /** Null means everything is visible. */
  readonly zones: ReadonlySet<string> | null;
  readonly portalTests: number;
  readonly portalsPassed: number;
}

interface ScreenRect {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

type ClipPoint = readonly [number, number, number, number];

function toClip(matrix: readonly number[], [x, y, z]: ZoneVec3): ClipPoint {
  return [
    matrix[0]! * x + matrix[4]! * y + matrix[8]! * z + matrix[12]!,
    matrix[1]! * x + matrix[5]! * y + matrix[9]! * z + matrix[13]!,
    matrix[2]! * x + matrix[6]! * y + matrix[10]! * z + matrix[14]!,
    matrix[3]! * x + matrix[7]! * y + matrix[11]! * z + matrix[15]!,
  ];
}

function clipToPositiveW(quad: readonly [ClipPoint, ClipPoint, ClipPoint, ClipPoint]): ClipPoint[] {
  const minW = 1e-5;
  const clipped: ClipPoint[] = [];
  let previous = quad[3];
  for (const current of quad) {
    const previousInside = previous[3] >= minW;
    const currentInside = current[3] >= minW;
    if (previousInside !== currentInside) {
      const t = (minW - previous[3]) / (current[3] - previous[3]);
      // The interpolated w is exactly the clipping plane.
      clipped.push([
        previous[0] + (current[0] - previous[0]) * t,
        previous[1] + (current[1] - previous[1]) * t,
        previous[2] + (current[2] - previous[2]) * t,
        minW,
      ]);
    }
    if (currentInside) clipped.push(current);
    previous = current;
  }
  return clipped;
}

function portalDistance(portal: PortalInput, point: ZoneVec3): number {
  const [x, y, z] = rotate(invertQuat(portal.rotation), sub(point, portal.center));
  const [hw, hh] = portal.halfSize;
  return Math.hypot(Math.max(0, Math.abs(x) - hw), Math.max(0, Math.abs(y) - hh), z);
}

function narrowRect(portal: PortalInput, matrix: readonly number[], rect: ScreenRect): ScreenRect | null {
  const [hw, hh] = portal.halfSize;
  const corner = (x: number, y: number) => toClip(matrix, add(portal.center, rotate(portal.rotation, [x, y, 0])));
  const clipped = clipToPositiveW([corner(-hw, -hh), corner(hw, -hh), corner(hw, hh), corner(-hw, hh)]);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y, , w] of clipped) {
    minX = Math.min(minX, x / w);
    maxX = Math.max(maxX, x / w);
    minY = Math.min(minY, y / w);
    maxY = Math.max(maxY, y / w);
  }
  minX = Math.max(minX, rect.minX);
  maxX = Math.min(maxX, rect.maxX);
  minY = Math.max(minY, rect.minY);
  maxY = Math.min(maxY, rect.maxY);
  return minX < maxX && minY < maxY ? { minX, maxX, minY, maxY } : null;
}

interface ZoneVisit {
  readonly zone: string;
  readonly rect: ScreenRect;
  readonly connections: readonly PortalConnection[];
  nextConnection: number;
}

export function visibleZones(set: ZoneSet, view: ZoneView, options?: VisibleZoneOptions): VisibleZones {
  const cameraZone = zoneAt(set, view.position);
  if (cameraZone === null) return { cameraZone, zones: null, portalTests: 0, portalsPassed: 0 };

  const maxDepth = options?.maxDepth ?? 8;
  const maxPortalTests = options?.maxPortalTests ?? 256;
  const nearPortal = options?.nearPortal ?? 0.3;
  const zones = new Set<string>();
  const path = new Set<string>();
  const stack: ZoneVisit[] = [];
  let portalTests = 0;
  let portalsPassed = 0;

  function enter(zone: string, rect: ScreenRect): void {
    zones.add(zone);
    path.add(zone);
    stack.push({ zone, rect, connections: set.portalsByZone.get(zone) ?? [], nextConnection: 0 });
  }

  enter(cameraZone, { minX: -1, maxX: 1, minY: -1, maxY: 1 });
  while (stack.length > 0) {
    const visit = stack[stack.length - 1]!;
    const connection = visit.connections[visit.nextConnection];
    if (connection === undefined || stack.length - 1 >= maxDepth) {
      stack.pop();
      path.delete(visit.zone);
      continue;
    }
    visit.nextConnection += 1;

    // Each path carries its own rectangle, so other paths may revisit a zone.
    const { next, portal } = connection;
    if (portal.open === false || options?.closed?.has(portal.id) || path.has(next)) continue;
    portalTests += 1;
    if (portalTests > maxPortalTests) return { cameraZone, zones: null, portalTests, portalsPassed };

    const rect = portalDistance(portal, view.position) < nearPortal
      ? visit.rect
      : narrowRect(portal, view.viewProjection, visit.rect);
    if (rect === null) continue;
    portalsPassed += 1;
    enter(next, rect);
  }

  return { cameraZone, zones, portalTests, portalsPassed };
}
