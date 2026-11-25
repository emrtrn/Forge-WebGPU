// Edits of a World Terrain's splines (plan 5d step 5, INV-B06). Adapted from
// Forge WebGL src/scene/SceneApp.ts @ forge-webgl-final (04b5fb23):
// appendLandscapeSplinePoint, linkSplineSegment, mergeSplineInto,
// closeSelectedLandscapeSpline, setSelectedLandscapeSpline*,
// splitSelectedLandscapeSplineSegment, deleteSelectedLandscapeSplinePoint. Pure:
// each takes the definition's world-frame splines and returns new ones with
// what becomes active, or a reason why nothing changed. The editor turns a
// result into one undo step (editor/landscape/landscapeSplines.ts).
//
// Differences from Forge: the result passes the save allowlist
// (`normalizeTerrainSplines`: limits, three decimals), so what is edited is
// what is saved; a spline's smoothness can be set; splitting a smooth segment
// puts the point on the curve, in the road's order (Forge appended it, so the
// pen tip and Close Loop went wrong); Close links the open ends; a drawn point goes on with the road's width,
// falloff and segment effects; choosing a mesh turns it on, bent along the
// curve and aligned to the terrain.

import type { Vec3 } from "../legacy/layout.ts";
import type { ForgeLandscapeSpline, ForgeLandscapeSplinePoint, ForgeLandscapeSplineSegment } from "./landscape.ts";
import { evaluateLandscapeSplineSegment } from "./landscapeSplineAdapter.ts";
import { migrateTerrainSplineCoordinates, normalizeTerrainSplines } from "./terrainSplineData.ts";
import { terrainTileWorldSize, type WorldTerrainDef, type WorldTerrainSpline } from "./terrainTypes.ts";

/** What the panel and the viewport work on. */
export interface LandscapeSplineActive {
  readonly splineId: string | null;
  readonly pointId: string | null;
  readonly segmentId: string | null;
}

export type LandscapeSplineEdit =
  | { readonly ok: true; readonly splines: WorldTerrainSpline[]; readonly active: LandscapeSplineActive }
  | { readonly ok: false; readonly reason: string };

/** Forge's new control point. */
export const NEW_SPLINE_POINT = { width: 6, falloff: 3 } as const;

export const NO_ACTIVE_SPLINE: LandscapeSplineActive = { splineId: null, pointId: null, segmentId: null };

/** The definition's splines in world space (legacy centre-local ones converted); copies. */
export function worldTerrainSplines(def: WorldTerrainDef): WorldTerrainSpline[] {
  if (!def.splines || def.splines.length === 0) return [];
  return migrateTerrainSplineCoordinates({ ...def, tiles: [], layers: [] }).splines as WorldTerrainSpline[];
}

/** Forge's weld radius: it grows with the tile so it feels the same at any terrain size. */
export function splineWeldDistance(def: Pick<WorldTerrainDef, "tileQuads" | "spacing">): number {
  return Math.max(1.5, terrainTileWorldSize(def) * 0.02);
}

function uniqueId(prefix: string, used: ReadonlySet<string>, start: number): string {
  let number = start;
  while (used.has(`${prefix}-${number}`)) number += 1;
  return `${prefix}-${number}`;
}
const uniquePointId = (spline: ForgeLandscapeSpline): string => uniqueId("point", new Set(spline.points.map((point) => point.id)), spline.points.length + 1);
const uniqueSegmentId = (spline: ForgeLandscapeSpline): string => uniqueId("segment", new Set(spline.segments.map((segment) => segment.id)), spline.segments.length + 1);

/** A segment between two points unless one connects them already (either direction). */
function link(spline: ForgeLandscapeSpline, startPointId: string, endPointId: string): boolean {
  const exists = spline.segments.some((segment) =>
    (segment.startPointId === startPointId && segment.endPointId === endPointId)
    || (segment.startPointId === endPointId && segment.endPointId === startPointId));
  if (exists) return false;
  const { deform, paint, mesh } = spline.segments.at(-1) ?? {};
  spline.segments.push({
    id: uniqueSegmentId(spline), startPointId, endPointId,
    ...(deform ? { deform: structuredClone(deform) } : {}),
    ...(paint ? { paint: structuredClone(paint) } : {}),
    ...(mesh ? { mesh: structuredClone(mesh) } : {}),
  });
  return true;
}

/** Folds `source` into `target` with fresh ids; the old -> new point ids. */
function mergeInto(target: ForgeLandscapeSpline, source: ForgeLandscapeSpline): Map<string, string> {
  const ids = new Map<string, string>();
  for (const point of source.points) {
    const id = uniquePointId(target);
    ids.set(point.id, id);
    target.points.push({ ...structuredClone(point), id });
  }
  for (const segment of source.segments) {
    target.segments.push({
      ...structuredClone(segment),
      id: uniqueSegmentId(target),
      startPointId: ids.get(segment.startPointId) ?? segment.startPointId,
      endPointId: ids.get(segment.endPointId) ?? segment.endPointId,
    });
  }
  return ids;
}

function done(splines: WorldTerrainSpline[], active: LandscapeSplineActive): LandscapeSplineEdit {
  try {
    return { ok: true, splines: normalizeTerrainSplines(splines) as WorldTerrainSpline[], active };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}
const no = (reason: string): LandscapeSplineEdit => ({ ok: false, reason });
const copy = (splines: readonly WorldTerrainSpline[]): WorldTerrainSpline[] => structuredClone([...splines]);

function newSpline(splines: readonly WorldTerrainSpline[]): WorldTerrainSpline {
  const id = uniqueId("spline", new Set(splines.map((spline) => spline.id)), 1);
  return { id, name: `Spline ${id.slice("spline-".length)}`, points: [], segments: [], coordinateSpace: "world" };
}

export function addLandscapeSpline(splines: readonly WorldTerrainSpline[]): LandscapeSplineEdit {
  const next = copy(splines);
  const spline = newSpline(next);
  next.push(spline);
  return done(next, { ...NO_ACTIVE_SPLINE, splineId: spline.id });
}

export function deleteLandscapeSpline(splines: readonly WorldTerrainSpline[], splineId: string): LandscapeSplineEdit {
  const next = copy(splines).filter((spline) => spline.id !== splineId);
  if (next.length === splines.length) return no("No spline is selected.");
  return done(next, { ...NO_ACTIVE_SPLINE, splineId: next[0]?.id ?? null });
}

/**
 * Draw's click at `position`: extends the active spline from its pen tip (the
 * active point, else its last). Within `weld` metres (XZ) of a point of any
 * spline it welds to that point instead: the same spline closes or branches,
 * another one is joined (the drawn spline folds into it). No active spline:
 * a new one starts.
 */
export function drawLandscapeSplinePoint(splines: readonly WorldTerrainSpline[], active: LandscapeSplineActive, position: Vec3, weld: number): LandscapeSplineEdit {
  const next = copy(splines);
  let spline = next.find((entry) => entry.id === active.splineId);
  if (!spline) {
    spline = newSpline(next);
    next.push(spline);
  }
  const from: ForgeLandscapeSplinePoint | undefined = spline.points.find((point) => point.id === active.pointId) ?? spline.points.at(-1);
  const target = next
    .flatMap((entry) => entry.points.filter((point) => point !== from).map((point) => ({
      spline: entry, point, distance: Math.hypot(point.position[0] - position[0], point.position[2] - position[2]),
    })))
    .filter((entry) => entry.distance <= weld)
    .sort((a, b) => a.distance - b.distance)[0];
  if (target && target.spline !== spline) {
    const ids = mergeInto(target.spline, spline);
    next.splice(next.indexOf(spline), 1);
    if (from) link(target.spline, ids.get(from.id) ?? from.id, target.point.id);
    return done(next, { splineId: target.spline.id, pointId: target.point.id, segmentId: null });
  }
  if (target) {
    if (from) link(spline, from.id, target.point.id);
    return done(next, { splineId: spline.id, pointId: target.point.id, segmentId: null });
  }
  const id = uniquePointId(spline);
  spline.points.push({ id, position: [...position], width: from?.width ?? NEW_SPLINE_POINT.width, falloff: from?.falloff ?? NEW_SPLINE_POINT.falloff });
  if (from) link(spline, from.id, id);
  return done(next, { splineId: spline.id, pointId: id, segmentId: null });
}

/** Links the road's two open ends; a spline with other than two, its last point back to its first (Forge). */
export function closeLandscapeSpline(splines: readonly WorldTerrainSpline[], splineId: string): LandscapeSplineEdit {
  const next = copy(splines);
  const spline = next.find((entry) => entry.id === splineId);
  if (!spline || spline.points.length < 3) return no("Add at least three control points before closing the loop.");
  const degree = new Map<string, number>();
  for (const segment of spline.segments) for (const id of [segment.startPointId, segment.endPointId]) degree.set(id, (degree.get(id) ?? 0) + 1);
  const ends = spline.points.filter((point) => degree.get(point.id) === 1);
  const [first, last] = ends.length === 2 ? [ends[0]!, ends[1]!] : [spline.points[0]!, spline.points.at(-1)!];
  if (!link(spline, last.id, first.id)) return no("The spline loop is already closed.");
  return done(next, { splineId, pointId: first.id, segmentId: null });
}

export interface LandscapeSplinePatch {
  readonly smooth?: boolean;
  readonly smoothness?: number;
}

export function setLandscapeSpline(splines: readonly WorldTerrainSpline[], active: LandscapeSplineActive, patch: LandscapeSplinePatch): LandscapeSplineEdit {
  const next = copy(splines);
  const spline = next.find((entry) => entry.id === active.splineId);
  if (!spline) return no("No spline is selected.");
  if (patch.smooth === true) spline.smooth = true;
  if (patch.smooth === false) delete spline.smooth;
  if (patch.smoothness !== undefined) spline.smoothness = Math.min(1, Math.max(0, patch.smoothness));
  return done(next, active);
}

export interface LandscapeSplinePointPatch {
  readonly x?: number;
  readonly y?: number;
  readonly z?: number;
  readonly width?: number;
  readonly falloff?: number;
}

/** Writes only the given fields, to every named point of the active spline. */
export function setLandscapeSplinePoints(splines: readonly WorldTerrainSpline[], active: LandscapeSplineActive, ids: readonly string[], patch: LandscapeSplinePointPatch): LandscapeSplineEdit {
  if (Object.values(patch).some((value) => !Number.isFinite(value))) return no("A control point needs finite values.");
  const next = copy(splines);
  const wanted = new Set(ids);
  const points = next.find((entry) => entry.id === active.splineId)?.points.filter((point) => wanted.has(point.id)) ?? [];
  if (points.length === 0) return no("No control point is selected.");
  for (const point of points) {
    if (patch.x !== undefined) point.position[0] = patch.x;
    if (patch.y !== undefined) point.position[1] = patch.y;
    if (patch.z !== undefined) point.position[2] = patch.z;
    if (patch.width !== undefined) point.width = Math.min(10000, Math.max(0.1, patch.width));
    if (patch.falloff !== undefined) point.falloff = Math.min(10000, Math.max(0, patch.falloff));
  }
  return done(next, active);
}

/** Removes a point and the segments it ends (Forge). */
export function deleteLandscapeSplinePoint(splines: readonly WorldTerrainSpline[], active: LandscapeSplineActive, pointId: string): LandscapeSplineEdit {
  const next = copy(splines);
  const spline = next.find((entry) => entry.id === active.splineId);
  if (!spline || !spline.points.some((point) => point.id === pointId)) return no("No control point is selected.");
  spline.points = spline.points.filter((point) => point.id !== pointId);
  spline.segments = spline.segments.filter((segment) => segment.startPointId !== pointId && segment.endPointId !== pointId);
  return done(next, { splineId: spline.id, pointId: null, segmentId: null });
}

/** Puts a point in the middle of a segment (on the curve); both halves keep its effects. */
export function splitLandscapeSplineSegment(splines: readonly WorldTerrainSpline[], active: LandscapeSplineActive, segmentId: string): LandscapeSplineEdit {
  const next = copy(splines);
  const spline = next.find((entry) => entry.id === active.splineId);
  const index = spline?.segments.findIndex((segment) => segment.id === segmentId) ?? -1;
  const segment = spline?.segments[index];
  const start = spline?.points.find((point) => point.id === segment?.startPointId);
  const end = spline?.points.find((point) => point.id === segment?.endPointId);
  if (!spline || !segment || !start || !end) return no("No segment is selected.");
  const middle = evaluateLandscapeSplineSegment(spline, segment, 0.5);
  if (!middle) return no("The segment has no curve.");
  const pointId = uniquePointId(spline);
  const newSegmentId = uniqueSegmentId(spline);
  // After its start, so the road's order and its last point (the pen tip) stay.
  spline.points.splice(spline.points.indexOf(start) + 1, 0, { id: pointId, position: middle, width: (start.width + end.width) / 2, falloff: (start.falloff + end.falloff) / 2 });
  spline.segments.splice(index, 1, { ...segment, endPointId: pointId }, { ...structuredClone(segment), id: newSegmentId, startPointId: pointId });
  return done(next, { splineId: spline.id, pointId, segmentId: newSegmentId });
}

type Deform = NonNullable<ForgeLandscapeSplineSegment["deform"]>;
type Paint = NonNullable<ForgeLandscapeSplineSegment["paint"]>;
type Mesh = NonNullable<ForgeLandscapeSplineSegment["mesh"]>;

export interface LandscapeSplineSegmentPatch {
  readonly deform?: Partial<Deform>;
  readonly paint?: Partial<Paint>;
  readonly mesh?: Partial<Mesh>;
}

export const DEFAULT_SEGMENT_DEFORM: Readonly<Deform> = { enabled: false, raiseTerrain: true, lowerTerrain: true, flatten: true };
export const DEFAULT_SEGMENT_MESH_SPACING = 2;

/** Keeps only what differs from a mesh's defaults (Forge's stored form). */
function compactMesh(mesh: Mesh): Mesh {
  return {
    enabled: mesh.enabled, assetId: mesh.assetId,
    ...(mesh.spacing ? { spacing: Math.max(0.01, mesh.spacing) } : {}),
    ...(mesh.yawOffset ? { yawOffset: mesh.yawOffset } : {}),
    ...(mesh.fitToLength === false ? { fitToLength: false } : {}),
    ...(mesh.scale ? { scale: mesh.scale } : {}),
    ...(mesh.offset ? { offset: mesh.offset } : {}),
    ...(mesh.alignToTerrain ? { alignToTerrain: true } : {}),
    ...(mesh.bank ? { bank: mesh.bank } : {}),
    ...(mesh.deform ? { deform: true } : {}),
    ...(mesh.collision === false ? { collision: false } : {}),
  };
}

/** Writes the given effect fields to every named segment; `paintLayer` starts a segment's paint effect. */
export function setLandscapeSplineSegments(
  splines: readonly WorldTerrainSpline[], active: LandscapeSplineActive, ids: readonly string[], patch: LandscapeSplineSegmentPatch, paintLayer: string,
): LandscapeSplineEdit {
  const next = copy(splines);
  const wanted = new Set(ids);
  const segments = next.find((entry) => entry.id === active.splineId)?.segments.filter((segment) => wanted.has(segment.id)) ?? [];
  if (segments.length === 0) return no("No segment is selected.");
  for (const segment of segments) {
    if (patch.deform) {
      const { targetOffset, ...flags }: Deform = { ...DEFAULT_SEGMENT_DEFORM, ...segment.deform, ...patch.deform };
      segment.deform = { ...flags, ...(targetOffset ? { targetOffset } : {}) };
    }
    if (patch.paint) {
      const paint: Paint = { enabled: false, layerId: paintLayer, strength: 1, ...segment.paint, ...patch.paint };
      segment.paint = { ...paint, strength: Math.min(1, Math.max(0, paint.strength)) };
    }
    if (patch.mesh) {
      const mesh: Mesh = { enabled: false, assetId: "", ...segment.mesh, ...patch.mesh };
      if (!segment.mesh && mesh.assetId && patch.mesh.enabled === undefined) Object.assign(mesh, { enabled: true, deform: true, alignToTerrain: true });
      if (!mesh.assetId) delete segment.mesh;
      else segment.mesh = compactMesh(mesh);
    }
  }
  return done(next, active);
}

/** What of `active` still exists in `splines`; nothing is active when its spline is gone. */
export function resolveActiveSpline(splines: readonly ForgeLandscapeSpline[], active: LandscapeSplineActive): LandscapeSplineActive {
  const spline = splines.find((entry) => entry.id === active.splineId);
  if (!spline) return NO_ACTIVE_SPLINE;
  return {
    splineId: spline.id,
    pointId: spline.points.some((point) => point.id === active.pointId) ? active.pointId : null,
    segmentId: spline.segments.some((segment) => segment.id === active.segmentId) ? active.segmentId : null,
  };
}
