// `npm run smoke:render` (architecture §4.10): headed Chrome on the real GPU,
// the engine's dev server on the smoke port serving the reference project.
// Never in the gate or CI (no GPU there). Run it before pushing a change to
// src/render/** or features/*/render.ts.
//
// The server is always started here, never reused: another project's server
// on the port must not become the target (feedback-working-rules).

import { defineConfig } from "@playwright/test";
import { REFERENCE_PROJECT, RENDER_REFS, REPO_ROOT, SMOKE_PORT } from "./renderScenes.ts";

export default defineConfig({
  testDir: ".",
  testMatch: "*.smoke.ts",
  timeout: 180_000,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  outputDir: `${REPO_ROOT}/test-results/smoke-render`,
  // References are written only on purpose (`-- --update-snapshots`), after the user accepted the shots.
  updateSnapshots: "none",
  snapshotPathTemplate: `${RENDER_REFS}/{arg}{ext}`,
  use: {
    channel: "chrome",
    headless: false,
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    baseURL: `http://127.0.0.1:${SMOKE_PORT}`,
    launchOptions: {
      args: ["--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding", "--disable-background-timer-throttling"],
    },
  },
  webServer: {
    command: `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${SMOKE_PORT} --strictPort`,
    cwd: REPO_ROOT,
    url: `http://127.0.0.1:${SMOKE_PORT}/`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { FORGE_PROJECT_ROOT: REFERENCE_PROJECT },
  },
});
