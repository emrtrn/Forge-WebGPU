import { describe, expect, test } from "vitest";
import { defineFeature, installFeatures } from "../feature.ts";
import type { ActorId, LevelId } from "../id.ts";
import type { ComponentMap } from "../level/model.ts";
import { defineComponent } from "../schema/component.ts";
import { array, bool, IDENTITY_TRANSFORM, num, object, SchemaDefinitionError, text, type Transform } from "../schema/fields.ts";
import { createContext } from "../schema/issues.ts";
import { persistFieldKeys } from "../schema/persist.ts";
import { createSchemaRegistry } from "../schema/registry.ts";
import { applyActorState, captureActorState, withComponentState } from "./actorState.ts";
import { consumeSaveForLoadedLevel, normalizeSaveGame, SAVE_GAME_SCHEMA, type SaveGameDoc } from "./saveGame.ts";
import { SaveLedger } from "./saveLedger.ts";
import { defineSaveState } from "./saveState.ts";

const LEVEL = `lvl_${"1".repeat(32)}` as LevelId;
const OTHER_LEVEL = `lvl_${"2".repeat(32)}` as LevelId;
const DOOR_ACTOR = `act_${"a".repeat(32)}` as ActorId;
const CAR_ACTOR = `act_${"b".repeat(32)}` as ActorId;
const SPAWNED_ACTOR = `act_${"c".repeat(32)}` as ActorId;

const Door = defineComponent(
  "test.door",
  2,
  {
    open: bool({ default: false, persist: true }),
    // Authored only: a save never carries it.
    sign: text({ default: "" }),
    // Renamed from `locked` in version 2; the step sees partial data.
    sealed: bool({ default: false, persist: true }),
  },
  { migrations: { 1: ({ locked, ...rest }) => (locked === undefined ? rest : { ...rest, sealed: locked }) } },
);

const Car = defineComponent(
  "test.car",
  1,
  { mass: num({ min: 1, default: 1200 }) },
  {
    persistTransform: true,
    state: { gear: num({ min: -1, max: 6, step: 1, default: 1 }), dents: array(num({ default: 0 })) },
  },
);

const Progress = defineSaveState("test.progress", 2, {
  balance: num({ min: 0, default: 0 }),
  visited: array(text()),
}, { migrations: { 1: ({ coins, ...rest }) => (coins === undefined ? rest : { ...rest, balance: coins }) } });

function registry() {
  const registry = createSchemaRegistry();
  installFeatures([defineFeature({ id: "test.save", components: [Door, Car], saveStates: [Progress] })], registry);
  return registry;
}

const options = (strict = false) => ({ strict, registry: registry(), resolveClass: () => undefined });

const moved: Transform = { p: [4, 0, 2], r: [0, 0, 0, 1], s: [1, 1, 1] };

describe("the persist flag and the state section", () => {
  test("a component lists its persist fields and keeps its state apart from its fields", () => {
    expect(persistFieldKeys(Door.fields)).toEqual(["open", "sealed"]);
    expect(Object.keys(Car.state)).toEqual(["gear", "dents"]);
    expect(Car.persistTransform).toBe(true);
    expect(Door).toMatchObject({ state: {}, persistTransform: false });
    expect(Object.isFrozen(Car.state)).toBe(true);
  });

  test("the flag only on top-level fields; state keys are their own and saved whole", () => {
    expect(() => defineComponent("test.bad", 1, { group: object({ inner: bool({ default: false, persist: true }) }) }))
      .toThrow(SchemaDefinitionError);
    expect(() => defineComponent("test.bad", 1, { list: array(num({ default: 0, persist: true })) })).toThrow(/top-level/);
    expect(() => defineComponent("test.bad", 1, { gear: num({ default: 0 }) }, { state: { gear: num({ default: 0 }) } }))
      .toThrow(/already a field/);
    expect(() => defineComponent("test.bad", 1, {}, { state: { local: num({ default: 0 }) } })).toThrow(/already a field/);
    expect(() => defineComponent("test.bad", 1, {}, { state: { gear: num({ default: 0, persist: true }) } })).toThrow(/saved as a whole/);
    expect(() => defineComponent("test.bad", 1, {}, { state: { gear: num({ min: 0, default: -1 }) } })).toThrow(SchemaDefinitionError);
  });

  test("a save state is a namespaced, versioned schema registered once through a feature", () => {
    expect(Progress).toMatchObject({ kind: "saveState", name: "test.progress", version: 2, label: "Progress" });
    expect(() => defineSaveState("progress", 1, {})).toThrow(/namespaced/);
    expect(() => defineSaveState("test.x", 0, {})).toThrow(/version/);
    expect(() => defineSaveState("test.x", 1, { type: text() })).toThrow(/stamp/);
    expect(() => defineSaveState("test.x", 1, { coins: num({ default: 0, persist: true }) })).toThrow(/saved as a whole/);
    const twice = registry();
    expect(twice.getSaveState("test.progress")).toBe(Progress);
    expect(() => twice.registerSaveState(Progress)).toThrow(/already registered/);
    expect(() => defineFeature({ id: "test.dup", saveStates: [Progress, Progress] })).toThrow(/listed twice/);
  });
});

describe("forge.saveGame/1", () => {
  const raw = {
    schema: SAVE_GAME_SCHEMA,
    level: LEVEL,
    actors: {
      [DOOR_ACTOR]: { components: { front: { type: "test.door@1", open: true, locked: true, sign: "Exit" } } },
      [CAR_ACTOR]: { transform: moved, components: { body: { type: "test.car@1", gear: 3, mass: 900 } } },
    },
    removed: [CAR_ACTOR, DOOR_ACTOR, CAR_ACTOR],
    spawned: [{ id: SPAWNED_ACTOR, name: "Crate", transform: moved, components: { door: { type: "test.door@2" } } }],
    states: { "test.progress": { type: "test.progress@1", coins: 40 } },
  };

  test("keys by GUID, keeps only persist fields and state, migrates older stamps, canonical order", () => {
    const result = normalizeSaveGame(raw, options());
    const doc = result.value!;
    expect(Object.keys(doc.actors)).toEqual([DOOR_ACTOR, CAR_ACTOR]);
    expect(doc.actors[DOOR_ACTOR]).toEqual({ components: { front: { type: "test.door@2", open: true, sealed: true } } });
    expect(doc.actors[CAR_ACTOR]).toEqual({ transform: moved, components: { body: { type: "test.car@1", gear: 3 } } });
    expect(doc.removed).toEqual([DOOR_ACTOR, CAR_ACTOR]);
    expect(doc.spawned.map((actor) => actor.id)).toEqual([SPAWNED_ACTOR]);
    expect(doc.states).toEqual({ "test.progress": { type: "test.progress@2", balance: 40, visited: [] } });
    // The authored `sign` and `mass` are not save state: reported, dropped.
    expect(result.issues.map((issue) => `${issue.code} ${issue.path}`)).toEqual([
      `unknown-field actors.${DOOR_ACTOR}.components.front.sign`,
      `unknown-field actors.${CAR_ACTOR}.components.body.mass`,
    ]);
    expect(result.ok).toBe(true);
    expect(normalizeSaveGame(raw, options(true)).ok).toBe(false);
    // A written save reads back as itself.
    expect(normalizeSaveGame(JSON.parse(JSON.stringify(doc)), options(true))).toMatchObject({ value: doc, issues: [] });
  });

  test("what cannot be read is dropped one entry at a time, never the save", () => {
    const result = normalizeSaveGame({
      schema: SAVE_GAME_SCHEMA,
      level: LEVEL,
      actors: {
        "actor:3": { components: {} },
        [DOOR_ACTOR]: { components: { front: { type: "test.door@9", open: true }, gone: { type: "test.nothing@1", x: 1 } } },
        [CAR_ACTOR]: { components: { body: { type: "test.car@1", gear: "fifth" } } },
      },
      removed: ["act_short"],
      spawned: [{ id: SPAWNED_ACTOR, name: "A" }, { id: SPAWNED_ACTOR, name: "B" }],
      states: { "test.unknown": { type: "test.unknown@1" }, "test.progress": { type: "test.other@1" } },
      flags: { intro: true },
    }, options());
    expect(result.value).toMatchObject({ actors: {}, removed: [], states: {} });
    expect(result.value!.spawned.map((actor) => actor.name)).toEqual(["A"]);
    expect(result.issues.map((issue) => issue.code).sort()).toEqual([
      "duplicate-id",
      "invalid-value",
      "invalid-value",
      "invalid-value",
      "invalid-value",
      "unknown-component-type",
      "unknown-field",
      "unknown-save-state",
      "unsupported-version",
    ]);
  });

  test("a document that is not a save of a level is refused whole", () => {
    expect(normalizeSaveGame([], options()).value).toBeNull();
    expect(normalizeSaveGame({ schema: "forge.saveGame/2", level: LEVEL }, options()).value).toBeNull();
    expect(normalizeSaveGame({ schema: SAVE_GAME_SCHEMA, level: "Levels/A.level.json" }, options()).value).toBeNull();
  });

  test("a save restores into its own level only; another loaded level leaves it pending", () => {
    const save: SaveGameDoc = { schema: SAVE_GAME_SCHEMA, level: LEVEL, actors: {}, removed: [], spawned: [], states: {} };
    expect(consumeSaveForLoadedLevel(save, OTHER_LEVEL)).toEqual({ restore: null, pending: save });
    expect(consumeSaveForLoadedLevel(save, LEVEL)).toEqual({ restore: save, pending: null });
    expect(consumeSaveForLoadedLevel(null, LEVEL)).toEqual({ restore: null, pending: null });
  });
});

describe("capturing and applying an actor's state", () => {
  const authored = (): { transform: Transform; components: ComponentMap } => ({
    transform: IDENTITY_TRANSFORM,
    components: {
      front: { type: "test.door@2", open: false, sign: "Exit", sealed: false },
      body: { type: "test.car@1", mass: 1200 },
    },
  });

  test("an actor as authored saves nothing; run-time state starts at its defaults", () => {
    const reg = registry();
    const live = { transform: IDENTITY_TRANSFORM, components: withComponentState(authored().components, reg) };
    expect(live.components.body).toEqual({ type: "test.car@1", mass: 1200, gear: 1, dents: [] });
    expect(captureActorState(authored(), live, reg)).toBeNull();
  });

  test("a save keeps changed persist fields, changed state and a moved transform only", () => {
    const reg = registry();
    const live = { transform: moved, components: withComponentState(authored().components, reg) };
    Object.assign(live.components.front!, { open: true, sign: "Changed in play" });
    Object.assign(live.components.body!, { gear: -1, mass: 5 });
    expect(captureActorState(authored(), live, reg)).toEqual({
      transform: moved,
      components: { front: { type: "test.door@2", open: true }, body: { type: "test.car@1", gear: -1 } },
    });
    // Without a persistTransform component a moved actor keeps no transform.
    const doorOnly = { transform: IDENTITY_TRANSFORM, components: { front: authored().components.front! } };
    const movedDoor = { transform: moved, components: { front: { ...doorOnly.components.front, open: true } } };
    expect(captureActorState(doorOnly, movedDoor, reg)).toEqual({ components: { front: { type: "test.door@2", open: true } } });
  });

  test("capture, a written save and apply give the live actor back", () => {
    const reg = registry();
    const live = { transform: moved, components: withComponentState(authored().components, reg) };
    Object.assign(live.components.front!, { open: true, sealed: true });
    Object.assign(live.components.body!, { gear: 4, dents: [0.2, 0.1] });
    const saved = captureActorState(authored(), live, reg)!;
    const written = normalizeSaveGame(JSON.parse(JSON.stringify({
      schema: SAVE_GAME_SCHEMA, level: LEVEL, actors: { [DOOR_ACTOR]: saved },
    })), options(true)).value!;
    const ctx = createContext({ strict: true });
    expect(applyActorState(authored(), written.actors[DOOR_ACTOR], reg, "actors", ctx)).toEqual(live);
    expect(ctx.issues).toEqual([]);
  });

  test("an entry for a component the level no longer has, or has as another type, is dropped and reported", () => {
    const reg = registry();
    const ctx = createContext({ strict: false });
    const level = { transform: IDENTITY_TRANSFORM, components: { front: { type: "test.car@1", mass: 1200 } } as ComponentMap };
    const restored = applyActorState(level, {
      components: { front: { type: "test.door@2", open: true }, back: { type: "test.door@2", open: true } },
    }, reg, "actors.x", ctx);
    expect(restored.components).toEqual({ front: { type: "test.car@1", mass: 1200, gear: 1, dents: [] } });
    expect(ctx.issues.map((issue) => `${issue.code} ${issue.path}`)).toEqual([
      "invalid-override actors.x.components.front",
      "invalid-override actors.x.components.back",
    ]);
  });
});

describe("the save ledger", () => {
  const door = { components: { front: { type: "test.door@2" as const, open: true } } };

  test("an unloaded actor's state comes back once when its cell loads; null forgets it", () => {
    const ledger = new SaveLedger(LEVEL);
    ledger.remember(DOOR_ACTOR, door);
    expect(ledger.has(DOOR_ACTOR)).toBe(true);
    expect(ledger.take(DOOR_ACTOR)).toEqual(door);
    expect(ledger.take(DOOR_ACTOR)).toBeUndefined();
    ledger.remember(DOOR_ACTOR, door);
    ledger.remember(DOOR_ACTOR, null);
    expect(ledger.has(DOOR_ACTOR)).toBe(false);
  });

  test("the document holds the ledger and the loaded actors, loaded ones winning, removed ones out", () => {
    const ledger = new SaveLedger(LEVEL);
    ledger.remember(DOOR_ACTOR, door);
    ledger.remember(CAR_ACTOR, { transform: moved, components: {} });
    ledger.markRemoved(CAR_ACTOR);
    ledger.setState({ type: "test.progress@2", balance: 7, visited: ["a"] });
    const spawned = { id: SPAWNED_ACTOR, name: "Crate", class: null, parent: null, spatiallyLoaded: true, transform: moved, components: {} } as const;
    const doc = ledger.toDocument(new Map([[DOOR_ACTOR, null]]), [spawned]);
    expect(doc).toEqual({
      schema: SAVE_GAME_SCHEMA,
      level: LEVEL,
      actors: {},
      removed: [CAR_ACTOR],
      spawned: [spawned],
      states: { "test.progress": { type: "test.progress@2", balance: 7, visited: ["a"] } },
    });
    const reread = new SaveLedger(LEVEL, normalizeSaveGame(JSON.parse(JSON.stringify(doc)), options(true)).value);
    expect(reread.isRemoved(CAR_ACTOR)).toBe(true);
    expect(reread.getState("test.progress")).toEqual({ type: "test.progress@2", balance: 7, visited: ["a"] });
    expect(reread.spawnedActors()).toEqual([spawned]);
    expect(() => new SaveLedger(OTHER_LEVEL, doc)).toThrow(/not lvl_2/);
  });
});
