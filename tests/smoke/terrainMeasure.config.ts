// Phase 5a §2.10: uncapped rAF reveals headroom, as in the Phase 0 baseline.
// Separate from render smoke: screenshots keep their original launch settings.
import { defineConfig } from "@playwright/test";
import smoke from "./playwright.config.ts";
import { REPO_ROOT } from "./renderScenes.ts";

export default defineConfig({
  ...smoke,
  testMatch: "terrain.measure.ts",
  outputDir: `${REPO_ROOT}/test-results/measure-terrain`,
  use: {
    ...smoke.use,
    launchOptions: {
      args: [...(smoke.use?.launchOptions?.args ?? []), "--disable-gpu-vsync", "--disable-frame-rate-limit"],
    },
  },
});
