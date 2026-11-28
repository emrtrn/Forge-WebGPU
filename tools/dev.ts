// `npm run dev`: the engine's dev server (Vite), with the engine's own flags
// taken out first, since Vite refuses a flag it does not know:
//
//   --engine-content   engine content mode (plan phase 4 step 6g, decision 6):
//                      the engine's content and every content pack are written
//                      from the editor's Content Browser (FORGE_ENGINE_CONTENT=1,
//                      tools/server/vitePlugin.ts); `npm run verify:assets`
//                      checks them in the gate.
//
// Every other argument goes to Vite as it is. The child gets the terminal; its
// exit code is this one's.
//
// The dev server keeps its pre-bundled dependencies to itself
// (.forge-cache/vite-dev-<port>, vite.config.ts). In the shared
// node_modules/.vite, any other Vite server of this repo (the tests',
// check:projects', a smoke's) rewrote them under a running editor, which then
// loaded three.js twice and drew black (2026-11-28).

import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const engineContent = args.includes("--engine-content");
// `--port 5192` or `--port=5192`; without one, vite.config.ts's DEV_PORT.
const portAt = args.findIndex((arg) => arg === "--port" || arg.startsWith("--port="));
const port = portAt < 0 ? "5183" : args[portAt]!.split("=")[1] ?? args[portAt + 1] ?? "5183";
const child = spawn(process.execPath, [resolve(root, "node_modules/vite/bin/vite.js"), ...args.filter((arg) => arg !== "--engine-content")], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, FORGE_ENGINE_CONTENT: engineContent ? "1" : "0", FORGE_VITE_CACHE_DIR: resolve(root, ".forge-cache", `vite-dev-${port}`) },
});
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => child.kill(signal));
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
child.on("error", (error) => {
  console.error(`forge dev: ${error.message}`);
  process.exitCode = 1;
});
