import { describe, expect, test } from "vitest";
import { summary } from "../level/testKit.ts";
import { checkSdkCompatibility, normalizeProjectManifest, parseSdkVersion } from "./manifest.ts";

const STRICT = { strict: true };
const GOOD = { schema: "forge.project/1", id: "starter", name: "Starter", sdkVersion: "0.1" };

describe("normalizeProjectManifest", () => {
  test("a minimal manifest takes defaults and settles", () => {
    const result = normalizeProjectManifest(GOOD, STRICT);
    expect(result.issues).toEqual([]);
    expect(result.value).toEqual({
      schema: "forge.project/1",
      id: "starter",
      name: "Starter",
      sdkVersion: "0.1",
      contentRoots: ["content"],
      contentPacks: [],
      startLevel: "",
      game: { module: "" },
      devPort: 5190,
    });
    expect(normalizeProjectManifest(result.value, STRICT).value).toEqual(result.value);
  });

  test("name and sdkVersion are required; paths must stay inside the project", () => {
    const result = normalizeProjectManifest(
      {
        schema: "forge.project/1",
        id: "game",
        sdkVersion: "1",
        startLevel: "../other/level",
        game: { module: "C:/game.ts" },
        contentRoots: ["content", "/abs"],
        contentPacks: ["starter", "Starter", "../x"],
        devPort: 80,
      },
      STRICT,
    );
    expect(summary(result.issues)).toEqual([
      "error missing-required name",
      "error invalid-value sdkVersion",
      "error invalid-value contentRoots[1]",
      "error invalid-value contentPacks[1]",
      "error invalid-value contentPacks[2]",
      "error invalid-value startLevel",
      "error invalid-value game.module",
      "warning clamped devPort",
    ]);
  });

  test.each([
    ["not an object", [], ""],
    ["another schema", { ...GOOD, schema: "forge.project/2" }, "schema"],
    ["an id with capitals", { ...GOOD, id: "MyGame" }, "id"],
    ["an id with a dot", { ...GOOD, id: "my.game" }, "id"],
  ])("%s is fatal", (_name, raw, path) => {
    const result = normalizeProjectManifest(raw, { strict: false });
    expect(result.value).toBeNull();
    expect(summary(result.issues)).toEqual([`error invalid-document ${path}`]);
  });

  test("unknown fields are a loss; no content root at all falls back to content", () => {
    const result = normalizeProjectManifest({ ...GOOD, contentRoots: [], engine: "../Forge" }, { strict: false });
    expect(summary(result.issues)).toEqual(["warning invalid-value contentRoots", "warning unknown-field engine"]);
    expect(result.value?.contentRoots).toEqual(["content"]);
  });

  test("content packs: ids, listed once", () => {
    const result = normalizeProjectManifest({ ...GOOD, contentPacks: ["starter", "test-range", "starter"] }, { strict: false });
    expect(summary(result.issues)).toEqual(["warning invalid-value contentPacks"]);
    expect(result.value?.contentPacks).toEqual(["starter", "test-range"]);
  });
});

describe("SDK versions", () => {
  test("parse", () => {
    expect(parseSdkVersion("0.1")).toEqual({ major: 0, minor: 1, patch: 0 });
    expect(parseSdkVersion("1.2.3")).toEqual({ major: 1, minor: 2, patch: 3 });
    for (const bad of ["1", "01.2", "1.2.3.4", "v1.2", ""]) expect(parseSdkVersion(bad)).toBeNull();
  });

  test.each([
    ["0.1.0", "0.1", true],
    ["0.1.4", "0.1", true],
    ["0.2.0", "0.1", false],
    ["0.1.0", "0.2", false],
    ["1.3.0", "1.2", true],
    ["1.2.0", "1.3", false],
    ["2.0.0", "1.9", false],
    ["0.1.0", "x", false],
  ])("engine %s, project %s: %s", (engine, project, ok) => {
    const result = checkSdkCompatibility(engine, project);
    expect(result.ok).toBe(ok);
    expect(result.reason === "").toBe(ok);
  });
});
