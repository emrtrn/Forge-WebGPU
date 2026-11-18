import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
/** Games/ForgeReference: FORGE_REFERENCE_ROOT, else next to the repo's parent folder. */
export const REFERENCE_ROOT = process.env.FORGE_REFERENCE_ROOT ?? resolve(REPO_ROOT, "../Games/ForgeReference");
export const REFERENCE_PROJECT = resolve(REFERENCE_ROOT, "webgpu-scenes");
export const RENDER_REFS = resolve(REFERENCE_ROOT, "render-refs");
/** 5283; `FORGE_SMOKE_PORT` when another session's server holds it. */
export const SMOKE_PORT = Number(process.env.FORGE_SMOKE_PORT ?? 5283);
/**
 * The profile every smoke run draws with: a manual pick, adaptive quality and
 * startup calibration off, so the image does not depend on the machine's
 * speed (the Phase 0 baseline's rule). Written as the player's stored
 * settings (`forge.userSettings`) before the page loads.
 */
export const SMOKE_QUALITY = "high";

/** The Phase 0 WebGL shots' size (`baseline/poses/*.png`, 1920 x 1080, DPR 1); the render smoke shoots at it. */
export const SMOKE_VIEWPORT = { width: 1920, height: 1080 } as const;
