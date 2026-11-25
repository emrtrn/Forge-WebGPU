// `npm run measure:weather` (plan phase W): the render smoke's browser, GPU and server, its own file. Stepped
// frames, so no uncapped launch flags. Never in the gate or CI.

import { defineConfig } from "@playwright/test";
import smoke from "./playwright.config.ts";
import { REPO_ROOT } from "./renderScenes.ts";

export default defineConfig({
  ...smoke,
  testMatch: "weather.measure.ts",
  outputDir: `${REPO_ROOT}/test-results/measure-weather`,
});
