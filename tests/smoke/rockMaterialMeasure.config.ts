// `npm run measure:rock-material` (vegetation plan PG1): the render smoke's browser,
// GPU and server, its own file. Stepped frames. Never in the gate or CI.

import { defineConfig } from "@playwright/test";
import smoke from "./playwright.config.ts";
import { REPO_ROOT } from "./renderScenes.ts";

export default defineConfig({
  ...smoke,
  testMatch: "rockMaterial.measure.ts",
  outputDir: `${REPO_ROOT}/test-results/measure-rock-material`,
});
