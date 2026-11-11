// Ported from Forge WebGL tools/engine-tests.ts @ forge-webgl-final (04b5fb23): each check is
// copied unchanged and runs as a Vitest test; docs/PORT_LOG.md §2.
import assert from "node:assert/strict";
import { type ColliderComponent, type TransformComponent } from "../legacy/components.ts";
import { type Entity } from "../legacy/entity.ts";
import { type Vec3 } from "../legacy/layout.ts";
import { EngineApp } from "../testing/EngineApp.ts";
import { PhysicsSubsystem } from "./physicsSubsystem.ts";
import { NEUTRAL_VEHICLE_INPUT, createReferenceCarDefinition, type VehicleInput } from "./vehicle/vehicleTypes.ts";
import { test } from "vitest";

const check = test;
const checkAsync = test;

function fallingCrateEntity(position: Vec3 = [0, 5, 0]): Entity {
  return {
    id: "crate",
    components: {
      Transform: { position, rotation: [0, 0, 0], scale: [1, 1, 1] },
      Collider: {
        shape: "box",
        size: [1, 1, 1],
        isStatic: false,
        isSensor: false,
        simulatePhysics: true,
      },
    },
  };
}

async function withQuietRapierInit(run: () => Promise<void>): Promise<void> {
  const warn = console.warn;
  console.warn = (...args: unknown[]) => {
    if (String(args[0] ?? "").includes("deprecated parameters for the initialization function")) {
      return;
    }
    warn(...args);
  };
  try {
    await run();
  } finally {
    console.warn = warn;
  }
}

const VEHICLE_SLICE = 1 / 60;

async function createVehicleTestWorld(options: { slopeDeg?: number; groundSize?: number; fixedTimestep?: number } = {}) {
  const physics = new PhysicsSubsystem({ backend: "rapier", fixedTimestep: options.fixedTimestep });
  physics.setGravity([0, -9.81, 0]);
  let pose: TransformComponent | null = null;
  physics.setTransformSink((entityId, transform) => {
    if (entityId === "car") pose = transform;
  });
  const slope = options.slopeDeg ?? 0;
  const entities: Entity[] = [
    {
      id: "ground",
      components: {
        Transform: { position: [0, -0.5, 0], rotation: [-slope, 0, 0], scale: [1, 1, 1] },
        Collider: { shape: "box", size: [options.groundSize ?? 400, 1, options.groundSize ?? 400], isStatic: true, isSensor: false },
      },
    },
    {
      id: "car",
      components: {
        Transform: { position: [0, 1, 0], rotation: [-slope, 0, 0], scale: [1, 1, 1] },
        Collider: {
          shape: "box",
          size: [1.8, 0.6, 4.2],
          isStatic: false,
          isSensor: false,
          simulatePhysics: true,
        },
      },
    },
  ];
  physics.setEntities(entities);
  await physics.init();
  let frame = 0;
  const tick = (seconds: number): void => {
    const frames = Math.round(seconds / VEHICLE_SLICE);
    for (let index = 0; index < frames; index += 1) {
      frame += 1;
      physics.update({ deltaSeconds: VEHICLE_SLICE, elapsedSeconds: frame * VEHICLE_SLICE, frame });
    }
  };
  const position = (): Vec3 => {
    const current = pose as TransformComponent | null;
    return current ? [...current.position] : assert.fail("car pose not synced");
  };
  const drive = (patch: Partial<VehicleInput>): void =>
    physics.setVehicleInput("car", { ...NEUTRAL_VEHICLE_INPUT, ...patch });
  return { physics, entities, tick, position, drive };
}

const RAMP_NORMAL_Y = 8 / Math.hypot(4, 8, 0);

function assertAabbClose(
  actual: { min: readonly number[]; max: readonly number[] },
  expected: { min: readonly number[]; max: readonly number[] },
  eps = 1e-9,
): void {
  for (let i = 0; i < 3; i += 1) {
    assert.ok(
      Math.abs((actual.min[i] ?? NaN) - (expected.min[i] ?? NaN)) < eps,
      `min[${i}]=${actual.min[i]} expected ${expected.min[i]}`,
    );
    assert.ok(
      Math.abs((actual.max[i] ?? NaN) - (expected.max[i] ?? NaN)) < eps,
      `max[${i}]=${actual.max[i]} expected ${expected.max[i]}`,
    );
  }
}

const UNIT_CUBE_CORNERS: [number, number, number][] = [
  [-0.5, -0.5, -0.5],
  [0.5, -0.5, -0.5],
  [0.5, 0.5, -0.5],
  [-0.5, 0.5, -0.5],
  [-0.5, -0.5, 0.5],
  [0.5, -0.5, 0.5],
  [0.5, 0.5, 0.5],
  [-0.5, 0.5, 0.5],
];

check("physics subsystem reports deterministic placeholder contacts", () => {
  const physics = new PhysicsSubsystem();
  physics.setEntities([
    {
      id: "dynamic",
      components: {
        Transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        Collider: { shape: "box", size: [1, 1, 1], isStatic: false, isSensor: false },
      },
    },
    {
      id: "wall",
      components: {
        Transform: { position: [4, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        Collider: { shape: "box", size: [1, 1, 1], isStatic: true, isSensor: false },
      },
    },
  ]);

  const app = new EngineApp();
  app.registerSubsystem(physics);
  app.update(0.016);
  assert.deepEqual(physics.contactsForEntity("dynamic"), []);

  physics.setEntityTransform("dynamic", {
    position: [3.25, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  });
  app.update(0.016);
  assert.deepEqual(physics.contactsForEntity("dynamic"), [
    { a: "dynamic", b: "wall", isSensor: false },
  ]);
});

check("generateOverlapEvents=false suppresses sensor overlap contacts", () => {
  const physics = new PhysicsSubsystem();
  const mover = {
    id: "mover",
    components: {
      Transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      Collider: { shape: "box", size: [1, 1, 1], isStatic: false, isSensor: false },
    },
  } as const;
  physics.setEntities([
    // @ts-expect-error Forge never type-checked its tests: an `as const` fixture is readonly, Entity is not (type-only).
    mover,
    {
      id: "silent",
      components: {
        Transform: { position: [0.3, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        Collider: {
          shape: "box",
          size: [1, 1, 1],
          isStatic: true,
          isSensor: true,
          generateOverlapEvents: false,
        },
      },
    },
  ]);
  const app = new EngineApp();
  app.registerSubsystem(physics);
  app.update(0.016);
  assert.deepEqual(physics.contactsForEntity("mover"), []);

  // A sensor with events left on (default) still reports the overlap.
  physics.setEntities([
    // @ts-expect-error Forge never type-checked its tests: an `as const` fixture is readonly, Entity is not (type-only).
    mover,
    {
      id: "live",
      components: {
        Transform: { position: [0.3, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        Collider: { shape: "box", size: [1, 1, 1], isStatic: true, isSensor: true },
      },
    },
  ]);
  app.update(0.016);
  assert.deepEqual(physics.contactsForEntity("mover"), [
    { a: "mover", b: "live", isSensor: true },
  ]);
});

check("simulationGeneratesHitEvents=false on both bodies suppresses the hit", () => {
  const physics = new PhysicsSubsystem();
  physics.setEntities([
    {
      id: "a",
      components: {
        Transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        Collider: {
          shape: "box",
          size: [1, 1, 1],
          isStatic: false,
          isSensor: false,
          simulationGeneratesHitEvents: false,
        },
      },
    },
    {
      id: "b",
      components: {
        Transform: { position: [0.3, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        Collider: {
          shape: "box",
          size: [1, 1, 1],
          isStatic: true,
          isSensor: false,
          simulationGeneratesHitEvents: false,
        },
      },
    },
  ]);
  const app = new EngineApp();
  app.registerSubsystem(physics);
  app.update(0.016);
  assert.deepEqual(physics.contactsForEntity("a"), []);
});

await checkAsync("rapier physics backend reports contacts through the same contract", async () => {
  const physics = new PhysicsSubsystem({ backend: "rapier" });
  physics.setEntities([
    {
      id: "dynamic",
      components: {
        Transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        Collider: { shape: "box", size: [1, 1, 1], isStatic: false, isSensor: false },
      },
    },
    {
      id: "wall",
      components: {
        Transform: { position: [0.25, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        Collider: { shape: "box", size: [1, 1, 1], isStatic: true, isSensor: false },
      },
    },
  ]);

  const app = new EngineApp();
  app.registerSubsystem(physics);
  const warn = console.warn;
  console.warn = (...args: unknown[]) => {
    if (String(args[0] ?? "").includes("deprecated parameters for the initialization function")) {
      return;
    }
    warn(...args);
  };
  try {
    await app.init();
    assert.equal(physics.usesRapier(), true); // colliders present -> Rapier loaded
    app.update(0.016);
    assert.deepEqual(physics.contactsForEntity("dynamic"), [
      { a: "dynamic", b: "wall", isSensor: false },
    ]);
    await app.dispose();
  } finally {
    console.warn = warn;
  }
});

await checkAsync("rapier backend reports static sensor overlap with a kinematic player", async () => {
  const physics = new PhysicsSubsystem({ backend: "rapier" });
  physics.setEntities([
    {
      id: "actor:0",
      components: {
        Transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        Collider: { shape: "box", size: [1, 1, 1], isStatic: true, isSensor: true },
      },
    },
    {
      id: "character:0",
      components: {
        Transform: { position: [0.25, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        Collider: { shape: "box", size: [1, 1, 1], isStatic: false, isSensor: false },
      },
    },
  ]);

  const app = new EngineApp();
  app.registerSubsystem(physics);
  const warn = console.warn;
  console.warn = (...args: unknown[]) => {
    if (String(args[0] ?? "").includes("deprecated parameters for the initialization function")) {
      return;
    }
    warn(...args);
  };
  try {
    await app.init();
    assert.equal(physics.usesRapier(), true);
    app.update(0.016);
    assert.deepEqual(physics.contactsForEntity("actor:0"), [
      { a: "actor:0", b: "character:0", isSensor: true },
    ]);
    await app.dispose();
  } finally {
    console.warn = warn;
  }
});

await checkAsync("rapier simulatePhysics body falls under configured gravity", async () => {
  const physics = new PhysicsSubsystem({ backend: "rapier" });
  physics.setGravity([0, -10, 0]);
  const synced: TransformComponent[] = [];
  physics.setTransformSink((_entityId, transform) => {
    synced.push({
      position: [...transform.position],
      rotation: [...transform.rotation],
      scale: [...transform.scale],
    });
  });
  physics.setEntities([
    {
      id: "crate",
      components: {
        Transform: { position: [0, 5, 0], rotation: [0, 30, 0], scale: [1, 1, 1] },
        Collider: {
          shape: "box",
          size: [1, 1, 1],
          isStatic: false,
          isSensor: false,
          simulatePhysics: true,
        },
      },
    },
  ]);

  const app = new EngineApp();
  app.registerSubsystem(physics);
  const warn = console.warn;
  console.warn = (...args: unknown[]) => {
    if (String(args[0] ?? "").includes("deprecated parameters for the initialization function")) {
      return;
    }
    warn(...args);
  };
  try {
    await app.init();
    assert.equal(physics.usesRapier(), true);
    for (let frame = 0; frame < 12; frame += 1) app.update(1 / 60);
    assert.ok(synced.length > 0, "expected physics to sync dynamic transforms");
    const last = synced.at(-1) ?? assert.fail("synced");
    assert.ok(last.position[1] < 5);
    assert.ok(Math.abs(last.rotation[1] - 30) < 1e-3, `rotationY=${last.rotation[1]}`);
    await app.dispose();
  } finally {
    console.warn = warn;
  }
});

await checkAsync("rapier active area suspends distant dynamics and resumes them near focus", async () => {
  const physics = new PhysicsSubsystem({ backend: "rapier" });
  physics.setGravity([0, -10, 0]);
  let focus: [number, number, number] = [0, 0, 0];
  const synced: TransformComponent[] = [];
  physics.setTransformSink((_entityId, transform) => {
    synced.push({
      position: [...transform.position],
      rotation: [...transform.rotation],
      scale: [...transform.scale],
    });
  });
  physics.setDynamicActiveArea({ activeDistance: 10, focusPosition: () => focus });
  physics.setEntities([
    {
      id: "distant-crate",
      components: {
        Transform: { position: [100, 5, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        Collider: {
          shape: "box",
          size: [1, 1, 1],
          isStatic: false,
          isSensor: false,
          simulatePhysics: true,
        },
      },
    },
  ]);

  const app = new EngineApp();
  app.registerSubsystem(physics);
  const warn = console.warn;
  console.warn = (...args: unknown[]) => {
    if (String(args[0] ?? "").includes("deprecated parameters for the initialization function")) {
      return;
    }
    warn(...args);
  };
  try {
    await app.init();
    for (let frame = 0; frame < 12; frame += 1) app.update(1 / 60);
    assert.equal(synced.length, 0, "distant dynamic body should not synchronize while suspended");
    assert.equal(physics.isDynamicBodyActive("distant-crate"), false);

    focus = [100, 5, 0];
    for (let frame = 0; frame < 12; frame += 1) app.update(1 / 60);
    const last = synced.at(-1) ?? assert.fail("resumed dynamic body should synchronize");
    assert.ok(last.position[1] < 5, `resumed body should fall, y=${last.position[1]}`);
    assert.equal(physics.isDynamicBodyActive("distant-crate"), true);
    await app.dispose();
  } finally {
    console.warn = warn;
  }
});

await checkAsync("rapier builds a compound collider per authored primitive (gap is empty)", async () => {
  const physics = new PhysicsSubsystem({ backend: "rapier" });
  physics.setGravity([0, 0, 0]);
  physics.setEntities([
    {
      id: "compound",
      components: {
        Transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        Collider: {
          shape: "box",
          size: [1, 3, 1], // encompassing AABB spans the gap between the two boxes
          isStatic: true,
          isSensor: false,
          primitives: [
            { shape: "box", size: [1, 1, 1], center: [0, 1, 0] },
            { shape: "box", size: [1, 1, 1], center: [0, -1, 0] },
          ],
        },
      },
    },
    {
      id: "hit",
      components: {
        Transform: { position: [0.3, 1, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        Collider: { shape: "box", size: [1, 1, 1], isStatic: false, isSensor: false, simulatePhysics: true },
      },
    },
    {
      id: "gap",
      components: {
        Transform: { position: [0.3, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        Collider: { shape: "box", size: [0.6, 0.6, 0.6], isStatic: false, isSensor: false, simulatePhysics: true },
      },
    },
  ]);
  const app = new EngineApp();
  app.registerSubsystem(physics);
  const warn = console.warn;
  console.warn = (...args: unknown[]) => {
    if (String(args[0] ?? "").includes("deprecated parameters for the initialization function")) return;
    warn(...args);
  };
  try {
    await app.init();
    assert.equal(physics.usesRapier(), true);
    app.update(1 / 60);
    // The probe overlapping a primitive contacts the compound...
    assert.ok(
      physics.contactsForEntity("hit").some((c) => c.a === "compound" || c.b === "compound"),
      "overlapping probe should contact the compound collider",
    );
    // ...but a probe sitting in the gap between the two boxes does not (proving
    // the per-primitive compound is used rather than the encompassing AABB box).
    assert.deepEqual(physics.contactsForEntity("gap"), []);
    await app.dispose();
  } finally {
    console.warn = warn;
  }
});

await checkAsync("rapier builds a convex collider from hull points", async () => {
  const physics = new PhysicsSubsystem({ backend: "rapier" });
  physics.setGravity([0, 0, 0]);
  physics.setEntities([
    {
      id: "hull",
      components: {
        Transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        Collider: {
          shape: "box",
          size: [1, 1, 1],
          isStatic: true,
          isSensor: false,
          primitives: [{ shape: "convex", size: [1, 1, 1], points: UNIT_CUBE_CORNERS }],
        },
      },
    },
    {
      id: "probe",
      components: {
        Transform: { position: [0.3, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        Collider: { shape: "box", size: [1, 1, 1], isStatic: false, isSensor: false, simulatePhysics: true },
      },
    },
  ]);
  const app = new EngineApp();
  app.registerSubsystem(physics);
  const warn = console.warn;
  console.warn = (...args: unknown[]) => {
    if (String(args[0] ?? "").includes("deprecated parameters for the initialization function")) return;
    warn(...args);
  };
  try {
    await app.init();
    assert.equal(physics.usesRapier(), true);
    app.update(1 / 60);
    assert.ok(
      physics.contactsForEntity("probe").some((c) => c.a === "hull" || c.b === "hull"),
      "probe overlapping the convex hull should contact it",
    );
    await app.dispose();
  } finally {
    console.warn = warn;
  }
});

await checkAsync("rapier trimesh colliders fix internal edges (a rolling ball does not bump)", async () => {
  // A wavy downhill grid, triangulated like the Landscape collider. Without
  // TriMeshFlags.FIX_INTERNAL_EDGES the ball's contacts with triangle edges
  // kick it upward: worst per-frame vertical speed jump ~0.66 m/s here, ~0.05
  // with the flag.
  const quads = 48;
  const vertices: Vec3[] = [];
  const indices: number[] = [];
  for (let z = 0; z <= quads; z += 1) {
    for (let x = 0; x <= quads; x += 1) {
      vertices.push([x, -0.35 * x + 0.5 * Math.sin(x / 7) * Math.cos(z / 9), z]);
    }
  }
  for (let z = 0; z < quads; z += 1) {
    for (let x = 0; x < quads; x += 1) {
      const a = z * (quads + 1) + x;
      const b = a + 1;
      const c = a + quads + 1;
      indices.push(a, c, b, b, c, c + 1);
    }
  }
  const physics = new PhysicsSubsystem({ backend: "rapier" });
  physics.setGravity([0, -9.81, 0]);
  const heights: number[] = [];
  physics.setTransformSink((entityId, transform) => {
    if (entityId === "ball") heights.push(transform.position[1]);
  });
  physics.setEntities([
    {
      id: "ground",
      components: {
        Transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        Collider: {
          shape: "box",
          size: [quads, 20, quads],
          isStatic: true,
          isSensor: false,
          primitives: [{ shape: "trimesh", size: [quads, 20, quads], vertices, indices }],
        },
      },
    },
    {
      id: "ball",
      components: {
        Transform: { position: [4, 1, 24], rotation: [0, 0, 0], scale: [1, 1, 1] },
        Collider: { shape: "sphere", size: [0.8, 0.8, 0.8], isStatic: false, isSensor: false, simulatePhysics: true },
      },
    },
  ]);
  const app = new EngineApp();
  app.registerSubsystem(physics);
  const warn = console.warn;
  console.warn = (...args: unknown[]) => {
    if (String(args[0] ?? "").includes("deprecated parameters for the initialization function")) return;
    warn(...args);
  };
  try {
    await app.init();
    assert.equal(physics.usesRapier(), true);
    for (let frame = 0; frame < 300; frame += 1) app.update(1 / 60);
    // Skip the first second (the drop onto the slope), then compare per-frame
    // vertical speeds: a smooth roll changes them by centimetres per second.
    let worstJump = 0;
    for (let i = 62; i < heights.length; i += 1) {
      const vy = (heights[i]! - heights[i - 1]!) * 60;
      const previous = (heights[i - 1]! - heights[i - 2]!) * 60;
      worstJump = Math.max(worstJump, Math.abs(vy - previous));
    }
    assert.ok(heights.length > 250, `ball transform synced ${heights.length} times`);
    assert.ok(worstJump < 0.25, `worst per-frame vertical speed jump ${worstJump.toFixed(3)} m/s`);
    await app.dispose();
  } finally {
    console.warn = warn;
  }
});

await checkAsync("rapier simulatePhysics enableGravity false disables world gravity", async () => {
  const physics = new PhysicsSubsystem({ backend: "rapier" });
  physics.setGravity([0, -10, 0]);
  const synced: TransformComponent[] = [];
  physics.setTransformSink((_entityId, transform) => {
    synced.push({
      position: [...transform.position],
      rotation: [...transform.rotation],
      scale: [...transform.scale],
    });
  });
  physics.setEntities([
    {
      id: "crate",
      components: {
        Transform: { position: [0, 5, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        Collider: {
          shape: "box",
          size: [1, 1, 1],
          isStatic: false,
          isSensor: false,
          simulatePhysics: true,
          enableGravity: false,
        },
      },
    },
  ]);

  const app = new EngineApp();
  app.registerSubsystem(physics);
  const warn = console.warn;
  console.warn = (...args: unknown[]) => {
    if (String(args[0] ?? "").includes("deprecated parameters for the initialization function")) {
      return;
    }
    warn(...args);
  };
  try {
    await app.init();
    for (let frame = 0; frame < 30; frame += 1) app.update(1 / 60);
    const last = synced.at(-1) ?? assert.fail("synced");
    assert.ok(Math.abs(last.position[1] - 5) < 0.001, `gravity disabled y=${last.position[1]}`);
    await app.dispose();
  } finally {
    console.warn = warn;
  }
});

await checkAsync("rapier simulatePhysics thin wall can topple after ground contact", async () => {
  const physics = new PhysicsSubsystem({ backend: "rapier" });
  physics.setGravity([0, -10, 0]);
  const synced: TransformComponent[] = [];
  physics.setTransformSink((entityId, transform) => {
    if (entityId === "wall") {
      synced.push({
        position: [...transform.position],
        rotation: [...transform.rotation],
        scale: [...transform.scale],
      });
    }
  });
  physics.setEntities([
    {
      id: "floor",
      components: {
        Transform: { position: [0, -0.1, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        Collider: { shape: "box", size: [20, 0.2, 20], isStatic: true, isSensor: false },
      },
    },
    {
      id: "wall",
      components: {
        Transform: { position: [0, 3, 0], rotation: [0, 0, 25], scale: [1, 1, 1] },
        Collider: {
          shape: "box",
          size: [0.2, 3, 0.2],
          isStatic: false,
          isSensor: false,
          simulatePhysics: true,
        },
      },
    },
  ]);

  const app = new EngineApp();
  app.registerSubsystem(physics);
  const warn = console.warn;
  console.warn = (...args: unknown[]) => {
    if (String(args[0] ?? "").includes("deprecated parameters for the initialization function")) {
      return;
    }
    warn(...args);
  };
  try {
    await app.init();
    for (let frame = 0; frame < 300; frame += 1) app.update(1 / 60);
    const last = synced.at(-1) ?? assert.fail("synced");
    assert.ok(last.position[1] < 2, `wall did not reach the floor: y=${last.position[1]}`);
    assert.ok(
      Math.abs(last.rotation[2] - 25) > 2,
      `wall rotation stayed locked: rotationZ=${last.rotation[2]}`,
    );
    await app.dispose();
  } finally {
    console.warn = warn;
  }
});

// 6.1.6b The rapier backend is a preference, not an unconditional load. A scene
// with no colliders must NOT pull the heavy Rapier runtime: the subsystem stays
// on the placeholder path so a physics-free game never fetches vendor-physics.
await checkAsync("rapier backend stays on placeholder when the scene has no colliders", async () => {
  const physics = new PhysicsSubsystem({ backend: "rapier" });
  // Transforms but no Collider components -> zero physics bodies.
  physics.setEntities([
    {
      id: "decor",
      components: {
        Transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      },
    },
  ]);

  const app = new EngineApp();
  app.registerSubsystem(physics);
  await app.init();
  assert.equal(physics.usesRapier(), false); // no colliders -> Rapier never loaded
  app.update(0.016);
  assert.deepEqual(physics.contactsForEntity("decor"), []);
  await app.dispose();
});

await checkAsync("rapier fixed step simulates the same fall at 30 Hz and 144 Hz", async () => {
  await withQuietRapierInit(async () => {
    const finalHeights: number[] = [];
    for (const hz of [30, 144]) {
      const physics = new PhysicsSubsystem({ backend: "rapier" });
      physics.setGravity([0, -10, 0]);
      let y = Number.NaN;
      physics.setTransformSink((_id, transform) => {
        y = transform.position[1];
      });
      physics.setEntities([fallingCrateEntity()]);
      const app = new EngineApp();
      app.registerSubsystem(physics);
      await app.init();
      let steps = 0;
      for (let frame = 0; frame < hz; frame += 1) {
        app.update(1 / hz);
        steps += physics.lastFrameStepCount();
      }
      assert.equal(physics.fixedTimestep(), 1 / 60);
      assert.ok(Math.abs(steps - 60) <= 1, `${hz} Hz simulated ${steps} slices`);
      finalHeights.push(y);
      await app.dispose();
    }
    const [at30, at144] = finalHeights;
    // ~5 m in one second at g=10; the render pose trails the last slice by one step.
    assert.ok(at30 !== undefined && at144 !== undefined && at30 < 1, `fell to ${at30}`);
    assert.ok(Math.abs(at30 - at144) < 1e-3, `30 Hz y=${at30} vs 144 Hz y=${at144}`);
  });
});

await checkAsync("rapier render pose blends between slices and a teleport skips the blend", async () => {
  await withQuietRapierInit(async () => {
    const physics = new PhysicsSubsystem({ backend: "rapier" });
    physics.setGravity([0, -10, 0]);
    let rendered: TransformComponent | null = null;
    physics.setTransformSink((_id, transform) => {
      rendered = transform;
    });
    physics.setEntities([fallingCrateEntity()]);
    const app = new EngineApp();
    app.registerSubsystem(physics);
    await app.init();
    const renderedY = (): number => (rendered as TransformComponent | null)?.position[1] ?? Number.NaN;

    for (let frame = 0; frame < 10; frame += 1) app.update(1 / 60);
    const beforeLastSlice = renderedY(); // alpha 0 renders the pose one slice back
    app.update(1 / 120);
    assert.equal(physics.lastFrameStepCount(), 0); // half a slice: nothing simulated...
    assert.ok(Math.abs(physics.interpolationAlpha() - 0.5) < 1e-6);
    const halfway = renderedY(); // ...but the render pose still moves on
    app.update(1 / 120);
    assert.equal(physics.lastFrameStepCount(), 1);
    const latest = renderedY();
    assert.ok(
      beforeLastSlice > halfway && halfway > latest,
      `expected ${beforeLastSlice} > ${halfway} > ${latest}`,
    );

    physics.setEntityTransform("crate", {
      position: [10, 5, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    });
    app.update(1 / 120);
    const teleported = (rendered as TransformComponent | null)?.position ?? assert.fail("rendered");
    assert.deepEqual(teleported, [10, 5, 0]);
    await app.dispose();
  });
});

await checkAsync("rapier vehicle only attaches to a live dynamic chassis", async () => {
  await withQuietRapierInit(async () => {
    const placeholder = new PhysicsSubsystem();
    placeholder.setEntities([fallingCrateEntity()]);
    assert.equal(placeholder.createVehicle("crate", createReferenceCarDefinition()), false);

    const world = await createVehicleTestWorld();
    assert.equal(world.physics.createVehicle("ground", createReferenceCarDefinition()), false);
    assert.equal(world.physics.createVehicle("missing", createReferenceCarDefinition()), false);
    assert.equal(world.physics.createVehicle("car", createReferenceCarDefinition()), true);
    assert.equal(world.physics.hasVehicle("car"), true);
    world.physics.dispose();
  });
});

await checkAsync("rapier camera trace stops at static walls and passes moving, sensor and camera-ignoring bodies", async () => {
  await withQuietRapierInit(async () => {
    const box = (id: string, z: number, collider: Partial<ColliderComponent> = {}): Entity => ({
      id,
      components: {
        Transform: { position: [0, 1, z], rotation: [0, 0, 0], scale: [1, 1, 1] },
        // @ts-expect-error Forge never type-checked its tests: a typed collider spread is wider than the JSON component data (type-only).
        Collider: { shape: "box", size: [10, 4, 1], isStatic: true, isSensor: false, ...collider },
      },
    });
    const entities = [
      box("wall", 5),
      box("glass", 10, { ignoreCameraTrace: true }),
      box("crate", -5, { isStatic: false, simulatePhysics: true, enableGravity: false }),
      box("trigger", -10, { isSensor: true }),
    ];
    const placeholder = new PhysicsSubsystem();
    placeholder.setEntities(entities);
    assert.equal(placeholder.traceCamera([0, 1, 0], [0, 1, 20]), null, "no exact shapes without Rapier");

    const physics = new PhysicsSubsystem({ backend: "rapier" });
    physics.setEntities(entities);
    await physics.init();
    try {
      physics.update({ deltaSeconds: VEHICLE_SLICE, elapsedSeconds: VEHICLE_SLICE, frame: 1 });
      const wall = physics.traceCamera([0, 1, 0], [0, 1, 20]) ?? assert.fail("the wall was missed");
      assert.ok(Math.abs(wall - 4.5 / 20) < 1e-4, `wall face at ${wall * 20} m`);
      assert.equal(physics.traceCamera([0, 1, 6], [0, 1, 20]), null, "camera-ignoring glass");
      assert.equal(physics.traceCamera([0, 1, 0], [0, 1, -20]), null, "a dynamic crate and a sensor");
      assert.equal(physics.traceCamera([0, 1, 0], [0, 1, 0]), null, "a zero-length boom");
      physics.setEntityCollisionEnabled("wall", false);
      assert.equal(physics.traceCamera([0, 1, 0], [0, 1, 9]), null, "collision switched off at runtime");
    } finally {
      physics.dispose();
    }
  });
});

check("physics subsystem exposes static blocker AABBs and collider half-extents", () => {
  const physics = new PhysicsSubsystem();
  physics.setEntities([
    {
      id: "wall",
      components: {
        Transform: { position: [2, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        Collider: { shape: "box", size: [1, 1, 1], isStatic: true, isSensor: false },
      },
    },
    {
      id: "trigger",
      components: {
        Transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        Collider: { shape: "box", size: [1, 1, 1], isStatic: true, isSensor: true },
      },
    },
    {
      id: "player",
      components: {
        Transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [2, 1, 1] },
        Collider: { shape: "box", size: [1, 1, 1], isStatic: false, isSensor: false },
      },
    },
  ]);
  const blockers = physics.staticBlockerAabbs();
  assert.equal(blockers.length, 1); // wall only: the sensor and the non-static player are excluded
  assert.deepEqual(blockers[0], { min: [1.5, -0.5, -0.5], max: [2.5, 0.5, 0.5] });
  // Collider size is world-space (scale baked at scene-build), so half = size/2;
  // the entity's transform.scale is no longer reapplied here.
  assert.deepEqual(physics.colliderHalfExtents("player"), [0.5, 0.5, 0.5]);
  assert.equal(physics.colliderHalfExtents("missing"), null);
});

check("physics navigation queries honor collider navigation roles without changing physics blockers", () => {
  const physics = new PhysicsSubsystem();
  const flatTriangle = {
    shape: "trimesh" as const,
    size: [1, 0, 1] as [number, number, number],
    vertices: [
      [-0.5, 0, -0.5],
      [0.5, 0, -0.5],
      [0, 0, 0.5],
    ],
    indices: [0, 2, 1], // CCW up-facing floor (signed normal +1)
  };
  physics.setEntities([
    {
      id: "ignored-wall",
      components: {
        Transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        Collider: {
          shape: "box",
          size: [1, 2, 0.2],
          isStatic: true,
          isSensor: false,
          navigationRole: "ignored",
        },
      },
    },
    {
      id: "obstacle-wall",
      components: {
        Transform: { position: [2, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        Collider: {
          shape: "box",
          size: [1, 2, 0.2],
          isStatic: true,
          isSensor: false,
          navigationRole: "obstacleOnly",
        },
      },
    },
    {
      id: "obstacle-floor",
      components: {
        Transform: { position: [4, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        Collider: {
          shape: "box",
          size: [1, 0, 1],
          isStatic: true,
          isSensor: false,
          navigationRole: "obstacleOnly",
          primitives: [flatTriangle],
        },
      },
    },
    {
      id: "walkable-floor",
      components: {
        Transform: { position: [6, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        Collider: {
          shape: "box",
          size: [1, 0, 1],
          isStatic: true,
          isSensor: false,
          navigationRole: "walkable",
          primitives: [flatTriangle],
        },
      },
    },
  ]);
  assert.equal(physics.staticBlockerAabbs().length, 2);
  const navBlockers = physics.staticNavigationBlockerAabbs();
  assert.equal(navBlockers.length, 1);
  assert.equal(navBlockers[0]?.navigationRole, "obstacleOnly");
  assert.equal(physics.staticSurfaceTriangles().length, 2);
  assert.equal(physics.staticNavigationSurfaceTriangles().length, 1);
});

// A `walkable` staircase's vertical riser triangles are still EMITTED as nav
// blockers (a solid walkable top can only seed ground via a blocker top, so the
// list must stay complete for ground probing) but each carries `navigationRole:
// "walkable"` so grid erosion can exclude them. Physics collision is unaffected.
check("walkable stair emits riser nav blockers tagged with their role; auto does not", () => {
  // One flat tread (y=0.2) + one vertical riser wall triangle (in the z=0 plane).
  const stairMesh = {
    shape: "trimesh" as const,
    size: [1, 0.2, 1] as [number, number, number],
    vertices: [
      [-0.5, 0.2, 0],
      [0.5, 0.2, 0],
      [0, 0.2, 0.5],
      [-0.5, 0, 0],
      [0.5, 0, 0],
      [-0.5, 0.2, 0],
    ] as [number, number, number][],
    indices: [0, 2, 1, 3, 4, 5], // CCW up-facing tread (signed +1); riser stays vertical
  };
  const makeStair = (navigationRole: "walkable" | "auto") => ({
    id: "stair",
    components: {
      Transform: {
        position: [0, 0, 0] as [number, number, number],
        rotation: [0, 0, 0] as [number, number, number],
        scale: [1, 1, 1] as [number, number, number],
      },
      Collider: {
        shape: "box" as const,
        size: [1, 0.2, 1] as [number, number, number],
        isStatic: true,
        isSensor: false,
        navigationRole,
        primitives: [stairMesh],
      },
    },
  });

  const walkable = new PhysicsSubsystem();
  walkable.setEntities([makeStair("walkable")]);
  const navBlockers = walkable.staticNavigationBlockerAabbs();
  assert.ok(
    navBlockers.length >= 1,
    "walkable riser is still emitted, so a solid walkable top can seed ground",
  );
  assert.ok(
    navBlockers.every((b) => b.navigationRole === "walkable"),
    "each walkable nav blocker carries its role so grid erosion can exclude it",
  );
  assert.ok(
    walkable.staticNavigationSurfaceTriangles().length >= 1,
    "walkable stair still seeds a walkable nav surface (the tread)",
  );
  assert.ok(
    walkable.staticBlockerAabbs().length >= 1,
    "physics collision is unaffected: the pawn still collides with / steps up the riser",
  );

  const auto = new PhysicsSubsystem();
  auto.setEntities([makeStair("auto")]);
  const autoBlockers = auto.staticNavigationBlockerAabbs();
  assert.ok(autoBlockers.length >= 1, "auto stair still walls the riser (geometry-derived)");
  assert.ok(
    autoBlockers.every((b) => b.navigationRole !== "walkable"),
    "auto blockers are not tagged walkable, so erosion keeps walling them",
  );
});

// A collider with a center offset places its AABB at position + center, so a
// model whose geometry is not centered on its origin still aligns to the mesh.
check("physics subsystem offsets a collider AABB by its center", () => {
  const physics = new PhysicsSubsystem();
  physics.setEntities([
    {
      id: "wall",
      components: {
        Transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        Collider: {
          shape: "box",
          size: [2, 4, 0.5],
          center: [0, 2, 1],
          isStatic: true,
          isSensor: false,
        },
      },
    },
  ]);
  assert.deepEqual(physics.staticBlockerAabbs()[0], {
    min: [-1, 0, 0.75],
    max: [1, 4, 1.25],
  });
});

check("physics subsystem rotates a corner-pivoted compound wall's blocker AABB", () => {
  const physics = new PhysicsSubsystem();
  physics.setEntities([
    {
      id: "wall",
      components: {
        Transform: { position: [0, 0, 0], rotation: [0, 90, 0], scale: [1, 1, 1] },
        Collider: {
          shape: "box",
          size: [4, 3, 0.2],
          center: [2, 1.5, 0],
          isStatic: true,
          isSensor: false,
          primitives: [{ shape: "box", size: [4, 3, 0.2], center: [2, 1.5, 0] }],
        },
      },
    },
  ]);
  assertAabbClose(physics.staticBlockerAabbs()[0]!, { min: [-0.1, 0, -4], max: [0.1, 3, 0] });
});

check("physics subsystem rotates a single (non-compound) collider's blocker AABB", () => {
  const physics = new PhysicsSubsystem();
  physics.setEntities([
    {
      id: "wall",
      components: {
        Transform: { position: [0, 0, 0], rotation: [0, 90, 0], scale: [1, 1, 1] },
        Collider: { shape: "box", size: [4, 3, 0.2], center: [2, 1.5, 0], isStatic: true, isSensor: false },
      },
    },
  ]);
  assertAabbClose(physics.staticBlockerAabbs()[0]!, { min: [-0.1, 0, -4], max: [0.1, 3, 0] });
});

// P1.3/P1.4 — a trimesh ramp is a walkable surface (ground probe), not a wall
// blocker; a steep trimesh triangle stays a blocker. Rotation bakes into normals.
check("physics subsystem exposes trimesh surfaces and excludes flat ones from blockers", () => {
  const physics = new PhysicsSubsystem();
  physics.setEntities([
    {
      id: "ramp",
      components: {
        Transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        Collider: {
          shape: "box",
          size: [4, 2, 2],
          isStatic: true,
          isSensor: false,
          primitives: [
            {
              shape: "trimesh",
              size: [4, 2, 2],
              vertices: [[0, 0, -1], [4, 2, -1], [4, 2, 1], [0, 0, 1]], // 26.57° ramp up +X
              indices: [0, 2, 1, 0, 3, 2], // CCW up-facing (signed normal +cos)
            },
          ],
        },
      },
    },
  ]);
  assert.equal(physics.staticBlockerAabbs().length, 0); // gentle ramp → not walls
  const surfaces = physics.staticSurfaceTriangles();
  assert.equal(surfaces.length, 2);
  assert.ok(Math.abs(surfaces[0]!.normalY - RAMP_NORMAL_Y) < 1e-9, `normalY=${surfaces[0]!.normalY}`);
});

check("physics subsystem keeps a steep up-facing terrain triangle as a support surface", () => {
  const physics = new PhysicsSubsystem();
  const rise = 2 * Math.tan((60 * Math.PI) / 180);
  physics.setEntities([
    {
      id: "steep-terrain",
      components: {
        Transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        Collider: {
          shape: "box",
          size: [2, rise, 2],
          isStatic: true,
          isSensor: false,
          primitives: [
            {
              shape: "trimesh",
              size: [2, rise, 2],
              vertices: [[-1, 0, -1], [1, rise, -1], [1, rise, 1], [-1, 0, 1]],
              indices: [0, 2, 1, 0, 3, 2],
            },
          ],
        },
      },
    },
  ]);
  assert.equal(physics.staticBlockerAabbs().length, 0, "terrain support is never represented as flat wall AABBs");
  const surfaces = physics.staticSurfaceTriangles();
  assert.equal(surfaces.length, 2);
  assert.ok(surfaces.every((surface) => Math.abs(surface.normalY - 0.5) < 1e-9));
});

check("physics subsystem keeps a steep trimesh triangle as a wall blocker (not a surface)", () => {
  const physics = new PhysicsSubsystem();
  physics.setEntities([
    {
      id: "wall",
      components: {
        Transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        Collider: {
          shape: "box",
          size: [2, 2, 1],
          isStatic: true,
          isSensor: false,
          primitives: [
            {
              shape: "trimesh",
              size: [2, 2, 1],
              vertices: [[-1, 0, 0], [1, 0, 0], [-1, 2, 0]], // vertical wall (normalY 0)
              indices: [0, 1, 2],
            },
          ],
        },
      },
    },
  ]);
  assert.equal(physics.staticBlockerAabbs().length, 1);
  assert.equal(physics.staticSurfaceTriangles().length, 0);
});

// Regression: a solid `complexAsSimple` slab (a staircase/floor block) has an
// up-facing top AND a down-facing bottom. The signed surface normal must accept
// only the top, so no phantom nav floor is seeded on the underside — the defect
// that let an AI path route through the interior of a solid staircase and stall
// the pawn mid-climb.
check("physics subsystem never seeds a walkable surface on a solid body's downward face", () => {
  const physics = new PhysicsSubsystem();
  physics.setEntities([
    {
      id: "slab",
      components: {
        Transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        Collider: {
          shape: "box",
          size: [2, 1, 2],
          isStatic: true,
          isSensor: false,
          primitives: [
            {
              shape: "trimesh",
              size: [2, 1, 2],
              vertices: [
                [-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1], // top face (y=1, up)
                [-1, 0, -1], [1, 0, -1], [1, 0, 1], [-1, 0, 1], // bottom face (y=0, down)
              ],
              // CCW top (signed normal +1); CW bottom (signed normal -1).
              indices: [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7],
            },
          ],
        },
      },
    },
  ]);
  const surfaces = physics.staticSurfaceTriangles();
  assert.equal(surfaces.length, 2, "only the two up-facing top triangles are walkable surfaces");
  assert.ok(surfaces.every((tri) => tri.normalY > 0.9), "every walkable surface faces up (signed +1)");
  assert.ok(
    surfaces.every((tri) => Math.abs(tri.a[1] - 1) < 1e-9),
    "the surviving surfaces are the top face (y=1), never the y=0 underside",
  );
});

check("physics subsystem bakes body rotation into surface-triangle normals", () => {
  const physics = new PhysicsSubsystem();
  physics.setEntities([
    {
      id: "tilted-floor",
      components: {
        Transform: { position: [0, 0, 0], rotation: [0, 0, 30], scale: [1, 1, 1] },
        Collider: {
          shape: "box",
          size: [2, 0.1, 2],
          isStatic: true,
          isSensor: false,
          primitives: [
            {
              shape: "trimesh",
              size: [2, 0.1, 2],
              vertices: [[0, 0, 0], [2, 0, 0], [0, 0, 2]], // flat, then tilted 30° about Z
              indices: [0, 2, 1], // CCW up-facing floor (signed normal +cos30 after tilt)
            },
          ],
        },
      },
    },
  ]);
  const surfaces = physics.staticSurfaceTriangles();
  assert.equal(surfaces.length, 1);
  assert.ok(
    Math.abs(surfaces[0]!.normalY - Math.cos((30 * Math.PI) / 180)) < 1e-9,
    `normalY=${surfaces[0]!.normalY}`,
  );
});

// complexAsSimple builds a trimesh collider; the AABB-based player movement must
// see one blocker per triangle (so the player can walk into an L-shaped wall's
// concave corner), not a single enclosing box.
check("physics subsystem expands a trimesh collider into per-triangle blockers", () => {
  const physics = new PhysicsSubsystem();
  physics.setEntities([
    {
      id: "wall",
      components: {
        Transform: { position: [10, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        Collider: {
          shape: "box",
          size: [4, 1, 4],
          isStatic: true,
          isSensor: false,
          primitives: [
            {
              shape: "trimesh",
              size: [4, 1, 4],
              // Two separate triangles (an L's two arms) with a gap between them.
              vertices: [
                [-2, 0, -2],
                [-1, 0, -2],
                [-2, 1, -2],
                [1, 0, 2],
                [2, 0, 2],
                [1, 1, 2],
              ],
              indices: [0, 1, 2, 3, 4, 5],
            },
          ],
        },
      },
    },
  ]);
  const blockers = physics.staticBlockerAabbs();
  assert.equal(blockers.length, 2); // one AABB per triangle, not one enclosing box
  // Each triangle's AABB is translated by the body origin (10, 0, 0); the gap
  // between x=9 and x=11 is walkable (the concave region of the L).
  assert.deepEqual({ min: blockers[0]?.min, max: blockers[0]?.max }, { min: [8, 0, -2], max: [9, 1, -2] });
  assert.deepEqual({ min: blockers[1]?.min, max: blockers[1]?.max }, { min: [11, 0, 2], max: [12, 1, 2] });
});

// A6: disabling an entity's collision drops it from contact generation and from
// the static movement blockers (a possessed pawn would walk through it);
// re-enabling restores both.
check("physics subsystem: setEntityCollisionEnabled toggles contacts and blockers", () => {
  const physics = new PhysicsSubsystem();
  const wall: Entity = {
    id: "wall:0",
    components: {
      Transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      Collider: { shape: "box", size: [1, 1, 1], isStatic: true, isSensor: false },
    },
  };
  const trigger: Entity = {
    id: "trigger:0",
    components: {
      Transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      Collider: { shape: "box", size: [2, 2, 2], isStatic: true, isSensor: true },
    },
  };
  const mover: Entity = {
    id: "mover:0",
    components: {
      Transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      Collider: { shape: "box", size: [1, 1, 1], isStatic: false, isSensor: false },
    },
  };
  physics.setEntities([wall, trigger, mover]);
  const app = new EngineApp();
  app.registerSubsystem(physics);

  app.update(0.016);
  assert.equal(physics.staticBlockerAabbs().length, 1); // the wall blocks movement
  assert.equal(physics.contactsForEntity("trigger:0").length, 1); // sensor overlaps the mover

  // Disable both: the wall leaves the blockers, the trigger stops overlapping.
  physics.setEntityCollisionEnabled("wall:0", false);
  physics.setEntityCollisionEnabled("trigger:0", false);
  app.update(0.016);
  assert.equal(physics.staticBlockerAabbs().length, 0);
  assert.deepEqual(physics.contactsForEntity("trigger:0"), []);

  // Re-enable: both come back.
  physics.setEntityCollisionEnabled("wall:0", true);
  physics.setEntityCollisionEnabled("trigger:0", true);
  app.update(0.016);
  assert.equal(physics.staticBlockerAabbs().length, 1);
  assert.equal(physics.contactsForEntity("trigger:0").length, 1);

  // setEntities rebuild clears the disabled set (runtime-only state).
  physics.setEntityCollisionEnabled("wall:0", false);
  physics.setEntities([wall, trigger, mover]);
  assert.equal(physics.staticBlockerAabbs().length, 1);
});
