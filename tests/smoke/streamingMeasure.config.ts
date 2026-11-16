// Phase 5b decision 9: `npm run measure:streaming`. A copy of the reference
// project under .forge-cache gets the synthetic large level
// (bench:streaming-level) and its HLOD (forge hlod) before the dev server
// starts on it; the reference project itself is never written. Uncapped rAF
// like measure:terrain; `--expose-gc` so the heap is read after a collection.
// Not in the gate or CI.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, rmSync } from "node:fs";
import { defineConfig, type PlaywrightTestConfig } from "@playwright/test";
import smoke from "./playwright.config.ts";
import { REFERENCE_PROJECT, REPO_ROOT } from "./renderScenes.ts";
import { STREAMING_LEVEL, STREAMING_PROJECT } from "./streamingScene.ts";

type WebServer = Exclude<PlaywrightTestConfig["webServer"], undefined | readonly unknown[]>;
const server = smoke.webServer as WebServer;

// The config is evaluated again in the worker: prepare once, in the runner.
if (process.env.FORGE_STREAMING_PREPARED !== "1") {
  if (existsSync(STREAMING_PROJECT)) rmSync(STREAMING_PROJECT, { recursive: true, force: true });
  cpSync(REFERENCE_PROJECT, STREAMING_PROJECT, { recursive: true, filter: (path) => !/[\\/](\.forge|node_modules)([\\/]|$)/.test(path) });
  const node = (args: string[]) => execFileSync(process.execPath, args, { cwd: REPO_ROOT, stdio: "inherit" });
  node(["tools/bench-streaming-level.ts", "--project", STREAMING_PROJECT, "--out", STREAMING_LEVEL, "--force"]);
  node(["tools/forge.ts", "hlod", "--project", STREAMING_PROJECT, "--level", STREAMING_LEVEL]);
  process.env.FORGE_STREAMING_PREPARED = "1";
}

export default defineConfig({
  ...smoke,
  testMatch: "streaming.measure.ts",
  timeout: 900_000,
  outputDir: `${REPO_ROOT}/test-results/measure-streaming`,
  use: {
    ...smoke.use,
    launchOptions: {
      args: [...(smoke.use?.launchOptions?.args ?? []), "--disable-gpu-vsync", "--disable-frame-rate-limit", "--js-flags=--expose-gc"],
    },
  },
  webServer: { ...server, env: { ...server.env, FORGE_PROJECT_ROOT: STREAMING_PROJECT } },
});
