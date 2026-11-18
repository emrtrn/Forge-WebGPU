// Playwright owns the lifecycle, including the temporary fixture and Vite.
import { spawn } from "node:child_process";
import { cp, mkdir, realpath, rm } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, sep } from "node:path";
import { writeCityLevel } from "../../tools/bench-city-level.ts";
import { REFERENCE_PROJECT, REPO_ROOT, SMOKE_PORT } from "./renderPaths.ts";

const project = process.env.FORGE_PROJECT_ROOT;
if (!project || !/^city-[0-9a-f-]{36}$/.test(basename(project))) throw new Error("City server requires an isolated project path.");
const source = await realpath(process.env.FORGE_CITY_SOURCE ?? REFERENCE_PROJECT);
const parent = dirname(project);
await mkdir(parent, { recursive: true });
const target = join(await realpath(parent), basename(project));
const fromSource = relative(source, target);
if (!isAbsolute(fromSource) && fromSource !== ".." && !fromSource.startsWith(`..${sep}`)) {
  throw new Error("The city project copy must be outside the source project.");
}

await mkdir(project); // exclusive: only remove the directory acquired here
let server: ReturnType<typeof spawn> | undefined;
let stopping = false;
const stop = () => { stopping = true; server?.kill(); };
process.once("SIGTERM", stop);
process.once("SIGINT", stop);
try {
  await cp(source, project, {
    recursive: true,
    filter: (path) => !relative(source, path).split(sep).some(part =>
      [".git", ".forge", ".forge-cache", "node_modules", "dist"].includes(part)),
  });
  const blocks = process.env.FORGE_CITY_BLOCKS;
  const report = await writeCityLevel(project, {
    heavy: process.env.FORGE_CITY_HEAVY === "1",
    ...(blocks === undefined ? {} : { blocks: Number(blocks) }),
  });
  console.log(`forge city: ${report.level}, ${report.zones.rooms} rooms, ${report.zones.portals} portals, ${report.hlod.cells} HLOD cells`);
  if (!stopping) {
    const node = spawn(process.execPath, [
      "node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(SMOKE_PORT), "--strictPort",
    ], { cwd: REPO_ROOT, stdio: "inherit" });
    server = node;
    process.exitCode = await new Promise<number>((resolve, reject) => {
      node.once("error", reject);
      node.once("exit", (code) => resolve(code ?? (stopping ? 0 : 1)));
    });
  }
} finally {
  await rm(project, { recursive: true, force: true });
}
