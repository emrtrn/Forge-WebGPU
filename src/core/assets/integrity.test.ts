import { describe, expect, test } from "vitest";
import type { ContentFile } from "./identity.ts";
import { planDelete } from "./integrity.ts";
import {
  actorClass,
  actorId,
  asset,
  assetId,
  build,
  CAR,
  fileSummary,
  level,
  levelId,
  MESH,
  projectFiles,
  TEX,
  WHEEL,
} from "./testKit.ts";

/** Moves a file (and keeps everything else) under a new path. */
function moved(files: ContentFile[], from: string, to: string): ContentFile[] {
  return files.map((file) => (file.path === from ? { ...file, path: to } : file));
}

function without(files: ContentFile[], ...paths: string[]): ContentFile[] {
  return files.filter((file) => !paths.includes(file.path));
}

describe("moving and renaming", () => {
  test("moving a binary with its meta file, a class and a level breaks no reference", () => {
    let files = projectFiles();
    files = moved(files, "meshes/wheel.glb", "vehicles/parts/front-wheel.glb");
    files = moved(files, "meshes/wheel.glb.meta.json", "vehicles/parts/front-wheel.glb.meta.json");
    files = moved(files, "classes/car.json", "prefabs/cars/reference-car.json");
    files = moved(files, "levels/main/level.json", "maps/test/level.json");
    const before = build(projectFiles());
    const after = build(files);
    expect(fileSummary(after.issues)).toEqual([]);
    expect(after.entries.get(WHEEL)?.path).toBe("vehicles/parts/front-wheel.glb");
    expect(after.resolveClass(CAR)?.id).toBe(CAR);
    const targets = (index: typeof after) =>
      index.references.map((reference) => `${reference.from} ${reference.path} ${reference.target}`).sort();
    expect(targets(after)).toEqual(targets(before));
  });

  test("moving the binary without its meta file is reported on both sides", () => {
    const files = moved(projectFiles(), "meshes/wheel.glb", "vehicles/wheel.glb");
    expect(fileSummary(build(files).issues)).toEqual([
      "error orphan-meta content/meshes/wheel.glb.meta.json",
      "error missing-meta content/vehicles/wheel.glb",
      "error dangling-reference content/levels/main/level.json actors[0].overrides.body.mesh",
      "error dangling-reference content/levels/main/level.json actors[1].components.mesh.mesh",
    ]);
  });
});

describe("dangling references", () => {
  test("an error in development, a report in production", () => {
    const files = without(projectFiles(), "textures/paint.png", "textures/paint.png.meta.json");
    const strict = build(files);
    expect(fileSummary(strict.issues)).toEqual([
      "error dangling-reference content/meshes/car.glb.meta.json import.textures[0]",
    ]);
    expect(strict.ok).toBe(false);
    const production = build(files, false);
    expect(fileSummary(production.issues)).toEqual([
      "warning dangling-reference content/meshes/car.glb.meta.json import.textures[0]",
    ]);
    expect(production.ok).toBe(true);
  });

  test("a missing actor class is reported once, by level normalisation", () => {
    const files = without(projectFiles(), "classes/car.json");
    expect(fileSummary(build(files).issues)).toEqual([
      "error dangling-reference content/levels/main/level.json actors[0].class",
    ]);
  });
});

describe("asset type constraint", () => {
  test("an assetRef limited to a type rejects an asset of another type", () => {
    const files = [
      ...asset("t.png", TEX, "test.texture@1"),
      ...asset("m.glb", MESH, "test.mesh@1", { import: { textures: [MESH] } }),
      level("l.json", "a", [
        { id: actorId("1"), components: { r: { type: "test.meshRenderer@1", parent: null, mesh: TEX } } },
        // test.staticMesh's `mesh` takes any type.
        { id: actorId("2"), components: { s: { type: "test.staticMesh@1", parent: null, mesh: TEX } } },
      ]),
    ];
    const index = build(files);
    expect(fileSummary(index.issues)).toEqual([
      "error asset-type-mismatch content/l.json actors[0].components.r.mesh",
      "error asset-type-mismatch content/m.glb.meta.json import.textures[0]",
    ]);
    expect(index.issues[0]?.message).toBe(`Expected a test.mesh; ${TEX} is a test.texture.`);
  });

  test("an actor class link must point at an actor class", () => {
    const files = [
      ...asset("t.png", TEX, "test.texture@1"),
      level("l.json", "a", [{ id: actorId("1"), class: TEX }]),
    ];
    expect(fileSummary(build(files).issues)).toEqual([
      "error dangling-reference content/l.json actors[0].class",
      "error asset-type-mismatch content/l.json actors[0].class",
    ]);
  });
});

describe("planDelete", () => {
  test("a referenced asset lists its referrers and is not allowed", () => {
    const index = build(projectFiles());
    const wheel = planDelete(index, WHEEL);
    expect(wheel.allowed).toBe(false);
    expect(wheel.exists).toBe(true);
    expect(wheel.referrers.map((reference) => `${reference.file} ${reference.path}`)).toEqual([
      "content/levels/main/level.json actors[0].overrides.body.mesh",
      "content/levels/main/level.json actors[1].components.mesh.mesh",
    ]);
    expect(planDelete(index, CAR).referrers.map((reference) => reference.via)).toEqual(["class"]);
    expect(planDelete(index, TEX).referrers.map((reference) => reference.from)).toEqual([MESH]);
  });

  test("an unreferenced asset may go; a reference to itself does not count", () => {
    const self = assetId("5");
    const files = [
      ...projectFiles(),
      actorClass("classes/self.json", self, {}),
      ...asset("loop.glb", assetId("6"), "test.mesh@1"),
    ];
    const index = build(files);
    expect(planDelete(index, levelId("a"))).toMatchObject({ exists: true, allowed: true, referrers: [] });
    expect(planDelete(index, self).allowed).toBe(true);
    expect(planDelete(index, assetId("f"))).toMatchObject({ exists: false, allowed: true });
  });
});
