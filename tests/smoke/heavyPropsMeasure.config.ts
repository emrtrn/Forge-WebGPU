// `npm run measure:heavy-props` (plan 5c R9a O5, R9b S1): the render smoke's browser,
// GPU and server, its own file. Stepped frames. Never in the gate or CI.

import { defineConfig } from "@playwright/test";
import smoke from "./playwright.config.ts";
import { REPO_ROOT } from "./renderScenes.ts";

export default defineConfig({
  ...smoke,
  testMatch: "heavyProps.measure.ts",
  outputDir: `${REPO_ROOT}/test-results/measure-heavy-props`,
});
