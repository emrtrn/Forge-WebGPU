import { fork } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, afterEach, expect, test, vi } from "vitest";
import { NodeIO } from "@gltf-transform/core";
import sharp from "sharp";
import { normalizeLevel, splitLevel } from "../../src/core/index.ts";
import { fileRevision } from "../assets/revision.ts";
import { lockPath, withProjectLock } from "../save/projectLock.ts";
import { createWritePolicy } from "../server/projectPaths.ts";
import * as builder from "./hlodBuild.ts";
import { digest } from "./hlodFingerprint.ts";
import { outputRevisions, writeHlodResult } from "./hlodPublish.ts";
import { runHlodJob, type HlodJobRequest } from "./hlodService.ts";
import { runHlod } from "./hlodCli.ts";
import { actor, cube, encode, fixture, FOLDER, GREY, inputOf, level, LEVEL, meta, MODEL } from "./hlodTestKit.ts";

const faults = vi.hoisted(() => ({ publication: false, cache: false }));
vi.mock("node:fs/promises", async (original) => {
  const fs = await original<typeof import("node:fs/promises")>();
  return { ...fs, rename: async (...args: Parameters<typeof fs.rename>) => {
    if (faults.publication && String(args[0]).endsWith(".tmp") && String(args[1]).endsWith("hlod.json")) {
      throw new Error("injected index publication failure");
    }
    return fs.rename(...args);
  }, writeFile: async (...args: Parameters<typeof fs.writeFile>) => {
    if (faults.cache && String(args[0]).includes(".forge-cache") && String(args[0]).endsWith(".tmp")) throw new Error("injected cache failure");
    return fs.writeFile(...args);
  } };
});
const temps: string[] = [];
afterAll(async () => { for (const path of temps) await rm(path, { recursive: true, force: true }); });
afterEach(() => { faults.publication = false; faults.cache = false; vi.restoreAllMocks(); });
async function setup(source?: Map<string, Uint8Array>) {
  const project = await mkdtemp(join(tmpdir(), "forge-hlod-service-")); temps.push(project);
  await writeFile(join(project, "forge.project.json"), encode({ schema: "forge.project/1", id: "hlodtest", name: "HLOD test",
    sdkVersion: "0.1", contentRoots: ["content"], contentPacks: [], startLevel: FOLDER, game: { module: "" } }));
  source ??= await fixture();
  for (const [path, bytes] of source) { await mkdir(dirname(join(project, path)), { recursive: true }); await writeFile(join(project, path), bytes); }
  const request: HlodJobRequest = { engineRoot: process.cwd(), project, level: FOLDER, build: true, ratio: 1 };
  return { project, request, source, check: () => runHlodJob({ ...request, build: false }),
    outputs: () => outputRevisions(createWritePolicy(project), FOLDER) };
}
const cachePath = (project: string) => join(project, ".forge-cache/hlod", `${digest(FOLDER)}.json`);

test("first build, current skip, force, conservative missing cache and empty levels", async () => {
  const { project, request, check, outputs } = await setup();
  expect(await check()).toMatchObject({ state: "missing", built: false, publication: null });
  const first = await runHlodJob(request);
  expect(first).toMatchObject({ state: "current", built: true, report: { cells: 2 } });
  expect(first.publication).toMatch(/^[a-f0-9-]{36}$/);
  expect(await runHlodJob(request)).toMatchObject({ state: "current", built: false, publication: first.publication });
  expect(await check()).toMatchObject({ state: "current", publication: first.publication });
  const forced = await runHlodJob({ ...request, force: true });
  expect(forced.built).toBe(true); expect(forced.publication).not.toBe(first.publication);
  const before = await outputs();
  await rm(cachePath(project));
  expect(await check()).toMatchObject({ state: "stale", publication: null });
  expect(await outputs()).toEqual(before);
  const empty = await setup(new Map([[`${FOLDER}/level.json`, encode(level([]))]]));
  expect(await runHlodJob(empty.request)).toMatchObject({ state: "current", built: true, report: { cells: 0 } });
  expect(await empty.check()).toMatchObject({ state: "current", built: false });
});

test("names and camera far do not rebuild geometry; cancelled work preserves the published set", async () => {
  const { project, request, check, outputs } = await setup();
  const first = await runHlodJob(request), before = await outputs();
  const original = level();
  const renamed = { ...original, settings: { ...original.settings, viewDistance: 1500 },
    actors: original.actors.map((value, at) => at === 0 ? { ...(value as Record<string, unknown>), name: "Renamed house" } : value) };
  await writeFile(join(project, FOLDER, "level.json"), encode(renamed));
  expect(await check()).toMatchObject({ state: "current", publication: first.publication });
  expect(await runHlodJob(request)).toMatchObject({ built: false, publication: first.publication });
  await expect(runHlodJob({ ...request, force: true }, { cancelled: () => true })).rejects.toThrow(/cancelled/);
  expect(await outputs()).toEqual(before);
});

test("movement, settings, same-GUID model/meta/material/texture edits invalidate; unrelated assets/levels do not", async () => {
  const source = await fixture();
  const texture = `ast_${"e".repeat(32)}`;
  source.set("content/cube.glb.meta.json", encode(meta(MODEL, "forge.model@2", { materials: [GREY] })));
  source.set("content/paint.material.json", encode({ schema: "forge.material/1", id: GREY, baseColor: "#ffffff", baseColorTexture: texture }));
  source.set("content/paint.png", await sharp({ create: { width: 1, height: 1, channels: 4, background: "red" } }).png().toBuffer());
  source.set("content/paint.png.meta.json", encode(meta(texture as typeof MODEL, "forge.texture@1")));
  const { request, project, check } = await setup(source);
  await runHlodJob(request);
  await writeFile(join(project, "content/unrelated.glb"), "unrelated bytes");
  await mkdir(join(project, "content/levels/other"), { recursive: true });
  await writeFile(join(project, "content/levels/other/level.json"), encode({ ...level([]), id: `lvl_${"f".repeat(32)}` }));
  expect((await check()).state).toBe("current");
  const editedModel = await cube(); editedModel.getRoot().getAsset().generator = "changed same GUID";
  const edits: [string, Uint8Array][] = [
    [`${FOLDER}/level.json`, encode(level([actor(1, 11), actor(2), actor(3, 266)]))],
    [`${FOLDER}/level.json`, encode({ ...level(), settings: { cellSize: 128, loadRange: 50 } })],
    ["content/cube.glb", await new NodeIO().writeBinary(editedModel)],
    ["content/cube.glb.meta.json", encode(meta(MODEL, "forge.model@2", { materials: [GREY], optimize: { enabled: false } }))],
    ["content/paint.material.json", encode({ schema: "forge.material/1", id: GREY, baseColor: "#00ff00", baseColorTexture: texture })],
    ["content/paint.png", await sharp({ create: { width: 1, height: 1, channels: 4, background: "blue" } }).png().toBuffer()],
  ];
  for (const [path, bytes] of edits) {
    await writeFile(join(project, path), bytes);
    expect((await check()).state, path).toBe("stale");
    expect((await runHlodJob(request)).built, path).toBe(true);
    expect((await check()).state, path).toBe("current");
  }
});

test("full saved cell documents, effective class placements and new missing GUID resolutions are tracked", async () => {
  const source = await fixture(), input = await inputOf(source);
  const options = { strict: true, registry: input.registry, resolveClass: input.index.resolveClass };
  const split = splitLevel(normalizeLevel(level(), options).value!, options);
  source.set(`${FOLDER}/level.json`, encode(split.persistent));
  for (const cell of split.cells) source.set(`${FOLDER}/cells/${cell.cell}.json`, encode(cell));
  source.set(`${FOLDER}/cells.json`, encode({ schema: "forge.levelCells/1", level: LEVEL,
    persistent: fileRevision(source.get(`${FOLDER}/level.json`)!), cells: Object.fromEntries(split.cells.map((cell) =>
      [cell.cell, fileRevision(source.get(`${FOLDER}/cells/${cell.cell}.json`)!)])) }));
  const saved = await setup(source);
  expect(await runHlodJob(saved.request)).toMatchObject({ report: { cells: 2 } });
  const last = split.cells.find((cell) => cell.cell === "2_0")!;
  last.actors[0]!.transform.p[0] += 1;
  await writeFile(join(saved.project, FOLDER, "cells/2_0.json"), encode(last));
  expect((await saved.check()).state).toBe("stale");
  const cls = `ast_${"9".repeat(32)}`;
  const classSource = await fixture();
  classSource.set(`${FOLDER}/level.json`, encode(level([{ id: actor(1).id, class: cls, transform: actor(1).transform }])));
  classSource.set("content/object.actor.json", encode({ schema: "forge.actorClass/1", id: cls, components: actor(1).components }));
  const classified = await setup(classSource);
  await runHlodJob(classified.request);
  await writeFile(join(classified.project, "content/object.actor.json"), encode({ schema: "forge.actorClass/1", id: cls,
    components: { mesh: { ...actor(1).components.mesh, color: "#00ff00" } } }));
  expect((await classified.check()).state).toBe("stale");
  const missingSource = await fixture(); missingSource.delete("content/cube.glb");
  const missing = await setup(missingSource);
  expect(await runHlodJob(missing.request)).toMatchObject({ report: { cells: 0 } });
  expect((await missing.check()).state).toBe("current");
  await writeFile(join(missing.project, "content/cube.glb"), (await fixture()).get("content/cube.glb")!);
  expect((await missing.check()).state).toBe("stale");
});

test("GLTF external buffers and missing external images participate in freshness", async () => {
  const source = await fixture(); source.delete("content/cube.glb"); source.delete("content/cube.glb.meta.json");
  const doc = await cube();
  doc.getRoot().listMaterials()[0]!.setBaseColorTexture(doc.createTexture().setImage(new Uint8Array([1, 2, 3])).setMimeType("image/png"));
  const gltf = await new NodeIO().writeJSON(doc);
  source.set("content/cube.gltf", encode(gltf.json));
  source.set("content/cube.gltf.meta.json", encode(meta()));
  const image = gltf.json.images![0]!; const imagePath = `content/${image.uri!}`;
  for (const [path, bytes] of Object.entries(gltf.resources)) if (`content/${path}` !== imagePath) source.set(`content/${path}`, bytes);
  const { project, request, check } = await setup(source);
  await runHlodJob(request);
  expect((await check()).state).toBe("current");
  await writeFile(join(project, imagePath), await sharp({ create: { width: 1, height: 1, channels: 4, background: "green" } }).png().toBuffer());
  expect((await check()).state).toBe("stale");
  await runHlodJob(request);
  const buffer = join(project, "content", gltf.json.buffers![0]!.uri!);
  const bytes = await readFile(buffer); bytes[0] = bytes[0]! ^ 1;
  await writeFile(buffer, bytes);
  expect((await check()).state).toBe("stale");
});

test("superseded computation preserves outputs/cache, and CLI reports a retry error", async () => {
  const { project, request, outputs } = await setup(); await runHlodJob(request);
  const before = await outputs(), cache = await readFile(cachePath(project));
  const original = builder.buildLevelHlod;
  let movement = 12;
  const spy = vi.spyOn(builder, "buildLevelHlod").mockImplementation(async (...args) => {
    const result = await original(...args);
    await writeFile(join(project, FOLDER, "level.json"), encode(level([actor(1, movement++)])));
    return result;
  });
  expect(await runHlodJob({ ...request, force: true })).toMatchObject({ state: "superseded", built: false });
  expect(await outputs()).toEqual(before); expect(await readFile(cachePath(project))).toEqual(cache);
  await expect(runHlod({ project, level: FOLDER, dryRun: false, json: true }, process.cwd())).rejects.toThrow(/retry/);
  spy.mockRestore();
});

test("publication failure rolls back replacements/deletions and preserves cache; changed outputs reject stale work", async () => {
  const { project, request, outputs } = await setup(); await runHlodJob(request);
  const before = await outputs(), cache = await readFile(cachePath(project));
  await writeFile(join(project, FOLDER, "level.json"), encode(level([actor(1, 400)])));
  faults.publication = true;
  await expect(runHlodJob(request)).rejects.toThrow(/injected index/);
  faults.publication = false;
  expect(await outputs()).toEqual(before); expect(await readFile(cachePath(project))).toEqual(cache);
  expect((await readdir(join(project, FOLDER, "hlod"))).some((name) => name.startsWith("."))).toBe(false);
  const source = await fixture(), result = await builder.buildLevelHlod(FOLDER, await inputOf(source));
  await writeFile(join(project, FOLDER, "hlod/0_0.glb"), "another process generation");
  const other = await outputs();
  await expect(writeHlodResult(createWritePolicy(project), FOLDER, result, before)).rejects.toThrow(/outputs changed/);
  expect(await outputs()).toEqual(other);
});

test("cache failure after identical forced publication is honest and conservatively stale", async () => {
  const { request, check } = await setup(); const first = await runHlodJob(request);
  faults.cache = true;
  const next = await runHlodJob({ ...request, force: true });
  expect(next).toMatchObject({ state: "current", built: true, message: expect.stringMatching(/cache could not be saved/) });
  expect(next.publication).not.toBe(first.publication);
  expect(await check()).toMatchObject({ state: "stale", publication: null });
});

test("a concurrent byte-identical generation supersedes work by publication UUID", async () => {
  const { project, request, outputs } = await setup(); await runHlodJob(request);
  const before = await outputs();
  const original = builder.buildLevelHlod;
  vi.spyOn(builder, "buildLevelHlod").mockImplementationOnce(async (...args) => {
    const result = await original(...args);
    const cache = JSON.parse(await readFile(cachePath(project), "utf8"));
    cache.publication = "99999999-9999-4999-8999-999999999999";
    await writeFile(cachePath(project), JSON.stringify(cache));
    return result;
  });
  expect(await runHlodJob({ ...request, force: true })).toMatchObject({ state: "superseded", built: false });
  expect(await outputs()).toEqual(before);
  expect(JSON.parse(await readFile(cachePath(project), "utf8")).publication).toBe("99999999-9999-4999-8999-999999999999");
});

test("dry run writes no output/cache/journal; validation rejects traversal, read-only and linked helpers", async () => {
  const { project, request, check } = await setup(); const before = await readdir(project);
  expect(await runHlodJob({ ...request, dryRun: true })).toMatchObject({ built: false, report: { cells: 2 } });
  expect(await readdir(project)).toEqual(before);
  expect((await check()).state).toBe("missing");
  for (const level of ["../outside", "engine:content/levels/test", "content/levels/missing", "tests/fixtures/test"]) {
    await expect(runHlodJob({ ...request, level })).rejects.toThrow();
  }
  await expect(runHlodJob({ ...request, ratio: 0 })).rejects.toThrow(/ratio/);
  await expect(runHlodJob({ ...request, project: join(process.cwd(), "samples/starter") })).rejects.toThrow(/not writable/);
  const outside = await mkdtemp(join(tmpdir(), "forge-hlod-cache-outside-")); temps.push(outside);
  await symlink(outside, join(project, ".forge-cache"), "junction");
  await expect(runHlodJob(request)).rejects.toThrow(/Links/);
  expect(await readdir(outside)).toEqual([]);
});

test("recheck waits on the ordinary project-root save lock, then rejects modified inputs", async () => {
  const { project, request, outputs } = await setup(); await runHlodJob(request); const before = await outputs();
  let release!: () => void, acquired!: () => void;
  const held = new Promise<void>((done) => { acquired = done; });
  const lock = withProjectLock(project, async () => { acquired(); await new Promise<void>((done) => { release = done; }); });
  await held;
  const original = builder.buildLevelHlod;
  let computed!: () => void; const built = new Promise<void>((done) => { computed = done; });
  vi.spyOn(builder, "buildLevelHlod").mockImplementation(async (...args) => { const result = await original(...args); computed(); return result; });
  const running = runHlodJob({ ...request, force: true });
  await built;
  expect(JSON.parse(await readFile(lockPath(project), "utf8")).pid).toBe(process.pid);
  await writeFile(join(project, FOLDER, "level.json"), encode(level([actor(1, 50)])));
  release(); await lock;
  expect((await running).state).toBe("superseded"); expect(await outputs()).toEqual(before);
});

test("native TS worker accepts one request, reports errors and disconnects", async () => {
  const { request } = await setup();
  const child = fork(join(process.cwd(), "tools/world/hlodWorker.ts"), [], { cwd: process.cwd(), execArgv: [], silent: true });
  let stderr = ""; child.stderr?.on("data", (bytes) => { stderr += String(bytes); });
  const messages: unknown[] = []; child.on("message", (message) => messages.push(message));
  const exited = new Promise<number | null>((done, reject) => { child.once("error", reject); child.once("exit", done); });
  child.send({ ...request, dryRun: true });
  expect(await exited, stderr).toBe(0);
  expect(messages).toContainEqual({ phase: "building" });
  expect(messages).toContainEqual(expect.objectContaining({ ok: true, result: expect.objectContaining({ built: false, report: expect.objectContaining({ cells: 2 }) }) }));
  const invalid = fork(join(process.cwd(), "tools/world/hlodWorker.ts"), [], { cwd: process.cwd(), execArgv: [], silent: true });
  const reply = new Promise<unknown>((done) => invalid.once("message", done));
  const ended = new Promise<void>((done) => invalid.once("exit", () => done()));
  invalid.send({ command: "anything" });
  expect(await reply).toMatchObject({ ok: false, message: "Invalid HLOD job request" });
  await ended;
});
