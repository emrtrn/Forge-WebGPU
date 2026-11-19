// Real headed WebGPU, like the render smoke. The server owns the temporary copy.
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { defineConfig } from "@playwright/test";
import smoke from "./playwright.config.ts";
import { REFERENCE_ROOT, REPO_ROOT, SMOKE_VIEWPORT } from "./renderPaths.ts";

const runId = process.env.FORGE_CITY_RUN_ID ??= randomUUID();
if (!/^[0-9a-f-]{36}$/.test(runId)) throw new Error("Invalid city measurement run ID.");
const buildingStreaming = process.env.FORGE_CITY_BUILDING_STREAMING === "1";
const staticCulling = process.env.FORGE_CITY_S12;
const project = join(process.env.FORGE_CITY_WORK_ROOT ?? join(REFERENCE_ROOT, ".forge-cache"), `city-${runId}`);
process.env.FORGE_CITY_TEMP_PROJECT = project;
const server = smoke.webServer;
if (!server || Array.isArray(server)) throw new Error("City measurement needs one smoke server.");

export default defineConfig({
  ...smoke,
  testMatch: staticCulling === "cpu" ? "cityStaticCullingCpu.measure.ts" : staticCulling === "1" ? "cityStaticCulling.measure.ts"
    : buildingStreaming ? "buildingStreaming.measure.ts" : "city.measure.ts",
  timeout: 480_000,
  outputDir: `${REPO_ROOT}/test-results/${staticCulling ? "measure-city-s12" : "measure-city"}`,
  use: {
    ...smoke.use, viewport: SMOKE_VIEWPORT,
    ...(buildingStreaming ? { launchOptions: { args: [...(smoke.use?.launchOptions?.args ?? []),
      "--disable-gpu-vsync", "--disable-frame-rate-limit", "--js-flags=--expose-gc"] } } : {}),
  },
  webServer: {
    ...server,
    command: "node tests/smoke/cityServer.ts",
    env: { ...server.env, FORGE_PROJECT_ROOT: project },
    timeout: 240_000,
    gracefulShutdown: { signal: "SIGTERM", timeout: 10_000 },
  },
});
