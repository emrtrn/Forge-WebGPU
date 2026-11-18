// `forge zones` (plan 5c R9b Z4) on a copy of samples/starter with the
// synthetic interior added: 64 rooms and 112 doors exactly, a second run
// writes the same bytes, a user zone is kept and takes its room.

import { cp, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, expect, test } from "vitest";
import { normalizeActorDoc, type ActorDoc } from "../../src/core/index.ts";
import { openEditProject } from "../edit/editProject.ts";
import { parseCommand, splitWords } from "../edit/args.ts";
import { runEdit } from "../edit/run.ts";
import { indoorScene } from "../scenes/indoorScene.ts";
import { runZones } from "./zonesCli.ts";

const ENGINE_ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const LEVEL = "content/levels/main";
let temp: string;
let project: string;

beforeAll(async () => {
  temp = await mkdtemp(join(tmpdir(), "forge-zones-"));
  project = join(temp, "p");
  await cp(join(ENGINE_ROOT, "samples/starter"), project, { recursive: true, filter: (source) => !source.includes(".forge") });
  const opened = await openEditProject(ENGINE_ROOT, project);
  const scene = indoorScene({ origin: [300, 0, 300], propsPerRoom: 2 });
  const added = await runEdit({
    engineRoot: ENGINE_ROOT, project, level: LEVEL, commands: [], opened,
    step: async (context) => {
      const docs = scene.actors.map((raw) => normalizeActorDoc(raw, { strict: true, registry: context.registry, resolveClass: context.resolveClass }).value as ActorDoc);
      const result = context.session.edit("Add interior", (tx) => { for (const doc of docs) tx.setActor(doc); });
      if (!result.ok) throw new Error(JSON.stringify(result.issues));
    },
  });
  if (!added.ok) throw new Error(JSON.stringify(added.error));
}, 120_000);

afterAll(async () => {
  await rm(temp, { recursive: true, force: true });
});

async function levelBytes(): Promise<Map<string, string>> {
  const folder = join(project, LEVEL);
  const files = new Map<string, string>();
  for (const entry of await readdir(folder, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name);
    files.set(path.slice(folder.length), await readFile(path, "utf8"));
  }
  return files;
}

const args = { project: "", level: LEVEL, json: false, floor: undefined, dryRun: false };

test("R9b Z4: the synthetic interior gets 64 zones and 112 portals; a second run writes the same bytes", async () => {
  const first = await runZones({ ...args, project }, ENGINE_ROOT);
  expect(first.edit.ok, JSON.stringify(first.edit.error)).toBe(true);
  expect(first.plan).toMatchObject({ floorY: 0, zones: 64, portals: 112, kept: 0, skipped: 0 });
  const level = await readFile(join(project, LEVEL, "level.json"), "utf8");
  expect(level.match(/"forge\.zone@1"/g)).toHaveLength(64);
  expect(level.match(/"forge\.portal@1"/g)).toHaveLength(112);
  const before = await levelBytes();
  const second = await runZones({ ...args, project }, ENGINE_ROOT);
  expect(second.edit.ok).toBe(true);
  expect(second.plan).toMatchObject({ zones: 64, portals: 112 });
  expect(second.plan!.remove).toHaveLength(176);
  expect(await levelBytes()).toEqual(before);
}, 120_000);

test("R9b Z4: a dry run saves nothing", async () => {
  const before = await levelBytes();
  const dry = await runZones({ ...args, project, dryRun: true }, ENGINE_ROOT);
  expect(dry.plan).toMatchObject({ zones: 64, portals: 112 });
  expect(await levelBytes()).toEqual(before);
}, 120_000);

test("R9b Z4: a zone edited by hand (generated off) is kept and keeps its room", async () => {
  const level = JSON.parse(await readFile(join(project, LEVEL, "level.json"), "utf8")) as { actors: { id: string; components?: Record<string, { type: string }> }[] };
  const zone = level.actors.find((actor) => Object.values(actor.components ?? {}).some((component) => component.type === "forge.zone@1"))!;
  const opened = await openEditProject(ENGINE_ROOT, project);
  const marked = await runEdit({ engineRoot: ENGINE_ROOT, project, level: LEVEL, opened, commands: [parseCommand(splitWords(`set ${zone.id} zone.generated=false`))] });
  expect(marked.ok, JSON.stringify(marked.error)).toBe(true);
  const again = await runZones({ ...args, project }, ENGINE_ROOT);
  expect(again.plan).toMatchObject({ zones: 63, portals: 112, kept: 1, skipped: 1 });
  const after = await readFile(join(project, LEVEL, "level.json"), "utf8");
  expect(after).toContain(zone.id);
  expect(after.match(/"forge\.zone@1"/g)).toHaveLength(64);
}, 120_000);
