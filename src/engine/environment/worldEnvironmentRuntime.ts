// The World Environment service of a world (plan phase 3 step 5, architecture
// §4.9). The `forge.worldEnvironment` feature's subsystem loads the level's
// singleton into a controller and provides it under this key; gameplay asks
// the controller for the hour, season or weather (`WorldEnvironmentService`),
// and the renderer reads the live state and the level's resolved defaults to
// render the override (environmentResolve.ts). The key lives in the engine,
// not in the feature, because the render layer cannot import features.

import { createServiceKey } from "../../core/index.ts";
import type { WorldEnvironmentController } from "./worldEnvironmentController.ts";
import type { ResolvedWorldEnvironment } from "./worldEnvironment.ts";

export interface WorldEnvironmentRuntime {
  /** The live state; inactive (no state) when the level has no World Environment. */
  readonly controller: WorldEnvironmentController;
  /** The level's resolved defaults (sun path, night); null without a World Environment. */
  readonly environment: ResolvedWorldEnvironment | null;
}

export const WorldEnvironmentKey = createServiceKey<WorldEnvironmentRuntime>("forge.worldEnvironment");
