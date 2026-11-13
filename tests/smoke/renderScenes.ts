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
  readonly position: readonly [number, number, number];
  /** The point the camera looks at; the quaternion is derived from it. */
  readonly target: readonly [number, number, number];
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
];
