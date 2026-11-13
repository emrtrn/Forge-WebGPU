import { describe, expect, test } from "vitest";
import {
  createServiceKey,
  defineFeature,
  defineSubsystem,
  normalizeLevel,
  type ActorDoc,
  type SubsystemContext,
  type TickGroup,
  type WorldActor,
} from "../core/index.ts";
import { actorId, CAR_CLASS_ID, createOptions, levelId, summary } from "../core/level/testKit.ts";
import { createWorld, MAX_TICK_SECONDS, WorldError, type World } from "./world.ts";

const OPTIONS = createOptions(true);

function docs(raw: unknown[]): ActorDoc[] {
  const result = normalizeLevel({ schema: "forge.level/1", id: levelId("1"), actors: raw }, OPTIONS);
  expect(result.issues).toEqual([]);
  return result.value!.actors;
}

const names = (actors: readonly WorldActor[]) => actors.map((actor) => actor.name);

/** A subsystem that writes down every hook call. */
function recorder(id: string, log: string[], tickGroups: TickGroup[] = []) {
  return defineSubsystem({
    id,
    tickGroups,
    create: () => {
      log.push(`${id} init`);
      return {
        actorsAdded: (actors) => log.push(`${id} added ${names(actors).join(",")}`),
        actorsRemoved: (actors) => log.push(`${id} removed ${names(actors).join(",")}`),
        beginPlay: () => log.push(`${id} beginPlay`),
        tick: (group, dt) => log.push(`${id} ${group} ${dt}`),
        endPlay: (reason) => log.push(`${id} endPlay ${reason}`),
        dispose: () => log.push(`${id} dispose`),
      };
    },
  });
}

function world(features = [defineFeature({ id: "test.empty" })]): World {
  return createWorld({ ...OPTIONS, features });
}

describe("lifecycle", () => {
  test("hooks run in order; teardown runs backwards", () => {
    const log: string[] = [];
    const subject = world([
      defineFeature({ id: "test.a", subsystems: [recorder("test.a", log, ["physics"])] }),
      defineFeature({ id: "test.b", subsystems: [recorder("test.b", log, ["prePhysics", "renderSync"])] }),
    ]);
    subject.init();
    subject.addActors(docs([{ id: actorId("1"), name: "one" }, { id: actorId("2"), name: "two" }]), "level");
    subject.beginPlay();
    subject.tick(0.016);
    subject.dispose();
    expect(log).toEqual([
      "test.a init",
      "test.b init",
      "test.a added one,two",
      "test.b added one,two",
      "test.a beginPlay",
      "test.b beginPlay",
      "test.b prePhysics 0.016",
      "test.a physics 0.016",
      "test.b renderSync 0.016",
      "test.b endPlay stopped",
      "test.a endPlay stopped",
      "test.b dispose",
      "test.a dispose",
    ]);
    expect(subject.state).toBe("disposed");
  });

  test("calls out of order are refused", () => {
    const subject = world();
    expect(() => subject.tick(0.016)).toThrow(/created/);
    expect(() => subject.addActors([], "level")).toThrow(WorldError);
    expect(() => subject.beginPlay()).toThrow(WorldError);
    subject.init();
    expect(() => subject.init()).toThrow(WorldError);
    subject.beginPlay();
    subject.endPlay();
    expect(subject.state).toBe("ended");
    expect(() => subject.tick(0.016)).toThrow(/ended/);
    subject.dispose();
    subject.dispose(); // twice is fine
    expect(() => subject.addActors([], "level")).toThrow(/disposed/);
  });

  test("dt is clamped to [0, 0.1]; a non-finite dt is 0", () => {
    const log: string[] = [];
    const subject = world([defineFeature({ id: "test.a", subsystems: [recorder("test.a", log, ["physics"])] })]);
    subject.init();
    subject.beginPlay();
    for (const dt of [5, -1, Number.NaN, 0.05]) subject.tick(dt);
    expect(log.filter((line) => line.includes("physics"))).toEqual([
      `test.a physics ${MAX_TICK_SECONDS}`,
      "test.a physics 0",
      "test.a physics 0",
      "test.a physics 0.05",
    ]);
  });

  test("a subsystem installed twice is refused", () => {
    const shared = recorder("test.shared", []);
    expect(() => world([defineFeature({ id: "test.a", subsystems: [shared] }), defineFeature({ id: "test.b", subsystems: [shared] })])).toThrow(
      /installed twice/,
    );
  });
});

describe("actors", () => {
  test("components are the effective ones, copied; the index finds them by type", () => {
    const subject = world();
    subject.init();
    const [car] = subject.addActors(docs([{ id: actorId("1"), class: CAR_CLASS_ID, overrides: { driver: { targetSpeed: 30 } } }]), "level");
    expect(Object.keys(car!.components)).toEqual(["chassis", "body", "driver"]);
    expect(car!.components.driver).toMatchObject({ targetSpeed: 30 });
    const drivers = subject.context.componentsOf("test.driver");
    expect(drivers.map((entry) => [entry.key, entry.actor.id])).toEqual([["driver", actorId("1")]]);
    drivers[0]!.component.targetSpeed = 1;
    expect(OPTIONS.resolveClass(CAR_CLASS_ID)!.components.driver!.targetSpeed).toBe(14);
  });

  test("spawned actors take the same path; an invalid one is refused with its issues", () => {
    const log: string[] = [];
    const subject = world([defineFeature({ id: "test.a", subsystems: [recorder("test.a", log)] })]);
    subject.init();
    subject.beginPlay();
    const [spawned] = subject.context.spawnActors([{ id: actorId("5"), name: "five", components: { d: { type: "test.driver@1" } } }]);
    expect(spawned?.origin).toBe("spawned");
    expect(log).toContain("test.a added five");
    expect(subject.context.componentsOf("test.driver")).toHaveLength(1);
    try {
      subject.context.spawnActors([{ id: actorId("6"), layer: 1 }]);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(WorldError);
      expect(summary((error as WorldError).issues)).toEqual(["error unknown-field layer"]);
    }
  });

  test("removing an actor removes its children, at any depth, and only them", () => {
    const log: string[] = [];
    const subject = world([defineFeature({ id: "test.a", subsystems: [recorder("test.a", log)] })]);
    subject.init();
    subject.addActors(
      docs([
        { id: actorId("1"), name: "root" },
        { id: actorId("2"), name: "child", parent: actorId("1"), components: { d: { type: "test.driver@1" } } },
        { id: actorId("3"), name: "grandchild", parent: actorId("2") },
        { id: actorId("4"), name: "other" },
      ]),
      "level",
    );
    subject.context.destroyActors([actorId("1")]);
    expect(log.at(-1)).toBe("test.a removed root,child,grandchild");
    expect(names([...subject.context.actors()])).toEqual(["other"]);
    expect(subject.context.componentsOf("test.driver")).toEqual([]);
  });

  test("an id twice or a parent that is not there is refused", () => {
    const subject = world();
    subject.init();
    subject.addActors(docs([{ id: actorId("1") }]), "level");
    expect(() => subject.addActors(docs([{ id: actorId("1") }]), "level")).toThrow(/already in the world/);
    const orphan = { ...docs([{ id: actorId("2") }])[0]!, parent: actorId("9") };
    expect(() => subject.addActors([orphan], "level")).toThrow(/parent/);
  });

  test("a subsystem may spawn from a hook; the others hear about it before the call returns", () => {
    const log: string[] = [];
    const spawner = defineSubsystem({
      id: "test.spawner",
      tickGroups: ["prePhysics"],
      create: (ctx: SubsystemContext) => ({
        tick: () => {
          if (!ctx.actor(actorId("7"))) ctx.spawnActors([{ id: actorId("7"), name: "spawned" }]);
        },
      }),
    });
    const subject = world([
      defineFeature({ id: "test.s", subsystems: [spawner] }),
      defineFeature({ id: "test.a", subsystems: [recorder("test.a", log, ["physics"])] }),
    ]);
    subject.init();
    subject.beginPlay();
    subject.tick(0.01);
    expect(log.slice(-2)).toEqual(["test.a added spawned", "test.a physics 0.01"]);
  });
});

describe("isolation (A6)", () => {
  test("two worlds in one page share nothing; disposing one leaves the other running", () => {
    const Count = createServiceKey<{ n: number }>("test.count");
    const counter = defineSubsystem({
      id: "test.counter",
      tickGroups: ["physics"],
      create: (ctx) => {
        const state = { n: 0 };
        ctx.services.provide(Count, state);
        return { tick: () => (state.n += 1) };
      },
    });
    const features = [defineFeature({ id: "test.counting", subsystems: [counter] })];
    const first = world(features);
    const second = world(features);
    for (const subject of [first, second]) {
      subject.init();
      subject.addActors(docs([{ id: actorId("1"), name: "same id in both" }]), "level");
      subject.beginPlay();
    }
    first.tick(0.01);
    first.tick(0.01);
    second.tick(0.01);
    expect(first.services.require(Count).n).toBe(2);
    expect(second.services.require(Count).n).toBe(1);
    first.context.destroyActors([actorId("1")]);
    expect(second.context.actor(actorId("1"))).toBeDefined();
    first.dispose();
    second.tick(0.01);
    expect(second.services.require(Count).n).toBe(2);
    expect([...first.context.actors()]).toEqual([]);
    second.dispose();
  });
});

describe("the editor's world (plan phase 4; user decision 2026-11-13)", () => {
  test("installs only the subsystems marked inEditor", () => {
    const log: string[] = [];
    const editorSafe = defineSubsystem({ id: "test.look", inEditor: true, create: () => (log.push("look init"), {}) });
    const gameplay = defineSubsystem({ id: "test.physics", create: () => (log.push("physics init"), {}) });
    const features = [defineFeature({ id: "test.mixed", subsystems: [gameplay, editorSafe] })];
    const editorWorld = createWorld({ ...OPTIONS, features, mode: "editor" });
    editorWorld.init();
    expect(log).toEqual(["look init"]);
    log.length = 0;
    createWorld({ ...OPTIONS, features }).init();
    expect(log).toEqual(["physics init", "look init"]);
    expect(defineSubsystem({ id: "test.plain", create: () => ({}) }).inEditor).toBe(false);
  });
});

describe("updating actors (the editor's edits)", () => {
  const changes = (log: string[]) =>
    defineSubsystem({
      id: "test.changes",
      create: () => ({
        actorsChanged: (list) => log.push(`changed ${list.map((change) => `${change.actor.name}${change.transformOnly ? "(t)" : ""}${change.previous === change.actor ? "" : "*"}`).join(",")}`),
      }),
    });

  function edited(subject: World, id: string, patch: Record<string, unknown>): ActorDoc {
    const actor = subject.context.actor(actorId(id))!;
    return docs([{ id: actor.id, name: actor.name, parent: actor.parent, transform: actor.transform, components: actor.components, ...patch }])[0]!;
  }

  test("a moved actor changes in place; its descendants come along; unchanged documents are no change", () => {
    const log: string[] = [];
    const subject = world([defineFeature({ id: "test.c", subsystems: [changes(log)] })]);
    subject.init();
    subject.addActors(
      docs([
        { id: actorId("1"), name: "root" },
        { id: actorId("2"), name: "child", parent: actorId("1") },
        { id: actorId("3"), name: "grandchild", parent: actorId("2") },
        { id: actorId("4"), name: "other" },
      ]),
      "level",
    );
    const before = subject.context.actor(actorId("1"));
    const result = subject.updateActors([edited(subject, "1", { transform: { p: [1, 2, 3] } })]);
    expect(log).toEqual(["changed root(t),child(t),grandchild(t)"]);
    expect(result.map((change) => change.actor.name)).toEqual(["root", "child", "grandchild"]);
    expect(subject.context.actor(actorId("1"))).toBe(before);
    expect(before!.transform.p).toEqual([1, 2, 3]);
    expect(subject.updateActors([edited(subject, "4", {})])).toEqual([]);
    expect(log).toHaveLength(1);
  });

  test("a component edit replaces the actor object (keeping its place) and reindexes; previous is the old actor", () => {
    const log: string[] = [];
    const subject = world([defineFeature({ id: "test.c", subsystems: [changes(log)] })]);
    subject.init();
    subject.addActors(docs([{ id: actorId("1"), name: "a" }, { id: actorId("2"), name: "b" }]), "level");
    const old = subject.context.actor(actorId("1"))!;
    subject.updateActors([edited(subject, "1", { components: { d: { type: "test.driver@1", targetSpeed: 20 } } })]);
    expect(log).toEqual(["changed a*"]);
    const now = subject.context.actor(actorId("1"))!;
    expect(now).not.toBe(old);
    expect(names([...subject.context.actors()])).toEqual(["a", "b"]);
    expect(subject.context.componentsOf("test.driver").map((entry) => [entry.actor, entry.component.targetSpeed])).toEqual([[now, 20]]);
  });

  test("without actorsChanged a subsystem hears removed (previous) then added (now)", () => {
    const log: string[] = [];
    const subject = world([defineFeature({ id: "test.a", subsystems: [recorder("test.a", log)] })]);
    subject.init();
    subject.addActors(docs([{ id: actorId("1"), name: "a" }]), "level");
    log.length = 0;
    subject.updateActors([edited(subject, "1", { name: "renamed" })]);
    expect(log).toEqual(["test.a removed a", "test.a added renamed"]);
  });

  test("a missing actor, a missing parent or a cycle is refused", () => {
    const subject = world();
    subject.init();
    subject.addActors(docs([{ id: actorId("1"), name: "root" }, { id: actorId("2"), name: "child", parent: actorId("1") }]), "level");
    expect(() => subject.updateActors(docs([{ id: actorId("9") }]))).toThrow(/not in the world/);
    expect(() => subject.updateActors([{ ...edited(subject, "1", {}), parent: actorId("8") }])).toThrow(/parent/);
    expect(() => subject.updateActors([{ ...edited(subject, "1", {}), parent: actorId("2") }])).toThrow(/cycle/);
  });
});
