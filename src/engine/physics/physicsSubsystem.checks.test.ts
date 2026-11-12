// Ported from Forge WebGL tools/engine-tests.ts @ forge-webgl-final (04b5fb23): each check is
// copied unchanged and runs as a Vitest test; docs/PORT_LOG.md §2.
import assert from "node:assert/strict";
// The fixtures author Forge's EventBindings / MessageBindings (K12: not ported); the
// scaffold turns them into the code registration, check bodies unchanged.
import { ForgeBindingBehaviorSubsystem as BehaviorSubsystem } from "../testing/forgeBindings.ts";
import { type BehaviorRegistry } from "../behavior/behaviorTypes.ts";
import { ActionMap } from "../input/actionMap.ts";
import { type Entity } from "../legacy/entity.ts";
import { resolvePlanarMovement } from "../movement/characterCollision.ts";
import { EngineApp } from "../testing/EngineApp.ts";
import { terrainTileTrimesh } from "../testing/terrainTrimeshReference.ts";
import { PhysicsSubsystem } from "./physicsSubsystem.ts";
import { test } from "vitest";

const check = test;

check("behavior can react to physics contacts from the engine tick", () => {
  const physics = new PhysicsSubsystem();
  const registry: BehaviorRegistry = {
    get: (scriptId) => {
      if (scriptId !== "contact-react") return undefined;
      return ({ physics: physicsQuery, transform }) => {
        if ((physicsQuery?.contactsForEntity("mover").length ?? 0) > 0) {
          transform.position[2] = 7;
        }
      };
    },
  };
  const synced: Array<{ id: string; z: number }> = [];
  const behavior = new BehaviorSubsystem(
    registry,
    new ActionMap({}),
    (id, transform) => synced.push({ id, z: transform.position[2] }),
    physics,
  );
  const entities: Entity[] = [
    {
      id: "mover",
      components: {
        Transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        Collider: { shape: "box", size: [1, 1, 1], isStatic: false, isSensor: false },
        Behavior: { scriptId: "contact-react" },
      },
    },
    {
      id: "sensor",
      components: {
        Transform: { position: [0.25, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        Collider: { shape: "box", size: [1, 1, 1], isStatic: true, isSensor: true },
      },
    },
  ];

  physics.setEntities(entities);
  behavior.setEntities(entities);

  const app = new EngineApp();
  app.registerSubsystem(physics);
  app.registerSubsystem(behavior);
  app.update(0.016);

  assert.deepEqual(physics.contactsForEntity("mover"), [
    { a: "mover", b: "sensor", isSensor: true },
  ]);
  assert.deepEqual(synced.at(-1), { id: "mover", z: 7 });
});

check("physics subsystem gives steep trimesh triangle blockers a tight XZ footprint", () => {
  const physics = new PhysicsSubsystem();
  physics.setEntities([
    {
      id: "rotated-trimesh-wall",
      components: {
        Transform: { position: [0, 0, 0], rotation: [0, 45, 0], scale: [1, 1, 1] },
        Collider: {
          shape: "box",
          size: [4, 3, 0.2],
          isStatic: true,
          isSensor: false,
          primitives: [
            {
              shape: "trimesh",
              size: [4, 3, 0.2],
              vertices: [
                [-2, 0, 0],
                [2, 0, 0],
                [-2, 3, 0],
              ],
              indices: [0, 1, 2],
            },
          ],
        },
      },
    },
  ]);
  const blockers = physics.staticBlockerAabbs();
  assert.equal(blockers.length, 1);
  assert.ok(blockers[0]?.footprint && blockers[0].footprint.length === 2, "vertical triangle projects to a segment");
  const moved = resolvePlanarMovement([1.7, 0, 0.8], { dx: -0.4, dz: 0 }, [0.1, 0.5, 0.1], blockers);
  assert.ok(Math.abs(moved.dx + 0.4) < 1e-9, `dx=${moved.dx}`);
});

// A1 DestroyActor: a destroyed entity leaves the behavior set the same tick — it no
// longer ticks, its physics body is gone (contacts read empty), and its message
// subscriptions are dropped (a later send never reaches it).
check("actor command: destroy cuts subsequent ticks, contacts and messages", () => {
  let ticks = 0;
  let pings = 0;
  const registry: BehaviorRegistry = {
    get: (scriptId) => {
      if (scriptId === "self-destruct") {
        return (context) => {
          ticks += 1;
          context.actor.destroy();
        };
      }
      if (scriptId === "on-ping") {
        return () => {
          pings += 1;
        };
      }
      return undefined;
    },
  };
  const physics = new PhysicsSubsystem();
  const actor: Entity = {
    id: "actor:0",
    components: {
      Transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      Collider: { shape: "box", size: [1, 1, 1], isStatic: true, isSensor: true },
      Behavior: { scriptId: "self-destruct", params: {} },
      MessageBindings: { bindings: [{ message: "Ping", scriptId: "on-ping", target: "self" }] },
    },
  };
  const player: Entity = {
    id: "player:0",
    components: {
      Transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      Collider: { shape: "box", size: [1, 1, 1], isStatic: false, isSensor: false },
    },
  };
  physics.setEntities([actor, player]);
  const behavior = new BehaviorSubsystem(
    registry,
    new ActionMap({}),
    () => undefined,
    physics,
    undefined,
    {
      // The host sink removes the physics body so contact queries read empty.
      actorCommandSink: {
        setVisibility: () => undefined,
        destroy: (id) => physics.removeEntity(id),
      },
    },
  );
  behavior.setEntities([actor, player]);
  const app = new EngineApp();
  app.registerSubsystem(physics);
  app.registerSubsystem(behavior);

  // Overlapping the player: before destroy there is a contact; after the tick the
  // self-destruct fires and the host removes the body.
  app.update(0.016);
  assert.equal(ticks, 1);
  assert.deepEqual(physics.contactsForEntity("actor:0"), []);

  // A message aimed at the destroyed actor reaches no subscriber, and it never ticks again.
  behavior.emitScriptMessage("Ping", "player:0", undefined, "actor:0");
  app.update(0.016);
  assert.equal(ticks, 1);
  assert.equal(pings, 0);
});

check("landscape trimesh reference is centred and up-facing, and physics files its triangles as walkable surfaces", () => {
  const { primitive } = terrainTileTrimesh({ tileQuads: 2, spacing: 2, origin: [0, 0, 0] }, {
    x: 0, z: 0, size: 3, layerCount: 0, weights: new Uint8Array(0),
    heights: Float32Array.from([
      0, 0, 0,
      0, 1, 0,
      0, 0, 0,
    ]),
  });
  assert.equal(primitive.shape, "trimesh");
  assert.equal(primitive.vertices.length, 9);
  assert.equal(primitive.indices.length, 24);
  assert.deepEqual(primitive.vertices[0], [-2, 0, -2]);
  assert.deepEqual(primitive.vertices[4], [0, 1, 0]);
  assert.deepEqual(primitive.size, [4, 1, 4]);
  assert.deepEqual(primitive.center, [0, 0.5, 0]);
  assert.deepEqual(primitive.indices.slice(0, 6), [0, 3, 1, 1, 3, 4]);

  const physics = new PhysicsSubsystem();
  physics.setEntities([
    {
      id: "landscape:unit",
      components: {
        Transform: { position: [10, 2, -3], rotation: [0, 0, 0], scale: [1, 1, 1] },
        Collider: {
          shape: "box",
          size: primitive.size,
          center: primitive.center,
          isStatic: true,
          isSensor: false,
          navigationRole: "walkable",
          // @ts-expect-error Forge never type-checked its tests: a typed collider primitive is wider than the JSON component data (type-only).
          primitives: [primitive],
        },
      },
    },
  ]);
  assert.equal(physics.staticBlockerAabbs().length, 0, "walkable landscape triangles are not wall blockers");
  const surfaces = physics.staticSurfaceTriangles();
  assert.equal(surfaces.length, 8);
  assert.ok(surfaces.every((surface) => surface.normalY > 0.6), "landscape surfaces are up-facing");
  assert.equal(physics.staticNavigationSurfaceTriangles().length, 8);
});

check("physics subsystem spatially narrows static landscape surface candidates for ground probes", () => {
  const { primitive } = terrainTileTrimesh({ tileQuads: 8, spacing: 1, origin: [0, 0, 0] },
    { x: 0, z: 0, size: 9, layerCount: 0, weights: new Uint8Array(0), heights: new Float32Array(81) });
  const physics = new PhysicsSubsystem();
  physics.setEntities([
    {
      id: "landscape:spatial-index",
      components: {
        Transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        Collider: {
          shape: "box",
          size: primitive.size,
          // @ts-expect-error Forge never type-checked its tests: the reference primitive's optional centre is wider than the JSON component data (type-only).
          center: primitive.center,
          isStatic: true,
          isSensor: false,
          // @ts-expect-error Forge never type-checked its tests: a typed collider primitive is wider than the JSON component data (type-only).
          primitives: [primitive],
        },
      },
    },
  ]);
  const all = physics.staticSurfaceTriangles();
  const near = physics.staticSurfaceTrianglesNear(0, 0);
  assert.equal(all.length, 128);
  assert.ok(near.length > 0 && near.length < all.length, `near candidates=${near.length} all=${all.length}`);
  assert.equal(physics.staticSurfaceTrianglesNear(20, 20).length, 0, "outside the terrain has no candidates");
});
