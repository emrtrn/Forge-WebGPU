// `npm run smoke:dist` (plan phase 4 step 2b; F06, INV-H17): a production
// build published under a sub folder opens its start level without the dev
// server. The server builds samples/starter with `--base /forge-base/` into a
// fresh OS temp folder, writes its content beside it (tools/build-content.ts)
// and serves it with `vite preview`. In the gate, so in CI: headless Chrome
// draws with WebGL forced (never a WebGPU acceptance).

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const PORT = 5283;
export const BASE = "/forge-base/";

if (!process.env.FORGE_DIST_SMOKE_OUT) process.env.FORGE_DIST_SMOKE_OUT = join(mkdtempSync(join(tmpdir(), "forge-dist-smoke-")), "dist");
const OUT = process.env.FORGE_DIST_SMOKE_OUT;
const vite = "node node_modules/vite/bin/vite.js";

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  timeout: 120_000,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  outputDir: `${REPO_ROOT}/test-results/dist`,
  globalTeardown: "./teardown.ts",
  use: {
    channel: "chrome",
    headless: true,
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    baseURL: `http://127.0.0.1:${PORT}`,
  },
  webServer: {
    command: [
      `${vite} build --base ${BASE} --outDir "${OUT}" --emptyOutDir --logLevel warn`,
      `node tools/build-content.ts --out "${OUT}"`,
      `${vite} preview --base ${BASE} --outDir "${OUT}" --host 127.0.0.1 --port ${PORT} --strictPort`,
    ].join(" && "),
    cwd: REPO_ROOT,
    url: `http://127.0.0.1:${PORT}${BASE}`,
    reuseExistingServer: false,
    timeout: 240_000,
    env: { FORGE_PROJECT_ROOT: join(REPO_ROOT, "samples/starter") },
  },
});
