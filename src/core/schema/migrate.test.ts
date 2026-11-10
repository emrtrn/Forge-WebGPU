import { describe, expect, test } from "vitest";
import { defineComponent } from "./component.ts";
import { color, num, SchemaDefinitionError, vec3 } from "./fields.ts";
import type { Issue } from "./issues.ts";
import type { MigrationMap } from "./migrate.ts";
import { normalizeComponent } from "./normalizeComponent.ts";

// v1: { falloff, color }
// v2: falloff renamed to heightFalloff
// v3: color split into color + sunColor; density added with a default
const migrations: MigrationMap = {
  1: ({ falloff, ...rest }) => ({ ...rest, heightFalloff: falloff }),
  2: (data) => ({ ...data, sunColor: data.color }),
};

const fields = {
  density: num({ min: 0, max: 1, default: 0.02 }),
  heightFalloff: num({ min: 0, max: 5, default: 0.2 }),
  color: color({ default: "#b8c4d6" }),
  sunColor: color({ default: "#ffe2bd" }),
};

const Fog = defineComponent("test.fog", 3, fields, { migrations });

const STRICT = { strict: true };

function summary(issues: readonly Issue[]): string[] {
  return issues.map((issue) => `${issue.severity} ${issue.code} ${issue.path}`);
}

describe("migration chain", () => {
  test("loading an old version runs every step up to the current one", () => {
    const result = normalizeComponent(Fog, { type: "test.fog@1", falloff: 0.7, color: "#112233" }, STRICT);
    expect(result.issues).toEqual([]);
    expect(result.value).toEqual({
      type: "test.fog@3",
      density: 0.02,
      heightFalloff: 0.7,
      color: "#112233",
      sunColor: "#112233",
    });
  });

  test("a middle version runs only the steps it still needs", () => {
    const result = normalizeComponent(
      Fog,
      { type: "test.fog@2", heightFalloff: 0.7, color: "#112233" },
      STRICT,
    );
    expect(result.issues).toEqual([]);
    expect(result.value).toMatchObject({ type: "test.fog@3", heightFalloff: 0.7, sunColor: "#112233" });
  });

  test("the current version runs no step", () => {
    const current = { type: "test.fog@3", density: 0.5, heightFalloff: 1, color: "#000000", sunColor: "#ffffff" };
    const result = normalizeComponent(Fog, current, STRICT);
    expect(result.value).toEqual(current);
  });

  test("a save always writes the current version", () => {
    const loaded = normalizeComponent(Fog, { type: "test.fog@1", falloff: 0.7 }, STRICT);
    const saved = normalizeComponent(Fog, loaded.value, STRICT);
    expect(saved.value?.type).toBe("test.fog@3");
    expect(saved.value).toEqual(loaded.value);
    expect(saved.issues).toEqual([]);
  });

  test("migrated data is normalised like any other input", () => {
    const result = normalizeComponent(Fog, { type: "test.fog@1", falloff: 99, legacy: true }, STRICT);
    expect(summary(result.issues)).toEqual(["warning clamped heightFalloff", "error unknown-field legacy"]);
    expect(result.value).toMatchObject({ heightFalloff: 5 });
  });

  test("the input document is not mutated", () => {
    const Mutating = defineComponent("test.mutating", 2, fields, {
      migrations: {
        1: (data) => {
          if (data.nested) {
            (data.nested as { value: number }).value = 2;
            delete data.nested;
          }
          return data;
        },
      },
    });
    const raw = { type: "test.mutating@1", nested: { value: 1 } };
    normalizeComponent(Mutating, raw, STRICT);
    expect(raw).toEqual({ type: "test.mutating@1", nested: { value: 1 } });
  });

  test("the envelope of a spatial component is not handed to migrations", () => {
    const seen: string[][] = [];
    const Box = defineComponent(
      "test.box",
      2,
      { size: vec3({ default: [1, 1, 1] }) },
      {
        spatial: true,
        migrations: {
          1: (data) => {
            seen.push(Object.keys(data));
            return { size: data.extent };
          },
        },
      },
    );
    seen.length = 0; // the definition-time check already ran the step on {}
    const result = normalizeComponent(
      Box,
      { type: "test.box@1", parent: "chassis", local: { p: [0, 1, 0] }, extent: [2, 2, 2] },
      STRICT,
    );
    expect(seen).toEqual([["extent"]]);
    expect(result.issues).toEqual([]);
    expect(result.value).toEqual({
      type: "test.box@2",
      parent: "chassis",
      local: { p: [0, 1, 0], r: [0, 0, 0, 1], s: [1, 1, 1] },
      size: [2, 2, 2],
    });
  });
});

describe("migration failures", () => {
  // Each step is partial-safe on {} (the definition-time check) and fails only
  // on the data that triggers it.
  test.each([
    ["throws", (data: Record<string, unknown>) => {
      if (data.legacy !== undefined) throw new Error("boom");
      return data;
    }],
    ["returns something that is not an object", (data: Record<string, unknown>) =>
      (data.legacy !== undefined ? [] : data) as never],
  ])("a step that %s drops the component with a loss issue", (_name, step) => {
    const Broken = defineComponent("test.broken", 2, fields, { migrations: { 1: step } });
    const strict = normalizeComponent(Broken, { type: "test.broken@1", legacy: 1 }, STRICT);
    expect(strict.value).toBeNull();
    expect(summary(strict.issues)).toEqual(["error migration-failed "]);
    expect(strict.ok).toBe(false);

    const lenient = normalizeComponent(Broken, { type: "test.broken@1", legacy: 1 }, { strict: false });
    expect(lenient.value).toBeNull();
    expect(summary(lenient.issues)).toEqual(["warning migration-failed "]);
    expect(lenient.ok).toBe(true);
  });

  test("a version newer than the build is not guessed at", () => {
    const result = normalizeComponent(Fog, { type: "test.fog@4" }, STRICT);
    expect(result.value).toBeNull();
    expect(summary(result.issues)).toEqual(["error unsupported-version type"]);
  });
});

describe("definition-time checks", () => {
  const step = (data: Record<string, unknown>) => data;

  test.each([
    ["a missing step", 3, { 1: step }],
    ["no steps at all", 2, {}],
    ["a step from the current version", 2, { 1: step, 2: step }],
    ["a step from version zero", 2, { 0: step, 1: step }],
  ])("rejects %s", (_name, version, given) => {
    expect(() => defineComponent("test.fog", version, fields, { migrations: given })).toThrow(
      SchemaDefinitionError,
    );
  });

  test("a step must accept partial data: it may not throw on {} or invent keys", () => {
    const cases: [string, MigrationMap, RegExp][] = [
      ["throws", { 1: (data) => ({ ...data, heightFalloff: (data.falloff as number[]).length }) }, /threw/],
      ["invents a key", { 1: (data) => ({ ...data, sunColor: "#ffffff" }) }, /only change the keys/],
      ["returns a non-object", { 1: () => null as never }, /only change the keys/],
    ];
    for (const [name, given, message] of cases) {
      expect(() => defineComponent("test.fog", 2, fields, { migrations: given }), name).toThrow(message);
    }
    // Renaming a key that may be absent leaves an undefined value: allowed.
    expect(() =>
      defineComponent("test.fog", 2, fields, {
        migrations: { 1: ({ falloff, ...rest }) => ({ ...rest, heightFalloff: falloff }) },
      }),
    ).not.toThrow();
  });

  test("version 1 needs no migrations", () => {
    expect(defineComponent("test.fog", 1, fields).migrations).toEqual({});
  });
});
