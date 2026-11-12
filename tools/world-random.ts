// npm run world:random -- --project <dir> --out <level folder> [--size small|medium|large]
//   [--landform plain|hills|mountains|valley|island|coast] [--sea-side west|east|north|south] [--mountains low|medium|high]
//   [--settlements village,hamlet,...] [--roads between|exits] [--rivers 0-3] [--lakes 0-3]
//   [--cover forest|meadow|farmland|steppe|desert|alpine] [--forest|--rocks|--fields low|medium|high] [--seed N] [--force]
//
// Builds a whole greybox world from a few choices into a level folder of a game
// project (plan 2b `tools/world`; Forge WebGL tools/world/build-random-world.mjs).
// The project must pick the `worldbuilder` content pack (ground covers, the
// neutral region profile). The brief stays in the level folder; `npm run
// world:brief` rebuilds from it.
//
// `--request` is the dev server's mode (`/__world-random`, 5d): it reads the
// window's request JSON from stdin (tools/world/randomWorldRequest.ts) and
// prints one `@@<json>` event line per build step, then `done` or `error`.

import { writeSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateRandomWorldRequest } from "./world/randomWorldRequest.ts";
import { runRandomWorld, type RandomWorldRunResult } from "./world/randomWorldRun.ts";
import { refuseEngineFixture } from "./world/worldCli.ts";

const engineRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const usage = "Usage: npm run world:random -- --project <dir> --out <level folder, e.g. content/levels/My World> [--size small|medium|large] "
  + "[--landform plain|hills|mountains|valley|island|coast] [--sea-side west|east|north|south] [--mountains low|medium|high] [--settlements village,hamlet] [--roads between|exits] [--rivers 0-3] [--lakes 0-3] "
  + "[--cover forest|meadow|farmland|steppe|desert|alpine] [--forest|--rocks|--fields low|medium|high] [--seed N] [--force]";
const CHOICES: Record<string, readonly string[]> = {
  size: ["small", "medium", "large"],
  landform: ["plain", "hills", "mountains", "valley", "island", "coast"],
  "sea-side": ["west", "east", "north", "south"],
  mountains: ["low", "medium", "high"],
  roads: ["between", "exits"],
  cover: ["forest", "meadow", "farmland", "steppe", "desert", "alpine"],
  forest: ["low", "medium", "high"],
  rocks: ["low", "medium", "high"],
  fields: ["low", "medium", "high"],
};

function summary(result: RandomWorldRunResult, started: number) {
  const placements = result.build.groups.flatMap((group) => group.placements);
  return {
    level: result.folder,
    brief: result.brief,
    buildings: placements.filter((placement) => placement.role?.startsWith("building.")).length,
    bridges: placements.filter((placement) => placement.role === "structure.bridge").length,
    rivers: result.build.ground.courses.length,
    lakes: result.build.ground.lakes.length,
    actors: result.level.level.actors.length,
    placeholders: result.level.counts.placeholders,
    files: result.written.length,
    seconds: Number(((Date.now() - started) / 1000).toFixed(1)),
    notes: result.notes,
    deferred: result.build.deferred,
  };
}

async function request(projectRoot: string): Promise<void> {
  // Synchronous writes: the build is synchronous, and each step must reach the server as it starts.
  const event = (value: unknown) => writeSync(1, `@@${JSON.stringify(value)}\n`);
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
    const input = validateRandomWorldRequest(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    const started = Date.now();
    const result = await runRandomWorld({
      engineRoot, projectRoot, out: input.out, force: input.force, world: input.world,
      onProgress: (step) => event({ type: "progress", step }),
    });
    event({ type: "done", ...summary(result, started) });
  } catch (error) {
    event({ type: "error", message: error instanceof Error ? error.message : String(error) });
    process.exitCode = 1;
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const values: Record<string, string> = {
    size: "medium", landform: "hills", "sea-side": "west", mountains: "medium", settlements: "village,hamlet", roads: "exits",
    rivers: "0", lakes: "0", cover: "forest", forest: "medium", rocks: "medium", fields: "medium", seed: String(Date.now() % 100000),
  };
  let out: string | null = null;
  let project: string | null = null;
  let force = false;
  let requestMode = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--force") {
      force = true;
      continue;
    }
    if (arg === "--request") {
      requestMode = true;
      continue;
    }
    const key = arg.startsWith("--") ? arg.slice(2) : null;
    const value = args[index + 1];
    if (!key || value === undefined || value.startsWith("--")) throw new Error(usage);
    index += 1;
    if (key === "out") out = value;
    else if (key === "project") project = value;
    else if (key in values) values[key] = value;
    else throw new Error(usage);
  }
  if (!project) throw new Error(usage);
  const projectRoot = resolve(project);
  refuseEngineFixture(engineRoot, projectRoot);
  if (requestMode) {
    await request(projectRoot);
    return;
  }
  if (!out) throw new Error(usage);
  for (const [key, allowed] of Object.entries(CHOICES)) {
    if (!allowed.includes(values[key]!)) throw new Error(`--${key} must be one of ${allowed.join(", ")}`);
  }
  const settlements = values.settlements!.split(",").filter(Boolean).map((type) => {
    if (!["hamlet", "village", "town"].includes(type)) throw new Error(`--settlements: ${type} is not hamlet, village or town`);
    return { type: type as "hamlet" | "village" | "town" };
  });
  const [rivers, lakes] = ["rivers", "lakes"].map((key) => {
    const count = Number(values[key]);
    if (!Number.isInteger(count) || count < 0 || count > 3) throw new Error(`--${key} must be 0, 1, 2 or 3`);
    return count;
  }) as [number, number];
  const seed = Number(values.seed);
  if (!Number.isInteger(seed) || seed < 0) throw new Error("--seed must be a whole number");

  const started = Date.now();
  const level = (key: string) => values[key] as "low" | "medium" | "high";
  const result = await runRandomWorld({
    engineRoot, projectRoot, out, force,
    world: {
      seed, size: values.size as "small" | "medium" | "large", landform: values.landform as "hills",
      mountainHeight: level("mountains"), settlements, roads: values.roads as "exits", rivers, lakes,
      seaSide: values["sea-side"] as "west", cover: values.cover as "forest",
      densities: { forest: level("forest"), rocks: level("rocks"), fields: level("fields") },
    },
  });
  for (const note of result.notes) console.warn(`[world:random] ${note}`);
  for (const warning of result.build.warnings) console.warn(`[world:random] ${warning}`);
  const s = summary(result, started);
  console.log(`[world:random] ${s.level} (seed ${seed}): ${s.buildings} buildings, ${values.cover} cover, ${s.rivers} river(s), ${s.lakes} lake(s), `
    + `${s.bridges} bridge(s), ${s.actors} actors (${s.placeholders} placeholders), ${s.files} files, ${s.seconds} s. Brief: ${s.brief}. Open it from the Content Browser.`);
  for (const item of s.deferred) console.log(`[world:random] not built yet: ${item}`);
}

main().catch((error: unknown) => {
  console.error(`[world:random] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
