// `npm run smoke:editor:webgpu` (plan phase 4 step 10, decision 12): the
// whole editor smoke on the real GPU, the local half of the phase's gate.
// The same tests, server and temporary project copy as `npm run
// smoke:editor`, but headed Chrome without `forceWebGL`: every opened editor
// and Play tab must prove the WebGPU backend (support.ts). Not in the gate or
// CI (no GPU there); run it before a push that changes the editor's drawing.

import "./webgpuEnv.ts";
import { defineConfig } from "@playwright/test";
import smoke from "./playwright.config.ts";

export default defineConfig({
  ...smoke,
  outputDir: `${smoke.outputDir!}-webgpu`,
  use: {
    ...smoke.use,
    headless: false,
    // Copy / paste go through the system clipboard (user decision 2026-11-14); a headed page asks for it.
    permissions: ["clipboard-read", "clipboard-write"],
    // Headed windows behind others must keep drawing (the render smoke's flags).
    launchOptions: { args: ["--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding", "--disable-background-timer-throttling"] },
  },
});
