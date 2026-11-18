// Real headed WebGPU, like the render smoke. The server owns the temporary copy.
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { defineConfig } from "@playwright/test";
import smoke from "./playwright.config.ts";
import { REFERENCE_ROOT, REPO_ROOT, SMOKE_VIEWPORT } from "./renderPaths.ts";

const runId = process.env.FORGE_CITY_RUN_ID ??= randomUUID();
if (!/^[0-9a-f-]{36}$/.test(runId)) throw new Error("Invalid city measurement run ID.");
const project = join(REFERENCE_ROOT, ".forge-cache", `city-${runId}`);
process.env.FORGE_CITY_TEMP_PROJECT = project;
const server = smoke.webServer;
if (!server || Array.isArray(server)) throw new Error("City measurement needs one smoke server.");

export default defineConfig({
  ...smoke,
  testMatch: "city.measure.ts",
  timeout: 480_000,
  outputDir: `${REPO_ROOT}/test-results/measure-city`,
  use: { ...smoke.use, viewport: SMOKE_VIEWPORT },
  webServer: {
    ...server,
    command: "node tests/smoke/cityServer.ts",
    env: { ...server.env, FORGE_PROJECT_ROOT: project },
    timeout: 240_000,
    gracefulShutdown: { signal: "SIGTERM", timeout: 10_000 },
  },
});
