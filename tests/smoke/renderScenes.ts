// The render smoke's scenes and poses (architecture §4.10, plan phase 3).
// Levels live in the out-of-repo reference project; reference images in
// `render-refs/` next to it, both under Games/ForgeReference (content licence
// not verified, phase 3 decision 11). The full set (plan phase 3, step 9):
// every reference level that draws, the terrain levels at their three Phase 0
// poses read from `baseline/poses.json` (position and quaternion as the WebGL
// baseline took them), at the Phase 0 shots' resolution.

import { readFileSync } from "node:fs";
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

/** The Phase 0 WebGL shots' size (`baseline/poses/*.png`, 1920 x 1080, DPR 1); the render smoke shoots at it. */
export const SMOKE_VIEWPORT = { width: 1920, height: 1080 } as const;

/** The Phase 0 baseline: poses and the clean WebGL shots (`poses/<scene>-<P1|P2|P3>.png`). */
export const BASELINE = resolve(REFERENCE_ROOT, "baseline");

export interface SmokePose {
  readonly id: string;
  /** Absent with `target` / `quaternion`: the viewer's own framing of the level (a level with no Phase 0 pose). */
  readonly position?: readonly [number, number, number];
  /** The point the camera looks at; the quaternion is derived from it unless `quaternion` is given. */
  readonly target?: readonly [number, number, number];
  /** The camera's rotation as the Phase 0 baseline recorded it (x, y, z, w). */
  readonly quaternion?: readonly [number, number, number, number];
  /** The Phase 0 WebGL shot of the same pose, baseline-relative; absent when Phase 0 has none. */
  readonly phase0Shot?: string;
  /** What the pose shows (Phase 0's label). */
  readonly label?: string;
}

export interface SmokeScene {
  readonly id: string;
  /** Project-relative level folder, `?level=`. */
  readonly level: string;
  readonly poses: readonly SmokePose[];
}

interface BaselineScene {
  readonly id: string;
  readonly poses: readonly {
    readonly id: string;
    readonly label: string;
    readonly position: [number, number, number];
    readonly target: [number, number, number];
    readonly quaternion: [number, number, number, number];
  }[];
}

/** The terrain levels' three Phase 0 poses (ground eye height, 60 m up at 20 degrees down, the scene's focus). */
function phase0Poses(sceneId: string): SmokePose[] {
  const path = resolve(BASELINE, "poses.json");
  const scenes = JSON.parse(readFileSync(path, "utf8")) as BaselineScene[];
  const scene = scenes.find((entry) => entry.id === sceneId);
  if (!scene) throw new Error(`${path} has no scene "${sceneId}"`);
  return scene.poses.map((pose) => ({
    id: pose.id.toLowerCase(),
    position: pose.position,
    target: pose.target,
    quaternion: pose.quaternion,
    phase0Shot: `poses/${sceneId}-${pose.id}.png`,
    label: pose.label,
  }));
}

export const SMOKE_SCENES: readonly SmokeScene[] = [
  {
    // Terrain-free: a floor mesh (GLB), a shape, height fog. Not in Phase 0 (no WebGL shot).
    id: "l03",
    level: "content/levels/L03",
    poses: [{ id: "p1", position: [5, 3.5, 6], target: [0, 0.5, 0] }],
  },
  { id: "derekavak", level: "content/levels/Derekavak", poses: phase0Poses("derekavak") },
  { id: "wb-pilot", level: "content/levels/WbPilotValley", poses: phase0Poses("wb-pilot") },
  { id: "island", level: "content/levels/Island", poses: phase0Poses("island") },
  { id: "open-world", level: "content/levels/OpenWorldTest", poses: phase0Poses("open-world") },
  // No Phase 0 pose: the viewer frames the placements (Forge's room bounds). `main`, the empty
  // start level, has nothing to draw; check:projects opens it.
  { id: "physics-interaction", level: "content/levels/PhysicsInteractionTest", poses: [{ id: "framed" }] },
  { id: "spline-test-range", level: "content/levels/spline-test-range", poses: [{ id: "framed" }] },
];
