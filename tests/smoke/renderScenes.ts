// The render smoke's scenes and poses (architecture §4.10, plan phase 3).
// Levels live in the out-of-repo reference project; reference images in
// `render-refs/` next to it, both under Games/ForgeReference (content licence
// not verified, phase 3 decision 11). The full set (every reference level,
// three poses each) comes with plan phase 3, step 9.

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
/** Games/ForgeReference: FORGE_REFERENCE_ROOT, else next to the repo's parent folder. */
export const REFERENCE_ROOT = process.env.FORGE_REFERENCE_ROOT ?? resolve(REPO_ROOT, "../Games/ForgeReference");
export const REFERENCE_PROJECT = resolve(REFERENCE_ROOT, "webgpu-scenes");
export const RENDER_REFS = resolve(REFERENCE_ROOT, "render-refs");
export const SMOKE_PORT = 5283;
/**
 * The profile every smoke run draws with: a manual pick, adaptive quality and
 * startup calibration off, so the image does not depend on the machine's
 * speed (the Phase 0 baseline's rule). Written as the player's stored
 * settings (`forge.userSettings`) before the page loads.
 */
export const SMOKE_QUALITY = "high";

export interface SmokePose {
  readonly id: string;
  /** Absent with `target`: the viewer's own framing of the level (a level with no Phase 0 pose). */
  readonly position?: readonly [number, number, number];
  /** The point the camera looks at; the quaternion is derived from it. */
  readonly target?: readonly [number, number, number];
}

export interface SmokeScene {
  readonly id: string;
  /** Project-relative level folder, `?level=`. */
  readonly level: string;
  readonly poses: readonly SmokePose[];
}

export const SMOKE_SCENES: readonly SmokeScene[] = [
  {
    // Terrain-free: a floor mesh (GLB), a shape, height fog; no lights converted yet, so the default sun.
    id: "l03",
    level: "content/levels/L03",
    poses: [{ id: "p1", position: [5, 3.5, 6], target: [0, 0.5, 0] }],
  },
  // Terrain levels at their Phase 0 pose P2 (60 m above ground, 20 degrees down; ForgeReference/baseline/poses.json).
  // The full set (three poses each, every reference level) comes with step 9.
  { id: "derekavak", level: "content/levels/Derekavak", poses: [{ id: "p2", position: [230.7, 299.9, 343.3], target: [155, 190.7, 53] }] },
  { id: "wb-pilot", level: "content/levels/WbPilotValley", poses: [{ id: "p2", position: [-37.9, 150.5, 450], target: [-34.1, 41.3, 150] }] },
  { id: "island", level: "content/levels/Island", poses: [{ id: "p2", position: [142.9, 73.4, -45.5], target: [-142.9, -35.8, 45.5] }] },
  { id: "open-world", level: "content/levels/OpenWorldTest", poses: [{ id: "p2", position: [30.9, 60.7, 649.8], target: [16.6, -48.5, 350.2] }] },
  // No Phase 0 pose: the viewer frames the placements (Forge's room bounds). `main`, the empty
  // start level, has nothing to draw; check:projects opens it.
  { id: "physics-interaction", level: "content/levels/PhysicsInteractionTest", poses: [{ id: "framed" }] },
  { id: "spline-test-range", level: "content/levels/spline-test-range", poses: [{ id: "framed" }] },
];
