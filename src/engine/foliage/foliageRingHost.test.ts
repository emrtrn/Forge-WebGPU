import { test } from "vitest";
import assert from "node:assert/strict";
import { TerrainTileMap } from "../terrain/terrainHeightQuery.ts";
import type { TerrainTileData } from "../terrain/terrainTypes.ts";
import { LocalFoliageCellGenerator, type FoliageCellJob, type FoliageGeneratorTerrainDef } from "./foliageCellGenerator.ts";
import { FoliageRing, type FoliageRingRule, type FoliageRingSink, type FoliageRingTerrain } from "./foliageRingHost.ts";
import { normalizeFoliageTypeParams } from "./foliageTypeParams.ts";
import type { GeneratedFoliageCell } from "./proceduralFoliage.ts";

const CENTER = [16, 16] as const;
const FAR_AWAY = [1024, 1024] as const;
const INITIAL_OWNERS = ["ring:grass:0_0", "ring:grass:1_0", "ring:grass:2_0"];

function makeTile(def: FoliageGeneratorTerrainDef, x: number, height = 3): TerrainTileData {
  const size = def.tileQuads + 1;
  const vertices = size * size;
  const weights = new Uint8Array(vertices * 4);
  for (let i = 0; i < vertices; i += 1) weights[i * 4] = 255;
  return { x, z: 0, size, layerCount: 1, heights: new Float32Array(vertices).fill(height), weights };
}

function makeTerrain(id = "ground", tilesX = 4, height = 3) {
  const def: FoliageGeneratorTerrainDef = {
    tileQuads: 32, spacing: 1, tilesX, tilesZ: 1, origin: [0, 10, 0], layers: [{ id: "grass" }],
  };
  const tiles = new TerrainTileMap();
  for (let x = 0; x < tilesX; x += 1) tiles.set(makeTile(def, x, height));
  const terrain: FoliageRingTerrain = { id, def, tiles, existingTiles: null };
  return { terrain, tiles };
}

function makeRule(terrain: FoliageRingTerrain, cullEnd = 72): FoliageRingRule {
  return {
    id: "grass",
    typeId: "grass-type",
    rule: { layerId: "grass", density: 0.1, minWeight: 0.5, seed: 17 },
    type: normalizeFoliageTypeParams({ randomYaw: true, alignToNormal: true }),
    cullStart: cullEnd / 2,
    cullEnd,
    terrain,
  };
}

class RecordingSink implements FoliageRingSink {
  readonly sets: { owner: string; typeId: string; matrices: Float32Array; count: number; drawn: number }[] = [];
  readonly removes: string[] = [];
  private readonly drawLimit: number;

  constructor(drawLimit = Infinity) {
    this.drawLimit = drawLimit;
  }

  set(owner: string, typeId: string, matrices: Float32Array, count: number): number {
    const drawn = Math.min(count, this.drawLimit);
    this.sets.push({ owner, typeId, matrices, count, drawn });
    return drawn;
  }

  remove(owner: string): void {
    this.removes.push(owner);
  }
}

class RecordingGenerator extends LocalFoliageCellGenerator {
  readonly jobs: FoliageCellJob[] = [];
  readonly removedTiles: string[] = [];
  readonly removedTerrains: string[] = [];
  generateCell = (job: FoliageCellJob): Promise<GeneratedFoliageCell> => super.generate(job);

  override generate(job: FoliageCellJob): Promise<GeneratedFoliageCell> {
    this.jobs.push(job);
    return this.generateCell(job);
  }

  override removeTile(id: string, x: number, z: number): void {
    this.removedTiles.push(`${id}:${x}_${z}`);
    super.removeTile(id, x, z);
  }

  override removeTerrain(id: string): void {
    this.removedTerrains.push(id);
    super.removeTerrain(id);
  }
}

function waitForJobs(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

test("prepare draws every planned resident cell and counts what the sink drew", async () => {
  const { terrain } = makeTerrain();
  const generator = new LocalFoliageCellGenerator();
  const sink = new RecordingSink(3);
  const ring = new FoliageRing({ rules: [makeRule(terrain)], sink, generator });

  await ring.prepare(CENTER, 1, 1);

  assert.deepEqual(sink.sets.map(({ owner }) => owner), INITIAL_OWNERS);
  for (const { typeId, matrices, count } of sink.sets) {
    assert.equal(typeId, "grass-type");
    assert.ok(count > 3);
    assert.equal(matrices.length, count * 16);
  }
  const drawn = sink.sets.reduce((sum, cell) => sum + cell.drawn, 0);
  assert.deepEqual(ring.snapshot(), { cells: 3, instances: drawn, pending: 0 });
});

test("identical rings give byte-identical matrices per owner", async () => {
  const { terrain } = makeTerrain();
  const buffers = await Promise.all([0, 1].map(async () => {
    const sink = new RecordingSink();
    const ring = new FoliageRing({ rules: [makeRule(terrain)], sink, generator: new LocalFoliageCellGenerator() });
    await ring.prepare(CENTER, 1, 1);
    return new Map(sink.sets.map(({ owner, matrices }) =>
      [owner, new Uint8Array(matrices.buffer, matrices.byteOffset, matrices.byteLength)]));
  }));

  assert.equal(buffers[0]!.size, 3);
  assert.deepEqual(buffers[0], buffers[1]);
});

test("streaming waits for a missing tile in the normal margin and skips terrain holes", async () => {
  const { terrain, tiles } = makeTerrain();
  tiles.delete(2, 0);
  const generator = new RecordingGenerator();
  const sink = new RecordingSink();
  const ring = new FoliageRing({
    rules: [makeRule({ ...terrain, existingTiles: new Set(["0_0", "1_0", "2_0", "3_0"]) })], sink, generator,
  });

  await ring.prepare(CENTER, 1, 1);
  // Cell 1 lies inside tile 1, but its two-vertex margin reaches tile 2.
  assert.deepEqual(generator.jobs.map(({ request }) => request.cellX), [0]);
  assert.deepEqual(sink.sets.map(({ owner }) => owner), INITIAL_OWNERS.slice(0, 1));

  tiles.set(makeTile(terrain.def, 2));
  ring.update(CENTER, 1, 1);
  assert.deepEqual(generator.jobs.map(({ request }) => request.cellX), [0, 1, 2]);
  await waitForJobs();
  ring.update(CENTER, 1, 1);
  assert.deepEqual(sink.sets.map(({ owner }) => owner), INITIAL_OWNERS.slice(0, 2));
  ring.update(CENTER, 1, 1);
  assert.deepEqual(sink.sets.map(({ owner }) => owner), INITIAL_OWNERS);
  assert.ok(sink.sets.every(({ count }) => count > 0));

  tiles.delete(2, 0);
  ring.update(CENTER, 1, 1);
  assert.deepEqual(generator.removedTiles, ["ground:2_0"]);

  const holeSink = new RecordingSink();
  const hole = new FoliageRing({
    rules: [makeRule({ ...terrain, existingTiles: new Set(["0_0", "1_0", "3_0"]) })],
    sink: holeSink, generator: new LocalFoliageCellGenerator(),
  });
  await hole.prepare(CENTER, 1, 1);
  assert.deepEqual(holeSink.sets.map(({ owner }) => owner), INITIAL_OWNERS);
  assert.ok(holeSink.sets[1]!.count > 0);
  assert.equal(holeSink.sets[2]!.count, 0);
});

test("moving across bands rebuilds at the new keep fraction within budget and unloads far owners", async () => {
  const { terrain } = makeTerrain();
  const generator = new RecordingGenerator();
  const sink = new RecordingSink();
  const ring = new FoliageRing({ rules: [makeRule(terrain)], sink, generator });
  await ring.prepare(CENTER, 1, 1);
  assert.deepEqual(generator.jobs.map(({ request }) => request.keepFraction), [1, 1, 0.25]);

  const moved = [80, 16] as const;
  ring.update(moved, 1, 1, 0);
  assert.deepEqual(generator.jobs.slice(3).map(({ request }) => [request.cellX, request.keepFraction]), [
    [2, 1], [3, 1], [0, 0.25],
  ]);
  await waitForJobs();
  assert.equal(sink.sets.length, 3);
  ring.update(moved, 1, 1, 2);
  assert.deepEqual(sink.sets.slice(3).map(({ owner }) => owner), ["ring:grass:2_0", "ring:grass:3_0"]);
  assert.equal(ring.snapshot().pending, 1);
  ring.update(moved, 1, 1);
  assert.equal(sink.sets.length, 6);
  assert.equal(sink.sets[5]!.owner, "ring:grass:0_0");
  assert.ok(sink.sets[3]!.count > sink.sets[2]!.count);
  assert.ok(sink.sets[5]!.count < sink.sets[0]!.count);
  assert.equal(ring.snapshot().pending, 0);

  ring.update(FAR_AWAY, 1, 1);
  assert.deepEqual(sink.removes, [...INITIAL_OWNERS, "ring:grass:3_0"]);
  assert.deepEqual(ring.snapshot(), { cells: 0, instances: 0, pending: 0 });
});

test("update builds its budget first, then more finished cells while the caller's time lasts", async () => {
  const { terrain } = makeTerrain();
  const generator = new RecordingGenerator();
  const sink = new RecordingSink();
  const ring = new FoliageRing({ rules: [makeRule(terrain)], sink, generator });
  await ring.prepare(CENTER, 1, 1);
  const moved = [80, 16] as const;
  ring.update(moved, 1, 1, 0);
  await waitForJobs();
  let asked = 0;
  ring.update(moved, 1, 1, 1, () => asked++ < 1);
  assert.equal(sink.sets.length, 5);
  assert.equal(ring.snapshot().pending, 1);
  ring.update(moved, 1, 1, 0, () => false);
  assert.equal(sink.sets.length, 5);
});

test("update respects the in-flight cap and prepare applies replies in completion order", async () => {
  const { terrain } = makeTerrain();
  const generator = new RecordingGenerator();
  const generate = generator.generateCell;
  const finish: (() => void)[] = [];
  generator.generateCell = (job) => new Promise((resolve) => {
    const result = generate(job);
    finish.push(() => resolve(result));
  });
  const sink = new RecordingSink();
  const ring = new FoliageRing({ rules: [makeRule(terrain)], sink, generator, maxInFlight: 1 });

  ring.update(CENTER, 1, 1);
  ring.update(CENTER, 1, 1);
  assert.deepEqual(generator.jobs.map(({ request }) => request.cellX), [0]);
  const preparing = ring.prepare(CENTER, 1, 1);
  assert.deepEqual(generator.jobs.map(({ request }) => request.cellX), [0, 1, 2]);
  for (const index of [2, 0, 1]) finish[index]!();
  await preparing;
  assert.deepEqual(sink.sets.map(({ owner }) => owner), [INITIAL_OWNERS[2], INITIAL_OWNERS[0], INITIAL_OWNERS[1]]);
});

test("replaceTerrain invalidates every built cell and keeps its owner until new tiles are drawn", async () => {
  const { terrain } = makeTerrain();
  const sink = new RecordingSink();
  const ring = new FoliageRing({ rules: [makeRule(terrain)], sink, generator: new LocalFoliageCellGenerator() });
  await ring.prepare(CENTER, 1, 1);
  const before = ring.snapshot();
  assert.ok(sink.sets.every(({ matrices }) => matrices[13] === 13));

  ring.replaceTerrain(makeTerrain(terrain.id, 4, 9).terrain);
  assert.deepEqual(ring.snapshot(), before);
  assert.deepEqual(sink.removes, []);
  await ring.prepare(CENTER, 1, 1);

  const replaced = sink.sets.slice(3);
  assert.deepEqual(replaced.map(({ owner }) => owner), INITIAL_OWNERS);
  assert.ok(replaced.every(({ matrices }) => matrices[13] === 19));
  assert.deepEqual(sink.removes, []);
  assert.deepEqual(ring.snapshot(), before);
});

test("late replies for unloaded and re-requested cells are dropped without spending the budget", async () => {
  const { terrain } = makeTerrain("ground", 1);
  const generator = new RecordingGenerator();
  const finish: ((result: GeneratedFoliageCell) => void)[] = [];
  generator.generateCell = () => new Promise((resolve) => finish.push(resolve));
  const sink = new RecordingSink();
  const ring = new FoliageRing({ rules: [makeRule(terrain, 8)], sink, generator });
  const stale = { count: 1, matrices: new Float32Array(16).fill(1) };
  const fresh = { count: 2, matrices: new Float32Array(32).fill(2) };

  ring.update(CENTER, 1, 1);
  assert.equal(ring.snapshot().pending, 1);
  ring.update(FAR_AWAY, 1, 1);
  assert.equal(ring.snapshot().pending, 0);
  finish[0]!(stale);
  await waitForJobs();
  ring.update(FAR_AWAY, 1, 1);
  assert.equal(sink.sets.length, 0);

  ring.update(CENTER, 1, 1);
  ring.replaceTerrain(terrain);
  assert.equal(ring.snapshot().pending, 0);
  ring.update(CENTER, 1, 1);
  assert.equal(finish.length, 3);
  finish[1]!(stale);
  finish[2]!(fresh);
  await waitForJobs();
  ring.update(CENTER, 1, 1);
  assert.deepEqual(sink.sets, [{ owner: "ring:grass:0_0", typeId: "grass-type", ...fresh, drawn: 2 }]);
  assert.deepEqual(ring.snapshot(), { cells: 1, instances: 2, pending: 0 });
});

test("a rejected job warns once and leaves a built empty cell", async () => {
  const { terrain } = makeTerrain("ground", 1);
  const generator = new RecordingGenerator();
  generator.generateCell = async () => { throw new Error("generation failed"); };
  const sink = new RecordingSink();
  const warnings: string[] = [];
  const ring = new FoliageRing({ rules: [makeRule(terrain, 8)], sink, generator, warn: (message) => warnings.push(message) });

  await ring.prepare(CENTER, 1, 1);
  ring.update(CENTER, 1, 1);
  ring.update(CENTER, 1, 1);

  assert.deepEqual(warnings, ["[foliage] rule grass cell 0_0: generation failed"]);
  assert.equal(generator.jobs.length, 1);
  assert.deepEqual(sink.sets, [{
    owner: "ring:grass:0_0", typeId: "grass-type", count: 0, matrices: new Float32Array(0), drawn: 0,
  }]);
  assert.deepEqual(ring.snapshot(), { cells: 1, instances: 0, pending: 0 });
});

test("a capped radius warns once per never-culling rule", () => {
  const { terrain } = makeTerrain();
  const wideTerrain = { ...terrain, def: { ...terrain.def, tilesX: 33 } };
  const rule = makeRule(wideTerrain, 0);
  const warnings: string[] = [];
  const ring = new FoliageRing({
    rules: [rule, { ...rule, id: "other" }], sink: new RecordingSink(),
    generator: new LocalFoliageCellGenerator(), warn: (message) => warnings.push(message),
  });

  ring.update(CENTER, 1, 0);
  ring.update(CENTER, 1, 0);

  assert.equal(warnings.length, 2);
  assert.match(warnings[0]!, /rule grass:.*capped at 512 m/);
  assert.match(warnings[1]!, /rule other:.*capped at 512 m/);
});

test("dispose removes every owner and terrain and suppresses pending and later work", async () => {
  const { terrain } = makeTerrain("ground", 1);
  const other = makeTerrain("other", 1).terrain;
  const rules = [makeRule(terrain, 8), { ...makeRule(other, 8), id: "other" }];
  const generator = new RecordingGenerator();
  const sink = new RecordingSink();
  const warnings: string[] = [];
  const ring = new FoliageRing({ rules, sink, generator, warn: (message) => warnings.push(message) });
  await ring.prepare(CENTER, 1, 1);
  const owners = sink.sets.map(({ owner }) => owner);
  assert.deepEqual(owners, ["ring:grass:0_0", "ring:other:0_0"]);

  const finish: (() => void)[] = [];
  generator.generateCell = ({ terrainId }) => new Promise((resolve, reject) => {
    finish.push(() => {
      if (terrainId === "ground") resolve({ count: 0, matrices: new Float32Array(0) });
      else reject(new Error("late failure"));
    });
  });
  const preparing = ring.prepare(CENTER, 1, 0.5);
  assert.equal(finish.length, 2);
  ring.dispose();
  for (const complete of finish) complete();
  await preparing;
  ring.replaceTerrain(terrain);
  ring.update(CENTER, 1, 1);
  await ring.prepare(CENTER, 1, 1);
  ring.dispose();

  assert.deepEqual(sink.removes, owners);
  assert.deepEqual(generator.removedTerrains, ["ground", "other"]);
  assert.equal(generator.jobs.length, 4);
  assert.equal(sink.sets.length, 2);
  assert.deepEqual(warnings, []);
  assert.deepEqual(ring.snapshot(), { cells: 0, instances: 0, pending: 0 });
});

test("the same-thread generator rejects unknown terrain and rejects after disposal", async () => {
  const { terrain, tiles } = makeTerrain("ground", 1);
  const { rule, type } = makeRule(terrain);
  const job = { terrainId: terrain.id, rule, type, request: { cellX: 0, cellZ: 0, cellSize: 32, keepFraction: 1 } };
  const generator = new LocalFoliageCellGenerator();
  await assert.rejects(generator.generate(job), /Unknown foliage terrain: ground/);
  generator.setTerrain(terrain.id, terrain.def);
  generator.setTile(terrain.id, tiles.tile(0, 0)!);
  assert.ok((await generator.generate(job)).count > 0);
  generator.dispose();
  await assert.rejects(generator.generate(job), /Foliage cell generator disposed/);
});
