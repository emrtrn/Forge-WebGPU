import { afterEach, expect, test as check } from "vitest";
import { createSchemaRegistry, defineComponent, defineFeature, installFeatures, num } from "../../core/index.ts";
import { actorId } from "../../core/level/testKit.ts";
import { BehaviorDefinitionsKey, defineBehavior } from "../../engine/behavior/worldBehavior.ts";
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

function openLevel() {
  const features = [fixtureFeature, behaviorFeature, inputFeature, timeFeature];
  const registry = createSchemaRegistry();
  installFeatures(features, registry);
  const scene = world = createWorld({ features, registry, strict: true, resolveClass: () => undefined });
  let actions!: ActionMap;
  scene.services.provide(InputHostKey, (map) => {
    actions = map;
    return { poll: () => [0, 0], setPointerLock() {}, setTouchEnabled() {}, dispose() {} };
  });
  scene.services.provide(BehaviorDefinitionsKey, new Map([[spin.id, spin], [move.id, move]]));
  scene.init();
  const actors = scene.context.spawnActors([
    { id: actorId("a"), name: "Spin", components: { behavior: { type: "forge.behavior@1", script: spin.id }, params: { type: "test.rotationRate@1" } } },
    { id: actorId("b"), name: "Move", components: { behavior: { type: "forge.behavior@1", script: move.id } } },
    { id: actorId("c"), name: "Inert", transform: { p: [9, 9, 9] }, components: {} },
  ]);
  scene.beginPlay();
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
