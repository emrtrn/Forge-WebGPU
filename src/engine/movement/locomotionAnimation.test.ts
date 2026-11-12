// Ported from Forge WebGL tools/engine-tests.ts @ forge-webgl-final (04b5fb23): each check is
// copied unchanged and runs as a Vitest test; docs/PORT_LOG.md §2.
import assert from "node:assert/strict";
import { type AssetSkeletonBlendSpaceDef } from "../animation/blendSpace.ts";
import { classifyLocomotion, locomotionConfigForSkeleton, pickLocomotionBlendSpace, resolveLocomotionAnimation, resolveLocomotionClip, selectLocomotionClip, type LocomotionAssetConfig, type LocomotionInput } from "./locomotionAnimation.ts";
import { test } from "vitest";

const check = test;

// G5 movement-driven animation (src/game/locomotionAnimation.ts): map the
// player's per-tick movement snapshot to a semantic state, then to a concrete
// clip via per-state fallback chains. Pure selection the runtime shell applies
// to a crossfade animator.
const ground = (planarSpeed: number): LocomotionInput => ({ planarSpeed, grounded: true, velocityY: 0 });

check("classifyLocomotion: grounded planar speed picks idle/walk/run by threshold", () => {
  const thresholds = { walkSpeed: 0.1, runSpeed: 3 };
  assert.equal(classifyLocomotion(ground(0), thresholds), "idle");
  assert.equal(classifyLocomotion(ground(0.05), thresholds), "idle"); // below walk
  assert.equal(classifyLocomotion(ground(2), thresholds), "walk");
  assert.equal(classifyLocomotion(ground(3), thresholds), "run"); // at runSpeed
  assert.equal(classifyLocomotion(ground(4), thresholds), "run");
});

check("classifyLocomotion: airborne reads jump while rising, fall while descending", () => {
  assert.equal(classifyLocomotion({ planarSpeed: 0, grounded: false, velocityY: 5 }), "jump");
  assert.equal(classifyLocomotion({ planarSpeed: 9, grounded: false, velocityY: -5 }), "fall");
  // Airborne overrides planar speed: moving fast off a ledge is still fall, not run.
  assert.equal(classifyLocomotion({ planarSpeed: 0, grounded: false, velocityY: 0 }), "fall");
});

check("resolveLocomotionClip: walks the fallback chain to an available clip", () => {
  const rich = new Set(["idle", "walk", "sprint", "static"]); // demo character's clips
  assert.equal(resolveLocomotionClip("idle", rich), "idle");
  assert.equal(resolveLocomotionClip("walk", rich), "walk");
  assert.equal(resolveLocomotionClip("run", rich), "sprint"); // run -> sprint
  assert.equal(resolveLocomotionClip("jump", rich), "idle"); // no jump clip -> idle
  assert.equal(resolveLocomotionClip("fall", rich), "idle"); // no fall clip -> idle

  // A sparser asset degrades run -> walk and idle -> static.
  const sparse = new Set(["walk", "static"]);
  assert.equal(resolveLocomotionClip("run", sparse), "walk");
  assert.equal(resolveLocomotionClip("idle", sparse), "static");

  // Last resort returns any clip; an empty set returns null.
  assert.equal(resolveLocomotionClip("idle", new Set(["only"])), "only");
  assert.equal(resolveLocomotionClip("idle", new Set<string>()), null);
});

check("resolveLocomotionClip: an authored anim-set overrides the clip-name heuristic", () => {
  // The asset names its clips arbitrarily; the heuristic vocabulary can't guess them.
  const available = new Set(["Anim_Stand", "Anim_Stroll", "Anim_Dash"]);
  const animationSet = { idle: "Anim_Stand", walk: "Anim_Stroll", run: "Anim_Dash" };
  assert.equal(resolveLocomotionClip("idle", available, animationSet), "Anim_Stand");
  assert.equal(resolveLocomotionClip("walk", available, animationSet), "Anim_Stroll");
  assert.equal(resolveLocomotionClip("run", available, animationSet), "Anim_Dash");
  // Roles with no authored clip walk the role-fallback chain: run->walk->idle,
  // fall->jump->idle. Here jump/fall are unauthored, so both degrade to idle's clip.
  assert.equal(resolveLocomotionClip("jump", available, animationSet), "Anim_Stand");
  assert.equal(resolveLocomotionClip("fall", available, animationSet), "Anim_Stand");
  // A missing run with an authored walk falls back to the authored walk clip.
  assert.equal(
    resolveLocomotionClip("run", new Set(["Anim_Stand", "Anim_Stroll"]), {
      idle: "Anim_Stand",
      walk: "Anim_Stroll",
    }),
    "Anim_Stroll",
  );
  // A stale authored clip (absent from the asset) is skipped for the name heuristic.
  assert.equal(resolveLocomotionClip("idle", new Set(["idle"]), { idle: "Gone" }), "idle");
});

check("locomotionConfigForSkeleton: derives blend space + anim-set, tolerates no sidecar", () => {
  const empty = locomotionConfigForSkeleton(null);
  assert.equal(empty.blendSpace, null);
  assert.deepEqual(empty.animationSet, {});

  const config = locomotionConfigForSkeleton({
    animationSet: { idle: "idle", walk: "walk" },
    blendSpaces: [
      {
        name: "Locomotion",
        type: "1d",
        axisX: { name: "Speed", min: 0, max: 4 },
        samples: [
          { clip: "idle", x: 0 },
          { clip: "walk", x: 4 },
        ],
      },
    ],
  });
  assert.equal(config.blendSpace?.name, "Locomotion");
  assert.deepEqual(config.animationSet, { idle: "idle", walk: "walk" });
});

check("selectLocomotionClip: composes classify + resolve end to end", () => {
  const clips = new Set(["idle", "walk", "sprint"]);
  assert.equal(selectLocomotionClip(ground(0), clips), "idle");
  assert.equal(selectLocomotionClip(ground(2), clips), "walk");
  assert.equal(selectLocomotionClip(ground(4), clips), "sprint");
  assert.equal(selectLocomotionClip({ planarSpeed: 0, grounded: false, velocityY: 3 }, clips), "idle");
});

check("pickLocomotionBlendSpace: prefers a named 1D space, else the first usable one", () => {
  const oneDimensional = (name: string): AssetSkeletonBlendSpaceDef => ({
    name,
    type: "1d",
    axisX: { name: "Speed", min: 0, max: 4 },
    samples: [
      { clip: "idle", x: 0 },
      { clip: "walk", x: 4 },
    ],
  });
  assert.equal(pickLocomotionBlendSpace([]), null);
  // A 2D space or an empty 1D space never qualifies for ground locomotion.
  assert.equal(
    pickLocomotionBlendSpace([
      { name: "Aim", type: "2d", axisX: { name: "X", min: -1, max: 1 }, axisY: { name: "Y", min: -1, max: 1 }, samples: [{ clip: "c", x: 0, y: 0 }] },
      { name: "Empty", type: "1d", axisX: { name: "Speed", min: 0, max: 4 }, samples: [] },
    ]),
    null,
  );
  // The case-insensitive "Locomotion" name wins over an earlier 1D space.
  const picked = pickLocomotionBlendSpace([oneDimensional("Movement"), oneDimensional("locomotion")]);
  assert.equal(picked?.name, "locomotion");
  // Otherwise the first usable 1D space is chosen.
  assert.equal(pickLocomotionBlendSpace([oneDimensional("Movement")])?.name, "Movement");
});

check("resolveLocomotionAnimation: blends on the ground, falls back to a clip airborne", () => {
  const available = new Set(["idle", "walk", "run", "jump"]);
  const blend: AssetSkeletonBlendSpaceDef = {
    name: "Locomotion",
    type: "1d",
    axisX: { name: "Speed", min: 0, max: 4 },
    samples: [
      { clip: "idle", x: 0 },
      { clip: "walk", x: 2 },
      { clip: "run", x: 4 },
    ],
  };
  const config = (blendSpace: AssetSkeletonBlendSpaceDef | null): LocomotionAssetConfig => ({
    blendSpace,
    animationSet: {},
  });
  // Grounded mid-speed blends the two bracketing clips by weight.
  const blended = resolveLocomotionAnimation(ground(1), available, config(blend));
  assert.equal(blended.kind, "blend");
  if (blended.kind === "blend") {
    assert.deepEqual(blended.weights, [
      { clip: "idle", weight: 0.5 },
      { clip: "walk", weight: 0.5 },
    ]);
  }
  // Airborne ignores the blend space and uses the single-clip selector.
  const airborne = resolveLocomotionAnimation(
    { planarSpeed: 0, grounded: false, velocityY: 4 },
    available,
    config(blend),
  );
  assert.deepEqual(airborne, { kind: "clip", clip: "jump" });
  // No blend space -> single clip even on the ground.
  assert.deepEqual(resolveLocomotionAnimation(ground(2), available, config(null)), {
    kind: "clip",
    clip: "walk",
  });
  // A blend space whose clips the asset lacks degrades to the clip fallback.
  const missingClips: AssetSkeletonBlendSpaceDef = {
    name: "Locomotion",
    type: "1d",
    axisX: { name: "Speed", min: 0, max: 4 },
    samples: [{ clip: "absent", x: 0 }],
  };
  assert.deepEqual(resolveLocomotionAnimation(ground(0), available, config(missingClips)), {
    kind: "clip",
    clip: "idle",
  });
  // The clip-fallback branch honours the authored anim-set (custom clip names).
  const authored: LocomotionAssetConfig = {
    blendSpace: null,
    animationSet: { jump: "Anim_Leap", walk: "Anim_Stroll" },
  };
  assert.deepEqual(
    resolveLocomotionAnimation(
      { planarSpeed: 0, grounded: false, velocityY: 5 },
      new Set(["Anim_Leap", "Anim_Stroll"]),
      authored,
    ),
    { kind: "clip", clip: "Anim_Leap" },
  );
});
