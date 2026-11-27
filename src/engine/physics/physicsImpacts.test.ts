// Ported from Forge WebGL tests/engine/physicsImpacts.test.ts @ forge-webgl-final (04b5fb23): checks unchanged, run by
// Vitest; 1 check(s) not yet portable left out. docs/PORT_LOG.md §2.
import assert from "node:assert/strict";
import type { PhysicsBody } from "./physicsTypes.ts";
import { type PhysicsImpact } from "./impactEvents.ts";
import { loadRapier, PhysicsSubsystem } from "./physicsSubsystem.ts";
import { test } from "vitest";


type CheckAsync = (label: string, fn: () => Promise<void>) => Promise<void>;

const STEP = 1 / 60;

const floor = (): PhysicsBody => ({
  id: "floor", transform: { position: [0, -0.5, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
  collider: { shape: "box", size: [20, 1, 20], isStatic: true, isSensor: false },
});

/** A 1 m, 10 kg crate whose underside starts the given distance above the floor. */
const crate = (drop: number, x = 0): PhysicsBody =>
  freeBox(x === 0 ? "crate" : `crate:${x}`, [x, 0.5 + drop, 0]);

async function withQuietRapier<T>(fn: () => Promise<T>): Promise<T> {
  const warn = console.warn;
  console.warn = (...args: unknown[]) => {
    if (String(args[0] ?? "").includes("deprecated parameters for the initialization function")) return;
    warn(...args);
  };
  try {
    return await fn();
  } finally {
    console.warn = warn;
  }
}

async function world(bodies: PhysicsBody[], configure: (physics: PhysicsSubsystem) => void = () => {}) {
  const physics = new PhysicsSubsystem({ backend: "rapier" });
  physics.addBodies(bodies);
  configure(physics);
  physics.startRapier(await loadRapier());
  return physics;
}

/** Runs frames of `frameSeconds` until `slices` fixed steps ran; returns every frame's impacts. */
function run(physics: PhysicsSubsystem, frameSeconds: number, slices: number): PhysicsImpact[][] {
  const frames: PhysicsImpact[][] = [];
  let taken = 0;
  while (taken < slices) {
    physics.step(frameSeconds);
    taken += physics.lastFrameStepCount();
    frames.push([...physics.impacts()]);
  }
  assert.equal(taken, slices, "the frame rate must divide the slice count");
  return frames;
}

const strongest = (frames: PhysicsImpact[][]): PhysicsImpact | null =>
  frames.flat().reduce<PhysicsImpact | null>((best, impact) => (!best || impact.impulse > best.impulse ? impact : best), null);

/** A 1 m dynamic box; the motion checks below turn gravity off. */
function freeBox(id: string, position: [number, number, number], massKg = 10): PhysicsBody {
  return {
    id, transform: { position, rotation: [0, 0, 0], scale: [1, 1, 1] },
    collider: { shape: "box", size: [1, 1, 1], isStatic: false, isSensor: false, simulatePhysics: true, massKg },
  };
}

const weightless = (physics: PhysicsSubsystem): void => physics.setGravity([0, 0, 0]);

export async function registerPhysicsImpactTests(checkAsync: CheckAsync): Promise<void> {
  await checkAsync("physics motion: a point on a spinning body moves at v + ω × r, and a set velocity holds", () => withQuietRapier(async () => {
    const physics = await world([freeBox("box", [0, 5, 0])], weightless);
    physics.setBodyVelocity("box", [1, 0, 0], [0, 0, 2]);
    assert.deepEqual(physics.angularVelocityOf("box"), [0, 0, 2]);
    // r = (0, 1, 0): ω × r = (-2, 0, 0).
    const point = physics.pointVelocity("box", [0, 6, 0])!;
    assert.ok(Math.abs(point[0] - -1) < 1e-5 && Math.abs(point[1]) < 1e-5, JSON.stringify(point));
    assert.equal(physics.pointVelocity("missing", [0, 0, 0]), null);
    assert.equal(physics.angularVelocityOf("missing"), null);
    physics.setBodyVelocity("missing", [1, 0, 0], [0, 0, 0]);
    physics.dispose();
  }));

  await checkAsync("physics pass-through: an overlapping pair stays calm where the solver would throw it apart", () => withQuietRapier(async () => {
    const overlap = (): PhysicsBody[] => [freeBox("shell", [0, 0, 0], 1000), freeBox("piece", [0.2, 0, 0])];
    const free = await world(overlap(), weightless);
    run(free, STEP, 6);
    const thrown = Math.abs(free.velocityOf("piece")![0]);
    free.dispose();
    assert.ok(thrown > 0.5, `the overlap alone is pushed out: ${thrown}`);

    const calm = await world(overlap(), weightless);
    calm.passThroughUntilApart("piece", "shell");
    run(calm, STEP, 6);
    assert.ok(Math.abs(calm.velocityOf("piece")![0]) < 1e-6, "nothing moved the pair");
    calm.dispose();
  }));

  await checkAsync("physics pass-through: a pair collides again once apart, and a removed body ends it", () => withQuietRapier(async () => {
    const entries = (physics: PhysicsSubsystem): number => (physics as unknown as { passThrough: Map<string, unknown> }).passThrough.size;
    // The impact opt-in matters: it steps with an event queue, and such a step
    // fails on a collider still flagged for hooks.
    const physics = await world([freeBox("shell", [0, 0, 0], 1000), freeBox("piece", [0.2, 0, 0])], (subsystem) => {
      weightless(subsystem);
      subsystem.setImpactEventThreshold("piece", 1);
    });
    physics.passThroughUntilApart("piece", "shell");
    assert.equal(entries(physics), 1);
    physics.setBodyVelocity("piece", [12, 0, 0], [0, 0, 0]);
    run(physics, STEP, 12);
    assert.equal(entries(physics), 0, "12 m/s for 0.2 s leaves the shell behind");
    // Sent back, it now stops against the shell instead of passing through.
    physics.setBodyVelocity("piece", [-12, 0, 0], [0, 0, 0]);
    run(physics, STEP, 30);
    assert.ok(physics.velocityOf("piece")![0] > -6, "the shell is solid again");
    physics.dispose();

    const gone = await world([freeBox("shell", [0, 0, 0], 1000), freeBox("piece", [0.2, 0, 0])], weightless);
    gone.passThroughUntilApart("piece", "shell");
    gone.removeEntity("shell");
    run(gone, STEP, 1);
    assert.equal(entries(gone), 0);
    gone.dispose();
  }));

  await checkAsync("physics impacts: a 10 kg crate dropped 2 m reports ≈ m·v at the floor", () => withQuietRapier(async () => {
    const physics = await world([floor(), crate(2)], (p) => p.setImpactEventThreshold("floor", 5));
    const frames = run(physics, STEP, 120);
    const peak = strongest(frames);
    assert.ok(peak, "the landing must report an impact");
    // m·√(2gh) = 62.6 N·s; Faz 0 measured 64.4 on the same settings.
    assert.ok(peak.impulse > 50 && peak.impulse < 80, `impulse ${peak.impulse}`);
    assert.equal(peak.a, "crate");
    assert.equal(peak.b, "floor");
    // Out of `a` (the crate) towards `b` (the floor): straight down.
    assert.ok(peak.normal[1] < -0.99, `normal ${peak.normal.join(",")}`);
    assert.ok(peak.point, "a landing has manifold points");
    assert.ok(Math.abs(peak.point[1]) < 0.1, `point ${peak.point.join(",")}`);
    assert.ok(Math.abs(peak.point[0]) < 0.1 && Math.abs(peak.point[2]) < 0.1, "a flat landing hits the face centre");
    // √(2·9.81·2) = 6.26 m/s, estimated from post-slice velocity + J/m.
    assert.ok(peak.relativeSpeed > 5 && peak.relativeSpeed < 7.5, `speed ${peak.relativeSpeed}`);
    // The landing is one event; a resting crate (≈1.6 N·s per slice) stays under 5 N·s.
    assert.deepEqual(frames.slice(-20).flat(), [], "resting contact is below the threshold");
    assert.equal(physics.impactsForEntity("crate").length, 0);
    physics.dispose();
  }));

  await checkAsync("physics impacts: a threshold above the hit and an opted-out world stay silent", () => withQuietRapier(async () => {
    const high = await world([floor(), crate(2)], (p) => p.setImpactEventThreshold("floor", 500));
    assert.deepEqual(run(high, STEP, 120).flat(), []);
    high.dispose();

    const none = await world([floor(), crate(2)]);
    assert.deepEqual(run(none, STEP, 120).flat(), []);
    none.dispose();

    const optedOut = await world([floor(), crate(2)], (p) => {
      p.setImpactEventThreshold("floor", 5);
      p.setImpactEventThreshold("floor", null);
    });
    assert.deepEqual(run(optedOut, STEP, 120).flat(), []);
    optedOut.dispose();
  }));

  await checkAsync("physics impacts: the opt-in survives a world rebuild and clear() drops it", () => withQuietRapier(async () => {
    const physics = await world([floor(), crate(2)]);
    // Opting in after init reaches the live colliders.
    physics.setImpactEventThreshold("floor", 5);
    physics.replaceBodies([floor(), crate(2)]);
    assert.ok(strongest(run(physics, STEP, 120)), "rebuilt bodies keep the opt-in");
    physics.clear();
    physics.replaceBodies([floor(), crate(2)]);
    assert.deepEqual(run(physics, STEP, 120).flat(), [], "clear() forgets the opt-in");
    physics.dispose();
  }));

  await checkAsync("physics impacts: owners keep their own thresholds and the lowest one reports", () => withQuietRapier(async () => {
    // The 2 m drop is ≈ 64 N·s: only the lower of the two thresholds lets it through.
    const both = await world([floor(), crate(2)], (p) => {
      p.setImpactEventThreshold("floor", 500, "fracture");
      p.setImpactEventThreshold("floor", 5, "deformable");
    });
    assert.ok(strongest(run(both, STEP, 120)), "the lower owner's threshold applies");
    both.dispose();

    const left = await world([floor(), crate(2)], (p) => {
      p.setImpactEventThreshold("floor", 500, "fracture");
      p.setImpactEventThreshold("floor", 5, "deformable");
      p.setImpactEventThreshold("floor", null, "deformable");
    });
    assert.deepEqual(run(left, STEP, 120).flat(), [], "the other owner's threshold outlives one leaving");
    left.dispose();

    const kept = await world([floor(), crate(2)], (p) => {
      p.setImpactEventThreshold("floor", 5, "deformable");
      p.setImpactEventThreshold("floor", null, "fracture");
    });
    assert.ok(strongest(run(kept, STEP, 120)), "one owner leaving does not silence another");
    kept.dispose();

    const none = await world([floor(), crate(2)], (p) => {
      p.setImpactEventThreshold("floor", 5, "deformable");
      p.setImpactEventThreshold("floor", 500, "fracture");
      p.setImpactEventThreshold("floor", null, "deformable");
      p.setImpactEventThreshold("floor", null, "fracture");
    });
    assert.deepEqual(run(none, STEP, 120).flat(), [], "no owner left opts the entity out");
    none.dispose();
  }));

  await checkAsync("physics impacts: 30, 60 and 144 Hz frames report the same fixed-step impacts", () => withQuietRapier(async () => {
    const totals: { impulse: number; peak: number; frames: number }[] = [];
    for (const hz of [30, 60, 144]) {
      const physics = await world([floor(), crate(2), crate(0.5, 3)], (p) => p.setImpactEventThreshold("floor", 5));
      // 144 Hz runs ~2.4 frames per slice; 240 slices is a whole number of frames at all three rates.
      const frames = run(physics, 1 / hz, 240);
      const flat = frames.flat();
      totals.push({
        impulse: flat.reduce((sum, impact) => sum + impact.impulse, 0),
        peak: strongest(frames)?.impulse ?? 0,
        frames: frames.filter((frame) => frame.length > 0).length,
      });
      assert.ok(flat.some((impact) => impact.a === "crate:3"), `${hz} Hz: the short drop reports too`);
      physics.dispose();
    }
    const [at30, at60, at144] = totals;
    assert.ok(at30 && at60 && at144);
    assert.ok(at60.impulse > 0);
    // The simulation is frame-rate independent; only how slices group into frames differs.
    for (const other of [at30, at144]) {
      assert.ok(Math.abs(other.impulse - at60.impulse) <= 1e-9 * at60.impulse, `${other.impulse} != ${at60.impulse}`);
    }
    assert.equal(at144.peak, at60.peak, "one slice per frame at most: the same peak slice");
    assert.ok(at30.peak >= at60.peak, "30 Hz may merge the peak with its neighbour slice");
  }));

  await checkAsync("physics mass: a simulated compound (convex primitive) collider takes its authored massKg", () => withQuietRapier(async () => {
    const hull: [number, number, number][] = [[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5],
      [-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]];
    const body = (id: string, massKg: number): PhysicsBody => {
      const box = freeBox(id, [id === "light" ? 0 : 5, 10, 0], massKg);
      return { ...box, collider: { ...box.collider, enableGravity: false, linearDamping: 0,
        primitives: [{ shape: "convex", size: [1, 1, 1], points: hull }] } };
    };

    const physics = await world([body("light", 2), body("heavy", 20)]);
    physics.applyImpulse("light", [10, 0, 0]);
    physics.applyImpulse("heavy", [10, 0, 0]);
    run(physics, STEP, 1);
    // Δv = J / m: a 1 m³ hull at Rapier's density 1 would weigh 1 kg and fly at 10 m/s.
    assert.ok(Math.abs((physics.velocityOf("light")?.[0] ?? 0) - 5) < 0.05, `light ${physics.velocityOf("light")}`);
    assert.ok(Math.abs((physics.velocityOf("heavy")?.[0] ?? 0) - 0.5) < 0.01, `heavy ${physics.velocityOf("heavy")}`);
    physics.dispose();
  }));

  await checkAsync("physics world support: a chunk resting on fixed ground touches it; lifted, excluded or on a body it does not", () => withQuietRapier(async () => {
    // A 0.4 m chunk hull around its centroid (fracture chunk specs carry this shape).
    const half = 0.2;
    const hull: [number, number, number][] = [];
    for (const x of [-half, half]) for (const y of [-half, half]) for (const z of [-half, half]) hull.push([x, y, z]);
    const identity: [number, number, number, number] = [0, 0, 0, 1];
    const physics = await world([floor(), crate(0, 5)]);
    run(physics, STEP, 1);
    const none = new Set<string>();
    assert.equal(physics.touchesStaticWorld([0, half, 0], identity, hull, none), true, "resting on the floor");
    assert.equal(physics.touchesStaticWorld([0, half + 0.3, 0], identity, hull, none), false, "lifted 30 cm");
    assert.equal(physics.touchesStaticWorld([0, half, 0], identity, hull, new Set(["floor"])), false, "its own source is excluded");
    // A dynamic body is not world support: the chunk sits on top of the crate, clear of the floor.
    assert.equal(physics.touchesStaticWorld([5, 1 + half, 0], identity, hull, none), false, "on a dynamic crate");
    // Rotated 45° about Z, the hull's lowest corner reaches further down.
    const tilted: [number, number, number, number] = [0, 0, Math.sin(Math.PI / 8), Math.cos(Math.PI / 8)];
    assert.equal(physics.touchesStaticWorld([0, half * Math.SQRT2, 0], tilted, hull, none), true, "tilted corner on the floor");
    assert.equal(physics.touchesStaticWorld([0, half, 0], identity, hull.slice(0, 3), none), false, "too few points");
    physics.dispose();
  }));
}

await registerPhysicsImpactTests(test as unknown as Parameters<typeof registerPhysicsImpactTests>[0]);
