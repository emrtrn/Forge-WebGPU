// Ported from Forge WebGL tools/engine-tests.ts @ forge-webgl-final (04b5fb23): each check is
// copied unchanged and runs as a Vitest test; docs/PORT_LOG.md §2.
import assert from "node:assert/strict";
import { BehaviorSubsystem } from "./behaviorSubsystem.ts";
import { type BehaviorRegistry } from "./behaviorTypes.ts";
import { type Entity } from "../legacy/entity.ts";
import { EngineApp } from "../testing/EngineApp.ts";
import { ActionMap } from "../input/actionMap.ts";
import { InputSubsystem } from "../input/inputSubsystem.ts";
import { test } from "vitest";

const check = test;

// 6.1.4 The behavior subsystem ticks behaviors against a derived entity set,
// mutating each entity's transform deterministically and syncing it out. Input
// advances first (registered before), so a behavior reads current-tick actions.
check("behavior subsystem ticks behaviors and mutates transforms deterministically", () => {
  const synced: Array<{ id: string; rotationY: number; x: number }> = [];
  const registry: BehaviorRegistry = {
    get: (scriptId) => {
      if (scriptId === "spin") {
        return ({ engine, params, transform }) => {
          const speed = typeof params.speedDeg === "number" ? params.speedDeg : 0;
          transform.rotation[1] += speed * engine.deltaSeconds;
        };
      }
      if (scriptId === "input-move") {
        return ({ engine, actions, transform }) => {
          if (actions.held("move-right")) transform.position[0] += 2 * engine.deltaSeconds;
        };
      }
      return undefined;
    },
  };

  const actions = new ActionMap({ KeyD: "move-right" });
  const subsystem = new BehaviorSubsystem(registry, actions, (id, transform) => {
    synced.push({ id, rotationY: transform.rotation[1], x: transform.position[0] });
  });

  const spinEntity: Entity = {
    id: "character:0",
    components: {
      Transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      Behavior: { scriptId: "spin", params: { speedDeg: 90 } },
    },
  };
  const moveEntity: Entity = {
    id: "character:1",
    components: {
      Transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      Behavior: { scriptId: "input-move" },
    },
  };
  // No behavior -> ignored; an unknown script id would also be ignored.
  const inertEntity: Entity = {
    id: "character:2",
    components: { Transform: { position: [9, 9, 9], rotation: [0, 0, 0], scale: [1, 1, 1] } },
  };

  subsystem.setEntities([spinEntity, moveEntity, inertEntity]);

  const app = new EngineApp();
  app.registerSubsystem(new InputSubsystem(actions));
  app.registerSubsystem(subsystem);

  // Tick 1: 0.5s, no input -> spin advances 45deg, move stays put.
  app.update(0.5);
  // Tick 2: hold move-right for 0.5s -> spin advances another 45deg, move +1.0.
  actions.handleDown("KeyD");
  app.update(0.5);

  assert.equal(synced.length, 4); // 2 behaviored entities x 2 ticks (inert excluded)
  assert.equal(synced.filter((s) => s.id === "character:0").at(-1)?.rotationY, 90);
  assert.equal(synced.filter((s) => s.id === "character:1").at(-1)?.x, 1);
});

// A disabled behavior subsystem holds the scene static: no behavior runs and no
// transform is synced, even with entities and held input. This is how the editor
// keeps WASD from driving the character in edit mode; re-enabling resumes ticking.
check("behavior subsystem: setEnabled(false) suppresses ticking until re-enabled", () => {
  const synced: string[] = [];
  const registry: BehaviorRegistry = {
    get: (scriptId) =>
      scriptId === "input-move"
        ? ({ engine, actions, transform }) => {
            if (actions.held("move-right")) transform.position[0] += 2 * engine.deltaSeconds;
          }
        : undefined,
  };
  const actions = new ActionMap({ KeyD: "move-right" });
  const subsystem = new BehaviorSubsystem(registry, actions, (_id, transform) => {
    synced.push(String(transform.position[0]));
  });
  subsystem.setEntities([
    {
      id: "character:0",
      components: {
        Transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        Behavior: { scriptId: "input-move" },
      },
    },
  ]);
  actions.handleDown("KeyD");
  const app = new EngineApp();
  app.registerSubsystem(new InputSubsystem(actions));
  app.registerSubsystem(subsystem);

  subsystem.setEnabled(false);
  app.update(0.5);
  assert.deepEqual(synced, []);

  subsystem.setEnabled(true);
  app.update(0.5);
  assert.deepEqual(synced, ["1"]);
});
