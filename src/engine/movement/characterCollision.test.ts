// Ported from Forge WebGL tools/engine-tests.ts @ forge-webgl-final (04b5fb23): each check is
// copied unchanged and runs as a Vitest test; docs/PORT_LOG.md §2.
import assert from "node:assert/strict";
import { collapseCoincidentFloors, filterWalkableBlockers, findGroundAt, findGroundLayersAt, findLandingGround, resolvePlanarMovement, resolvePlanarMovementSubstepped, safeSubstepLength, type Aabb3 } from "./characterCollision.ts";
import { type LocomotionInput } from "./locomotionAnimation.ts";
import { slopeCosFromDegrees, type GroundTriangle } from "./slopeSurface.ts";
import { test } from "vitest";

const check = test;

const RAMP_NORMAL_Y = 8 / Math.hypot(4, 8, 0);

// G5 movement-driven animation (src/game/locomotionAnimation.ts): map the
// player's per-tick movement snapshot to a semantic state, then to a concrete
// clip via per-state fallback chains. Pure selection the runtime shell applies
// to a crossfade animator.
const ground = (planarSpeed: number): LocomotionInput => ({ planarSpeed, grounded: true, velocityY: 0 });

// G3 collision response (src/game/collision.ts): resolve a proposed XZ move
// against static collider AABBs so the player cannot enter walls and slides
// along them. Vertical span gates which blockers apply (jump over short ones).
check("resolvePlanarMovement: no blockers leaves the move unchanged", () => {
  assert.deepEqual(
    resolvePlanarMovement([0, 0, 0], { dx: 1, dz: 2 }, [0.5, 0.5, 0.5], []),
    { dx: 1, dz: 2 },
  );
});

check("resolvePlanarMovement: head-on into a wall is blocked; diagonal slides", () => {
  const wall: Aabb3 = { min: [0.5, -1, -5], max: [1.5, 1, 5] }; // X-facing slab
  // Head-on +x from x=-0.1 (half 0.5): clamps flush to x=0 (wall.min - half).
  const headOn = resolvePlanarMovement([-0.1, 0, 0], { dx: 0.3, dz: 0 }, [0.5, 0.5, 0.5], [wall]);
  assert.ok(Math.abs(headOn.dx - 0.1) <= 1e-12);
  assert.equal(headOn.dz, 0);
  // Diagonal into the same wall: x is blocked, z slides freely.
  const diag = resolvePlanarMovement([-0.1, 0, 0], { dx: 0.3, dz: 0.4 }, [0.5, 0.5, 0.5], [wall]);
  assert.ok(Math.abs(diag.dx - 0.1) <= 1e-12);
  assert.ok(Math.abs(diag.dz - 0.4) <= 1e-12);
});

check("resolvePlanarMovement: a blocker above the player's span does not block", () => {
  const overhead: Aabb3 = { min: [0.5, 1, -5], max: [1.5, 2, 5] };
  // Player vertical span [-0.25, 0.25] sits below the overhead blocker.
  const moved = resolvePlanarMovement([-0.1, 0, 0], { dx: 0.3, dz: 0 }, [0.5, 0.25, 0.5], [overhead]);
  assert.ok(Math.abs(moved.dx - 0.3) <= 1e-12);
});

check("resolvePlanarMovement: a blocker the player already overlaps does not block (ground)", () => {
  // Large ground slab the player stands within (overlaps on every axis at start).
  const ground: Aabb3 = { min: [-5, -0.5, -5], max: [5, 0.5, 5] };
  const moved = resolvePlanarMovement([0, 0, 0], { dx: 0.3, dz: -0.4 }, [0.15, 0.15, 0.15], [ground]);
  assert.ok(Math.abs(moved.dx - 0.3) <= 1e-12);
  assert.ok(Math.abs(moved.dz + 0.4) <= 1e-12);
});

check("resolvePlanarMovement: stops at the blocker in the path among several", () => {
  const near: Aabb3 = { min: [0.5, -1, -5], max: [1.5, 1, 5] };
  const far: Aabb3 = { min: [3, -1, -5], max: [4, 1, 5] };
  const moved = resolvePlanarMovement([0, 0, 0], { dx: 1.2, dz: 0 }, [0.5, 0.5, 0.5], [far, near]);
  assert.ok(Math.abs(moved.dx) <= 1e-12); // flush against the near wall (x stays 0)
});

// P1.1 — tunneling guard. A single-pass resolve lets a fast move (delta longer
// than the wall is thick) skip clean over a thin wall, because the destination no
// longer overlaps it. The substepped wrapper must stop flush regardless of speed.
check("safeSubstepLength: half the thinnest X/Z extent, Infinity for no blockers", () => {
  assert.equal(safeSubstepLength([]), Infinity);
  const thinWall: Aabb3 = { min: [0.9, -1, -5], max: [1.1, 1, 5] }; // 0.2 thick on X
  assert.ok(Math.abs(safeSubstepLength([thinWall]) - 0.1) < 1e-12);
  const sliver: Aabb3 = { min: [0, 0, 0], max: [0.001, 1, 1] }; // floored at 0.01
  assert.ok(Math.abs(safeSubstepLength([sliver]) - 0.01) < 1e-12);
});

check("resolvePlanarMovement: trimesh wall segment footprint does not block its empty AABB corners", () => {
  const wall: Aabb3 = {
    min: [-1.5, -1, -1.5],
    max: [1.5, 1, 1.5],
    footprint: [[-1, 1], [1, -1]],
  };
  const moved = resolvePlanarMovement([1.7, 0, 0.8], { dx: -0.4, dz: 0 }, [0.1, 0.5, 0.1], [wall]);
  assert.ok(Math.abs(moved.dx + 0.4) < 1e-9, `dx=${moved.dx}`);
  assert.equal(moved.dz, 0);
  assert.equal(safeSubstepLength([wall]), 0.01);
});

check("resolvePlanarMovementSubstepped: a fast move cannot tunnel through a thin wall", () => {
  const thinWall: Aabb3 = { min: [0.9, -1, -5], max: [1.1, 1, 5] }; // 0.2 thick
  const half: [number, number, number] = [0.3, 0.5, 0.3];
  const fast = { dx: 3, dz: 0 }; // far longer than the wall is thick
  // Single-pass resolve tunnels: the destination (x≈3) no longer overlaps the wall.
  const naive = resolvePlanarMovement([0, 0, 0], fast, half, [thinWall]);
  assert.ok(naive.dx > 1, "sanity: the single-pass resolve is expected to tunnel here");
  // Substepped resolve stops flush against the wall's near face (x = 0.9 - 0.3).
  const guarded = resolvePlanarMovementSubstepped(
    [0, 0, 0],
    fast,
    half,
    [thinWall],
    safeSubstepLength([thinWall]),
  );
  assert.ok(Math.abs(guarded.dx - 0.6) < 1e-9, `guarded.dx=${guarded.dx}`);
});

check("resolvePlanarMovementSubstepped: a move within one substep matches the single pass", () => {
  const wall: Aabb3 = { min: [0.5, -1, -5], max: [1.5, 1, 5] };
  const half: [number, number, number] = [0.5, 0.5, 0.5];
  const small = { dx: 0.05, dz: 0.03 };
  const single = resolvePlanarMovement([0, 0, 0], small, half, [wall]);
  const stepped = resolvePlanarMovementSubstepped([0, 0, 0], small, half, [wall], safeSubstepLength([wall]));
  assert.deepEqual(stepped, single);
});

check("resolvePlanarMovementSubstepped: preserves wall slide on a fast diagonal move", () => {
  const wall: Aabb3 = { min: [0.9, -1, -5], max: [1.1, 1, 5] }; // X-facing, thin
  const half: [number, number, number] = [0.3, 0.5, 0.3];
  const guarded = resolvePlanarMovementSubstepped(
    [0, 0, 0],
    { dx: 3, dz: 2 },
    half,
    [wall],
    safeSubstepLength([wall]),
  );
  assert.ok(Math.abs(guarded.dx - 0.6) < 1e-9, `blocked dx=${guarded.dx}`); // flush on X
  assert.ok(Math.abs(guarded.dz - 2) < 1e-9, `slid dz=${guarded.dz}`); // Z slides freely
});

check("findGroundAt: a walkable ramp surface supplies the interpolated floor height", () => {
  const ramp: GroundTriangle = { a: [0, 0, -1], b: [4, 2, -1], c: [4, 2, 1], normalY: RAMP_NORMAL_Y };
  const hit = findGroundAt([3, 1.5, 0], [], {
    footprintHalf: [0.3, 0.3],
    maxStepUp: 0.45,
    maxStepDown: 0.2,
    surfaces: [ramp],
    maxSlopeCos: slopeCosFromDegrees(45), // 26.57° < 45° → walkable
  });
  assert.ok(hit && hit.blocker === null && Math.abs(hit.floorY - 1.5) < 1e-9, `floorY=${hit?.floorY}`);
  assert.equal(hit?.walkable, true);
});

check("findGroundAt: a ramp steeper than the slope limit still supports the pawn but is not walkable", () => {
  const ramp: GroundTriangle = { a: [0, 0, -1], b: [4, 2, -1], c: [4, 2, 1], normalY: RAMP_NORMAL_Y };
  const hit = findGroundAt([3, 1.5, 0], [], {
    footprintHalf: [0.3, 0.3],
    maxStepUp: 0.45,
    maxStepDown: 0.2,
    surfaces: [ramp],
    maxSlopeCos: slopeCosFromDegrees(20), // 20° < 26.57° → too steep to walk
  });
  // Öneri A: the steep surface still returns a floor (no fall-through), flagged
  // non-walkable so slide/deny-ascent can build on it later.
  assert.ok(hit && hit.blocker === null && Math.abs(hit.floorY - 1.5) < 1e-9, `floorY=${hit?.floorY}`);
  assert.equal(hit?.walkable, false);
});

check("findGroundAt: a flat AABB top still wins over a lower ramp surface", () => {
  const ramp: GroundTriangle = { a: [0, 0, -1], b: [4, 2, -1], c: [4, 2, 1], normalY: RAMP_NORMAL_Y };
  const shelf: Aabb3 = { min: [2, 0, -1], max: [4, 1.7, 1] }; // top 1.7 > ramp's 1.5 at x=3
  const hit = findGroundAt([3, 1.7, 0], [shelf], {
    footprintHalf: [0.3, 0.3],
    maxStepUp: 0.45,
    maxStepDown: 0.4,
    surfaces: [ramp],
    maxSlopeCos: slopeCosFromDegrees(45),
  });
  assert.ok(hit && Math.abs(hit.floorY - 1.7) < 1e-9, `floorY=${hit?.floorY}`);
});

check("findGroundAt: preferredFloorY chooses the intended stacked floor", () => {
  const lowerFloor: Aabb3 = { min: [-2, -0.2, -2], max: [2, 0, 2] };
  const upperFloor: Aabb3 = { min: [-2, 1.8, -2], max: [2, 2, 2] };
  const options = {
    footprintHalf: [0.25, 0.25] as [number, number],
    maxStepUp: 0,
    maxStepDown: 4,
  };

  assert.equal(findGroundAt([0, 3, 0], [lowerFloor, upperFloor], options)?.floorY, 2);
  assert.equal(
    findGroundAt([0, 3, 0], [lowerFloor, upperFloor], { ...options, preferredFloorY: 0 })?.floorY,
    0,
  );
  assert.equal(
    findGroundAt([0, 3, 0], [lowerFloor, upperFloor], { ...options, preferredFloorY: 2 })?.floorY,
    2,
  );
});

check("findGroundLayersAt returns every walkable stacked floor", () => {
  const lowerFloor: Aabb3 = { min: [-2, -0.2, -2], max: [2, 0, 2] };
  const upperFloor: Aabb3 = { min: [-2, 1.8, -2], max: [2, 2, 2] };
  const layers = findGroundLayersAt([0, 3, 0], [lowerFloor, upperFloor], {
    footprintHalf: [0.25, 0.25],
    maxStepUp: 0,
    maxStepDown: 4,
  });
  assert.deepEqual(layers.map((hit) => hit.floorY), [0, 2]);
});

check("findGroundLayersAt support radius rejects narrow wall tops but keeps stacked floors", () => {
  const floor: Aabb3 = { min: [-3, -0.2, -3], max: [3, 0, 3] };
  const wall: Aabb3 = { min: [-2, 0, -0.1], max: [2, 1, 0.1] };
  const upperFloor: Aabb3 = { min: [-3, 1.8, -3], max: [3, 2, 3] };
  const options = {
    footprintHalf: [0.35, 0.35] as [number, number],
    maxStepUp: 0,
    maxStepDown: 4,
  };

  assert.deepEqual(
    findGroundLayersAt([0, 3, 0], [floor, wall], options).map((hit) => hit.floorY),
    [0, 1],
  );
  assert.deepEqual(
    findGroundLayersAt([0, 3, 0], [floor, wall], { ...options, requiredSupportRadius: 0.15 }).map(
      (hit) => hit.floorY,
    ),
    [0],
  );
  assert.deepEqual(
    findGroundLayersAt([0, 3, 0], [floor, upperFloor], { ...options, requiredSupportRadius: 0.15 }).map(
      (hit) => hit.floorY,
    ),
    [0, 2],
  );
});

check("findGroundLayersAt support radius keeps stair treads walkable", () => {
  const floor: Aabb3 = { min: [-2, -0.2, -2], max: [2, 0, 1] };
  const step1: Aabb3 = { min: [-2, 0, -2.6], max: [2, 0.3, -2] };
  const step2: Aabb3 = { min: [-2, 0, -3.2], max: [2, 0.6, -2.6] };
  const step3: Aabb3 = { min: [-2, 0, -3.8], max: [2, 0.9, -3.2] };
  const options = {
    footprintHalf: [0.35, 0.35] as [number, number],
    maxStepUp: 0,
    maxStepDown: 4,
    requiredSupportRadius: 0.15,
  };

  assert.ok(findGroundLayersAt([0, 2, -2.3], [floor, step1, step2, step3], options).some((hit) => hit.floorY === 0.3));
  assert.ok(findGroundLayersAt([0, 2, -2.9], [floor, step1, step2, step3], options).some((hit) => hit.floorY === 0.6));
  assert.ok(findGroundLayersAt([0, 2, -3.5], [floor, step1, step2, step3], options).some((hit) => hit.floorY === 0.9));
});

check("findGroundLayersAt can respect navigation roles without changing default ground probes", () => {
  const floor: Aabb3 = { min: [-2, -0.2, -2], max: [2, 0, 2] };
  const obstacleTop: Aabb3 = {
    min: [-1, 0, -1],
    max: [1, 1, 1],
    navigationRole: "obstacleOnly",
  };
  const options = {
    footprintHalf: [0.25, 0.25] as [number, number],
    maxStepUp: 0,
    maxStepDown: 3,
  };
  assert.deepEqual(
    findGroundLayersAt([0, 2, 0], [floor, obstacleTop], options).map((hit) => hit.floorY),
    [0, 1],
  );
  assert.deepEqual(
    findGroundLayersAt([0, 2, 0], [floor, obstacleTop], {
      ...options,
      respectNavigationRole: true,
    }).map((hit) => hit.floorY),
    [0],
  );
});

check("findGroundLayersAt support radius rejects rotated wall footprint tops", () => {
  const c = Math.SQRT1_2;
  const halfLength = 2;
  const halfWidth = 0.1;
  const dx = c * halfLength;
  const dz = c * halfLength;
  const px = -c * halfWidth;
  const pz = c * halfWidth;
  const wall: Aabb3 = {
    min: [-dx - Math.abs(px), 0, -dz - Math.abs(pz)],
    max: [dx + Math.abs(px), 1, dz + Math.abs(pz)],
    footprint: [
      [-dx + px, -dz + pz],
      [dx + px, dz + pz],
      [dx - px, dz - pz],
      [-dx - px, -dz - pz],
    ],
  };

  assert.deepEqual(
    findGroundLayersAt([0, 2, 0], [wall], {
      footprintHalf: [0.35, 0.35],
      maxStepUp: 0,
      maxStepDown: 3,
      requiredSupportRadius: 0.15,
    }),
    [],
  );
  assert.deepEqual(
    findGroundLayersAt([0, 2, 0], [wall], {
      footprintHalf: [0.05, 0.05],
      maxStepUp: 0,
      maxStepDown: 3,
      requiredSupportRadius: 0.05,
    }).map((hit) => hit.floorY),
    [1],
  );
});

// Recast walkableHeight: the nav floor probe drops a layer that lacks the agent's
// height of clearance above it, so no nav floor is baked under a ramp/stair. A
// higher walkable surface (ramp top) and a blocker underside both count as ceilings.
check("findGroundLayersAt headroom gate drops floor cells under a low ceiling", () => {
  const floor: Aabb3 = { min: [-3, -0.2, -3], max: [3, 0, 3] };
  // A walkable roof 1 m above the floor (the top face of a ramp/platform whose
  // underside this floor sits beneath).
  const roofA: GroundTriangle = { a: [-3, 1, -3], b: [3, 1, -3], c: [3, 1, 3], normalY: 1 };
  const roofB: GroundTriangle = { a: [-3, 1, -3], b: [3, 1, 3], c: [-3, 1, 3], normalY: 1 };
  const base = {
    footprintHalf: [0.35, 0.35] as [number, number],
    maxStepUp: 0,
    maxStepDown: 5,
    surfaces: [roofA, roofB],
    maxSlopeCos: 0.5,
  };
  // No gate: both the floor (0) and the roof (1) are walkable layers.
  assert.deepEqual(
    findGroundLayersAt([0, 3, 0], [floor], base).map((hit) => hit.floorY),
    [0, 1],
  );
  // Gate 1.8: the floor at 0 has only 1 m of clearance -> dropped; the roof at 1
  // has open sky above -> kept.
  assert.deepEqual(
    findGroundLayersAt([0, 3, 0], [floor], { ...base, requiredHeadroom: 1.8 }).map((hit) => hit.floorY),
    [1],
  );
  // A high roof (2.5 m) leaves enough clearance -> the floor stays walkable.
  const highA: GroundTriangle = { a: [-3, 2.5, -3], b: [3, 2.5, -3], c: [3, 2.5, 3], normalY: 1 };
  const highB: GroundTriangle = { a: [-3, 2.5, -3], b: [3, 2.5, 3], c: [-3, 2.5, 3], normalY: 1 };
  assert.deepEqual(
    findGroundLayersAt([0, 3, 0], [floor], { ...base, surfaces: [highA, highB], requiredHeadroom: 1.8 }).map(
      (hit) => hit.floorY,
    ),
    [0, 2.5],
  );
});

check("findGroundLayersAt headroom gate treats a blocker underside as a ceiling", () => {
  const floor: Aabb3 = { min: [-3, -0.2, -3], max: [3, 0, 3] };
  const lowSlab: Aabb3 = { min: [-3, 1, -3], max: [3, 1.2, 3] }; // solid slab 1 m up
  const options = {
    footprintHalf: [0.35, 0.35] as [number, number],
    maxStepUp: 0,
    maxStepDown: 5,
    requiredHeadroom: 1.8,
  };
  // Floor(0) has the slab underside (1 m) overhead -> dropped; the slab top (1.2)
  // has clear sky -> kept.
  assert.deepEqual(
    findGroundLayersAt([0, 3, 0], [floor, lowSlab], options).map((hit) => hit.floorY),
    [1.2],
  );
});

check("findGroundLayersAt never seeds from a seedsGround:false hull top", () => {
  const floor: Aabb3 = { min: [-3, -0.2, -3], max: [3, 0, 3] };
  // The editor's enclosing hull AABB of a complexAsSimple ramp: its flat top is
  // a fictional plane at peak height, so it must not become a floor layer.
  const hull: Aabb3 = { min: [-2, 0, -2], max: [2, 1.1, 2], navigationRole: "walkable", seedsGround: false };
  const options = {
    footprintHalf: [0.35, 0.35] as [number, number],
    maxStepUp: 0,
    maxStepDown: 5,
    respectNavigationRole: true,
  };
  assert.deepEqual(
    findGroundLayersAt([0, 3, 0], [floor, hull], options).map((hit) => hit.floorY),
    [0],
  );
  // Without the flag the same hull would seed its (fictional) top.
  const seedingHull: Aabb3 = { min: [-2, 0, -2], max: [2, 1.1, 2], navigationRole: "walkable" };
  assert.deepEqual(
    findGroundLayersAt([0, 3, 0], [floor, seedingHull], options).map((hit) => hit.floorY),
    [0, 1.1],
  );
});

check("collapseCoincidentFloors merges same-floor clusters and keeps distinct levels", () => {
  // A solid floor mesh reports its top face and slab underside a few cm apart:
  // one navigable floor, keeping the higher surface the pawn stands on.
  assert.deepEqual(collapseCoincidentFloors([0, 0.03, 2], 0.45), [0.03, 2]);
  // Unsorted input, chained cluster, and floors beyond the step height survive.
  assert.deepEqual(collapseCoincidentFloors([2, 0, 0.3, 0.6, 1.8], 0.45), [0.6, 2]);
  assert.deepEqual(collapseCoincidentFloors([], 0.45), []);
});

check("ground probe finds walkable tops, landing crossings, and filters step-height blockers", () => {
  const floor: Aabb3 = { min: [-5, -0.2, -5], max: [5, 0, 5] };
  const lowPlatform: Aabb3 = { min: [-0.5, 0, -0.5], max: [0.5, 0.3, 0.5] };
  const wall: Aabb3 = { min: [1, 0, -0.5], max: [1.5, 1.2, 0.5] };
  const options = {
    footprintHalf: [0.25, 0.25] as [number, number],
    maxStepUp: 0.45,
    maxStepDown: 0.2,
  };

  assert.equal(findGroundAt([0, 0, 0], [floor, lowPlatform], options)?.floorY, 0.3);
  assert.equal(findGroundAt([2, 0.3, 0], [lowPlatform], options), null);
  assert.equal(findLandingGround(1.1, 0.2, [0, 0.2, 0], [lowPlatform], options)?.floorY, 0.3);
  assert.deepEqual(filterWalkableBlockers(0, [floor, lowPlatform, wall], 0.45), [wall]);
});
