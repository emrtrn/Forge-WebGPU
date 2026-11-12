/**
 * Random world (docs/world-builder/RANDOM_WORLD_PLAN.md, step 2): choices
 * become a valid world brief, the same seed gives the same brief, settlements
 * stay apart and on the map (on the floor of a valley), the roads join every
 * settlement and the exits reach the map edge; the brief's relief keeps the
 * mountains off the settlements; a small world builds into villages; and
 * `world:random` writes the brief beside a new level.
 */
// Ported from Forge WebGL tests/engine/randomWorld.test.ts @ forge-webgl-final (04b5fb23): checks unchanged, run by
// Vitest; 7 check(s) not yet portable left out. docs/PORT_LOG.md §2.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createBriefTerrain } from "./briefTerrain.ts";
import { insidePolygon, sourceDistance } from "./field.ts";
import { SEA_SIDES, islandHeight, islandOcean, islandShorePoint, oceanBeachWeight, oceanBedDepth, oceanLandDistance } from "./island.ts";
import { coverPaint, normalizeGroundCover } from "./groundCover.ts";
import { oceanMask } from "./masks.ts";
import { paintWeights } from "./build/temporarySteps.ts";
import { radialIslandArea } from "./islandShape.ts";
import { RIVER_SIZES, SETTLEMENT_WATER_GAP } from "./randomWater.ts";
import { DEFAULT_REGION_PROFILE, LANDFORMS, randomWorldBrief, type RandomWorldOptions, worldExtent } from "./randomWorld.ts";
import { briefToWorld, normalizeWorldBrief, type WorldBrief } from "./worldBrief.ts";
import { test } from "vitest";


type Check = (label: string, run: () => void) => void;
type CheckAsync = (label: string, run: () => Promise<void>) => Promise<void>;

const OPTIONS: RandomWorldOptions = {
  id: "random_test",
  name: "Random Test",
  seed: 11,
  size: "small",
  landform: "mountains",
  mountainHeight: "medium",
  settlements: [{ type: "village" }, { type: "hamlet" }, { type: "hamlet" }],
  roads: "exits",
};

function brief(options: Partial<RandomWorldOptions> = {}): WorldBrief {
  const { brief: raw } = randomWorldBrief({ ...OPTIONS, ...options });
  const { brief: normalized, issues } = normalizeWorldBrief(structuredClone(raw));
  assert.deepEqual(issues, []);
  return normalized!;
}

/** Every water entry's points with the settlements' gap to it (negative inside the gap). */
function waterGaps(world: WorldBrief): Array<{ id: string; gap: number }> {
  return world.water.flatMap((water) => world.settlements.map((settlement) => {
    const points = water.line ?? water.polygon!;
    const nearest = Math.min(...points.map(([east, north]) => Math.hypot(east - settlement.center[0], north - settlement.center[1])));
    const asked = SETTLEMENT_WATER_GAP.share * settlement.radius! + (water.line ? SETTLEMENT_WATER_GAP.river : SETTLEMENT_WATER_GAP.lake);
    return { id: `${water.id}/${settlement.id}`, gap: nearest - asked };
  }));
}

export async function registerRandomWorldTests(check: Check, checkSlowAsync: CheckAsync): Promise<void> {
  check("random world island A3: balanced area, saved seed forms, exact shore distances and safe frame band", () => {
    const signatures = new Set<string>();
    for (const size of ["small", "medium"] as const) for (const seed of [4, 11, 12, 29, 48213, 0xffffffff]) {
      const world = brief({ size, seed, landform: "island", settlements: [], roads: "between" }), shape = world.terrain.island!;
      const radius = shape.radius, half = worldExtent(size) / 2, ocean = islandOcean(world)!;
      assert.equal(shape.radii!.length, 128);
      assert.deepEqual(world, brief({ size, seed, landform: "island", settlements: [], roads: "between" }));
      assert.deepEqual(normalizeWorldBrief(JSON.parse(JSON.stringify(world))).brief, world);
      assert.ok(Math.abs(radialIslandArea(shape.radii!) / (Math.PI * radius ** 2 * 1.00325) - 1) < .00001, "same total area as legacy island");
      const points = shape.radii!.map((_, i) => islandShorePoint(world, -i * 2 * Math.PI / 128));
      signatures.add(shape.radii!.map(r => (r / radius).toFixed(3)).join(","));
      for (const [x, z] of points) {
        assert.ok(half - Math.max(Math.abs(x), Math.abs(z)) >= Math.max(32, worldExtent(size) * .03) - .01);
        assert.ok(Math.abs(ocean.distance(x, z)) < 1e-8);
      }
      const closed = [...points, points[0]!];
      // Generic all-edge geometry is independent of the accelerated query's cache.
      for (let j = 0; j < 33; j++) for (let i = 0; i < 33; i++) {
        const x = -half + (i + .17) * worldExtent(size) / 33, z = -half + (j + .31) * worldExtent(size) / 33;
        const reference = sourceDistance([x, z], { kind: "polyline", points: closed });
        const actual = ocean.distance(x, z);
        assert.ok(Math.abs(Math.abs(actual) - reference) < 1e-7, "cell pruning preserves exact distances");
        assert.equal(actual >= 0, insidePolygon(x, z, points));
      }
      const legacy = structuredClone(world); delete legacy.terrain.island!.radii;
      assert.deepEqual(normalizeWorldBrief(legacy).brief, legacy, "old briefs are not given new radii");
      const retained = structuredClone(world); retained.seed = (seed + 1) >>> 0;
      assert.deepEqual(islandShorePoint(retained, .7), islandShorePoint(world, .7), "saved radii freeze the coastline independently of later seed edits");
      const old = createBriefTerrain(legacy);
      for (const [x, z] of [[-half, -half], [half, -half], [half, half], [-half, half]]) assert.ok(old.height(x!, z!) < -25, "legacy corner depths are unchanged");
      assert.ok(ocean.distance(0, 0) > 120, "a broad connected inland kernel remains");
      assert.ok(Number.isNaN(ocean.distance(NaN, 0)));
    }
    assert.ok(signatures.size >= 6, "six seeds produce distinct main forms");
    for (const radii of [[], [1], Array(128).fill(0), Array(128).fill(Infinity), Array(128).fill(10000)]) {
      const raw = randomWorldBrief({ ...OPTIONS, landform: "island" }).brief;
      (raw.terrain as { island: { radii: unknown } }).island.radii = radii;
      assert.equal(normalizeWorldBrief(raw).brief, null, "invalid or out-of-map outlines are rejected");
    }
  });
  check("random world A2: smooth shallow shelf, unchanged dry terrain/shoreline and explicit legacy compatibility", () => {
    const spec = brief({ landform: "island" }).ocean!;
    assert.equal(oceanBedDepth(spec, 60, 0), 0);
    assert.equal(oceanBedDepth(spec, 60, 35), 2);
    assert.equal(oceanBedDepth(spec, 60, 150), 40);
    assert.equal(oceanBedDepth(spec, 60, 300), 40);
    let previous = 0;
    for (let s = .25; s <= 250; s += .25) {
      const depth = oceanBedDepth(spec, 60, s);
      assert.ok(Number.isFinite(depth) && depth >= previous && depth <= 40);
      previous = depth;
    }
    for (const join of [0, 35, 150]) {
      const h = .001;
      const left = (oceanBedDepth(spec, 60, join) - oceanBedDepth(spec, 60, join - h)) / h;
      const right = (oceanBedDepth(spec, 60, join + h) - oceanBedDepth(spec, 60, join)) / h;
      assert.ok(Math.abs(left - right) < .001, `${join}: continuous slope`);
    }
    for (const size of ["small", "medium"] as const) for (const landform of ["island", "coast"] as const)
      for (const seaSide of landform === "coast" ? SEA_SIDES : ["west"] as const) for (const seed of [4, 11, 29]) {
        const next = brief({ size, landform, seaSide, seed, settlements: [], roads: "between" });
        const prior = structuredClone(next); delete prior.ocean!.shoreProfile;
        const before = islandOcean(prior)!, after = islandOcean(next)!, half = worldExtent(size) / 2;
        assert.deepEqual(normalizeWorldBrief(prior).brief, prior, "no default injection into an old explicit brief");
        for (let z = -half + 8; z < half; z += 32) for (let x = -half + 8; x < half; x += 32) {
          assert.equal(after.distance(x, z), before.distance(x, z), "Island shape / Coast A1 boundaries do not move");
          const d = after.distance(x, z), a = islandHeight(next, after, x, z, 19), b = islandHeight(prior, before, x, z, 19);
          if (d >= 0) assert.equal(a, b, "dry beach and relief stay identical");
          else assert.ok(a < after.surfaceLevel && b < before.surfaceLevel, "both profiles stay submerged without holes");
        }
        for (const s of [1, 10, 35, 80, 150]) assert.equal(oceanBedDepth(prior.ocean!, 60, s), 40 * (1 - Math.exp(-s / 60)));
      }
    for (const patch of [null, {}, { shallowDistance: 0 }, { shallowDistance: .00001 }, { shallowDepth: 40 }, { deepDistance: 35 }, { deepDistance: Infinity }, { extra: 1 }]) {
      const raw = randomWorldBrief({ ...OPTIONS, landform: "island" }).brief;
      const ocean = raw.ocean as Record<string, unknown>;
      ocean.shoreProfile = patch === null ? null : { ...(ocean.shoreProfile as object), ...patch };
      if (patch && Object.keys(patch).length === 0) ocean.shoreProfile = {};
      assert.ok(normalizeWorldBrief(raw).issues.some(issue => issue.includes("shoreProfile")), JSON.stringify(patch));
    }
  });
  check("random world coast A1: 70% interior and 2–3x measured painted beach across sizes, directions and seeds", () => {
    const cover = // Boundary (plan 2b): the forest cover is a data document of the worldbuilder pack.
    normalizeGroundCover(JSON.parse(readFileSync("content/packs/worldbuilder/covers/forest.cover.json", "utf8")).data).cover!;
    const bed = cover.layers.findIndex(layer => layer.id === cover.roles.bed);
    for (const size of ["small", "medium"] as const) for (const seaSide of SEA_SIDES) for (const seed of [4, 11, 29]) {
      const world = brief({ size, seaSide, seed, landform: "coast", settlements: [], roads: "between" });
      const terrain = createBriefTerrain(world), ocean = terrain.ocean!, extent = worldExtent(size), half = extent / 2;
      const paint = coverPaint(cover, world, terrain, { forest: "medium", rocks: "medium", fields: "medium" }, { clearings: [], snowLine: null });
      const pilot = paintWeights(world, terrain);
      let interior = 0;
      for (let j = 0; j < 128; j++) for (let i = 0; i < 128; i++) {
        const x = -half + (i + .5) * extent / 128, z = -half + (j + .5) * extent / 128;
        const weights = paint(x, z, 0, terrain.height(x, z));
        const sand = weights[bed]! / weights.reduce((a, b) => a + b, 0);
        assert.equal(sand, pilot(x, z, 0)[4], "preview/cover and fallback paint agree");
        if (ocean.distance(x, z) >= 0 && sand < .5) interior++;
      }
      assert.ok(Math.abs(interior / 128 ** 2 - .7) < .02, `${size}/${seaSide}/${seed}: interior ratio`);
      // Cross the actual paint, rather than equating shoreWidth with visible sand.
      const axis = seaSide === "west" ? [1, 0] : seaSide === "east" ? [-1, 0] : seaSide === "north" ? [0, 1] : [0, -1];
      const [cx, cz] = briefToWorld(world, world.terrain.coast!.center);
      for (const along of [-half * .7, 0, half * .7]) {
        const origin = [cx - axis[1]! * along, cz + axis[0]! * along] as const;
        const d = ocean.distance(...origin), shore = [origin[0] - axis[0]! * d, origin[1] - axis[1]! * d];
        let width = 0;
        while (paint(shore[0]! + axis[0]! * (width + .25), shore[1]! + axis[1]! * (width + .25), 0, 0)[bed]! >= .5) width += .25;
        assert.ok(width / 25 >= 2 && width / 25 <= 3);
        const sea = [shore[0]! - axis[0]! * 10, shore[1]! - axis[1]! * 10] as const;
        const oldProfile = structuredClone(world); delete oldProfile.ocean!.shoreProfile;
        assert.ok(Math.abs(createBriefTerrain(oldProfile).height(...sea) + 40 * (1 - Math.exp(-10 / 60))) < 1e-8, "A1/legacy submerged profile is unchanged");
        const beach = [shore[0]! + axis[0]! * 60, shore[1]! + axis[1]! * 60] as const;
        assert.ok(oceanLandDistance(ocean, ...beach) < 0);
        const mask = oceanMask({ origin: [beach[0] - 1, beach[1] - 1], cellSize: 2, width: 1, depth: 1 }, { ocean } as Parameters<typeof oceanMask>[1]);
        assert.equal(mask.values[0], 1, "roads/scatter masks protect the dry beach too");
      }
      const legacy = structuredClone(world);
      delete legacy.terrain.coast!.beachWidth;
      legacy.terrain.coast!.center = [0, 0];
      const roundTrip = normalizeWorldBrief(legacy);
      assert.deepEqual(roundTrip.issues, []); assert.deepEqual(roundTrip.brief, legacy);
      const old = islandOcean(legacy)!;
      assert.equal(old.landClearance, undefined);
      const d0 = old.distance(0, 0), x = axis[0]! * (25 - d0), z = axis[1]! * (25 - d0);
      assert.ok(Math.abs(oceanBeachWeight(old, x, z) - .5) < 1e-9, "legacy midpoint stays 25 m");
    }
    for (const beachWidth of [0, -1, Infinity, "wide"]) {
      const raw = randomWorldBrief({ ...OPTIONS, landform: "coast" }).brief;
      (raw.terrain as { coast: Record<string, unknown> }).coast.beachWidth = beachWidth;
      assert.ok(normalizeWorldBrief(raw).issues.some(issue => issue.includes("beachWidth")));
    }
  });
  check("random world coast: four sea directions keep settlements and exits dry; rivers drain to sea", () => {
    for (const size of ["small", "medium"] as const) for (const seaSide of SEA_SIDES) {
      let mouths = 0;
      for (const seed of [4, 11, 29]) {
        const options = { ...OPTIONS, size, landform: "coast" as const, seaSide, seed, rivers: 1, settlements: [{ type: "hamlet" as const }] };
        const result = randomWorldBrief(options);
        const normalized = normalizeWorldBrief(result.brief);
        assert.deepEqual(normalized.issues, []);
        assert.deepEqual(result, randomWorldBrief(options));
        const world = normalized.brief!, ground = createBriefTerrain(world);
        assert.equal(world.settlements.length, 1);
        for (const node of world.roads.nodes) {
          const [x, z] = briefToWorld(world, node.at);
          assert.ok(oceanLandDistance(ground.ocean!, x, z) > 75, `${seaSide} ${seed} ${node.id} is beyond the beach`);
        }
        for (const course of ground.courses) if (course.water.outlet === "ocean") {
          mouths++;
          assert.equal(course.surface.at(-1), 0);
          assert.ok(Math.abs(ground.ocean!.distance(...course.points.at(-1)!) - 4) < .15, "the mouth joins inside its shore channel");
          assert.ok(ground.ocean!.distance(...course.points.at(-2)!) >= 79);
          for (const [x, z] of course.points.slice(-2)) assert.ok(Math.min(x + worldExtent(size) / 2, worldExtent(size) / 2 - x,
            z + worldExtent(size) / 2, worldExtent(size) / 2 - z) > course.width * 10, "terminal live-width ribbon stays on terrain");
          course.surface.slice(1).forEach((height, i) => assert.ok(height <= course.surface[i]!));
        }
      }
      assert.ok(mouths > 0, `${seaSide}: at least one safe sea outlet across the fixtures`);
    }
  });
  check("random world island: deterministic coast, dry settlements and an internal road for a lone village", () => {
    for (const seed of [1, 11, 48213, 0xffffffff]) {
      const options = { landform: "island" as const, seed, rivers: 0, settlements: [{ type: "village" as const }] };
      const world = brief(options), ground = createBriefTerrain(world);
      assert.deepEqual(world, brief(options));
      assert.equal(world.settlements.length, 1);
      assert.equal(world.roads.edges.length, 1, "a lone village still has a road to grow streets from");
      for (const node of world.roads.nodes) {
        const [x, z] = briefToWorld(world, node.at);
        assert.ok(ground.ocean!.distance(x, z) > 70, `${seed}: internal road end`);
        assert.ok(ground.ground(x, z) > ground.ocean!.surfaceLevel + 3, `${seed}: dry road end`);
      }
      for (const [x, z] of [[-512, -512], [512, -512], [512, 512], [-512, 512]]) assert.ok(ground.ground(x!, z!) < 0, "an offshore band remains even where capes approach the frame");
      assert.ok(ground.ground(0, 0) > 0);
    }
    assert.throws(() => brief({ landform: "island", rivers: 1 }), /river-mouth/);
    const coast11 = createBriefTerrain(brief({ landform: "island", seed: 11 })).ocean!;
    const coast12 = createBriefTerrain(brief({ landform: "island", seed: 12 })).ocean!;
    assert.ok(Math.abs(coast11.distance(380, 0) - coast12.distance(380, 0)) > 5, "adjacent seeds visibly change the shore");
    const raw = randomWorldBrief({ ...OPTIONS, landform: "island" }).brief;
    for (const ocean of [{ ...(raw.ocean as object), extra: true }, { ...(raw.ocean as object), offshoreDepth: 0 }, undefined]) {
      assert.equal(normalizeWorldBrief({ ...raw, ocean }).brief, null);
    }
    assert.equal(normalizeWorldBrief({ ...raw, terrain: { ...(raw.terrain as object), island: { center: [0, 0], radius: 500, shoreWidth: 50, landHeight: 10 } } }).brief, null);
  });

  check("random world island: random lakes stay inland or report that no lake fits", () => {
    for (const size of ["small", "medium"] as const) {
      let found = 0;
      for (const seed of [3, 11, 27, 91, 0, 12]) {
        const result = randomWorldBrief({ ...OPTIONS, size, landform: "island", seed, lakes: 1, rivers: 0, settlements: [] });
        const normalized = normalizeWorldBrief(result.brief);
        assert.deepEqual(normalized.issues, []);
        const terrain = createBriefTerrain(normalized.brief!);
        for (const lake of terrain.lakes) {
          found++;
          assert.ok(lake.surface > terrain.ocean!.surfaceLevel + 3, "an inland lake is above the sea");
          for (const [x, z] of lake.polygon) assert.ok(terrain.ocean!.distance(x, z) > 30, "no lake/sea surface overlap");
        }
        if (!terrain.lakes.length) assert.ok(result.notes.some(note => note.includes("lakes: room for 0")));
      }
      assert.ok(found > 0, `${size}: at least one generated island has room for an inland lake`);
    }
  });
  check("random world water: none by default; asking for it leaves the rest of the world as it was", () => {
    for (const landform of ["mountains", "hills", "plain"] as const) {
      const dry = randomWorldBrief({ ...OPTIONS, landform, size: "medium" }).brief;
      assert.deepEqual(dry, randomWorldBrief({ ...OPTIONS, landform, size: "medium", rivers: 0, lakes: 0 }).brief, "0 rivers and lakes: the same brief");
      assert.deepEqual(dry.water, []);
      const wet = randomWorldBrief({ ...OPTIONS, landform, size: "medium", rivers: 1, lakes: 1 }).brief;
      assert.ok((wet.water as unknown[]).length > 0, `${landform}: water`);
      assert.deepEqual({ ...wet, water: [] }, dry, `${landform}: the same world plus water`);
    }
    // A valley's settlements keep to one side of the floor; still the same roads and relief otherwise.
    const valleyDry = randomWorldBrief({ ...OPTIONS, landform: "valley", size: "medium" }).brief;
    const valleyWet = randomWorldBrief({ ...OPTIONS, landform: "valley", size: "medium", rivers: 1 }).brief;
    assert.deepEqual(valleyWet.terrain, valleyDry.terrain);
    assert.deepEqual(valleyWet.valleys, valleyDry.valleys);
  });

  check("random world water: rivers run downhill to the edge, a lake or another river; water keeps off the settlements", () => {
    let lakes = 0;
    for (const landform of LANDFORMS.filter(form => form !== "island" && form !== "coast")) {
      for (const seed of [3, 7, 11]) {
        const world = brief({ landform, seed, size: "medium", rivers: 2, lakes: 1 });
        const terrain = createBriefTerrain(world);
        // The rivers were drawn on the ground before the mountains kept off them.
        const dry = createBriefTerrain({ ...world, water: [] });
        const rivers = world.water.filter((water) => water.line);
        assert.ok(rivers.length >= 1, `${landform} ${seed}: a river`);
        for (const river of rivers) {
          assert.equal(river.width, RIVER_SIZES.medium.width);
          const line = river.line!;
          const [first, last] = [line[0]!, line[line.length - 1]!];
          const atEdge = Math.min(world.area.north - last[1], world.area.east - last[0], last[1] - world.area.south, last[0] - world.area.west) < 5;
          const inLake = world.water.some((lake) => lake.polygon && lake.polygon.some((point) => Math.hypot(point[0] - last[0], point[1] - last[1]) < 250));
          const intoRiver = rivers.some((other) => other !== river && other.line!.some((point) => Math.hypot(point[0] - last[0], point[1] - last[1]) < 50));
          assert.ok(atEdge || inLake || intoRiver, `${landform} ${seed} ${river.id} ends at the edge, in a lake or a river`);
          // Water level never rises downstream; on the ground it was drawn on, the source stands above the mouth.
          const course = terrain.courses.find((entry) => entry.id === river.id)!;
          course.surface.slice(1).forEach((level, index) => assert.ok(level <= course.surface[index]!));
          const [sx, sz] = briefToWorld(world, first);
          const [ex, ez] = briefToWorld(world, last);
          assert.ok(dry.ground(sx, sz) >= dry.ground(ex, ez) - 1, `${landform} ${seed} ${river.id}: source above mouth`);
        }
        lakes += world.water.filter((water) => water.polygon).length;
        for (const { id, gap } of waterGaps(world)) assert.ok(gap >= -1, `${landform} ${seed} ${id}: ${gap.toFixed(1)} m inside the settlement's gap`);
      }
    }
    assert.ok(lakes >= 10, `${lakes} of 12 lakes found room`);
  });


  check("random world: every landform and size gives a valid brief; the same seed the same brief", () => {
    for (const landform of LANDFORMS) {
      for (const size of ["small", "medium", "large"] as const) {
        if ((landform === "island" || landform === "coast") && size === "large") {
          assert.throws(() => brief({ landform, size }), /Ocean terrain budget/);
          continue;
        }
        const world = brief({ landform, size });
        assert.equal(world.area.east - world.area.west, worldExtent(size));
        assert.equal(world.terrain.spacing, 2);
        assert.equal(world.playerStart, undefined, "no player start: the level opens with a free camera");
      }
    }
    assert.deepEqual(randomWorldBrief(OPTIONS), randomWorldBrief(OPTIONS));
    assert.notDeepEqual(randomWorldBrief(OPTIONS).brief, randomWorldBrief({ ...OPTIONS, seed: 12 }).brief);
    assert.equal(brief().regionProfile, DEFAULT_REGION_PROFILE);
  });

  check("random world: settlements stay apart and on the map; a valley's sit on its floor", () => {
    for (const landform of LANDFORMS.filter(form => form !== "island" && form !== "coast")) {
      for (const seed of [1, 2, 3]) {
        const world = brief({ landform, seed, size: "medium" });
        assert.equal(world.settlements.length, 3, `${landform} ${seed}`);
        world.settlements.forEach((a, i) => {
          assert.ok(Math.abs(a.center[0]) < world.area.east && Math.abs(a.center[1]) < world.area.north);
          if (landform === "valley") {
            const sections = world.valleys[0]!.sections;
            const k = sections.findIndex((section, index) => index > 0 && section.north <= a.center[1]);
            const [s0, s1] = [sections[k - 1]!, sections[k]!];
            const t = (s0.north - a.center[1]) / (s0.north - s1.north);
            const [floorW, floorE] = [0, 1].map((side) => s0.floor[side]! + (s1.floor[side]! - s0.floor[side]!) * t);
            assert.ok(a.center[0] > floorW! && a.center[0] < floorE!, `${a.id} on the valley floor`);
          }
          world.settlements.slice(i + 1).forEach((b) => {
            assert.ok(Math.hypot(a.center[0] - b.center[0], a.center[1] - b.center[1]) >= (a.radius! + b.radius!) * 0.9 + 60, `${a.id} apart from ${b.id}`);
          });
        });
      }
    }
    const crowded = randomWorldBrief({ ...OPTIONS, settlements: Array.from({ length: 12 }, () => ({ type: "town" as const })) });
    assert.ok(crowded.notes.some((note) => note.includes("no room")), "a settlement with no room is reported, not forced in");
  });

  check("random world: the roads join every settlement and the exits reach the map edge", () => {
    for (const roads of ["between", "exits"] as const) {
      const world = brief({ roads });
      const settlements = world.settlements.map((settlement) => settlement.id);
      const exits = world.roads.nodes.filter((node) => node.kind === "end");
      assert.equal(exits.length, roads === "exits" ? 2 : 0);
      assert.equal(world.roads.edges.length, settlements.length - 1 + exits.length);
      // Every settlement reaches every other one.
      const reached = new Set([settlements[0]!]);
      for (let pass = 0; pass < settlements.length; pass += 1) {
        for (const edge of world.roads.edges) if (reached.has(edge.from) || reached.has(edge.to)) [edge.from, edge.to].forEach((id) => reached.add(id));
      }
      for (const id of settlements) assert.ok(reached.has(id), `${id} is on the network`);
      for (const exit of exits) {
        const gap = Math.min(world.area.north - exit.at[1], world.area.east - exit.at[0], exit.at[1] - world.area.south, exit.at[0] - world.area.west);
        assert.ok(gap < 10, `${exit.id} at the edge`);
      }
    }
    const lone = randomWorldBrief({ ...OPTIONS, settlements: [{ type: "village" }], roads: "between" });
    assert.equal((lone.brief.roads as { edges: unknown[] }).edges.length, 1, "a lone settlement still gets a road in");
  });

  check("random world: the mountains stay off the settlements and the roads; hills roll everywhere", () => {
    const world = brief({ size: "medium" });
    const terrain = createBriefTerrain(world);
    const clear = world.terrain.relief!.clear;
    for (const settlement of world.settlements) {
      const [x, z] = briefToWorld(world, settlement.center);
      const reach = settlement.radius! + clear.settlements.inner - 8;
      // Inside the clear band only the softened hills remain.
      for (const [dx, dz] of [[0, 0], [reach, 0], [0, -reach], [-reach * 0.7, reach * 0.7]]) {
        assert.ok(Math.abs(terrain.ground(x + dx!, z + dz!)) < world.terrain.relief!.hills!.height, `${settlement.id} ground stays low`);
      }
    }
    let peak = -Infinity;
    for (let x = -1000; x <= 1000; x += 50) for (let z = -1000; z <= 1000; z += 50) peak = Math.max(peak, terrain.ground(x, z));
    assert.ok(peak > world.terrain.relief!.mountains!.height * 0.5, `mountains rise (${peak.toFixed(0)} m)`);
    assert.ok(peak < world.terrain.heightRange[1], "within the terrain's height range");
    const relief = normalizeWorldBrief({ ...randomWorldBrief(OPTIONS).brief, terrain: { ...world.terrain, relief: { hills: { height: 5, wavelength: 100, steep: true } } } });
    assert.ok(relief.issues.some((issue) => issue.includes("terrain.relief.hills.steep")), "an unknown relief field is reported");
  });
}

await registerRandomWorldTests(test as unknown as Parameters<typeof registerRandomWorldTests>[0], test as unknown as Parameters<typeof registerRandomWorldTests>[1]);
