import assert from "node:assert/strict";
import { test } from "vitest";
import {
  addLandscapeSpline, closeLandscapeSpline, deleteLandscapeSpline, deleteLandscapeSplinePoint, drawLandscapeSplinePoint, NO_ACTIVE_SPLINE, resolveActiveSpline,
  setLandscapeSpline, setLandscapeSplinePoints, setLandscapeSplineSegments, splitLandscapeSplineSegment, worldTerrainSplines,
  type LandscapeSplineActive, type LandscapeSplineEdit,
} from "./landscapeSplineEdit.ts";
import { evaluateLandscapeSplineSegment } from "./landscapeSplineAdapter.ts";
import type { WorldTerrainDef, WorldTerrainSpline } from "./terrainTypes.ts";
import { worldTerrainActorPosition } from "./worldTerrainActor.ts";

type Vec3 = [number, number, number];
const ok = (edit: LandscapeSplineEdit): { splines: WorldTerrainSpline[]; active: LandscapeSplineActive } => {
  assert.ok(edit.ok, edit.ok ? "" : edit.reason);
  return edit;
};
/** Clicks in Draw, one after the other, from `start`. */
function draw(clicks: readonly Vec3[], start: { splines: WorldTerrainSpline[]; active: LandscapeSplineActive } = { splines: [], active: NO_ACTIVE_SPLINE }) {
  let state = start;
  for (const click of clicks) state = ok(drawLandscapeSplinePoint(state.splines, state.active, click, 1.5));
  return state;
}
const edges = (spline: WorldTerrainSpline): string[] => spline.segments.map((segment) => `${segment.startPointId}>${segment.endPointId}`);

test("drawing starts a spline, extends it from the pen tip, branches from a picked point and closes by welding", () => {
  const road = draw([[0, 1, 0], [10, 1, 0], [20, 1, 0]]);
  assert.equal(road.splines.length, 1);
  assert.deepEqual([road.splines[0]!.id, road.splines[0]!.coordinateSpace], ["spline-1", "world"]);
  assert.deepEqual(edges(road.splines[0]!), ["point-1>point-2", "point-2>point-3"]);
  assert.deepEqual(road.active, { splineId: "spline-1", pointId: "point-3", segmentId: null });

  const branch = draw([[10, 1, 10]], { splines: road.splines, active: { ...road.active, pointId: "point-2" } });
  assert.deepEqual(edges(branch.splines[0]!).at(-1), "point-2>point-4");

  // Within the weld distance of the first point: linked, no new point; again: no second segment.
  const closed = draw([[0.5, 1, 1]], road);
  assert.equal(closed.splines[0]!.points.length, 3);
  assert.deepEqual(edges(closed.splines[0]!).at(-1), "point-3>point-1");
  assert.deepEqual(closed.active.pointId, "point-1");
  const again = draw([[20, 1, 0.5]], closed);
  assert.equal(again.splines[0]!.segments.length, 3);
  assert.deepEqual(road.splines[0]!.points.length, 3, "inputs are never changed");
});

test("welding onto another spline joins the two with fresh ids", () => {
  const first = draw([[0, 0, 0], [10, 0, 0]]);
  const made = ok(addLandscapeSpline(first.splines));
  const second = draw([[10, 0, 20], [10, 0, 10], [10, 0, 1]], made);
  assert.equal(second.splines.length, 1);
  const joined = second.splines[0]!;
  assert.equal(joined.id, "spline-1");
  assert.deepEqual(joined.points.map((point) => point.id), ["point-1", "point-2", "point-3", "point-4"]);
  assert.deepEqual(edges(joined), ["point-1>point-2", "point-3>point-4", "point-4>point-2"]);
  assert.deepEqual(second.active, { splineId: "spline-1", pointId: "point-2", segmentId: null });
});

test("a drawn point goes on with the road's width and effects", () => {
  const road = draw([[0, 0, 0], [10, 0, 0]]);
  const wide = ok(setLandscapeSplinePoints(road.splines, road.active, ["point-2"], { width: 9, falloff: 1 }));
  const active = { ...wide.active, segmentId: "segment-1" };
  const meshed = ok(setLandscapeSplineSegments(wide.splines, active, ["segment-1"], { mesh: { assetId: "road" }, deform: { enabled: true, targetOffset: 0.25 } }, "dirt"));
  assert.deepEqual(meshed.splines[0]!.segments[0]!.mesh, { enabled: true, assetId: "road", alignToTerrain: true, deform: true });
  const next = draw([[20, 0, 0]], { splines: meshed.splines, active: { ...active, pointId: "point-2" } }).splines[0]!;
  assert.deepEqual([next.points[2]!.width, next.points[2]!.falloff], [9, 1]);
  assert.deepEqual(next.segments[1]!.mesh, next.segments[0]!.mesh);
  assert.deepEqual(next.segments[1]!.deform, { enabled: true, raiseTerrain: true, lowerTerrain: true, flatten: true, targetOffset: 0.25 });
});

test("close, split, delete and the several-item edits; refusals change nothing", () => {
  const two = draw([[0, 0, 0], [10, 0, 0]]);
  assert.equal(closeLandscapeSpline(two.splines, "spline-1").ok, false);
  const three = draw([[10, 4, 10]], two);
  const loop = ok(closeLandscapeSpline(three.splines, "spline-1"));
  assert.deepEqual(edges(loop.splines[0]!).at(-1), "point-3>point-1");
  assert.equal(closeLandscapeSpline(loop.splines, "spline-1").ok, false);

  const curved = ok(setLandscapeSpline(three.splines, three.active, { smooth: true, smoothness: 1 }));
  const middle = evaluateLandscapeSplineSegment(curved.splines[0]!, curved.splines[0]!.segments[0]!, 0.5)!;
  const split = ok(splitLandscapeSplineSegment(curved.splines, curved.active, "segment-1"));
  const halved = split.splines[0]!;
  assert.deepEqual(edges(halved), ["point-1>point-4", "point-4>point-2", "point-2>point-3"]);
  assert.deepEqual(halved.points.map((point) => point.id), ["point-1", "point-4", "point-2", "point-3"]);
  assert.deepEqual(halved.points[1]!.position, middle.map((value) => Number(value.toFixed(3))));
  assert.deepEqual([split.active.pointId, split.active.segmentId], ["point-4", "segment-3"]);
  assert.deepEqual(edges(ok(closeLandscapeSpline(split.splines, "spline-1")).splines[0]!).at(-1), "point-3>point-1");

  const moved = ok(setLandscapeSplinePoints(three.splines, three.active, ["point-1", "point-2"], { y: 7.12345 }));
  assert.deepEqual(moved.splines[0]!.points.map((point) => point.position[1]), [7.123, 7.123, 4]);
  assert.equal(setLandscapeSplinePoints(three.splines, three.active, [], { y: 1 }).ok, false);
  assert.equal(setLandscapeSplinePoints(three.splines, three.active, ["point-1"], { x: Number.NaN }).ok, false);

  const gone = ok(deleteLandscapeSplinePoint(three.splines, three.active, "point-2"));
  assert.deepEqual([gone.splines[0]!.points.length, gone.splines[0]!.segments.length], [2, 0]);
  const painted = ok(setLandscapeSplineSegments(three.splines, three.active, ["segment-1", "segment-2"], { paint: { enabled: true, strength: 4 } }, "dirt"));
  assert.deepEqual(painted.splines[0]!.segments.map((segment) => segment.paint), Array(2).fill({ enabled: true, layerId: "dirt", strength: 1 }));
  const cleared = ok(setLandscapeSplineSegments(painted.splines, three.active, ["segment-1"], { mesh: { assetId: "" } }, "dirt"));
  assert.equal(cleared.splines[0]!.segments[0]!.mesh, undefined);
  assert.deepEqual(ok(deleteLandscapeSpline(three.splines, "spline-1")).active, NO_ACTIVE_SPLINE);
  assert.deepEqual(resolveActiveSpline(three.splines, { splineId: "spline-1", pointId: "gone", segmentId: "segment-2" }), { splineId: "spline-1", pointId: null, segmentId: "segment-2" });
});

test("the save limits hold while editing", () => {
  const full = draw(Array.from({ length: 256 }, (_, i): Vec3 => [i * 10, 0, 0]));
  const over = drawLandscapeSplinePoint(full.splines, full.active, [2560, 0, 0], 1.5);
  assert.equal(over.ok, false);
});

test("legacy centre-local splines are edited in world space; the definition is not touched", () => {
  const def: WorldTerrainDef = {
    schema: 1, type: "worldTerrain", name: "T", tileQuads: 32, spacing: 1, tilesX: 1, tilesZ: 1, origin: [100, 5, -40], heightMin: -8, heightMax: 8,
    collision: true, layers: [], tiles: [],
    splines: [{ id: "old", points: [{ id: "a", position: [1, 2, 3], width: 4, falloff: 1 }], segments: [] }],
  };
  const centre = worldTerrainActorPosition(def);
  assert.deepEqual(worldTerrainSplines(def)[0]!.points[0]!.position, [centre[0] + 1, centre[1] + 2, centre[2] + 3]);
  assert.equal(worldTerrainSplines(def)[0]!.coordinateSpace, "world");
  assert.equal(def.splines![0]!.coordinateSpace, undefined);
});
