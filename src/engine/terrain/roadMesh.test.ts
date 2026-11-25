// Adapted from Forge WebGL tools/engine-tests.ts and tests/engine/terrainSplineMeshes.test.ts.
import assert from "node:assert/strict";
import { test } from "vitest";
import type { Vec3 } from "../legacy/layout.ts";
import {
  computeLandscapeSplineMeshInstances,
  resolveLandscapeSplineMeshChains,
  type ForgeLandscapeSpline,
  type ForgeLandscapeSplineSegment,
} from "./landscape.ts";
import {
  buildRoadMeshes,
  deformRoadPart,
  roadModelForwardLength,
  type RoadMeshAttribute,
  type RoadMeshDeformPath,
  type RoadMeshModel,
  type RoadMeshPart,
} from "./roadMesh.ts";
import { prepareTerrainSplineMeshSource, terrainSplineMeshTileKeys } from "./terrainSplineMeshes.ts";
import { createFlatTerrainTile, tileKey, type TerrainTileData, type WorldTerrainDef } from "./terrainTypes.ts";

const bentMesh = { enabled: true, assetId: "road", deform: true } as const;
const flatNormal = (): Vec3 => [0, 1, 0];
const oneCell = { cellSize: 128 };

const attribute = (size: number, values: number[]): RoadMeshAttribute => ({ size, values: Float32Array.from(values) });

function strip(rings = [-5, 5], halfWidth = 1, longitudinal: "u" | "v" | null = "v"): RoadMeshPart {
  const positions: number[] = [];
  const uv: number[] = [];
  const indices: number[] = [];
  for (const [i, z] of rings.entries()) {
    positions.push(-halfWidth, 0, z, halfWidth, 0, z);
    const t = i / (rings.length - 1);
    uv.push(...(longitudinal === "u" ? [t, 0, t, 1] : [0, t, 1, t]));
    const a = i * 2;
    if (i + 1 < rings.length) indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  return {
    attributes: { position: attribute(3, positions), ...(longitudinal ? { uv: attribute(2, uv) } : {}) },
    indices: Uint32Array.from(indices),
  };
}

function modelMap(...parts: RoadMeshPart[]): Map<string, RoadMeshModel> {
  return new Map([["road", { parts }]]);
}

function path(points: Vec3[], overrides: Partial<RoadMeshDeformPath> = {}): RoadMeshDeformPath {
  return { points, scale: [1, 1, 1], offset: [0, 0, 0], yawOffset: 0, bank: 0, alignToTerrain: false, ...overrides };
}

function spline(id: string, positions: Vec3[], mesh: ForgeLandscapeSplineSegment["mesh"] = bentMesh): ForgeLandscapeSpline {
  return {
    id,
    points: positions.map((position, i) => ({ id: String(i), position, width: 2, falloff: 1 })),
    segments: positions.slice(1).map((_, i) => ({
      id: `s${i}`, startPointId: String(i), endPointId: String(i + 1), ...(mesh ? { mesh: { ...mesh } } : {}),
    })),
  };
}

function rows({ size, values }: RoadMeshAttribute): number[][] {
  return Array.from({ length: values.length / size }, (_, i) => Array.from(values.subarray(i * size, (i + 1) * size)));
}

function component(mesh: RoadMeshPart, name: string, axis: number): number[] {
  return rows(mesh.attributes[name]!).map((value) => value[axis]!);
}

test("deformRoadPart bends local +Z geometry along the sampled path", () => {
  const part = strip(Array.from({ length: 9 }, (_, i) => i * 1.25 - 5));
  const input = {
    ...part,
    attributes: {
      ...part.attributes,
      normal: attribute(3, Array(54).fill(1)),
      tangent: attribute(4, Array(72).fill(1)),
      color: attribute(3, Array(54).fill(0.5)),
    },
  };
  const before = structuredClone(input);
  const bent = deformRoadPart(input, path([[0, 0, 0], [0, 0, 10], [10, 0, 10]]), flatNormal);
  assert.ok(bent);
  const x = component(bent, "position", 0);
  assert.equal(Math.min(...component(bent, "position", 2)), 0);
  assert.equal(Math.max(...x), 10);
  assert.ok(x.some((value) => value > 4));
  assert.equal(bent.attributes.normal, undefined);
  assert.equal(bent.attributes.tangent, undefined);
  assert.deepEqual(bent.attributes.color, before.attributes.color);
  assert.deepEqual(input, before);
});

test("deformRoadPart continues the UV component that follows the source path", () => {
  const bent = deformRoadPart(strip([-5, 5], 1, "u"), path([[0, 0, 0], [0, 0, 10]], { distanceStart: 10 }), flatNormal);
  assert.ok(bent);
  assert.deepEqual(component(bent, "uv", 0), [1, 1, 2, 2]);
  assert.deepEqual(component(bent, "uv", 1), [0, 1, 0, 1]);
});

test("end rings snap to one incoming frame at authored segment joins", () => {
  const part = strip([-5, 5], 2);
  part.attributes.position!.values[8] = 5 - 0.00004;
  part.attributes.position!.values[5] = -5 + 0.00004;
  const base = path([[0, 0, 0], [0, 0, 10], [10, 0, 10]]);
  const first = deformRoadPart(part, { ...base, pathDistanceEnd: 10 }, flatNormal);
  const second = deformRoadPart(part, { ...base, distanceStart: 10, pathDistanceStart: 10, pathDistanceEnd: 20 }, flatNormal);
  assert.ok(first && second);
  const join = [[-2, 0, 10], [2, 0, 10]];
  assert.deepEqual(rows(first.attributes.position!).slice(2), join);
  assert.deepEqual(rows(second.attributes.position!).slice(0, 2), join);
});

test("deformation applies yaw before bending and uses bank, scale and offset without adding UVs", () => {
  const input: RoadMeshPart = {
    ...strip([-5, 5], 1, null),
    attributes: { position: attribute(3, [5, 1, -1, 5, 1, 1, -5, 1, -1, -5, 1, 1]) },
  };
  const bent = deformRoadPart(input, path([[0, 0, 0], [0, 0, 10]], {
    yawOffset: 90, bank: 90, scale: [2, 3, 99], offset: [7, 8, 9],
  }), flatNormal);
  assert.ok(bent);
  assert.deepEqual(rows(bent.attributes.position!), [[4, 6, 9], [4, 10, 9], [4, 6, 19], [4, 10, 19]]);
  assert.equal(bent.attributes.uv, undefined);
  assert.equal(deformRoadPart(input, path([[0, 0, 0], [0, 0, 0]]), flatNormal), null);
  assert.equal(deformRoadPart(strip(), path([[0, 0, 0], [0, 0, 10]]), flatNormal, { min: 2, max: 2 }), null);
});

test("the path sampler skips a short selected piece like Forge's scan", () => {
  const bend = deformRoadPart(strip(), path([[0, 0, 0], [0, 0, 0.0000005], [10, 0, 0.0000005]]), flatNormal);
  assert.ok(bend);
  assert.deepEqual(rows(bend.attributes.position!).slice(0, 2), [
    [0, 0, Math.fround(1.0000005)], [0, 0, Math.fround(-0.9999995)],
  ]);
});

test("two segments weld into one mesh per part with continuous UVs", () => {
  const road = spline("corner", [[4, 0, 0], [4, 0, 10], [14, 0, 10]]);
  const source = { splines: [road], normalAt: flatNormal };
  const built = buildRoadMeshes(source, modelMap(strip(), strip([-5, 5], 2)), oneCell);
  assert.deepEqual(built.problems, []);
  assert.deepEqual(built.instances, []);
  assert.deepEqual(built.chunks.map(({ assetId, part, cell }) => [assetId, part, cell]), [["road", 0, "0_0"], ["road", 1, "0_0"]]);
  for (const chunk of built.chunks) {
    assert.equal(rows(chunk.attributes.position!).length, 6);
    assert.equal(chunk.indices.length, 12);
    assert.deepEqual(component(chunk, "uv", 1).sort(), [0, 0, 1, 1, 2, 2]);
    assert.equal(rows(chunk.attributes.normal!).length, 6);
  }
});

test("welding keeps secondary UV and color seams, drops index degenerates and compacts non-indexed geometry", () => {
  const road = spline("seams", [[40004, 0, 0], [40004, 0, 10], [40004, 0, 20]]);
  const base = strip([-5, 5], 1, null);
  const input: RoadMeshPart = {
    attributes: {
      position: attribute(3, [
        ...base.attributes.position!.values, -1.000001, 0, -5, 1, 0, 0,
      ]),
      uv1: attribute(2, [0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 0]),
      color: attribute(3, [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 1, 1, 1]),
    },
    indices: Uint32Array.of(...base.indices!, 0, 4, 5),
  };
  const soup: RoadMeshPart = {
    attributes: { position: attribute(3, Array.from(base.indices!, (i) => rows(base.attributes.position!)[i]!).flat()) },
    indices: null,
  };
  const [withSeams, welded] = buildRoadMeshes({ splines: [road], normalAt: flatNormal }, modelMap(input, soup), oneCell).chunks;
  assert.ok(withSeams && welded);
  assert.equal(withSeams.indices.length, 12);
  assert.equal(rows(withSeams.attributes.position!).length, 8);
  assert.equal(new Set(withSeams.indices).size, 8);
  assert.equal(welded.indices.length, 12);
  assert.equal(rows(welded.attributes.position!).length, 6);
  assert.equal(welded.attributes.uv, undefined);
});

function terrainFixture(deform = true) {
  const def: WorldTerrainDef = {
    schema: 1, type: "worldTerrain", name: "Road", tileQuads: 32, spacing: 1,
    tilesX: 4, tilesZ: 2, origin: [1000000.25, 7.5, -1000000.75], heightMin: -64, heightMax: 64,
    collision: true, layers: [{ id: "grass", name: "Grass", color: "#558833" }], tiles: [],
  };
  const tiles = new Map<string, TerrainTileData>();
  for (let z = 0; z < 2; z += 1) {
    for (let x = 0; x < 4; x += 1) {
      const tile = createFlatTerrainTile(def, x, z);
      for (let iz = 0; iz < tile.size; iz += 1) {
        tile.heights.fill((z * 32 + iz) * 0.25, iz * tile.size, (iz + 1) * tile.size);
      }
      const key = tileKey(x, z);
      tiles.set(key, tile);
      def.tiles.push({ key, minHeight: 0, maxHeight: 16 });
    }
  }
  const positions = [14, 32, 54].map((x): Vec3 => [def.origin[0] + x, def.origin[1] + 6, def.origin[2] + 16]);
  const road = {
    ...spline("road", positions, { ...bentMesh, deform, alignToTerrain: true, fitToLength: false }),
    coordinateSpace: "world" as const,
  };
  def.splines = [road];
  return { def, tiles, road, models: modelMap(strip([-5, 0, 5], 2)) };
}

test("terrain-centred geometry stays local and banks with the cross slope at a large origin", async () => {
  const document = terrainFixture();
  const before = structuredClone(document.def);
  const source = await prepareTerrainSplineMeshSource(document);
  assert.deepEqual(terrainSplineMeshTileKeys(document.def), ["0_0", "1_0"]);
  const normal = source.normalAt(-32, -16);
  assert.ok(Math.abs(normal[2] / normal[1] + 0.25) < 1e-10);
  const built = buildRoadMeshes(source, document.models, oneCell);
  assert.deepEqual(built.problems, []);
  assert.equal(built.chunks.length, 1);
  const chunk = built.chunks[0]!;
  assert.equal(rows(chunk.attributes.position!).length, 10);
  const x = component(chunk, "position", 0);
  const y = component(chunk, "position", 1);
  assert.ok(Math.min(...x) > -52 && Math.max(...x) < -8);
  assert.ok(Math.max(...y) - Math.min(...y) > 0.9);
  assert.deepEqual(document.def, before);
});

test("terrain preparation fetches only missing aligned tiles and rejects failures and holes", async () => {
  const document = terrainFixture();
  const disk = new Map(document.tiles);
  document.tiles.clear();
  document.tiles.set("0_0", disk.get("0_0")!);
  const resident = new Map(document.tiles);
  const requested: string[] = [];
  const source = await prepareTerrainSplineMeshSource(document, async (key) => {
    requested.push(key);
    return disk.get(key)!;
  });
  assert.deepEqual(requested, ["1_0"]);
  assert.deepEqual(document.tiles, resident);
  assert.ok(source.normalAt(-32, -16)[1] > 0.9);
  await assert.rejects(prepareTerrainSplineMeshSource(document), /requires terrain tile 1_0/);
  await assert.rejects(prepareTerrainSplineMeshSource(document, async () => { throw new Error("read failed"); }), /read failed/);
  document.def.tiles = document.def.tiles.filter(({ key }) => key !== "1_0");
  const withHole = await prepareTerrainSplineMeshSource(document, async (key) => disk.get(key)!);
  assert.throws(() => withHole.normalAt(-10, -16), /normal unavailable/);
  for (const segment of document.road.segments) segment.mesh!.alignToTerrain = false;
  assert.deepEqual(terrainSplineMeshTileKeys(document.def), []);
});

test("rigid opt-outs preserve 20 instances, 9 collidable, and collision settings never split a visual chain", async () => {
  const document = terrainFixture(false);
  document.road.segments[1]!.mesh!.collision = false;
  const source = await prepareTerrainSplineMeshSource(document);
  const rigid = buildRoadMeshes(source, document.models, oneCell);
  assert.equal(rigid.instances.length, 20);
  assert.equal(rigid.instances.filter((instance) => instance.collision).length, 9);
  assert.ok(rigid.instances.every((instance) => instance.orientation[0] !== 0));
  assert.deepEqual(rigid.chunks, []);
  assert.deepEqual(rigid.problems, []);
  assert.deepEqual(buildRoadMeshes(source, new Map(), oneCell), { chunks: [], instances: [], problems: [] });

  for (const segment of document.road.segments) segment.mesh!.deform = true;
  const chains = resolveLandscapeSplineMeshChains(document.road);
  assert.equal(chains.length, 1);
  assert.deepEqual(chains[0]!.segments.map((segment) => segment.collision), [true, false]);
  const mixed = buildRoadMeshes(await prepareTerrainSplineMeshSource(document), document.models, oneCell);
  document.road.segments[1]!.mesh!.collision = true;
  const full = buildRoadMeshes(await prepareTerrainSplineMeshSource(document), document.models, oneCell);
  assert.equal(mixed.chunks.length, 1);
  assert.deepEqual(mixed, full);
});

test("chain resolution reverses compatible segments and stops at branches", () => {
  const reversed = spline("reversed", [[0, 0, 0], [0, 0, 10], [0, 0, 20], [10, 0, 20]]);
  reversed.segments[1] = { ...reversed.segments[1]!, startPointId: "2", endPointId: "1" };
  reversed.segments[2]!.mesh = { ...bentMesh, bank: 5 };
  const chains = resolveLandscapeSplineMeshChains(reversed);
  assert.equal(chains.length, 2);
  assert.deepEqual(chains[0]!.segments.map(({ id }) => id), ["s0", "s1"]);
  assert.deepEqual(chains[0]!.points.map((point) => point[2]), [0, 10, 20]);
  assert.equal(chains[0]!.totalLength, 20);
  assert.equal(chains[0]!.closed, false);

  const branch = spline("branch", [[0, 0, 0], [0, 0, 10], [10, 0, 0], [0, 0, -10]]);
  for (const segment of branch.segments) segment.startPointId = "0";
  assert.deepEqual(resolveLandscapeSplineMeshChains(branch).map((chain) => chain.segments.length), [1, 1, 1]);
});

test("closed chains deform the closing segment through its full distance", () => {
  const loop = spline("loop", [[4, 0, 4], [4, 0, 14], [14, 0, 14], [14, 0, 4]]);
  loop.segments.push({ id: "closing", startPointId: "3", endPointId: "0", mesh: bentMesh });
  const chains = resolveLandscapeSplineMeshChains(loop);
  assert.equal(chains.length, 1);
  assert.equal(chains[0]!.closed, true);
  assert.equal(chains[0]!.segments.length, 4);
  const built = buildRoadMeshes({ splines: [loop], normalAt: flatNormal }, modelMap(strip()), oneCell);
  assert.deepEqual(built.problems, []);
  assert.equal(built.chunks.length, 1);
  const chunk = built.chunks[0]!;
  assert.equal(chunk.indices.length, 24);
  assert.equal(Math.max(...component(chunk, "uv", 1)), 4);
});

test("rigid placement fits the model length, applies yaw offset and skips disabled or asset-less segments", () => {
  const rigid = spline("rigid", [[-10, 2, 0], [10, 2, 0]], { enabled: true, assetId: "road", spacing: 5 });
  const models = modelMap(strip([-6, -2]), strip([-2, 4]));
  const built = buildRoadMeshes({ splines: [rigid], normalAt: flatNormal }, models, oneCell);
  assert.equal(roadModelForwardLength({ parts: [] }), 0);
  assert.equal(roadModelForwardLength(models.get("road")!), 10);
  assert.equal(built.instances.length, 1);
  assert.deepEqual(built.instances[0]!.position, [0, 2, 0]);
  assert.equal(built.instances[0]!.rotation[1], 90);
  assert.equal(built.instances[0]!.scale[2], 2);
  assert.equal(built.instances[0]!.assetId, "road");

  rigid.segments[0]!.mesh!.yawOffset = -90;
  assert.equal(computeLandscapeSplineMeshInstances(rigid)[0]!.rotation[1], 0);
  rigid.segments[0]!.mesh!.enabled = false;
  rigid.segments.push({ ...rigid.segments[0]!, id: "empty", mesh: { enabled: true, assetId: "" } });
  assert.deepEqual(computeLandscapeSplineMeshInstances(rigid), []);
});

test("cell splitting preserves triangle counts and area-weighted normals across the border", () => {
  const road = spline("ramp", [[2, 0, 0], [2, 0, 10], [2, 10, 20]]);
  const source = { splines: [road], normalAt: flatNormal };
  const models = modelMap(strip());
  const whole = buildRoadMeshes(source, models, oneCell).chunks[0]!;
  const { chunks } = buildRoadMeshes(source, models, { cellSize: 10 });
  assert.deepEqual(chunks.map(({ cell }) => cell), ["0_0", "0_1"]);
  assert.equal(chunks.reduce((count, chunk) => count + chunk.indices.length, 0), whole.indices.length);

  function border(mesh: RoadMeshPart) {
    const normals = rows(mesh.attributes.normal!);
    return rows(mesh.attributes.position!).flatMap(([x, y, z], i) => z === 10 ? [{ x, y, normal: normals[i]! }] : [])
      .sort((a, b) => a.x! - b.x!);
  }
  const shared = border(chunks[0]!);
  assert.equal(shared.length, 2);
  assert.deepEqual(shared, border(chunks[1]!));
  assert.deepEqual(shared, border(whole));
  assert.deepEqual(shared[0]!.normal, [0, Math.fround(3 / Math.sqrt(10)), Math.fround(-1 / Math.sqrt(10))]);
});

test("a real terrain hole reports one chain problem while a separate chain in the same spline builds", async () => {
  const document = terrainFixture();
  document.def.tiles = document.def.tiles.filter(({ key }) => key !== "1_0");
  document.road.name = "Road with a hole";
  const [x, y, z] = document.def.origin;
  const good = spline("other", [[x + 8, y + 6, z + 20], [x + 20, y + 6, z + 20]], { ...bentMesh, alignToTerrain: true });
  document.road.points.push(...good.points.map((point) => ({ ...point, id: `good-${point.id}` })));
  document.road.segments.push({
    ...good.segments[0]!, id: "good", startPointId: "good-0", endPointId: "good-1",
  });
  const source = await prepareTerrainSplineMeshSource(document);
  const built = buildRoadMeshes(source, document.models, oneCell);
  assert.equal(built.problems.length, 1);
  assert.match(built.problems[0]!, /^Road with a hole: Spline mesh terrain normal unavailable/);
  assert.equal(built.chunks.length, 1);
  assert.equal(built.chunks[0]!.indices.length, 12);
  assert.equal(Math.max(...component(built.chunks[0]!, "position", 0)), -44);
});

test("one rigid spline's error discards its placements and hidden and missing assets never sample normals", () => {
  const mesh = { enabled: true, assetId: "road", alignToTerrain: true };
  const bad = spline("bad", [[2, 0, 0], [2, 0, 10], [2, 0, 20]], mesh);
  const good = spline("good", [[4, 0, 0], [4, 0, 10], [4, 0, 20]], mesh);
  good.segments[1]!.mesh = { ...mesh, assetId: "missing" };
  const hidden = { ...spline("hidden", [[2, 0, 10], [2, 0, 20]], mesh), hidden: true };
  const built = buildRoadMeshes({
    splines: [bad, hidden, good],
    normalAt: (_x, z) => {
      if (z > 10) throw new Error("hole");
      return flatNormal();
    },
  }, modelMap(strip()), oneCell);
  assert.deepEqual(built.problems, ["bad: hole"]);
  assert.deepEqual(built.instances.map(({ position }) => position), [[4, 0, 5]]);
});

test("model-wide yawed extent keeps a partial model part in its half of the segment", () => {
  function xForwardStrip(start: number, end: number): RoadMeshPart {
    const part = strip([start, end], 1, "u");
    const position = rows(part.attributes.position!).flatMap(([x, y, z]) => [-z!, y!, x!]);
    return { ...part, attributes: { ...part.attributes, position: attribute(3, position) } };
  }
  const road = spline("parts", [[4, 0, 0], [4, 0, 20]], { ...bentMesh, yawOffset: 90 });
  const source = { splines: [road], normalAt: flatNormal };
  const { chunks } = buildRoadMeshes(source, modelMap(xForwardStrip(-5, 0), xForwardStrip(0, 5)), oneCell);
  assert.deepEqual(chunks.map((chunk) => component(chunk, "position", 2).sort((a, b) => a - b)), [[0, 0, 10, 10], [10, 10, 20, 20]]);
  assert.deepEqual(chunks.map((chunk) => component(chunk, "uv", 0).sort()), [[0, 0, 1, 1], [1, 1, 2, 2]]);

  const clamped = deformRoadPart(strip([-10, 10]), path([[0, 0, 0], [0, 0, 20]]), flatNormal, { min: -5, max: 5 });
  assert.ok(clamped);
  assert.deepEqual(component(clamped, "position", 2), [0, 0, 20, 20]);
  assert.deepEqual(component(clamped, "uv", 1), [0, 0, 2, 2]);
});

test("chunks merge across chains and splines in first appearance order with deterministic output", () => {
  const first = spline("first", [[-20, 0, 4], [-20, 0, 14], [-20, 0, 24]]);
  first.segments[1]!.mesh = { ...bentMesh, bank: 5 };
  const second = spline("second", [[20, 0, 4], [20, 0, 14]]);
  const third = spline("third", [[-40, 0, 4], [-40, 0, 14]]);
  const models = modelMap(strip());
  const source = { splines: [first, second, third], normalAt: flatNormal };
  const input = structuredClone({ splines: source.splines, models });
  const built = buildRoadMeshes(source, models, oneCell);
  assert.deepEqual(built.problems, []);
  assert.deepEqual(built.chunks.map(({ cell, indices }) => [cell, indices.length]), [["-1_0", 18], ["0_0", 6]]);
  const merged = built.chunks[0]!;
  assert.equal(rows(merged.attributes.position!).length, 12);
  assert.deepEqual([...merged.indices.slice(-6)], [8, 9, 10, 10, 9, 11]);
  assert.deepEqual(buildRoadMeshes(source, models, oneCell), built);
  assert.deepEqual({ splines: source.splines, models }, input);
});
