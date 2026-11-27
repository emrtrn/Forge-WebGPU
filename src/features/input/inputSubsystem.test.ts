import { expect, test as check } from "vitest";
import { createSchemaRegistry, installFeatures } from "../../core/index.ts";
import { InputHostKey, InputServiceKey } from "../../engine/input/inputService.ts";
import type { ActionMap } from "../../engine/input/actionMap.ts";
import { createWorld } from "../../runtime/world.ts";
import inputFeature from "./feature.ts";

check("input subsystem maps raw codes to named action edges per tick", () => {
  const features = [inputFeature];
  const registry = createSchemaRegistry();
  installFeatures(features, registry);
  const world = createWorld({ features, registry, strict: true, resolveClass: () => undefined });
  let actions!: ActionMap;
  world.services.provide(InputHostKey, (map) => {
    actions = map;
    return { poll: () => [0, 0], setPointerLock() {}, setTouchEnabled() {}, dispose() {} };
  });
  world.init();
  world.beginPlay();
  const input = world.services.require(InputServiceKey);
  const current = () => input.get("move-forward");
  const idle = { pressed: false, held: false, released: false };
  try {
    world.tick(0.016);
    expect(current()).toEqual(idle);
    actions.handleDown("KeyW");
    world.tick(0.016);
    expect(current()).toEqual({ pressed: true, held: true, released: false });
    world.tick(0.016);
    expect(current()).toEqual({ pressed: false, held: true, released: false });
    actions.handleDown("ArrowUp");
    actions.handleUp("KeyW");
    world.tick(0.016);
    expect(current()).toEqual({ pressed: false, held: true, released: false });
    actions.handleUp("ArrowUp");
    world.tick(0.016);
    expect(current()).toEqual({ pressed: false, held: false, released: true });
    world.tick(0.016);
    expect(current()).toEqual(idle);
    actions.handleDown("KeyX");
    world.tick(0.016);
    expect(current()).toEqual(idle);
  } finally {
    world.dispose();
  }
});
