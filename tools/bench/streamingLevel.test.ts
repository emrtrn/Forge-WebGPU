import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, test } from "vitest";
import {
  cellAt, cellKey, componentTypeTag, mergeLevelParts, normalizeLevel, normalizeLevelCell,
  type AssetId, type LevelCellDoc, type LevelDoc, type SchemaRegistry,
} from "../../src/core/index.ts";
import { Shape, SHAPE_BASE_SIZE } from "../../src/features/shape/schema.ts";
import { StaticMesh } from "../../src/features/static-mesh/schema.ts";
import { loadEngineRegistry } from "../assets/engineRegistry.ts";
import { fileRevision } from "../assets/revision.ts";
import { generateStreamingLevel, STREAMING_LEVEL_DEFAULTS, writeStreamingLevel, type StreamingLevel } from "./streamingLevel.ts";

const models = [1, 2, 3].map<AssetId>((n) => `ast_${String(n).padStart(32, "0")}`);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
let fixture: StreamingLevel;
let registry: SchemaRegistry;
beforeAll(async () => {
  registry = await loadEngineRegistry(repoRoot);
  fixture = generateStreamingLevel({ models, actors: 5000 });
});

describe("streaming level", () => {
  test("same options give byte-identical files; another seed changes them", () => {
    const options = { models, actors: 200, seed: 12 };
    const first = generateStreamingLevel(options);
    expect(generateStreamingLevel(options).files).toEqual(first.files);
    expect(generateStreamingLevel({ ...options, seed: 13 }).files).not.toEqual(first.files);
    expect(generateStreamingLevel({ ...options, levelId: "lvl_ffffffffffffffffffffffffffffffff" }).levelId).toBe("lvl_ffffffffffffffffffffffffffffffff");
  });

  test("has the requested count, mix, model coverage and bounded transforms", () => {
    const actors = fixture.level.actors;
    expect(Math.abs(actors.length - 5000) / 5000).toBeLessThanOrEqual(.01);
    const meshes = actors.filter((a) => a.class === null && a.components.mesh?.type === componentTypeTag(StaticMesh));
    const children = meshes.filter((a) => a.parent !== null);
    const cubes = actors.filter((a) => a.class === null && a.components.shape?.primitive === "cube");
    for (const [count, share] of [[meshes.length - children.length, .85], [cubes.length, .1], [children.length, .05]]) {
      expect(Math.abs(count! / actors.length - share!)).toBeLessThanOrEqual(.02);
    }
    expect(new Set(meshes.flatMap((a) => a.class === null ? [a.components.mesh!.mesh] : []))).toEqual(new Set(models));
    const childCounts = new Map<string, number>();
    for (const actor of meshes) {
      expect(actor.class).toBeNull();
      if (actor.class !== null) continue;
      expect(Object.keys(actor.components)).toEqual(["mesh"]);
      const [sx, sy, sz] = actor.transform.s;
      expect(sx).toBeGreaterThanOrEqual(.7);
      expect(sx).toBeLessThanOrEqual(1.5);
      expect([sy, sz]).toEqual([sx, sx]);
      expect(Math.hypot(...actor.transform.r)).toBeCloseTo(1, 8);
      if (actor.parent !== null) {
        expect(Math.hypot(...actor.transform.p)).toBeLessThanOrEqual(4);
        childCounts.set(actor.parent, (childCounts.get(actor.parent) ?? 0) + 1);
      } else expect(actor.transform.p[1]).toBe(0);
    }
    expect([...childCounts.values()].every((n) => n >= 1 && n <= 3)).toBe(true);
    for (const cube of cubes) {
      const [x, y, z] = cube.transform.s;
      expect(x).toBeGreaterThanOrEqual(4);
      expect(x).toBeLessThanOrEqual(16);
      expect(z).toBeGreaterThanOrEqual(4);
      expect(z).toBeLessThanOrEqual(16);
      expect(y).toBeGreaterThanOrEqual(3);
      expect(y).toBeLessThanOrEqual(20);
      expect(cube.transform.p[1]).toBe(y * SHAPE_BASE_SIZE / 2);
    }
  });

  test("normalizes strictly with the real engine registry and splits under core rules", () => {
    const context = { strict: true, registry, resolveClass: () => undefined };
    expect(normalizeLevel(fixture.level, context).issues).toEqual([]);
    const persistent = JSON.parse(fixture.files.find((f) => f.path === "level.json")!.text) as LevelDoc;
    const normalized = normalizeLevel(persistent, context);
    expect(normalized.issues).toEqual([]);
    expect(persistent.actors).toHaveLength(1);
    const ground = persistent.actors[0]!;
    expect(ground.spatiallyLoaded).toBe(false);
    expect(ground.class === null && ground.components.shape).toMatchObject({ type: componentTypeTag(Shape), primitive: "plane", castShadow: false });
    expect(ground.transform.s).toEqual([STREAMING_LEVEL_DEFAULTS.size / SHAPE_BASE_SIZE, 1, STREAMING_LEVEL_DEFAULTS.size / SHAPE_BASE_SIZE]);
    expect(persistent.settings).toMatchObject({ loadRange: 384, viewDistance: 2000 });
    const cells: LevelCellDoc[] = [];
    for (const file of fixture.files.filter((f) => f.path.startsWith("cells/"))) {
      const result = normalizeLevelCell(JSON.parse(file.text), context);
      expect(result.issues).toEqual([]);
      const cell = result.value!;
      cells.push(cell);
      const byId = new Map(cell.actors.map((actor) => [actor.id, actor]));
      for (const actor of cell.actors) {
        // Children use local coordinates and follow their root's cell.
        const root = actor.parent === null ? actor : byId.get(actor.parent)!;
        expect(root).toBeDefined();
        const [x, , z] = root.transform.p;
        expect(cellKey(cellAt(fixture.level.settings.cellSize, x, z))).toBe(cell.cell);
      }
    }
    const merged = mergeLevelParts(normalized.value!, cells, context);
    expect(merged.issues).toEqual([]);
    expect(merged.value.level.actors).toHaveLength(5000);
    const index = JSON.parse(fixture.files.find((f) => f.path === "cells.json")!.text) as { persistent: string; cells: Record<string, string> };
    for (const file of fixture.files.filter((f) => f.path !== "cells.json")) {
      const revision = file.path === "level.json" ? index.persistent : index.cells[file.path.slice(6, -5)];
      expect(revision).toBe(fileRevision(file.text));
    }
  });

  test("default 50k world has dense clusters", () => {
    const level = generateStreamingLevel({ models });
    expect(level.actorCount).toBe(50_000);
    expect(level.cellCounts.max).toBeGreaterThanOrEqual(3 * level.cellCounts.median);
  }, 10_000);

  test("writer refuses existing folders, force removes stale cells and preserves bytes", async () => {
    const root = await mkdtemp(join(tmpdir(), "forge-streaming-test-"));
    try {
      const small = generateStreamingLevel({ models, actors: 40 });
      const folder = await writeStreamingLevel(root, "content/levels/streaming", small);
      for (const file of small.files) expect(await readFile(join(folder, file.path), "utf8")).toBe(file.text);
      const stale = join(folder, "cells/999_999.json");
      await writeFile(stale, "stale");
      await expect(writeStreamingLevel(root, "content/levels/streaming", small)).rejects.toThrow("--force");
      expect(await readFile(stale, "utf8")).toBe("stale");
      await writeStreamingLevel(root, "content/levels/streaming", small, { force: true });
      expect(await readdir(join(folder, "cells"))).not.toContain("999_999.json");
      for (const file of small.files) expect(await readFile(join(folder, file.path), "utf8")).toBe(file.text);
      await expect(writeStreamingLevel(root, "../escape", small, { force: true })).rejects.toThrow("inside the project");
    } finally {
      // mkdtemp returned a directory inside the OS temp folder.
      await rm(root, { recursive: true, force: true });
    }
  });

  test("rejects missing models and invalid sizes or counts", () => {
    expect(() => generateStreamingLevel({ models: [] })).toThrow("model GUID");
    expect(() => generateStreamingLevel({ models, actors: 0 })).toThrow("actors");
    expect(() => generateStreamingLevel({ models, seed: NaN })).toThrow("seed");
    expect(() => generateStreamingLevel({ models, size: Infinity })).toThrow("size");
  });
});
