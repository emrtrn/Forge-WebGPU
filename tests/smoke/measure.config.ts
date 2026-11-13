// Measurements on the smoke server (`npm run measure:sky-capture`): the
// render smoke's browser, GPU and server, its own files (`*.measure.ts`).
// Never in the gate or CI.

import { defineConfig } from "@playwright/test";
import smoke from "./playwright.config.ts";
import { REPO_ROOT } from "./renderScenes.ts";

export default defineConfig({
  ...smoke,
  testMatch: "*.measure.ts",
  outputDir: `${REPO_ROOT}/test-results/measure`,
});
