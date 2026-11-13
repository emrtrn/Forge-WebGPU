// `npm run smoke:editor` (plan phase 4, decision 12): the editor's browser
// checks. In the gate, so in CI: headless Chrome there has no GPU, so pages
// that draw run with WebGL forced (`forceWebGL`, never a WebGPU acceptance);
// the render acceptance stays in `npm run smoke:render`. Pages here are UI and
// data flow. The server is always started here on the smoke port, never
// reused (another project's server must not become the target).

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const PORT = 5283;

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  timeout: 60_000,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  outputDir: `${REPO_ROOT}/test-results/editor`,
  use: {
    channel: "chrome",
    headless: true,
    viewport: { width: 1280, height: 900 },
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
  },
});
