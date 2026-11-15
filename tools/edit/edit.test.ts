import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import type { ActorId, SchemaRegistry } from "../../src/core/index.ts";
import { loadEngineRegistry } from "../assets/engineRegistry.ts";
import { CommandError, parseBatch, parseCommand, parsePath, splitWords } from "./args.ts";
import { editMain } from "./cli.ts";
import { openEditProject, type EditProject } from "./editProject.ts";
import { formatText } from "./format.ts";
import { EXIT_CONFLICT, EXIT_ERROR, EXIT_OK, runEdit, type EditRunResult } from "./run.ts";

const ENGINE_ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const LEVEL = "content/levels/main";
const FOG = "act_651958edcc8a5a19f805a02affafe0de";
const FOG_CLASS_FILE = "engine:content/packs/starter/classes/exponential-height-fog.json";

let registry: SchemaRegistry;
let temp: string;
let project: string;
let opened: EditProject;
let counter = 0;
const newId = (): ActorId => `act_${(counter += 1).toString(16).padStart(32, "0")}` as ActorId;

beforeAll(async () => {
  registry = await loadEngineRegistry(ENGINE_ROOT);
  temp = await mkdtemp(join(tmpdir(), "forge-edit-"));
});

afterAll(async () => {
  await rm(temp, { recursive: true, force: true });
});

beforeEach(async () => {
  project = join(temp, `p${(counter += 1000)}`);
  // As a new project is: no generated `.forge/` (the dev server and the commands write it).
  await cp(join(ENGINE_ROOT, "samples/starter"), project, { recursive: true, filter: (source) => !source.includes(".forge") });
  opened = await openEditProject(ENGINE_ROOT, project, registry);
});

const run = (...lines: string[]): Promise<EditRunResult> =>
  runEdit({ engineRoot: ENGINE_ROOT, project, level: LEVEL, commands: lines.map((line) => parseCommand(splitWords(line))), opened, newId });

const read = (path: string): Promise<string> => readFile(join(project, path), "utf8");
const json = async (path: string): Promise<{ actors: { id: string; [key: string]: unknown }[] }> => JSON.parse(await read(path));
const actorIn = async (path: string, id: string): Promise<Record<string, unknown> | undefined> => (await json(path)).actors.find((actor) => actor.id === id);

function ok(result: EditRunResult): EditRunResult {
  if (!result.ok) throw new Error(`expected ok: ${JSON.stringify(result.error)}`);
  return result;
}

describe("edit command words", () => {
  test("words split on spaces; quotes group; a path reads strictly; values are JSON or text", () => {
    expect(splitWords(`set act_1 name="A \\"big\\" one" 'x y'`)).toEqual(["set", "act_1", 'name=A "big" one', "x y"]);
    expect(parsePath("layers[0].tint")).toEqual(["layers", 0, "tint"]);
    expect(() => parsePath("a..b")).toThrow(CommandError);
    expect(() => parsePath("a[x]")).toThrow(CommandError);
    const set = parseCommand(["set", "act_1", "light.intensity=3", "shape.color=#ff8800", "actor.locked=true"]);
    expect(set).toMatchObject({ kind: "set", ids: ["act_1"], sets: [{ value: 3 }, { value: "#ff8800" }, { value: true }] });
    expect(parseCommand(["move", "a", "b", "--scale", "2"])).toMatchObject({ ids: ["a", "b"], scale: [2, 2, 2] });
    expect(parseCommand(["move", "a", "--parent", "none"])).toMatchObject({ parent: null });
  });

  test("a command that does not read names what is wrong and its usage", () => {
    expect(() => parseCommand(["move", "act_1"])).toThrow(/needs --to.*\n  usage: move/);
    expect(() => parseCommand(["add", "--class", "x", "--component", "a=forge.shape"])).toThrow(/--class or --component/);
    expect(() => parseCommand(["find", "--near", "1,2,3"])).toThrow(/--near and --radius/);
    expect(() => parseCommand(["fly"])).toThrow(/Unknown command: fly[\s\S]*find/);
    expect(() => parseCommand(["find", "--colour", "x"])).toThrow(/Unknown option --colour/);
    expect(() => parseBatch("find\nmove a --to 1,2\n")).toThrow(/line 2: --to takes x,y,z/);
    expect(parseBatch("# comment\n\nfind --limit 2\n").map((entry) => entry.line)).toEqual([3]);
  });
});

describe("forge edit", () => {
  test("add with components and fields; find and show read it back; the save is canonical", async () => {
    const added = ok(await run(`add --component light=forge.pointLight --name Lamp --at 3,1.5,2 --set light.intensity=7`));
    const id = newIdOf(added);
    expect(added.outcomes[0]).toMatchObject({ kind: "add", actors: [{ id, name: "Lamp", types: ["forge.pointLight"], position: [3, 1.5, 2] }] });
    expect(added.files.map((file) => file.path).sort()).toEqual([`${LEVEL}/cells.json`, `${LEVEL}/cells/0_0.json`]);
    const stored = await actorIn(`${LEVEL}/cells/0_0.json`, id);
    expect(stored).toMatchObject({ name: "Lamp", spatiallyLoaded: true, transform: { p: [3, 1.5, 2] }, components: { light: { type: "forge.pointLight@1", intensity: 7, distance: 8 } } });

    const found = ok(await run("find --component forge.pointLight", "find --name lamp --near 3,0,2 --radius 2", "find --near 100,0,0 --radius 1"));
    expect(found.outcomes.map((outcome) => (outcome.kind === "find" ? outcome.total : -1))).toEqual([1, 1, 0]);
    expect(found.files).toEqual([]);
    const shown = ok(await run(`show ${id.slice(0, 12)}`));
    expect(shown.outcomes[0]).toMatchObject({ kind: "show", doc: { id, components: { light: { intensity: 7 } } } });
    expect(formatText(shown).split("\n")[0]).toBe(`${id} "Lamp" forge.pointLight @ 3,1.5,2`);
  });

  test("set writes a field; a class actor gets an override, reset takes it away; clamps warn", async () => {
    const set = ok(await run(`set ${FOG} fog.density=0.002 fog.color="#ff0000"`));
    expect(set.files.map((file) => file.path).sort()).toEqual([`${LEVEL}/cells.json`, `${LEVEL}/level.json`]);
    expect(await actorIn(`${LEVEL}/level.json`, FOG)).toMatchObject({ overrides: { fog: { type: "forge.heightFog@1", density: 0.002, color: "#ff0000" } } });
    ok(await run(`reset ${FOG} fog.density`));
    expect(((await actorIn(`${LEVEL}/level.json`, FOG))!.overrides as { fog: Record<string, unknown> }).fog).toEqual({ type: "forge.heightFog@1", color: "#ff0000" });
    ok(await run(`reset ${FOG} fog`));
    expect((await actorIn(`${LEVEL}/level.json`, FOG))!.overrides).toEqual({});

    const lamp = newIdOf(ok(await run("add --component light=forge.pointLight")));
    const clamped = ok(await run(`set ${lamp} light.intensity=-4`));
    expect(clamped.outcomes[0]).toMatchObject({ warnings: [expect.stringMatching(/light\.intensity/)] });
    expect(await actorIn(`${LEVEL}/cells/0_0.json`, lamp)).toMatchObject({ components: { light: { intensity: 0 } } });
    expect(formatText(clamped)).toMatch(/warning: .*light\.intensity/);
  });

  test("a class actor is added by its file or GUID; names follow the editor's rule; one per level holds", async () => {
    const LAMP_CLASS = "ast_0123456789abcdef0123456789abcdef";
    await mkdir(join(project, "content/classes"), { recursive: true });
    await writeFile(
      join(project, "content/classes/lamp.json"),
      `${JSON.stringify({ schema: "forge.actorClass/1", id: LAMP_CLASS, name: "Lamp", components: { light: { type: "forge.pointLight@1", parent: null, local: { p: [0, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] }, intensity: 4 } } })}\n`,
    );
    opened = await openEditProject(ENGINE_ROOT, project, registry);
    const result = ok(await run("add --class content/classes/lamp.json --at 1,0,1", `add --class ${LAMP_CLASS} --at 2,0,1 --set light.intensity=9`));
    const [first, second] = result.outcomes.map((outcome) => (outcome.kind === "add" ? outcome.actors[0]!.id : ""));
    expect(await actorIn(`${LEVEL}/cells/0_0.json`, first!)).toMatchObject({ class: LAMP_CLASS, name: "Lamp", overrides: {} });
    expect(await actorIn(`${LEVEL}/cells/0_0.json`, second!)).toMatchObject({ class: LAMP_CLASS, name: "Lamp 2", overrides: { light: { intensity: 9 } } });

    const twice = await run(`add --class ${FOG_CLASS_FILE}`);
    expect(twice.error?.message).toMatch(/already has a Exponential Height Fog \(act_651958edcc8a5a19f805a02affafe0de/);
    expect((await run("add --class content/classes/nothing.json")).error?.message).toMatch(/No actor class content\/classes\/nothing\.json/);
  });

  test("move: own transform, by a delta, rotation and scale; reparenting keeps the world place", async () => {
    const result = ok(await run(
      "add --name Parent --at 10,0,0 --scale 2",
      "add --component shape=forge.shape --name Child --at 12,0,0",
    ));
    const [parent, child] = result.outcomes.map((outcome) => (outcome.kind === "add" ? outcome.actors[0]!.id : ""));
    ok(await run(`move ${child} --parent ${parent}`));
    let stored = await actorIn(`${LEVEL}/cells/0_0.json`, child!);
    expect(stored).toMatchObject({ parent, transform: { p: [1, 0, 0], s: [0.5, 0.5, 0.5] } });
    const shown = ok(await run(`show ${child}`));
    expect(shown.outcomes[0]).toMatchObject({ actor: { position: [12, 0, 0], parent } });

    ok(await run(`move ${child} --by 1,2,3 --rot 0,90,0 --scale 1`));
    stored = await actorIn(`${LEVEL}/cells/0_0.json`, child!);
    expect(stored).toMatchObject({ transform: { p: [2, 2, 3], s: [1, 1, 1] } });
    const r = (stored!.transform as { r: number[] }).r;
    expect(r[1]).toBeCloseTo(Math.SQRT1_2, 6);
    ok(await run(`move ${child} --parent none`));
    expect(await actorIn(`${LEVEL}/cells/0_0.json`, child!)).toMatchObject({ parent: null, transform: { p: [14, 4, 6] } });
    expect(() => parseCommand(["move", child!, "--to", "1,2"])).toThrow(CommandError);
  });

  test("delete takes everything under the actor", async () => {
    const result = ok(await run("add --name Group", "add --name A", "add --name B"));
    const [group, a, b] = result.outcomes.map((outcome) => (outcome.kind === "add" ? outcome.actors[0]!.id : ""));
    ok(await run(`move ${a} ${b} --parent ${group}`));
    const deleted = ok(await run(`delete ${group}`));
    expect(deleted.outcomes[0]).toMatchObject({ kind: "delete", actors: [{ id: group }, { id: a }, { id: b }] });
    const ids = (await json(`${LEVEL}/cells/0_0.json`)).actors.map((actor) => actor.id);
    expect(ids).not.toContain(group);
    expect(ids).not.toContain(a);
  });

  test("a command that cannot run saves nothing and says why", async () => {
    const before = await read(`${LEVEL}/cells/0_0.json`);
    const cases: [string, RegExp][] = [
      [`set ${FOG} fog.colour=1`, /no field fog\.colour; fields: .*fog\.density/],
      [`set ${FOG} light.intensity=1`, /no component light; components: fog/],
      [`set ${FOG} actor.size=1`, /actor fields: actor\.name/],
      ["move act_6 --to 1,2,3", /longer prefix/],
      ["move act_ffffff --to 1,2,3", /No actor act_ffffff/],
      ["add --component x=forge.nothing", /No component type forge\.nothing/],
    ];
    for (const [line, pattern] of cases) {
      const result = await run("add --name Kept", line);
      expect(result.ok, line).toBe(false);
      expect(result.exitCode).toBe(EXIT_ERROR);
      expect(result.error?.message, line).toMatch(pattern);
      expect(formatText(result)).toMatch(/nothing saved$/);
      expect(await read(`${LEVEL}/cells/0_0.json`)).toBe(before);
    }
  });

  test("a level changed on disk between read and save is read again once; a second change is a conflict", async () => {
    let saves = 0;
    const meddle = async (): Promise<void> => {
      const path = join(project, LEVEL, "level.json");
      await writeFile(path, (await readFile(path, "utf8")).replace(/"name": "(?:Fog \d+|Exponential Height Fog)"/, `"name": "Fog ${saves}"`));
    };
    const client = {
      ...opened.client,
      async save(request: Parameters<EditProject["client"]["save"]>[0]) {
        saves += 1;
        await meddle();
        return opened.client.save(request);
      },
    };
    const once = { ...opened, client: { ...client, save: async (request: Parameters<EditProject["client"]["save"]>[0]) => (saves === 0 ? client.save(request) : opened.client.save(request)) } };
    const retried = await runEdit({ engineRoot: ENGINE_ROOT, project, level: LEVEL, commands: [parseCommand(splitWords(`set ${FOG} fog.density=0.003`))], opened: once, newId });
    ok(retried);
    expect(await actorIn(`${LEVEL}/level.json`, FOG)).toMatchObject({ name: "Fog 1", overrides: { fog: { density: 0.003 } } });

    const always = { ...opened, client };
    const conflict = await runEdit({ engineRoot: ENGINE_ROOT, project, level: LEVEL, commands: [parseCommand(splitWords(`set ${FOG} fog.density=0.004`))], opened: always, newId });
    expect(conflict).toMatchObject({ ok: false, exitCode: EXIT_CONFLICT, error: { code: "conflict" } });
  });

  test("the engine's samples, the engine's content and the packs are read, never changed", async () => {
    const sample = join(ENGINE_ROOT, "samples/starter");
    const readOnly = await runEdit({ engineRoot: ENGINE_ROOT, project: sample, level: LEVEL, commands: [parseCommand(["move", FOG, "--by", "1,0,0"])], opened: await openEditProject(ENGINE_ROOT, sample, registry) });
    expect(readOnly).toMatchObject({ ok: false, error: { code: "read-only" } });
    const found = await runEdit({ engineRoot: ENGINE_ROOT, project: sample, level: LEVEL, commands: [parseCommand(["find"])], opened: await openEditProject(ENGINE_ROOT, sample, registry) });
    expect(found).toMatchObject({ ok: true, outcomes: [{ kind: "find", total: 2 }] });
    const engineLevel = await runEdit({ engineRoot: ENGINE_ROOT, project, level: "engine:content/packs/starter/levels/x", commands: [parseCommand(["delete", FOG])], opened });
    expect(engineLevel).toMatchObject({ ok: false, error: { code: "read-only" } });
  });

  test("a batch from stdin is one save; --json prints one object", async () => {
    const lines: string[] = [];
    const log = console.log;
    console.log = (text: string) => void lines.push(text);
    let code: number;
    try {
      code = await editMain(["--project", project, "--level", LEVEL, "--json", "-"], ENGINE_ROOT, () => `add --name "Alpha One"\n# two of them\nadd --name "Alpha Two"\nfind --name alpha`);
    } finally {
      console.log = log;
    }
    expect(code).toBe(EXIT_OK);
    const printed = JSON.parse(lines.join("\n")) as { ok: boolean; results: { kind: string; total?: number }[]; files: { path: string }[] };
    expect(printed.ok).toBe(true);
    expect(printed.results.map((one) => one.kind)).toEqual(["add", "add", "find"]);
    expect(printed.results[2]!.total).toBe(2);
    expect(printed.files.map((file) => file.path).sort()).toEqual([`${LEVEL}/cells.json`, `${LEVEL}/cells/0_0.json`]);
  });

  test("npm run forge -- edit runs in its own process with the game module's schemas", () => {
    const result = spawnSync(process.execPath, ["tools/forge.ts", "edit", "--project", project, "--level", LEVEL, "add", "--component", "box=forge.shape", "--name", "Box"], {
      cwd: ENGINE_ROOT,
      encoding: "utf8",
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/^added act_[0-9a-f]{32} "Box" forge\.shape @ 0,0,0\nsaved 2 files: /);
    const usage = spawnSync(process.execPath, ["tools/forge.ts", "edit", "--project", project], { cwd: ENGINE_ROOT, encoding: "utf8" });
    expect(usage.status).toBe(EXIT_ERROR);
    expect(usage.stderr).toMatch(/Usage: npm run forge -- edit/);
  }, 60_000);
});

function newIdOf(result: EditRunResult): ActorId {
  const outcome = result.outcomes.find((one) => one.kind === "add");
  if (!outcome || outcome.kind !== "add") throw new Error("no add");
  return outcome.actors[0]!.id;
}
