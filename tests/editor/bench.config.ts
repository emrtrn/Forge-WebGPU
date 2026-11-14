// `npm run bench:outliner` (plan phase 4 step 5a, user decision 2026-11-14):
// the editor's measurements on the real GPU. The editor smoke's server and
// temporary project copy (playwright.config.ts), but headed Chrome without
// `forceWebGL` and its own files (`*.bench.ts`). Never in the gate or CI.

import { defineConfig } from "@playwright/test";
import smoke from "./playwright.config.ts";

export default defineConfig({
  ...smoke,
  testMatch: "*.bench.ts",
  timeout: 600_000,
  outputDir: `${smoke.outputDir!.replace(/editor$/, "")}bench`,
  use: { ...smoke.use, headless: false },
});
