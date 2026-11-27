import { afterEach, expect, test as check } from "vitest";
import { createSchemaRegistry, defineComponent, defineFeature, installFeatures, num } from "../../core/index.ts";
import { actorId } from "../../core/level/testKit.ts";
import { BehaviorDefinitionsKey, defineBehavior, type BehaviorDefinition } from "../../engine/behavior/worldBehavior.ts";
import type { ActionMap } from "../../engine/input/actionMap.ts";
import { InputHostKey, InputServiceKey } from "../../engine/input/inputService.ts";
import { TimeControlKey } from "../../engine/time/timeControl.ts";
import { ActorMotionKey } from "../../engine/world/actorMotion.ts";
import { createWorld } from "../../runtime/world.ts";
import inputFeature from "../input/feature.ts";
import timeFeature from "../time/feature.ts";
import behaviorFeature from "./feature.ts";

const Spin = defineComponent("test.rotationRate", 1, { speedDeg: num({ default: 90 }) });
const fixtureFeature = defineFeature({ id: "test.actors", components: [Spin] });
const spin = defineBehavior({
  id: "test.spin",
  tick({ actor, deltaSeconds, world }) {
    const rate = actor.components.params!.speedDeg as number;
    const halfAngle = Math.asin(actor.transform.r[1]) + rate * deltaSeconds * Math.PI / 360;
    world.services.require(ActorMotionKey).setTransforms([{ actor: actor.id,
      transform: { ...actor.transform, r: [0, Math.sin(halfAngle), 0, Math.cos(halfAngle)] } }]);
  },
});
const move = defineBehavior({
  id: "test.inputMove",
  tick({ actor, deltaSeconds, world }) {
    const x = actor.transform.p[0] + (world.services.require(InputServiceKey).get("move-right").held ? 2 * deltaSeconds : 0);
    world.services.require(ActorMotionKey).setTransforms([{ actor: actor.id, transform: { ...actor.transform, p: [x, 0, 0] } }]);
  },
});

let world: ReturnType<typeof createWorld> | undefined;

function play(definitions: readonly BehaviorDefinition[], docs: readonly unknown[]) {
  const features = [fixtureFeature, behaviorFeature, inputFeature, timeFeature];
  const registry = createSchemaRegistry();
  installFeatures(features, registry);
  const scene = world = createWorld({ features, registry, strict: true, resolveClass: () => undefined });
  let actions!: ActionMap;
  scene.services.provide(InputHostKey, (map) => {
    actions = map;
    return { poll: () => [0, 0], setPointerLock() {}, setTouchEnabled() {}, dispose() {} };
  });
  scene.services.provide(BehaviorDefinitionsKey, new Map(definitions.map((entry) => [entry.id, entry])));
  scene.init();
  const actors = scene.context.spawnActors(docs);
  scene.beginPlay();
  return { scene, actions, actors };
}

function openLevel() {
  const { scene, actions, actors } = play([spin, move], [
    { id: actorId("a"), name: "Spin", components: { behavior: { type: "forge.behavior@1", script: spin.id }, params: { type: "test.rotationRate@1" } } },
    { id: actorId("b"), name: "Move", components: { behavior: { type: "forge.behavior@1", script: move.id } } },
    { id: actorId("c"), name: "Inert", transform: { p: [9, 9, 9] }, components: {} },
  ]);
  return { scene, actions, spinning: actors[0]!, moving: actors[1]!, inert: actors[2]! };
}

afterEach(() => world?.dispose());

check("behavior subsystem ticks behaviors and mutates transforms deterministically", () => {
  const { scene, actions, spinning, moving, inert } = openLevel();
  scene.tick(0.1);
  actions.handleDown("KeyD");
  scene.tick(0.1);
  expect(spinning.transform.r[1]).toBeCloseTo(Math.sin(Math.PI / 20));
  expect(moving.transform.p).toEqual([0.2, 0, 0]);
  expect(inert.transform.p).toEqual([9, 9, 9]);
});

check("behavior subsystem: setEnabled(false) suppresses ticking until re-enabled", () => {
  const { scene, actions, moving } = openLevel();
  const time = scene.services.require(TimeControlKey);
  actions.handleDown("KeyD");
  time.pause("test");
  scene.tick(0.1);
  expect(moving.transform.p).toEqual([0, 0, 0]);
  time.resume("test");
  scene.tick(0.1);
  expect(moving.transform.p).toEqual([0.2, 0, 0]);
});

check("actor command: setTickInterval throttles ticks and passes accumulated dt", () => {
  const deltas: number[] = [];
  const id = actorId("e");
  const behavior = defineBehavior({
    id: "test.interval",
    events: { beginPlay({ setTickInterval }) { setTickInterval(0.1); } },
    tick({ deltaSeconds }) { deltas.push(deltaSeconds); },
  });
  const actor = { id, name: "Timer", components: { behavior: { type: "forge.behavior@1", script: behavior.id } } };
  const { scene } = play([behavior], [actor]);
  scene.tick(0.04);
  scene.tick(0.04);
  expect(deltas).toEqual([]);
  scene.tick(0.04);
  expect(deltas).toHaveLength(1);
  expect(deltas[0]).toBeCloseTo(0.12);
  scene.tick(0.04);
  scene.tick(0.04);
  scene.context.destroyActors([id]);
  scene.context.spawnActors([actor]);
  scene.tick(0.04);
  expect(deltas).toHaveLength(1);
});

check("actor command: setTickEnabled gates the tick binding, re-enable resumes", () => {
  let ticks = 0;
  let elapsed = 0;
  const target = actorId("e");
  const counter = defineBehavior({
    id: "test.counter",
    events: { beginPlay({ setTickEnabled }) { setTickEnabled(false); } },
    messages: { enable: { target: "self", handle({ setTickEnabled }) { setTickEnabled(true); } } },
    tick() { ticks += 1; },
  });
  const sender = defineBehavior({
    id: "test.enabler",
    tick({ send, deltaSeconds }) {
      elapsed += deltaSeconds;
      if (elapsed > 0.03) send("enable", target);
    },
  });
  const { scene } = play([counter, sender], [
    { id: target, name: "Counter", components: { behavior: { type: "forge.behavior@1", script: counter.id } } },
    { id: actorId("f"), name: "Sender", components: { behavior: { type: "forge.behavior@1", script: sender.id } } },
  ]);
  scene.tick(0.016);
  scene.tick(0.016);
  expect(ticks).toBe(0);
  scene.tick(0.016);
  expect(ticks).toBe(1);
});

check("script timers: after delivers one self-targeted message", () => {
  const received: [string, unknown][] = [];
  let armed = false;
  const timer = defineBehavior({ id: "test.timer", tick({ timers }) {
    if (armed) return;
    armed = true;
    timers.after(0.05, "done", { value: 7 });
  } });
  const listener = defineBehavior({ id: "test.listener", messages: { done: {
    target: "self", handle({ actor }, { payload }) { received.push([actor.id, payload.value]); },
  } } });
  const origin = actorId("e");
  const { scene } = play([timer, listener], [
    { id: origin, name: "Origin", components: {
      timer: { type: "forge.behavior@1", script: timer.id }, listener: { type: "forge.behavior@1", script: listener.id },
    } },
    { id: actorId("f"), name: "Bystander", components: { listener: { type: "forge.behavior@1", script: listener.id } } },
  ]);
  scene.tick(0.02);
  scene.tick(0.02);
  expect(received).toEqual([]);
  scene.tick(0.03);
  scene.tick(0.1);
  expect(received).toEqual([[origin, 7]]);
});

check("script timers: clear prevents delivery and setEntities drops pending timers", () => {
  const id = actorId("e");
  let deliveries = 0;
  const behavior = defineBehavior({ id: "test.clearTimer", events: { beginPlay({ actor, timers }) {
    if (actor.name === "Replacement") return;
    const handle = timers.after(0.01, "done");
    if (actor.name === "Cleared") timers.clear(handle);
  } }, messages: { done: { target: "self", handle() { deliveries += 1; } } } });
  const actor = { id, name: "Cleared", components: { behavior: { type: "forge.behavior@1", script: behavior.id } } };
  const { scene } = play([behavior], [actor]);
  scene.tick(0.02);
  expect(deliveries).toBe(0);
  scene.context.destroyActors([id]);
  scene.context.spawnActors([{ ...actor, name: "Pending" }]);
  scene.tick(0.001);
  scene.context.destroyActors([id]);
  scene.context.spawnActors([{ ...actor, name: "Replacement" }]);
  scene.tick(0.02);
  expect(deliveries).toBe(0);
});

check("script timers: disabled subsystem does not advance timer time", () => {
  let delivered = false;
  let armed = false;
  const behavior = defineBehavior({ id: "test.pausedTimer", tick({ timers }) {
    if (armed) return;
    armed = true;
    timers.after(0.1, "done");
  }, messages: { done: { target: "self", handle() { delivered = true; } } } });
  const { scene } = play([behavior], [{ id: actorId("e"), name: "Timer",
    components: { behavior: { type: "forge.behavior@1", script: behavior.id } } }]);
  const time = scene.services.require(TimeControlKey);
  scene.tick(0.001);
  time.pause("test");
  for (let frame = 0; frame < 20; frame += 1) scene.tick(0.1);
  time.resume("test");
  scene.tick(0.09);
  expect(delivered).toBe(false);
  scene.tick(0.02);
  expect(delivered).toBe(true);
});

check("actor command: setLifeSpan destroys through the actor command sink", () => {
  let ticks = 0;
  const removed: string[] = [];
  const id = actorId("e");
  const behavior = defineBehavior({ id: "test.lifeSpan", tick({ setLifeSpan }) {
    ticks += 1;
    if (ticks === 1) setLifeSpan(0.05);
  }, events: { endPlay({ actor }, event) {
    if (event.kind === "endPlay" && event.reason === "removed") removed.push(actor.id);
  } } });
  const { scene } = play([behavior], [{ id, name: "Temporary actor",
    components: { behavior: { type: "forge.behavior@1", script: behavior.id } } }]);
  scene.tick(0.01);
  scene.tick(0.04);
  expect(scene.context.actor(id)).toBeDefined();
  scene.tick(0.02);
  scene.tick(0.1);
  expect(scene.context.actor(id)).toBeUndefined();
  expect(removed).toEqual([id]);
  expect(ticks).toBe(3);
});
