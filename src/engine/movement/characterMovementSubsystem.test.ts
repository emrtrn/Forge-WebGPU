// Ported from Forge WebGL tools/engine-tests.ts @ forge-webgl-final (04b5fb23): each check is
// copied unchanged and runs as a Vitest test; docs/PORT_LOG.md §2.
import assert from "node:assert/strict";
import { type TransformComponent } from "../legacy/components.ts";
import { type Entity } from "../legacy/entity.ts";
import { type Vec3 } from "../legacy/layout.ts";
import { type Aabb3 } from "./characterCollision.ts";
import { CharacterMovementSubsystem } from "./characterMovementSubsystem.ts";
import { type LocomotionInput } from "./locomotionAnimation.ts";
import { type GroundTriangle } from "./slopeSurface.ts";
import { PhysicsSubsystem } from "../physics/physicsSubsystem.ts";
import { ActionMap } from "../input/actionMap.ts";
import { test } from "vitest";

const check = test;

const showTiming = process.env.ENGINE_TESTS_TIMING === "1";

let checks = 0;

const report = (label: string, startedAt: number): void => {
  checks += 1;
  const elapsed = showTiming ? ` (${(performance.now() - startedAt).toFixed(0)} ms)` : "";
  console.log(`  ok: ${label}${elapsed}`);
};

// G1 player movement core (src/game/playerMovement.ts): planar input resolves to
// a normalized XZ delta plus a facing yaw, so diagonals are not ~1.41x faster and
// the character turns to face its movement, holding facing when idle. Yaw values
// are compared modulo 360 (so +/-180 match, and -0 reads as 0).
const yawApproxEqual = (actual: number, expected: number, eps = 1e-9): void => {
  const diff = ((((actual - expected) % 360) + 540) % 360) - 180;
  assert.ok(Math.abs(diff) <= eps, `yaw ${actual} not ~= ${expected} (mod 360)`);
};

check("CharacterMovement subsystem walks up a trimesh ramp, following the incline", () => {
  const actions = new ActionMap({ KeyD: "move-right" });
  const physics = new PhysicsSubsystem();
  physics.setEntities([
    {
      id: "floor",
      components: {
        Transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        // Flat run-up: top at y=0, spanning x[-2,0].
        Collider: { shape: "box", size: [2, 1, 4], center: [-1, -0.5, 0], isStatic: true, isSensor: false },
      },
    },
    {
      id: "ramp",
      components: {
        Transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        Collider: {
          shape: "box",
          size: [4, 2, 4],
          isStatic: true,
          isSensor: false,
          primitives: [
            {
              shape: "trimesh",
              size: [4, 2, 4],
              vertices: [[0, 0, -2], [4, 2, -2], [4, 2, 2], [0, 0, 2]], // y = 0.5*x, 26.57°
              indices: [0, 2, 1, 0, 3, 2], // CCW up-facing (signed normal +cos)
            },
          ],
        },
      },
    },
  ]);
  const player: Entity = {
    id: "actor:ramp-walker",
    components: {
      Transform: { position: [-1.5, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      Collider: { shape: "box", size: [0.6, 1.8, 0.6], isStatic: false, isSensor: false },
      CharacterMovement: {
        maxWalkSpeed: 3,
        capsuleRadius: 0.3,
        capsuleHalfHeight: 0.9,
        maxStepHeight: 0.45,
        maxSlopeAngleDeg: 45,
      },
    },
  };
  let transform: TransformComponent | null = null;
  const movement = new CharacterMovementSubsystem(actions, (_id, next) => {
    transform = next;
  }, physics, { getGravityY: () => -10 });
  movement.setEntities([player]);

  actions.handleDown("KeyD");
  let maxY = -Infinity;
  for (let frame = 1; frame <= 40; frame += 1) {
    actions.advance();
    movement.update({ deltaSeconds: 0.1, elapsedSeconds: frame * 0.1, frame });
    const t = transform ?? assert.fail("transform");
    // @ts-expect-error Forge never type-checked its tests: a `let` assigned inside a callback narrows to never (type-only).
    const x = t.position[0];
    // @ts-expect-error Forge never type-checked its tests: a `let` assigned inside a callback narrows to never (type-only).
    const y = t.position[1];
    maxY = Math.max(maxY, y);
    // While on the ramp (0 ≤ x ≤ 4), the player rests on the incline: y ≈ 0.5*x.
    if (x > 0.2 && x < 3.8) {
      assert.ok(Math.abs(y - 0.5 * x) < 0.05, `off the incline at x=${x}: y=${y}`);
    }
  }
  assert.ok(maxY > 1, `player never climbed the ramp: maxY=${maxY}`);
});

// A6 velocity access: the character subsystem (the host's velocity source for the
// possessed pawn) exposes last-frame velocity from the applied position delta, and
// a teleport/respawn drops the stale value so it isn't read as a huge one-frame speed.
check("CharacterMovement subsystem exposes last-frame velocity from applied motion", () => {
  const actions = new ActionMap({ KeyW: "move-forward" });
  actions.handleDown("KeyW");
  actions.advance();
  const entity: Entity = {
    id: "actor:vel",
    components: {
      Transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      CharacterMovement: {
        maxWalkSpeed: 4,
        sprintMultiplier: 2,
        jumpSpeed: 5,
        gravityScale: 1,
        rotationRate: [0, 0, 0],
        orientRotationToMovement: false,
        movementMode: "walking",
      },
    },
  };
  const movement = new CharacterMovementSubsystem(actions, () => undefined, undefined, {
    isPlayerControlled: () => true,
  });
  movement.setEntities([entity]);
  assert.equal(movement.velocityOf("actor:vel"), null, "no velocity before the first tick");
  movement.update({ deltaSeconds: 0.5, elapsedSeconds: 0.5, frame: 1 });
  const v = movement.velocityOf("actor:vel");
  assert.ok(v, "velocity available after a tick");
  const speed = Math.hypot(v[0], v[1], v[2]);
  assert.ok(Math.abs(speed - 4) < 0.5, `expected ~4 u/s, got ${speed}`);
  movement.resetEntityTransform("actor:vel", {
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  });
  assert.equal(movement.velocityOf("actor:vel"), null, "teleport drops stale velocity");
});

// A6 LaunchCharacter: an upward launch drives the character airborne (it rises
// then lands back on its floor via the existing vertical/landing logic), and the
// horizontal launch is a knockback that decays to rest.
check("CharacterMovement launch: upward launch arcs and lands; horizontal knockback decays", () => {
  const actions = new ActionMap({});
  const entity: Entity = {
    id: "actor:k",
    components: {
      Transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      CharacterMovement: {
        maxWalkSpeed: 4,
        sprintMultiplier: 2,
        jumpSpeed: 5,
        gravityScale: 1,
        rotationRate: [0, 0, 0],
        orientRotationToMovement: false,
        movementMode: "walking",
      },
    },
  };
  let transform: TransformComponent | null = null;
  const movement = new CharacterMovementSubsystem(
    actions,
    (_id, next) => {
      transform = next;
    },
    undefined,
    { isPlayerControlled: () => true },
  );
  movement.setEntities([entity]);
  let frame = 0;
  const step = (n: number) => {
    for (let i = 0; i < n; i += 1) {
      movement.update({ deltaSeconds: 0.05, elapsedSeconds: 0.05 * frame, frame });
      frame += 1;
    }
  };
  step(1); // settle grounded at y≈0
  // @ts-expect-error Forge never type-checked its tests: a `let` assigned inside a callback narrows to never (type-only).
  assert.ok(transform && Math.abs(transform.position[1]) < 1e-6, "starts grounded");
  movement.launch("actor:k", [6, 6, 0]); // up + +x knockback
  step(1);
  // @ts-expect-error Forge never type-checked its tests: a `let` assigned inside a callback narrows to never (type-only).
  assert.ok(transform.position[1] > 0.1, "went airborne");
  // @ts-expect-error Forge never type-checked its tests: a `let` assigned inside a callback narrows to never (type-only).
  assert.ok(transform.position[0] > 0.1, "knocked back on +x");
  step(60); // ~3s: arc completes, lands, knockback decays
  // @ts-expect-error Forge never type-checked its tests: a `let` assigned inside a callback narrows to never (type-only).
  assert.ok(Math.abs(transform.position[1]) < 0.05, "landed back on the floor");
  // @ts-expect-error Forge never type-checked its tests: a `let` assigned inside a callback narrows to never (type-only).
  const restX = transform.position[0];
  step(5);
  // @ts-expect-error Forge never type-checked its tests: a `let` assigned inside a callback narrows to never (type-only).
  assert.ok(Math.abs(transform.position[0] - restX) < 1e-6, "knockback fully decayed");
});

check("CharacterMovement subsystem only moves the possessed character", () => {
  const actions = new ActionMap({ KeyW: "move-forward" });
  actions.handleDown("KeyW");
  actions.advance();
  const entity: Entity = {
    id: "actor:0",
    components: {
      Transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      CharacterMovement: {
        maxWalkSpeed: 4,
        sprintMultiplier: 2,
        jumpSpeed: 5,
        gravityScale: 1,
        orientRotationToMovement: true,
      },
    },
  };

  let unpossessed: TransformComponent | null = null;
  const idle = new CharacterMovementSubsystem(
    actions,
    (_id, transform) => {
      unpossessed = transform;
    },
    undefined,
    { isPlayerControlled: () => false },
  );
  idle.setEntities([entity]);
  idle.update({ deltaSeconds: 0.5, elapsedSeconds: 0.5, frame: 1 });
  assert.equal(unpossessed, null);

  let possessed: TransformComponent | null = null;
  const reports = new Map<string, LocomotionInput>();
  const driven = new CharacterMovementSubsystem(
    actions,
    (_id, transform) => {
      possessed = transform;
    },
    undefined,
    {
      isPlayerControlled: () => true,
      reportLocomotion: (entityId, report) => reports.set(entityId, report),
    },
  );
  driven.setEntities([entity]);
  driven.update({ deltaSeconds: 0.5, elapsedSeconds: 0.5, frame: 1 });
  assert.ok(possessed);
  // @ts-expect-error Forge never type-checked its tests: a `let` assigned inside a callback narrows to never (type-only).
  assert.ok(possessed.position[2] < 0);
  // @ts-expect-error Forge never type-checked its tests: a `let` assigned inside a callback narrows to never (type-only).
  yawApproxEqual(possessed.rotation[1], 180);
  assert.equal(reports.get("actor:0")?.grounded, true);
});

check("CharacterMovement subsystem moves an AI-driven character from move intent", () => {
  const actions = new ActionMap({});
  const entity: Entity = {
    id: "actor:ai",
    components: {
      Transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      CharacterMovement: {
        maxWalkSpeed: 4,
        sprintMultiplier: 2,
        jumpSpeed: 5,
        gravityScale: 1,
        orientRotationToMovement: true,
      },
    },
  };

  let transform: TransformComponent | null = null;
  const reports = new Map<string, LocomotionInput>();
  const movement = new CharacterMovementSubsystem(
    actions,
    (_id, next) => {
      transform = next;
    },
    undefined,
    {
      isPlayerControlled: () => false,
      getMoveIntent: (entityId) =>
        entityId === "actor:ai" ? { direction: [1, 0], speed: 2 } : null,
      reportLocomotion: (entityId, report) => reports.set(entityId, report),
    },
  );
  movement.setEntities([entity]);
  assert.equal(movement.transformOf("actor:ai")?.position[0], 0);
  movement.update({ deltaSeconds: 0.5, elapsedSeconds: 0.5, frame: 1 });

  assert.ok(transform);
  // @ts-expect-error Forge never type-checked its tests: a `let` assigned inside a callback narrows to never (type-only).
  assert.equal(transform.position[0], 1);
  // @ts-expect-error Forge never type-checked its tests: a `let` assigned inside a callback narrows to never (type-only).
  assert.equal(transform.position[2], 0);
  // @ts-expect-error Forge never type-checked its tests: a `let` assigned inside a callback narrows to never (type-only).
  yawApproxEqual(transform.rotation[1], 90);
  assert.equal(reports.get("actor:ai")?.planarSpeed, 2);
  assert.equal(movement.velocityOf("actor:ai")?.[0], 2);
  assert.equal(movement.transformOf("actor:ai")?.position[0], 1);
});

check("CharacterMovement subsystem blocks planar movement against dynamic character blockers", () => {
  const actions = new ActionMap({ KeyW: "move-forward" });
  actions.handleDown("KeyW");
  actions.advance();
  const physics = {
    staticBlockerAabbs: () => [],
    staticSurfaceTriangles: () => [],
    colliderHalfExtents: () => [0.3, 0.9, 0.3] as [number, number, number],
  };
  const entity: Entity = {
    id: "actor:mover",
    components: {
      Transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      CharacterMovement: {
        maxWalkSpeed: 4,
        sprintMultiplier: 1,
        jumpSpeed: 5,
        gravityScale: 1,
        capsuleRadius: 0.3,
        capsuleHalfHeight: 0.9,
        orientRotationToMovement: true,
      },
    },
  };
  const other: Aabb3 = { min: [-0.3, 0, -1.1], max: [0.3, 1.8, -0.5] };
  let transform: TransformComponent | null = null;
  const movement = new CharacterMovementSubsystem(
    actions,
    (_id, next) => {
      transform = next;
    },
    // @ts-expect-error Forge never type-checked its tests: a partial PhysicsQuery stub (type-only).
    physics,
    {
      isPlayerControlled: () => true,
      dynamicBlockers: () => [other],
    },
  );
  movement.setEntities([entity]);
  movement.update({ deltaSeconds: 0.5, elapsedSeconds: 0.5, frame: 1 });

  assert.ok(transform);
  // @ts-expect-error Forge never type-checked its tests: a `let` assigned inside a callback narrows to never (type-only).
  assert.equal(transform.position[2], -0.2);
});

check("CharacterMovement subsystem derives ground footprint from the Collider capsule", () => {
  const actions = new ActionMap({});
  actions.advance();
  const physics = {
    staticBlockerAabbs: () => [{ min: [0.6, -0.2, -1], max: [1, 0, 1] }] as Aabb3[],
    staticSurfaceTriangles: () => [],
    colliderHalfExtents: () => [1, 3, 1] as [number, number, number],
  };
  const entity: Entity = {
    id: "actor:large-footprint",
    components: {
      Transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      Collider: {
        shape: "capsule",
        capsuleRadius: 1,
        capsuleHalfHeight: 3,
        isStatic: false,
        isSensor: false,
      },
      CharacterMovement: {
        maxWalkSpeed: 0,
        sprintMultiplier: 1,
        jumpSpeed: 5,
        gravityScale: 1,
        capsuleRadius: 0.3,
        capsuleHalfHeight: 0.9,
        orientRotationToMovement: true,
      },
    },
  };
  let transform: TransformComponent | null = null;
  const movement = new CharacterMovementSubsystem(
    actions,
    (_id, next) => {
      transform = next;
    },
    // @ts-expect-error Forge never type-checked its tests: a partial PhysicsQuery stub (type-only).
    physics,
    {
      isPlayerControlled: () => false,
      getMoveIntent: () => ({ direction: [0, 0], speed: 0 }),
    },
  );
  movement.setEntities([entity]);
  movement.update({ deltaSeconds: 0.1, elapsedSeconds: 0.1, frame: 1 });

  assert.ok(transform);
  // @ts-expect-error Forge never type-checked its tests: a `let` assigned inside a callback narrows to never (type-only).
  assert.equal(transform.position[1], 0);
});

check("CharacterMovement subsystem keeps planar wall resolve on physics collider half-extents", () => {
  const actions = new ActionMap({ KeyW: "move-forward" });
  actions.handleDown("KeyW");
  actions.advance();
  const physics = {
    staticBlockerAabbs: () => [{ min: [-1, 0, -2.1], max: [1, 3, -1.9] }] as Aabb3[],
    staticSurfaceTriangles: () => [],
    colliderHalfExtents: () => [1, 3, 1] as [number, number, number],
  };
  const entity: Entity = {
    id: "actor:wide-physics-capsule",
    components: {
      Transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      Collider: {
        shape: "capsule",
        capsuleRadius: 0.3,
        capsuleHalfHeight: 0.9,
        isStatic: false,
        isSensor: false,
      },
      CharacterMovement: {
        maxWalkSpeed: 4,
        sprintMultiplier: 1,
        jumpSpeed: 5,
        gravityScale: 1,
        capsuleRadius: 0.3,
        capsuleHalfHeight: 0.9,
        orientRotationToMovement: true,
      },
    },
  };
  let transform: TransformComponent | null = null;
  const movement = new CharacterMovementSubsystem(
    actions,
    (_id, next) => {
      transform = next;
    },
    // @ts-expect-error Forge never type-checked its tests: a partial PhysicsQuery stub (type-only).
    physics,
    { isPlayerControlled: () => true },
  );
  movement.setEntities([entity]);
  movement.update({ deltaSeconds: 0.5, elapsedSeconds: 0.5, frame: 1 });

  assert.ok(transform);
  // @ts-expect-error Forge never type-checked its tests: a `let` assigned inside a callback narrows to never (type-only).
  assert.ok(Math.abs(transform.position[2] - -0.9) < 1e-9, `z stopped at ${transform.position[2]}`);
});

check("CharacterMovement subsystem can orient a character to controller yaw", () => {
  const actions = new ActionMap({});
  actions.advance();
  const entity: Entity = {
    id: "actor:aim",
    components: {
      Transform: { position: [0, 0, 0], rotation: [0, 15, 0], scale: [1, 1, 1] },
      CharacterMovement: {
        maxWalkSpeed: 4,
        sprintMultiplier: 2,
        jumpSpeed: 5,
        gravityScale: 1,
        orientRotationToMovement: true,
        orientRotationToControl: true,
      },
    },
  };

  let transform: TransformComponent | null = null;
  const movement = new CharacterMovementSubsystem(
    actions,
    (_id, next) => {
      transform = next;
    },
    undefined,
    {
      getControlYaw: () => Math.PI / 2,
      isPlayerControlled: () => true,
    },
  );
  movement.setEntities([entity]);
  movement.update({ deltaSeconds: 0.5, elapsedSeconds: 0.5, frame: 1 });
  assert.ok(transform);
  // @ts-expect-error Forge never type-checked its tests: a `let` assigned inside a callback narrows to never (type-only).
  yawApproxEqual(transform.rotation[1], -90);
});

check("CharacterMovement subsystem applies Rotation Rate Z to smooth yaw turns", () => {
  const actions = new ActionMap({ KeyS: "move-back" });
  actions.handleDown("KeyS");
  actions.advance();
  const entity: Entity = {
    id: "actor:turn",
    components: {
      Transform: { position: [0, 0, 0], rotation: [0, 180, 0], scale: [1, 1, 1] },
      CharacterMovement: {
        maxWalkSpeed: 4,
        sprintMultiplier: 2,
        jumpSpeed: 5,
        gravityScale: 1,
        rotationRate: [0, 0, 90],
        orientRotationToMovement: true,
      },
    },
  };

  let transform: TransformComponent | null = null;
  const movement = new CharacterMovementSubsystem(
    actions,
    (_id, next) => {
      transform = next;
    },
    undefined,
    { isPlayerControlled: () => true },
  );
  movement.setEntities([entity]);
  movement.update({ deltaSeconds: 0.1, elapsedSeconds: 0.1, frame: 1 });
  assert.ok(transform);
  // @ts-expect-error Forge never type-checked its tests: a `let` assigned inside a callback narrows to never (type-only).
  yawApproxEqual(transform.rotation[1], -171);
});

check("CharacterMovement subsystem applies jump and gravity from component props", () => {
  const actions = new ActionMap({ Space: "jump" });
  actions.handleDown("Space");
  actions.advance();
  const entity: Entity = {
    id: "actor:jump",
    components: {
      Transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      CharacterMovement: {
        maxWalkSpeed: 3,
        sprintMultiplier: 2,
        jumpSpeed: 5,
        gravityScale: 1,
      },
    },
  };
  let transform: TransformComponent | null = null;
  const movement = new CharacterMovementSubsystem(
    actions,
    (_id, next) => {
      transform = next;
    },
    undefined,
    { getGravityY: () => -10, isPlayerControlled: () => true },
  );
  movement.setEntities([entity]);
  movement.update({ deltaSeconds: 0.1, elapsedSeconds: 0.1, frame: 1 });
  assert.ok(transform);
  // @ts-expect-error Forge never type-checked its tests: a `let` assigned inside a callback narrows to never (type-only).
  assert.ok(transform.position[1] > 0);

  actions.handleUp("Space");
  actions.advance();
  let landed = false;
  for (let frame = 2; frame < 100 && !landed; frame += 1) {
    movement.update({ deltaSeconds: 0.1, elapsedSeconds: frame / 10, frame });
    // @ts-expect-error Forge never type-checked its tests: a `let` assigned inside a callback narrows to never (type-only).
    landed = transform?.position[1] === 0;
  }
  assert.equal(landed, true);
});

check("CharacterMovement subsystem steps onto low platforms and falls off unsupported edges", () => {
  const actions = new ActionMap({ KeyW: "move-forward" });
  const platform: Aabb3 = { min: [-0.5, 0, -0.5], max: [0.5, 0.3, 0.5] };
  const physics = {
    staticBlockerAabbs: () => [platform],
    staticSurfaceTriangles: () => [],
    colliderHalfExtents: () => [0.3, 0.9, 0.3] as [number, number, number],
  };
  const entity: Entity = {
    id: "actor:platformer",
    components: {
      Transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      CharacterMovement: {
        maxWalkSpeed: 4,
        sprintMultiplier: 2,
        jumpSpeed: 5,
        gravityScale: 1,
        capsuleRadius: 0.3,
        capsuleHalfHeight: 0.9,
        maxStepHeight: 0.45,
      },
    },
  };
  let transform: TransformComponent | null = null;
  let report: LocomotionInput | null = null;
  const movement = new CharacterMovementSubsystem(
    actions,
    (_id, next) => {
      transform = next;
    },
    // @ts-expect-error Forge never type-checked its tests: a partial PhysicsQuery stub (type-only).
    physics,
    {
      getGravityY: () => -10,
      isPlayerControlled: () => true,
      reportLocomotion: (_id, next) => {
        report = next;
      },
    },
  );
  movement.setEntities([entity]);

  // The feet ease onto the platform top over a few frames (stepSmoothSpeed 6,
  // dt 1/60 → 0.1/frame), then settle at 0.3 while staying grounded.
  for (let frame = 1; frame <= 5; frame += 1) {
    actions.advance();
    movement.update({ deltaSeconds: 1 / 60, elapsedSeconds: frame / 60, frame });
  }
  // @ts-expect-error Forge never type-checked its tests: a `let` assigned inside a callback narrows to never (type-only).
  assert.ok(Math.abs((transform ?? assert.fail("transform")).position[1] - 0.3) < 1e-9);
  // @ts-expect-error Forge never type-checked its tests: a `let` assigned inside a callback narrows to never (type-only).
  assert.equal(report?.grounded, true);

  actions.handleDown("KeyW");
  actions.advance();
  movement.update({ deltaSeconds: 0.5, elapsedSeconds: 0.5, frame: 6 });
  // @ts-expect-error Forge never type-checked its tests: a `let` assigned inside a callback narrows to never (type-only).
  assert.ok((transform ?? assert.fail("transform")).position[2] < -0.5);
  // @ts-expect-error Forge never type-checked its tests: an indexed read is possibly undefined under noUncheckedIndexedAccess (type-only).
  assert.ok(transform.position[1] < 0.3);
  // @ts-expect-error Forge never type-checked its tests: a `let` assigned inside a callback narrows to never (type-only).
  assert.equal(report?.grounded, false);
});

check("CharacterMovement subsystem eases a step-up over several frames (no camera pop)", () => {
  const actions = new ActionMap();
  const step: Aabb3 = { min: [-5, 0, -5], max: [5, 0.3, 5] }; // flat top at y=0.3
  const physics = {
    staticBlockerAabbs: () => [step],
    staticSurfaceTriangles: () => [],
    colliderHalfExtents: () => [0.3, 0.9, 0.3] as [number, number, number],
  };
  const entity: Entity = {
    id: "actor:stepper",
    components: {
      Transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      Collider: { shape: "box", size: [0.6, 1.8, 0.6], isStatic: false, isSensor: false },
      CharacterMovement: {
        maxWalkSpeed: 3,
        capsuleRadius: 0.3,
        capsuleHalfHeight: 0.9,
        maxStepHeight: 0.45,
        stepSmoothSpeed: 6, // 6 * (1/60) = 0.1 per frame → a 0.3 step takes 3 frames
      },
    },
  };
  let y = 0;
  const movement = new CharacterMovementSubsystem(
    actions,
    (_id, next) => {
      y = next.position[1];
    },
    // @ts-expect-error Forge never type-checked its tests: a partial PhysicsQuery stub (type-only).
    physics,
    { getGravityY: () => -10 },
  );
  movement.setEntities([entity]);

  actions.advance();
  movement.update({ deltaSeconds: 1 / 60, elapsedSeconds: 1 / 60, frame: 1 });
  assert.ok(Math.abs(y - 0.1) < 1e-9, `frame1 eased partway, not snapped: y=${y}`);
  actions.advance();
  movement.update({ deltaSeconds: 1 / 60, elapsedSeconds: 2 / 60, frame: 2 });
  assert.ok(Math.abs(y - 0.2) < 1e-9, `frame2: y=${y}`);
  for (let frame = 3; frame <= 5; frame += 1) {
    actions.advance();
    movement.update({ deltaSeconds: 1 / 60, elapsedSeconds: frame / 60, frame });
  }
  assert.ok(Math.abs(y - 0.3) < 1e-9, `settled at the step top: y=${y}`);
});

check("CharacterMovement subsystem slows the walk while climbing stairs and recovers on the flat", () => {
  const actions = new ActionMap({ KeyW: "move-forward" });
  const floor: Aabb3 = { min: [-2, -0.2, -2], max: [2, 0, 1] };
  const step1: Aabb3 = { min: [-2, 0, -2.6], max: [2, 0.3, -2] };
  const step2: Aabb3 = { min: [-2, 0, -3.2], max: [2, 0.6, -2.6] };
  const step3: Aabb3 = { min: [-2, 0, -3.8], max: [2, 0.9, -3.2] };
  const landing: Aabb3 = { min: [-2, 0, -8], max: [2, 0.9, -3.8] };
  const physics = {
    staticBlockerAabbs: () => [floor, step1, step2, step3, landing],
    staticSurfaceTriangles: () => [],
    colliderHalfExtents: () => [0.3, 0.9, 0.3] as [number, number, number],
  };
  const entity: Entity = {
    id: "actor:climber",
    components: {
      Transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      Collider: { shape: "box", size: [0.6, 1.8, 0.6], isStatic: false, isSensor: false },
      CharacterMovement: {
        maxWalkSpeed: 2,
        capsuleRadius: 0.3,
        capsuleHalfHeight: 0.9,
        maxStepHeight: 0.45,
        maxStepDown: 0.5,
        uphillSpeedScale: 0.65,
        stepSmoothSpeed: 6,
      },
    },
  };
  const speeds: number[] = [];
  const grounded: boolean[] = [];
  // @ts-expect-error Forge never type-checked its tests: a partial PhysicsQuery stub (type-only).
  const movement = new CharacterMovementSubsystem(actions, () => {}, physics, {
    getGravityY: () => -10,
    reportLocomotion: (_id, report) => {
      speeds.push(report.planarSpeed);
      grounded.push(report.grounded);
    },
  });
  movement.setEntities([entity]);
  actions.handleDown("KeyW");
  for (let frame = 1; frame <= 190; frame += 1) {
    actions.advance();
    movement.update({ deltaSeconds: 1 / 60, elapsedSeconds: frame / 60, frame });
  }
  assert.ok(grounded.every(Boolean), "stays grounded across the whole staircase");
  // @ts-expect-error Forge never type-checked its tests: an indexed read is possibly undefined under noUncheckedIndexedAccess (type-only).
  assert.ok(Math.abs(speeds[40] - 2) < 1e-6, `full speed on the flat: ${speeds[40]}`);
  const climbMin = Math.min(...speeds.slice(60, 110));
  assert.ok(climbMin < 1.9 && climbMin > 1.2, `measurably slowed on the stairs: ${climbMin}`);
  // @ts-expect-error Forge never type-checked its tests: an indexed read is possibly undefined under noUncheckedIndexedAccess (type-only).
  assert.ok(speeds[189] > 1.95, `recovered on the landing: ${speeds[189]}`);
});

check("CharacterMovement subsystem slides downhill off a too-steep surface (Öneri C)", () => {
  const actions = new ActionMap({ KeyW: "move-forward" });
  // A 48° slope: steeper than the 45° walk limit (non-walkable) but shallower than
  // the 50° wall gate, so it is exactly the surface the pawn now stands on and
  // must slide down instead of standing frozen. Downhill is +Z (uphill toward -Z).
  const SLOPE = (48 * Math.PI) / 180;
  const tan = Math.tan(SLOPE);
  const nY = Math.cos(SLOPE);
  const yAt = (z: number): number => -z * tan;
  // Vertices wound so the geometric normal is up-facing (ny > 0) and tilts toward +Z.
  const rampA: GroundTriangle = { a: [-3, yAt(-3), -3], b: [-3, yAt(3), 3], c: [3, yAt(3), 3], normalY: nY };
  const rampB: GroundTriangle = { a: [-3, yAt(-3), -3], b: [3, yAt(3), 3], c: [3, yAt(-3), -3], normalY: nY };
  const physics = {
    staticBlockerAabbs: () => [],
    staticSurfaceTriangles: () => [rampA, rampB],
    colliderHalfExtents: () => [0.3, 0.9, 0.3] as [number, number, number],
  };
  const entity: Entity = {
    id: "actor:slider",
    components: {
      Transform: { position: [0, yAt(0), 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      Collider: { shape: "box", size: [0.6, 1.8, 0.6], isStatic: false, isSensor: false },
      CharacterMovement: {
        maxWalkSpeed: 2,
        capsuleRadius: 0.3,
        capsuleHalfHeight: 0.9,
        maxStepHeight: 0.45,
        maxStepDown: 0.5,
        maxSlopeAngleDeg: 45,
        stepSmoothSpeed: 60,
      },
    },
  };
  let y = yAt(0);
  let z = 0;
  const grounded: boolean[] = [];
  const movement = new CharacterMovementSubsystem(
    actions,
    (_id, next) => {
      y = next.position[1];
      z = next.position[2];
    },
    // @ts-expect-error Forge never type-checked its tests: a partial PhysicsQuery stub (type-only).
    physics,
    {
      getGravityY: () => -10,
      // No input: the slide alone must carry the pawn downhill.
      isPlayerControlled: () => false,
      getMoveIntent: () => ({ direction: [0, 0], speed: 0 }),
      reportLocomotion: (_id, report) => grounded.push(report.grounded),
    },
  );
  movement.setEntities([entity]);
  for (let frame = 1; frame <= 90; frame += 1) {
    movement.update({ deltaSeconds: 1 / 60, elapsedSeconds: frame / 60, frame });
  }
  assert.ok(grounded.every(Boolean), "stays supported (never falls through) while sliding");
  assert.ok(z > 0.3, `slid downhill (+Z) under gravity: z=${z}`);
  assert.ok(y < -0.3 && Math.abs(y - yAt(z)) < 0.15, `hugged the slope on the way down: y=${y}`);
});

check("CharacterMovement subsystem walks down a 0.4 ledge without entering falling", () => {
  const actions = new ActionMap({ KeyW: "move-forward" });
  const platform: Aabb3 = { min: [-2, 0, -1], max: [2, 0.4, 1] };
  const floor: Aabb3 = { min: [-2, -0.2, -6], max: [2, 0, -1] };
  const physics = {
    staticBlockerAabbs: () => [platform, floor],
    staticSurfaceTriangles: () => [],
    colliderHalfExtents: () => [0.3, 0.9, 0.3] as [number, number, number],
  };
  const entity: Entity = {
    id: "actor:descender",
    components: {
      Transform: { position: [0, 0.4, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      Collider: { shape: "box", size: [0.6, 1.8, 0.6], isStatic: false, isSensor: false },
      // maxStepDown omitted on purpose: the component default (0.5) covers the drop.
      CharacterMovement: {
        maxWalkSpeed: 2,
        capsuleRadius: 0.3,
        capsuleHalfHeight: 0.9,
        maxStepHeight: 0.45,
        stepSmoothSpeed: 6,
      },
    },
  };
  let y = 0.4;
  const grounded: boolean[] = [];
  const movement = new CharacterMovementSubsystem(
    actions,
    (_id, next) => {
      y = next.position[1];
    },
    // @ts-expect-error Forge never type-checked its tests: a partial PhysicsQuery stub (type-only).
    physics,
    {
      getGravityY: () => -10,
      reportLocomotion: (_id, report) => {
        grounded.push(report.grounded);
      },
    },
  );
  movement.setEntities([entity]);
  actions.handleDown("KeyW");
  for (let frame = 1; frame <= 90; frame += 1) {
    actions.advance();
    movement.update({ deltaSeconds: 1 / 60, elapsedSeconds: frame / 60, frame });
  }
  assert.ok(grounded.every(Boolean), "never enters falling on a step-sized drop");
  assert.ok(Math.abs(y) < 1e-9, `eased down onto the lower floor: y=${y}`);
});

check("CharacterMovement subsystem stays glued to a descending slope while running (scaled ground snap)", () => {
  const actions = new ActionMap({ KeyW: "move-forward" });
  // A 40° ramp descending in the forward (-Z) direction, modelled as walkable
  // surface triangles. y depends only on z (planar ramp): top edge at z=2 → y=0.
  const SLOPE = (40 * Math.PI) / 180;
  const tan = Math.tan(SLOPE);
  const nY = Math.cos(SLOPE);
  const yAt = (z: number): number => (z - 2) * tan;
  const rampA: GroundTriangle = { a: [-2, yAt(2), 2], b: [2, yAt(2), 2], c: [2, yAt(-10), -10], normalY: nY };
  const rampB: GroundTriangle = { a: [-2, yAt(2), 2], b: [2, yAt(-10), -10], c: [-2, yAt(-10), -10], normalY: nY };
  const physics = {
    staticBlockerAabbs: () => [],
    staticSurfaceTriangles: () => [rampA, rampB],
    colliderHalfExtents: () => [0.3, 0.9, 0.3] as [number, number, number],
  };
  const entity: Entity = {
    id: "actor:runner",
    components: {
      Transform: { position: [0, yAt(0), 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      Collider: { shape: "box", size: [0.6, 1.8, 0.6], isStatic: false, isSensor: false },
      CharacterMovement: {
        // Fast enough that one spiked frame (dt=0.1) drops the surface ~0.67 below
        // the feet — more than the fixed 0.5 base — so the old fixed probe would
        // lose the floor and launch the pawn off the slope.
        maxWalkSpeed: 8,
        capsuleRadius: 0.3,
        capsuleHalfHeight: 0.9,
        maxStepHeight: 0.45,
        maxStepDown: 0.5,
        maxSlopeAngleDeg: 45,
        stepSmoothSpeed: 60,
      },
    },
  };
  let y = yAt(0);
  let z = 0;
  const grounded: boolean[] = [];
  const movement = new CharacterMovementSubsystem(
    actions,
    (_id, next) => {
      y = next.position[1];
      z = next.position[2];
    },
    // @ts-expect-error Forge never type-checked its tests: a partial PhysicsQuery stub (type-only).
    physics,
    {
      getGravityY: () => -10,
      reportLocomotion: (_id, report) => grounded.push(report.grounded),
    },
  );
  movement.setEntities([entity]);
  actions.handleDown("KeyW");
  // Spiked frames (dt clamped to 0.1s), the exact condition that separates walking
  // (small step, stays grounded) from running (large step, used to launch).
  for (let frame = 1; frame <= 6; frame += 1) {
    actions.advance();
    movement.update({ deltaSeconds: 0.1, elapsedSeconds: frame * 0.1, frame });
  }
  assert.ok(grounded.every(Boolean), `never launches off the running descent: ${grounded}`);
  assert.ok(z < -4, `moved forward down the ramp: z=${z}`);
  // Followed the incline down rather than staying at the launch height.
  assert.ok(Math.abs(y - yAt(z)) < 0.15, `hugs the slope surface: y=${y} expected≈${yAt(z)}`);
});

check("CharacterMovement subsystem follows a walkable landscape slope at the player sprint smoothing speed", () => {
  const actions = new ActionMap({ KeyW: "move-forward", ShiftLeft: "sprint" });
  // Mirrors Script_PlayerCharacter: walk=2, sprint multiplier=3, vertical
  // step smoothing=2. A 40 degree descent needs ~5.03 vertical units/s while
  // sprinting, so generic step smoothing used to accumulate enough lag for the
  // next ground probe to miss this otherwise walkable surface.
  const SLOPE = (40 * Math.PI) / 180;
  const tan = Math.tan(SLOPE);
  const normalY = Math.cos(SLOPE);
  const yAt = (z: number): number => (z - 2) * tan;
  const rampA: GroundTriangle = {
    a: [-2, yAt(2), 2],
    b: [2, yAt(2), 2],
    c: [2, yAt(-10), -10],
    normalY,
  };
  const rampB: GroundTriangle = {
    a: [-2, yAt(2), 2],
    b: [2, yAt(-10), -10],
    c: [-2, yAt(-10), -10],
    normalY,
  };
  const physics = {
    staticBlockerAabbs: () => [],
    staticSurfaceTriangles: () => [rampA, rampB],
    colliderHalfExtents: () => [0.3, 0.9, 0.3] as [number, number, number],
  };
  const entity: Entity = {
    id: "actor:player-sprint-descender",
    components: {
      Transform: { position: [0, yAt(0), 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      Collider: { shape: "box", size: [0.6, 1.8, 0.6], isStatic: false, isSensor: false },
      CharacterMovement: {
        maxWalkSpeed: 2,
        sprintMultiplier: 3,
        capsuleRadius: 0.3,
        capsuleHalfHeight: 0.9,
        maxStepHeight: 0.45,
        maxStepDown: 0.5,
        maxSlopeAngleDeg: 45,
        stepSmoothSpeed: 2,
      },
    },
  };
  let y = yAt(0);
  let z = 0;
  const grounded: boolean[] = [];
  const movement = new CharacterMovementSubsystem(
    actions,
    (_id, next) => {
      y = next.position[1];
      z = next.position[2];
    },
    // @ts-expect-error Forge never type-checked its tests: a partial PhysicsQuery stub (type-only).
    physics,
    { getGravityY: () => -10, reportLocomotion: (_id, report) => grounded.push(report.grounded) },
  );
  movement.setEntities([entity]);
  actions.handleDown("KeyW");
  actions.handleDown("ShiftLeft");
  for (let frame = 1; frame <= 60; frame += 1) {
    actions.advance();
    movement.update({ deltaSeconds: 1 / 60, elapsedSeconds: frame / 60, frame });
  }
  assert.ok(grounded.every(Boolean), `sprint stays grounded: ${grounded}`);
  assert.ok(z < -5.5, `sprinted down the slope: z=${z}`);
  assert.ok(Math.abs(y - yAt(z)) < 1e-9, `follows the slope exactly: y=${y} expected=${yAt(z)}`);
});

check("CharacterMovement subsystem still falls off a drop beyond Max Step Down", () => {
  const actions = new ActionMap({ KeyW: "move-forward" });
  const platform: Aabb3 = { min: [-2, 0, -1], max: [2, 0.6, 1] }; // 0.6 > maxStepDown 0.5
  const floor: Aabb3 = { min: [-2, -0.2, -6], max: [2, 0, -1] };
  const physics = {
    staticBlockerAabbs: () => [platform, floor],
    staticSurfaceTriangles: () => [],
    colliderHalfExtents: () => [0.3, 0.9, 0.3] as [number, number, number],
  };
  const entity: Entity = {
    id: "actor:faller",
    components: {
      Transform: { position: [0, 0.6, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      Collider: { shape: "box", size: [0.6, 1.8, 0.6], isStatic: false, isSensor: false },
      CharacterMovement: {
        maxWalkSpeed: 2,
        capsuleRadius: 0.3,
        capsuleHalfHeight: 0.9,
        maxStepHeight: 0.45,
        stepSmoothSpeed: 6,
      },
    },
  };
  let y = 0.6;
  const grounded: boolean[] = [];
  const movement = new CharacterMovementSubsystem(
    actions,
    (_id, next) => {
      y = next.position[1];
    },
    // @ts-expect-error Forge never type-checked its tests: a partial PhysicsQuery stub (type-only).
    physics,
    {
      getGravityY: () => -10,
      reportLocomotion: (_id, report) => {
        grounded.push(report.grounded);
      },
    },
  );
  movement.setEntities([entity]);
  actions.handleDown("KeyW");
  for (let frame = 1; frame <= 120; frame += 1) {
    actions.advance();
    movement.update({ deltaSeconds: 1 / 60, elapsedSeconds: frame / 60, frame });
  }
  assert.ok(grounded.some((flag) => !flag), "a beyond-threshold drop goes airborne");
  assert.equal(grounded[grounded.length - 1], true, "lands back on the floor");
  assert.ok(Math.abs(y) < 1e-9, `settled on the lower floor: y=${y}`);
});

check("AI spline patrol move speed stays stable at 30 and 120 FPS through CharacterMovement", () => {
  const runForOneSecond = (fps: number): { positionX: number; planarSpeed: number | undefined } => {
    const actions = new ActionMap({});
    const entity: Entity = {
      id: "guard",
      components: {
        Transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        CharacterMovement: {
          maxWalkSpeed: 4,
          sprintMultiplier: 1,
          jumpSpeed: 5,
          gravityScale: 1,
          orientRotationToMovement: true,
        },
      },
    };
    const splineLookAheadMove = { position: [100, 0, 0] as Vec3, speed: 2.4 };
    let lastReport: LocomotionInput | undefined;
    const movement = new CharacterMovementSubsystem(actions, () => undefined, undefined, {
      isPlayerControlled: () => false,
      getMoveIntent: (_entityId, transform) => ({
        direction: [
          splineLookAheadMove.position[0] - transform.position[0],
          splineLookAheadMove.position[2] - transform.position[2],
        ],
        speed: splineLookAheadMove.speed,
      }),
      reportLocomotion: (_entityId, report) => { lastReport = report; },
    });
    movement.setEntities([entity]);
    for (let frame = 1; frame <= fps; frame += 1) {
      movement.update({ deltaSeconds: 1 / fps, elapsedSeconds: frame / fps, frame });
    }
    return {
      positionX: movement.transformOf("guard")?.position[0] ?? 0,
      planarSpeed: lastReport?.planarSpeed,
    };
  };

  const thirtyFps = runForOneSecond(30);
  const oneTwentyFps = runForOneSecond(120);
  assert.ok(Math.abs(thirtyFps.positionX - 2.4) < 1e-8);
  assert.ok(Math.abs(oneTwentyFps.positionX - 2.4) < 1e-8);
  assert.equal(thirtyFps.planarSpeed, 2.4);
  assert.equal(oneTwentyFps.planarSpeed, 2.4);
});
