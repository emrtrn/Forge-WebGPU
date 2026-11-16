// The synthetic streaming level's location (phase 5b decision 9), shared by
// measure:streaming's config (which prepares it) and its spec.
import { join } from "node:path";
import { REPO_ROOT } from "./renderScenes.ts";

/** A copy of the reference project; the reference project itself is never written. */
export const STREAMING_PROJECT = join(REPO_ROOT, ".forge-cache", "measure-streaming", "webgpu-scenes");
export const STREAMING_LEVEL = "content/levels/StreamingBench";
