// The launcher for game projects (architecture §4.8, A8):
//
//   npm run forge -- check --project <path>
//   npm run forge -- dev --project <path> [--port <port>]
//   npm run forge -- build --project <path> [--out <folder>] [--base </path/>]
//   npm run forge -- edit --project <path> --level <folder> [--json] <command …> | -
//   npm run forge -- stats --project <path> --level <folder> [--json] [--top <n>]
//   npm run forge -- zones --project <path> --level <folder> [--json] [--floor <y>] [--dry-run]
//   npm run forge -- generate (--project <path> | --pack <id>) --recipe <file> [--force] [--dry-run] [--json]
//
// `check`: manifest, SDK version, generated .forge/tsconfig.json, compile,
// import boundary (tools/project/check.ts).
// `dev`: the engine's dev server on the project, on the project's own port
// (`devPort`, D14). A project for another SDK version is not opened; the
// changelog entries in between are shown.
// `edit`: the agent's edit commands on a level (A12, tools/edit/): no dev
// server needed; an editor that has the level open refreshes by itself.
// `stats`: the level's scene cost report (plan 5c R5, tools/stats/).
// `zones`: generates the level's zones and portals (plan 5c R9b Z4, tools/zones/).
// `generate`: runs a procedural recipe and writes its assets (vegetation plan PG1, tools/procgen/).

import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { parseSdkVersion, SDK_VERSION } from "../src/core/index.ts";
import { checkProject, formatProblem, loadProject, writeProjectTsconfig } from "./project/check.ts";
import { editMain } from "./edit/cli.ts";
import { hlodMain } from "./world/hlodCli.ts";
import { statsMain } from "./stats/statsCli.ts";
import { zonesMain } from "./zones/zonesCli.ts";
import { generateMain } from "./procgen/generateCli.ts";

const engineRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function option(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
}

/** The changelog sections newer than the project's SDK, newest first. */
async function changelogSince(projectSdk: string): Promise<string> {
  const project = parseSdkVersion(projectSdk);
  const text = await readFile(join(engineRoot, "src/sdk/CHANGELOG.md"), "utf8");
  const sections = text.split(/^(?=## )/m).filter((section) => section.startsWith("## "));
  return sections
    .filter((section) => {
      const version = parseSdkVersion(section.slice(3).split(/\s/)[0] ?? "");
      return !project || !version || version.major > project.major || (version.major === project.major && version.minor > project.minor);
    })
    .join("\n")
    .trim();
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (command === "hlod") {
    process.exitCode = await hlodMain(args, engineRoot);
    return;
  }
  if (command === "stats") {
    process.exitCode = await statsMain(args, engineRoot);
    return;
  }
  if (command === "zones") {
    process.exitCode = await zonesMain(args, engineRoot);
    return;
  }
  if (command === "generate") {
    process.exitCode = await generateMain(args, engineRoot);
    return;
  }
  if (command === "edit") {
    process.exitCode = await editMain(args, engineRoot);
    return;
  }
  const project = option(args, "project");
  if ((command !== "check" && command !== "dev" && command !== "build") || project === undefined) {
    console.error("Usage: npm run forge -- <check|dev|build|edit|generate|hlod|stats|zones> --project <path>");
    process.exitCode = 1;
    return;
  }
  const root = resolve(project);

  if (command === "build") {
    const { buildProject } = await import("./project/buildProject.ts");
    const outDir = option(args, "out"), base = option(args, "base");
    try {
      const output = await buildProject({ projectRoot: root, engineRoot,
        ...(outDir ? { outDir } : {}), ...(base ? { base } : {}) });
      console.log(`forge build: ${output}`);
    } catch (error) {
      console.error(`forge build: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    }
    return;
  }

  if (command === "check") {
    const result = await checkProject(root, engineRoot);
    for (const problem of result.problems) console.error(`forge check: ${formatProblem(problem)}`);
    if (result.problems.some((problem) => problem.code === "sdk-version") && result.manifest) {
      console.error(`\nSDK changes since ${result.manifest.sdkVersion} (engine ${SDK_VERSION}):\n\n${await changelogSince(result.manifest.sdkVersion)}`);
    }
    if (result.ok) {
      console.log(`forge check: ${result.manifest!.name} (${result.manifest!.id}) fits SDK ${result.manifest!.sdkVersion}; compiles; imports stay in the contract.`);
    } else {
      process.exitCode = 1;
    }
    return;
  }

  const loaded = await loadProject(root, { engineRoot });
  if (!loaded.manifest || loaded.problems.length > 0) {
    for (const problem of loaded.problems) console.error(`forge dev: ${formatProblem(problem)}`);
    if (loaded.manifest && loaded.problems.some((problem) => problem.code === "sdk-version")) {
      console.error(`\nSDK changes since ${loaded.manifest.sdkVersion} (engine ${SDK_VERSION}):\n\n${await changelogSince(loaded.manifest.sdkVersion)}`);
    }
    process.exitCode = 1;
    return;
  }
  await writeProjectTsconfig(root, engineRoot);
  const port = Number(option(args, "port") ?? loaded.manifest.devPort);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error(`Not a port: ${port}`);
  process.env.FORGE_PROJECT_ROOT = root;
  // Engine authoring is an explicit `npm run dev -- --engine-content` mode,
  // never an inherited capability of a game's dev server.
  process.env.FORGE_ENGINE_CONTENT = "0";
  const server = await createServer({
    configFile: join(engineRoot, "vite.config.ts"),
    root: engineRoot,
    cacheDir: join(root, ".forge/vite-cache"),
    server: { host: "127.0.0.1", port, strictPort: true },
  });
  let closing = false;
  const close = async (): Promise<void> => {
    if (closing) return;
    closing = true;
    await server.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void close());
  process.on("SIGTERM", () => void close());
  await server.listen();
  console.log(`forge dev: ${loaded.manifest.name} (${root})`);
  server.printUrls();
}

await main();
