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

import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const engineContent = args.includes("--engine-content");
const child = spawn(process.execPath, [resolve(root, "node_modules/vite/bin/vite.js"), ...args.filter((arg) => arg !== "--engine-content")], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, FORGE_ENGINE_CONTENT: engineContent ? "1" : "0" },
});
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => child.kill(signal));
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
child.on("error", (error) => {
  console.error(`forge dev: ${error.message}`);
  process.exitCode = 1;
});
