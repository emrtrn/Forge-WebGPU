import { describe, expect, test } from "vitest";
import { normalizeActorDoc, openLevelSession, type ActorDoc, type LevelDoc } from "../../core/index.ts";
import { actorId, CAR_CLASS_ID, Collider, createOptions, Driver, Fog, levelId } from "../../core/level/testKit.ts";
import {
  addComponent,
  cannotAdd,
  componentSections,
  detailsTarget,
  editActor,
  editComponent,
  mixedPaths,
  removeComponent,
  resetOverride,
  withRotationAxis,
} from "./detailsModel.ts";

const OPTIONS = createOptions(true);
const IDENTITY = { p: [0, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] };
const normal = (raw: unknown): ActorDoc => {
  const result = normalizeActorDoc(raw, OPTIONS);
  if (!result.value) throw new Error(JSON.stringify(result.issues));
  return result.value;
};
const plain = (seed: string, components: Record<string, unknown>, extra: Record<string, unknown> = {}): ActorDoc =>
  normal({ id: actorId(seed), name: seed, class: null, parent: null, transform: IDENTITY, components, ...extra });
const car = (seed: string, overrides: Record<string, unknown> = {}): ActorDoc =>
  normal({ id: actorId(seed), name: seed, class: CAR_CLASS_ID, parent: null, transform: IDENTITY, overrides });
const target = (doc: ActorDoc) => detailsTarget(doc, OPTIONS.resolveClass);

describe("what Details shows", () => {
  test("several actors share the components with the same id and type; differing leaves are mixed", () => {
    const a = plain("a", { driver: { type: "test.driver@1", targetSpeed: 10 }, box: { type: "test.collider@1", parent: null, local: IDENTITY, size: [1, 2, 3] } });
    const b = plain("b", { driver: { type: "test.driver@1", targetSpeed: 20 }, box: { type: "test.collider@1", parent: null, local: IDENTITY, size: [1, 5, 3] } });
    const c = plain("c", { driver: { type: "test.driver@1", targetSpeed: 20 } });
    const two = componentSections([target(a), target(b)], OPTIONS.registry);
    expect(two.map((section) => section.id)).toEqual(["driver", "box"]);
    expect([...two[0]!.mixed]).toEqual(["targetSpeed"]);
    expect([...two[1]!.mixed]).toEqual(["size", "size[1]"]);
    expect(two[1]!.fields.map((field) => field.key)).toEqual(["local", "size"]);
    expect(componentSections([target(a), target(c)], OPTIONS.registry).map((section) => section.id)).toEqual(["driver"]);
    expect([...mixedPaths([{ t: { p: [1, 2, 3] } }, { t: { p: [1, 2, 4] } }])]).toEqual(["t", "t.p", "t.p[2]"]);
  });

  test("a class actor shows its effective values; its overridden fields are marked", () => {
    const tuned = car("a", { driver: { targetSpeed: 30 } });
    const sections = componentSections([target(tuned), target(car("b"))], OPTIONS.registry);
    const driver = sections.find((section) => section.id === "driver")!;
    expect(driver.fromClass).toBe(true);
    expect(driver.value.targetSpeed).toBe(30);
    expect([...driver.overridden]).toEqual(["targetSpeed"]);
    expect([...driver.mixed]).toEqual(["targetSpeed"]);
  });
});

describe("how Details edits land", () => {
  test("a plain actor's field is written in place; a class actor's becomes an override, dropped again when equal to the class", () => {
    const a = plain("a", { driver: { type: "test.driver@1", targetSpeed: 10 } });
    expect(editComponent(target(a), "driver", ["targetSpeed"], 12)).toMatchObject({ components: { driver: { targetSpeed: 12 } } });
    const tuned = editComponent(target(car("b")), "chassis", ["size", 1], 2);
    expect(tuned.class === null ? null : tuned.overrides.chassis).toEqual({ type: "test.collider@1", size: [2.08, 2, 4.08] });
    const back = normal(editComponent(target(normal(tuned)), "chassis", ["size", 1], 1.52));
    expect(back.class === null ? null : back.overrides).toEqual({});
  });

  test("reset takes one override or all of a component's away", () => {
    const tuned = car("a", { driver: { targetSpeed: 30 }, chassis: { size: [1, 1, 1], local: { p: [0, 2, 0] } } });
    const one = resetOverride(tuned, "chassis", "size");
    expect(one.class === null ? null : Object.keys(one.overrides.chassis!)).toEqual(["type", "local"]);
    const all = resetOverride(tuned, "driver", null);
    expect(all.class === null ? null : Object.keys(all.overrides)).toEqual(["chassis"]);
    expect(resetOverride(resetOverride(one, "chassis", "local"), "driver", "targetSpeed")).toMatchObject({ overrides: {} });
  });

  test("an actor field is a leaf edit; a rotation axis keeps the other two", () => {
    const a = plain("a", {}, { transform: { p: [1, 2, 3], r: [0, 0, 0, 1], s: [1, 1, 1] } });
    expect(editActor(a, ["transform", "p", 1], 9).transform.p).toEqual([1, 9, 3]);
    const turned = withRotationAxis(withRotationAxis(a.transform, 1, 90), 0, 30);
    const back = withRotationAxis(turned, 0, 0);
    expect(back.r.map((value) => Number(value.toFixed(6)))).toEqual([0, Number(Math.SQRT1_2.toFixed(6)), 0, Number(Math.SQRT1_2.toFixed(6))]);
  });
});

describe("adding and removing components (plain actors)", () => {
  test("a new component is at its defaults with a free local id; a spatial one at the actor's root", () => {
    const a = plain("a", { driver: { type: "test.driver@1" } });
    const more = addComponent(addComponent(a, Driver), Collider);
    expect(more.class === null ? Object.keys(more.components) : []).toEqual(["driver", "driver2", "collider"]);
    expect(more).toMatchObject({ components: { driver2: { type: "test.driver@1", targetSpeed: 14 }, collider: { parent: null, local: IDENTITY, size: [1, 1, 1] } } });
    expect(normalizeActorDoc(more, OPTIONS).issues).toEqual([]);
  });

  test("a singleton goes to a level without one; a class actor takes none", () => {
    const fogged = plain("d", { fog: { type: "test.fog@2" } });
    const other = plain("e", {});
    expect(cannotAdd(other, Fog, [fogged, other], OPTIONS.resolveClass)).toMatch(/one per level/);
    expect(cannotAdd(other, Fog, [other], OPTIONS.resolveClass)).toBeNull();
    expect(cannotAdd(other, Driver, [car("c")], OPTIONS.resolveClass)).toBeNull();
    expect(cannotAdd(car("c"), Driver, [], OPTIONS.resolveClass)).toMatch(/class/);
  });

  test("removing a component moves its spatial children to its parent", () => {
    const a = plain("a", {
      frame: { type: "test.collider@1", parent: null, local: IDENTITY },
      body: { type: "test.staticMesh@1", parent: "frame", local: IDENTITY },
    });
    const removed = removeComponent(a, "frame");
    expect(removed).toMatchObject({ components: { body: { parent: null } } });
    expect(normalizeActorDoc(removed, OPTIONS).issues).toEqual([]);
  });

  test("an edit of several actors through the session is one undo step", () => {
    const docs = [plain("a", { driver: { type: "test.driver@1", targetSpeed: 1 } }), plain("b", { driver: { type: "test.driver@1", targetSpeed: 2 } })];
    const level = { schema: "forge.level/1", id: levelId("1"), settings: { cellSize: 128 }, actors: docs.map((doc) => ({ ...doc, spatiallyLoaded: false })) } as LevelDoc;
    const session = openLevelSession({ folder: "content/levels/x", persistent: level, persistentRevision: null, index: null }, OPTIONS);
    for (const speed of [5, 6, 7]) {
      session.edit("Drag", (tx) => {
        for (const id of [actorId("a"), actorId("b")]) tx.setActor(editComponent(target(session.actor(id)!), "driver", ["targetSpeed"], speed));
      }, { coalesce: "details:a,b:driver:targetSpeed" });
    }
    session.history.seal();
    expect(session.history.undoStack).toHaveLength(1);
    session.undo();
    expect([actorId("a"), actorId("b")].map((id) => (session.actor(id) as unknown as { components: { driver: { targetSpeed: number } } }).components.driver.targetSpeed)).toEqual([1, 2]);
  });
});
