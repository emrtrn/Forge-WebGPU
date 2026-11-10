import { describe, expect, test } from "vitest";
import { effectiveComponents, normalizeActorClass } from "./actorClass.ts";
import type { ActorDoc, ClassActor } from "./model.ts";
import { normalizeLevel } from "./normalizeLevel.ts";
import {
  actorId,
  assetId,
  CAR_CLASS_ID,
  CAR_CLASS_SOURCE,
  createCarClass,
  createOptions,
  createTestRegistry,
  levelId,
  MESH_ID,
  summary,
} from "./testKit.ts";

const IDENTITY = { p: [0, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] };
const STRICT = createOptions(true);
const LENIENT = createOptions(false);

function carLevel(overrides: unknown, classId: string = CAR_CLASS_ID): unknown {
  return {
    schema: "forge.level/1",
    id: levelId("1"),
    actors: [{ id: actorId("a"), name: "Car", class: classId, parent: null, transform: IDENTITY, overrides }],
  };
}

function overridesOf(result: ReturnType<typeof normalizeLevel>): unknown {
  return (result.value?.actors[0] as ClassActor | undefined)?.overrides;
}

describe("actor class document", () => {
  const registry = createTestRegistry();

  test("normalises to full form: complete locals, every field written", () => {
    const result = normalizeActorClass(CAR_CLASS_SOURCE, { strict: true, registry });
    expect(result.issues).toEqual([]);
    expect(result.value).toEqual({
      schema: "forge.actorClass/1",
      id: CAR_CLASS_ID,
      name: "Reference Car",
      components: {
        chassis: {
          type: "test.collider@1",
          parent: null,
          local: { p: [0, 1, -0.04], r: [0, 0, 0, 1], s: [1, 1, 1] },
          size: [2.08, 1.52, 4.08],
        },
        body: {
          type: "test.staticMesh@1",
          parent: "chassis",
          local: { p: [0, 0, 0], r: [0, 0, 0, 1], s: [1.6, 1.6, 1.6] },
          mesh: MESH_ID,
        },
        driver: { type: "test.driver@1", targetSpeed: 14, target: null },
      },
    });
  });

  test("load -> save writes back what was read", () => {
    const loaded = normalizeActorClass(CAR_CLASS_SOURCE, { strict: true, registry });
    const text = JSON.stringify(loaded.value);
    const saved = normalizeActorClass(JSON.parse(text), { strict: true, registry });
    expect(saved.issues).toEqual([]);
    expect(JSON.stringify(saved.value)).toBe(text);
  });

  test.each([
    ["not an object", null, ""],
    ["another schema", { ...CAR_CLASS_SOURCE, schema: "forge.level/1" }, "schema"],
    ["an id that is not an asset id", { ...CAR_CLASS_SOURCE, id: actorId("a") }, "id"],
  ])("%s is fatal", (_name, raw, path) => {
    const result = normalizeActorClass(raw, { strict: false, registry });
    expect(result.value).toBeNull();
    expect(summary(result.issues)).toEqual([`error invalid-document ${path}`]);
  });

  test("unknown fields and a broken hierarchy follow the usual rules", () => {
    const raw = {
      ...CAR_CLASS_SOURCE,
      tags: ["vehicle"],
      components: { body: { type: "test.staticMesh@1", parent: "frame" } },
    };
    const result = normalizeActorClass(raw, { strict: true, registry });
    expect(summary(result.issues)).toEqual([
      "error invalid-parent components.body.parent",
      "error unknown-field tags",
    ]);
  });
});

describe("overrides", () => {
  test("hold only differences, in class order, each value complete", () => {
    const result = normalizeLevel(
      carLevel({
        driver: { targetSpeed: 18, target: null },
        body: { mesh: MESH_ID },
        chassis: { size: [2.08, 1.52, 4.08], local: { s: [2, 2, 2] } },
      }),
      STRICT,
    );
    expect(result.issues).toEqual([]);
    expect(JSON.stringify(overridesOf(result))).toBe(
      JSON.stringify({
        chassis: { type: "test.collider@1", local: { p: [0, 1, -0.04], r: [0, 0, 0, 1], s: [2, 2, 2] } },
        driver: { type: "test.driver@1", targetSpeed: 18 },
      }),
    );
  });

  test("an override equal to the class value disappears", () => {
    const result = normalizeLevel(carLevel({ driver: { targetSpeed: 14 }, chassis: {} }), STRICT);
    expect(result.issues).toEqual([]);
    expect(overridesOf(result)).toEqual({});
  });

  test("a number out of range is clamped like anywhere else", () => {
    const result = normalizeLevel(carLevel({ driver: { targetSpeed: 500 } }), STRICT);
    expect(summary(result.issues)).toEqual(["warning clamped actors[0].overrides.driver.targetSpeed"]);
    expect(overridesOf(result)).toEqual({ driver: { type: "test.driver@1", targetSpeed: 50 } });
  });

  test("parent cannot be overridden; a component cannot be added", () => {
    const result = normalizeLevel(
      carLevel({
        body: { type: "test.staticMesh@1", parent: null },
        trailer: { size: [1, 1, 1] },
      }),
      STRICT,
    );
    expect(summary(result.issues)).toEqual([
      "error invalid-override actors[0].overrides.body.parent",
      "error invalid-override actors[0].overrides.trailer",
    ]);
    expect(overridesOf(result)).toEqual({});
  });

  test("an unknown field is dropped; local on a non-spatial component is unknown", () => {
    const result = normalizeLevel(carLevel({ driver: { topSpeed: 90, local: IDENTITY } }), LENIENT);
    expect(summary(result.issues)).toEqual([
      "warning unknown-field actors[0].overrides.driver.topSpeed",
      "warning unknown-field actors[0].overrides.driver.local",
    ]);
    expect(overridesOf(result)).toEqual({});
  });

  test("a value of the wrong type is not kept: the class value stands", () => {
    const result = normalizeLevel(carLevel({ driver: { targetSpeed: "fast" }, body: "hidden" }), LENIENT);
    expect(summary(result.issues)).toEqual([
      "warning invalid-value actors[0].overrides.body",
      "warning invalid-value actors[0].overrides.driver.targetSpeed",
    ]);
    expect(overridesOf(result)).toEqual({});
  });

  test("a class that cannot be found is a dangling reference; overrides are kept unchecked", () => {
    const missing = assetId("9");
    const raw = carLevel({ driver: { targetSpeed: 500, mystery: true }, junk: 1 }, missing);
    const strict = normalizeLevel(raw, STRICT);
    expect(summary(strict.issues)).toEqual([
      "error dangling-reference actors[0].class",
      "error invalid-value actors[0].overrides.junk",
    ]);
    expect(strict.ok).toBe(false);
    const lenient = normalizeLevel(raw, LENIENT);
    expect(lenient.ok).toBe(true);
    expect(overridesOf(lenient)).toEqual({ driver: { targetSpeed: 500, mystery: true } });
    expect(lenient.value?.actors[0]?.class).toBe(missing);
  });

  test("a singleton that arrives through a class counts", () => {
    const registry = createTestRegistry();
    const foggy = normalizeActorClass(
      { schema: "forge.actorClass/1", id: assetId("f"), name: "Fog Bank", components: { fog: { type: "test.fog@2" } } },
      { strict: true, registry },
    ).value!;
    const raw = {
      schema: "forge.level/1",
      id: levelId("1"),
      actors: [
        { id: actorId("a"), class: foggy.id },
        { id: actorId("b"), class: foggy.id },
      ],
    };
    const result = normalizeLevel(raw, { strict: true, registry, resolveClass: () => foggy });
    expect(summary(result.issues)).toEqual(["error singleton-conflict actors[1].class"]);
  });
});

describe("effective components", () => {
  const car = createCarClass(createTestRegistry());

  test("a class actor has the class components with its overrides applied", () => {
    const result = normalizeLevel(
      carLevel({ driver: { targetSpeed: 18 }, chassis: { local: { p: [0, 2, 0] } } }),
      STRICT,
    );
    const actor = result.value!.actors[0]!;
    const components = effectiveComponents(actor, car);
    expect(components.driver).toEqual({ type: "test.driver@1", targetSpeed: 18, target: null });
    expect(components.chassis?.local).toEqual({ p: [0, 2, 0], r: [0, 0, 0, 1], s: [1, 1, 1] });
    expect(components.body).toEqual(car.components.body);
    expect(Object.keys(components)).toEqual(["chassis", "body", "driver"]);
  });

  test("returns copies: editing the result touches neither the class nor the actor", () => {
    const actor = normalizeLevel(carLevel({ driver: { targetSpeed: 18 } }), STRICT).value!.actors[0]!;
    const components = effectiveComponents(actor, car);
    components.driver!.targetSpeed = 1;
    (components.chassis!.local!.p as number[])[0] = 99;
    expect(car.components.driver?.targetSpeed).toBe(14);
    expect(car.components.chassis?.local?.p).toEqual([0, 1, -0.04]);
    expect((actor as ClassActor).overrides.driver?.targetSpeed).toBe(18);
  });

  test("a plain actor has its own components; an unresolved class has none", () => {
    const plain: ActorDoc = {
      id: actorId("a"),
      name: "A",
      class: null,
      parent: null,
      transform: { p: [0, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] },
      components: { driver: { type: "test.driver@1", targetSpeed: 3, target: null } },
    };
    expect(effectiveComponents(plain, undefined)).toEqual(plain.components);
    const dangling = normalizeLevel(carLevel({}, assetId("9")), LENIENT).value!.actors[0]!;
    expect(effectiveComponents(dangling, undefined)).toEqual({});
  });
});
