// `npm run smoke:editor` (plan phase 4, decision 12): the editor's browser
// checks. In the gate, so in CI: headless Chrome there has no GPU, so the
// editor draws with WebGL forced (`?forceWebGL`, never a WebGPU acceptance;
// FORGE_EDITOR_WEBGPU=1 drops it on a machine with a GPU); the render
// acceptance stays in `npm run smoke:render`. The server is always started
// here on the smoke port, never reused (another project's server must not
// become the target).
//
// Smokes never write to an example project (D14): every run serves a fresh
// copy of samples/starter in the OS temp folder, deleted afterwards. The copy
// is made once, in the main process (workers inherit its path).

import { cpSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const PORT = 5283;

if (!process.env.FORGE_EDITOR_SMOKE_PROJECT) {
  const project = join(mkdtempSync(join(tmpdir(), "forge-editor-smoke-")), "starter");
  cpSync(join(REPO_ROOT, "samples/starter"), project, { recursive: true });
  process.env.FORGE_EDITOR_SMOKE_PROJECT = project;
}

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  timeout: 120_000,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  outputDir: `${REPO_ROOT}/test-results/editor`,
  globalTeardown: "./teardown.ts",
  use: {
    channel: "chrome",
    headless: true,
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 1,
    locale: "en-US",
    baseURL: `http://127.0.0.1:${PORT}`,
  },
  webServer: {
    command: `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${PORT} --strictPort`,
    cwd: REPO_ROOT,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { FORGE_PROJECT_ROOT: process.env.FORGE_EDITOR_SMOKE_PROJECT },
  },
});
