import { describe, expect, test } from "vitest";
import { buildAssetIndex, normalizeLevelCell, type ContentFile } from "../../src/core/index.ts";
import { fileRevision } from "../assets/revision.ts";
import { createBenchRegistry, generateScaleProject, toLegacy, type GeneratedFile } from "./levelScale.ts";

// A small level: the same code path as the 50.000-actor one, fast enough for the gate.
const SMALL = { actors: 2_000, worldSize: 1024, meshes: 20, classes: 4 };

function contentFiles(files: readonly GeneratedFile[]): ContentFile[] {
  return files.map((file) =>
    file.path.endsWith(".json")
      ? { root: "content", path: file.path, json: JSON.parse(file.text) as unknown, revision: fileRevision(file.text) }
      : { root: "content", path: file.path },
  );
}

function index(files: readonly GeneratedFile[]) {
  return buildAssetIndex(contentFiles(files), { strict: true, registry: createBenchRegistry() });
}

describe("generateScaleProject", () => {
  test("the same seed gives the same bytes; another seed does not", () => {
    const first = generateScaleProject({ ...SMALL, seed: 7 });
    const again = generateScaleProject({ ...SMALL, seed: 7 });
    expect(again.files).toEqual(first.files);
    expect(generateScaleProject({ ...SMALL, seed: 8 }).files).not.toEqual(first.files);
  });

  test("is a clean project for the asset index: cells, index revisions, references", () => {
    const project = generateScaleProject(SMALL);
    const built = index(project.files);
    expect(built.issues).toEqual([]);
    expect(project.actorCount).toBe(SMALL.actors);
    const level = built.levels.get(project.levelId);
    expect(level?.folder).toBe("levels/scale");
    expect(level?.cells).toEqual(project.cells);
    expect(project.cells.length).toBe(64); // 1024 m / 128 m, squared
  });

  test("has the planned mix of actors", () => {
    const project = generateScaleProject(SMALL);
    const actors = project.files
      .filter((file) => file.path.includes("/cells/"))
      .flatMap((file) => (JSON.parse(file.text) as { actors: { class: unknown; parent: unknown }[] }).actors);
    const share = (count: number) => count / SMALL.actors;
    expect(actors.length + project.persistentActors).toBe(SMALL.actors);
    expect(share(actors.filter((actor) => actor.class !== null).length)).toBeCloseTo(0.15, 1);
    expect(share(actors.filter((actor) => actor.parent !== null).length)).toBeCloseTo(0.05, 1);
    expect(project.persistentActors).toBeGreaterThanOrEqual(2); // the fog and at least one parked light
  });

  test("legacy files migrate to exactly what the current files say", () => {
    const current = generateScaleProject(SMALL);
    const legacy = generateScaleProject({ ...SMALL, legacy: true });
    expect(legacy.files.map((file) => file.path)).toEqual(current.files.map((file) => file.path));
    const cell = `${current.levelFolder}/cells/${current.cells[10]}.json`;
    const text = (files: readonly GeneratedFile[]) => files.find((file) => file.path === cell)!.text;
    expect(text(legacy.files)).toContain('"bench.collider@1"');
    expect(text(legacy.files)).not.toContain("@2");

    const legacyIndex = index(legacy.files);
    expect(legacyIndex.issues).toEqual([]);
    const options = { strict: true, registry: createBenchRegistry(), resolveClass: legacyIndex.resolveClass };
    const fromLegacy = normalizeLevelCell(JSON.parse(text(legacy.files)), options);
    expect(fromLegacy.issues).toEqual([]);
    expect(fromLegacy.value).toEqual(normalizeLevelCell(JSON.parse(text(current.files)), options).value);
  });

  test("toLegacy folds matching shadow flags and renames v1 fields", () => {
    expect(
      toLegacy({
        a: { type: "bench.staticMesh@2", mesh: null, castShadow: false, receiveShadow: false, lodBias: 1 },
        b: { type: "bench.staticMesh@2", castShadow: false, receiveShadow: true },
        c: { type: "bench.collider@2", size: [1, 2, 3] },
        d: { type: "bench.vehicleDriver@2", targetSpeed: 3 },
        e: { type: "bench.fog@1", density: 0.1 },
      }),
    ).toEqual({
      a: { type: "bench.staticMesh@1", mesh: null, lodBias: 1, shadows: false },
      b: { type: "bench.staticMesh@1", castShadow: false, receiveShadow: true },
      c: { type: "bench.collider@1", extent: [1, 2, 3] },
      d: { type: "bench.vehicleDriver@1", speed: 3 },
      e: { type: "bench.fog@1", density: 0.1 },
    });
  });
});
