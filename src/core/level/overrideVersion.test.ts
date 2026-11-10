// The override version tag (architecture §4.4): an override entry carries the
// class component's type tag, so a stale override runs the migration chain.

import { describe, expect, test } from "vitest";
import { defineComponent } from "../schema/component.ts";
import { color, num } from "../schema/fields.ts";
import { validateJsonSchema } from "../schema/jsonSchemaTestValidator.ts";
import { createSchemaRegistry } from "../schema/registry.ts";
import { normalizeActorClass } from "./actorClass.ts";
import { levelJsonSchema } from "./jsonSchema.ts";
import type { ClassActor } from "./model.ts";
import { normalizeLevel } from "./normalizeLevel.ts";
import { actorId, assetId, Collider, levelId, summary } from "./testKit.ts";

// v1: { falloff, tint }   v2: falloff -> heightFalloff   v3: density in 1/km (x1000)
const Haze = defineComponent(
  "test.haze",
  3,
  {
    heightFalloff: num({ min: 0, max: 5, default: 0.2 }),
    density: num({ min: 0, max: 100, default: 20 }),
    tint: color({ default: "#b8c4d6" }),
  },
  {
    migrations: {
      1: ({ falloff, ...rest }) => ({ ...rest, heightFalloff: falloff }),
      2: ({ density, ...rest }) => (density === undefined ? rest : { ...rest, density: (density as number) * 1000 }),
    },
  },
);

const CLASS_ID = assetId("d");

function setup() {
  const registry = createSchemaRegistry();
  registry.registerComponent(Haze);
  registry.registerComponent(Collider);
  const cls = normalizeActorClass(
    {
      schema: "forge.actorClass/1",
      id: CLASS_ID,
      name: "Haze Volume",
      components: {
        bounds: { type: "test.collider@1", parent: null },
        haze: { type: "test.haze@3", heightFalloff: 0.2, density: 20, tint: "#b8c4d6" },
      },
    },
    { strict: true, registry },
  ).value;
  if (!cls) throw new Error("fixture class does not normalise");
  return { registry, resolveClass: (id: string) => (id === CLASS_ID ? cls : undefined) };
}

function load(overrides: unknown, strict = true) {
  const raw = {
    schema: "forge.level/1",
    id: levelId("1"),
    actors: [{ id: actorId("a"), class: CLASS_ID, overrides }],
  };
  const result = normalizeLevel(raw, { strict, ...setup() });
  return { result, overrides: (result.value?.actors[0] as ClassActor | undefined)?.overrides };
}

describe("override version tag", () => {
  test("a save stamps every entry with the current tag", () => {
    const { result, overrides } = load({ haze: { tint: "#ff0000" }, bounds: { size: [2, 2, 2] } });
    expect(result.issues).toEqual([]);
    expect(JSON.stringify(overrides)).toBe(
      JSON.stringify({
        bounds: { type: "test.collider@1", size: [2, 2, 2] },
        haze: { type: "test.haze@3", tint: "#ff0000" },
      }),
    );
  });

  test("a stale entry runs the migration chain on its partial data", () => {
    const fromV1 = load({ haze: { type: "test.haze@1", falloff: 1.5 } });
    expect(fromV1.result.issues).toEqual([]);
    expect(fromV1.overrides).toEqual({ haze: { type: "test.haze@3", heightFalloff: 1.5 } });

    const fromV2 = load({ haze: { type: "test.haze@2", density: 0.05, tint: "#00ff00" } });
    expect(fromV2.result.issues).toEqual([]);
    expect(fromV2.overrides).toEqual({ haze: { type: "test.haze@3", density: 50, tint: "#00ff00" } });
  });

  test("before the tag, a renamed field was an unknown field; with it, nothing is lost", () => {
    const untagged = load({ haze: { falloff: 1.5 } });
    expect(summary(untagged.result.issues)).toEqual(["error unknown-field actors[0].overrides.haze.falloff"]);
    const tagged = load({ haze: { type: "test.haze@1", falloff: 1.5 } });
    expect(tagged.result.ok).toBe(true);
  });

  test("a migrated value equal to the class value is not kept", () => {
    const { result, overrides } = load({ haze: { type: "test.haze@2", density: 0.02 } });
    expect(result.issues).toEqual([]);
    expect(overrides).toEqual({});
  });

  test("a tag for another component type: the class swapped the component, the entry goes", () => {
    const { result, overrides } = load({ haze: { type: "test.fog@1", density: 0.5 } });
    expect(summary(result.issues)).toEqual(["error invalid-override actors[0].overrides.haze.type"]);
    expect(result.issues[0]?.message).toContain("the class component is a test.haze now");
    expect(overrides).toEqual({});
  });

  test("a newer version or a malformed tag drops the entry with a report", () => {
    expect(summary(load({ haze: { type: "test.haze@4", tint: "#ff0000" } }).result.issues)).toEqual([
      "error unsupported-version actors[0].overrides.haze.type",
    ]);
    expect(summary(load({ haze: { type: "haze", tint: "#ff0000" } }, false).result.issues)).toEqual([
      "warning invalid-value actors[0].overrides.haze.type",
    ]);
  });

  test("the envelope does not go through migrations and is still checked", () => {
    const { result, overrides } = load({
      bounds: { type: "test.collider@1", local: { p: [0, 2, 0] }, parent: "haze" },
    });
    expect(summary(result.issues)).toEqual(["error invalid-override actors[0].overrides.bounds.parent"]);
    expect(overrides).toEqual({
      bounds: { type: "test.collider@1", local: { p: [0, 2, 0], r: [0, 0, 0, 1], s: [1, 1, 1] } },
    });
  });

  test("the level JSON Schema accepts a stamp and rejects a malformed one", () => {
    const schema = levelJsonSchema(setup().registry);
    const level = (overrides: unknown) => ({
      schema: "forge.level/1",
      id: levelId("1"),
      actors: [{ id: actorId("a"), class: CLASS_ID, overrides }],
    });
    expect(validateJsonSchema(schema, level({ haze: { type: "test.haze@3", tint: "#ff0000" } }))).toEqual([]);
    expect(validateJsonSchema(schema, level({ haze: { type: "haze@0" } }))).not.toEqual([]);
  });
});
