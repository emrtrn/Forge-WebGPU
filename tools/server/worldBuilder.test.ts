import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createSchemaRegistry } from "../../src/core/index.ts";
import type { RandomWorldEvent } from "../../src/engine/worldbuilder/randomWorldChoices.ts";
import type { RandomWorldRequest } from "../world/randomWorldRequest.ts";
import { createForgeServer, type ForgeServer } from "./forgeServer.ts";
import { withContentPacks, type WorldBuild } from "./worldBuilder.ts";

const engineRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const WORLD = { seed: 1, size: "small", landform: "plain", mountainHeight: "low", settlements: [], roads: "between", rivers: 0, lakes: 0, cover: "steppe" };
const DONE: RandomWorldEvent = { type: "done", level: "content/levels/A", brief: "content/levels/A/A.worldbrief.json", buildings: 1, bridges: 0, rivers: 0, lakes: 0, actors: 4, placeholders: 0, files: 5, seconds: 1, notes: [], deferred: [] };

let root: string;
let forge: ForgeServer;
let server: Server;
let base: string;
let started: RandomWorldRequest[];
let restarts: number;
let run: (event: (event: RandomWorldEvent) => void) => WorldBuild;

async function open(options: { readOnly?: boolean; packs?: string[] } = {}): Promise<void> {
  await mkdir(join(root, "content"), { recursive: true });
  await writeFile(join(root, "forge.project.json"), `${JSON.stringify({ schema: "forge.project/1", id: "game", contentPacks: options.packs ?? ["starter"], startLevel: "content/levels/main" }, null, 2)}\n`);
  forge = await createForgeServer({
    root, engineRoot, registry: createSchemaRegistry(), ...(options.readOnly ? { readOnly: true } : {}), restart: () => { restarts += 1; },
    startWorldBuild: (_engine, _project, request, event) => { started.push(request); return run(event); },
  });
  server = createServer((req, res) => forge.middleware(req, res, () => res.end()));
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/__forge`;
}

const headers = { "X-Forge-Request": "1" };
const post = (path: string, body: unknown = {}) => fetch(`${base}/${path}`, { method: "POST", headers, body: JSON.stringify(body) });
const state = async () => (await fetch(`${base}/world-builder`, { headers })).json();

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "forge-world-builder-"));
  started = [];
  restarts = 0;
  run = (event) => {
    event({ type: "progress", step: "terrain" });
    event(DONE);
    return { done: Promise.resolve(), cancel: () => undefined };
  };
});

afterEach(async () => {
  forge.dispose();
  await new Promise<void>((done) => { server.close(() => done()); server.closeAllConnections(); });
  await rm(root, { recursive: true, force: true });
});

describe("World Builder endpoints", () => {
  test("a build streams its events; its request is checked first", async () => {
    await open({ packs: ["starter", "worldbuilder"] });
    expect((await post("world-random", { out: "content/levels/A", world: { ...WORLD, size: "huge" } })).status).toBe(400);
    expect((await post("world-random", { out: "src/levels/A", world: WORLD })).status).toBe(403);
    expect((await fetch(`${base}/world-random`, { method: "POST", body: "{}" })).status).toBe(403);
    expect(started).toEqual([]);
    const answer = await post("world-random", { out: "content/levels/A", world: WORLD });
    expect(answer.headers.get("content-type")).toContain("ndjson");
    expect((await answer.text()).trim().split("\n").map((line) => JSON.parse(line))).toEqual([{ type: "progress", step: "terrain" }, DONE]);
    expect(started.map((request) => [request.out, request.force])).toEqual([["content/levels/A", false]]);
  });

  test("an existing level needs force; a second build waits its turn", async () => {
    await open({ packs: ["starter", "worldbuilder"] });
    await mkdir(join(root, "content/levels/A"), { recursive: true });
    await writeFile(join(root, "content/levels/A/level.json"), "{}");
    const exists = await post("world-random", { out: "content/levels/A", world: WORLD });
    expect([exists.status, ((await exists.json()) as { exists?: boolean }).exists]).toEqual([409, true]);

    let finish = (): void => undefined;
    run = (event) => ({ done: new Promise<void>((done) => { finish = () => { event(DONE); done(); }; }), cancel: () => undefined });
    const first = await post("world-random", { out: "content/levels/A", world: WORLD, force: true });
    expect(await state()).toMatchObject({ building: true });
    expect((await post("world-random", { out: "content/levels/B", world: WORLD })).status).toBe(409);
    finish();
    expect(JSON.parse(await first.text())).toEqual(DONE);
    expect(await state()).toMatchObject({ building: false });
    expect(started).toHaveLength(1);
  });

  test("a builder that ends without an answer is an error event", async () => {
    await open({ packs: ["starter", "worldbuilder"] });
    run = () => ({ done: Promise.resolve(), cancel: () => undefined });
    expect(JSON.parse(await (await post("world-random", { out: "content/levels/A", world: WORLD })).text())).toMatchObject({ type: "error" });
  });

  test("a missing pack is said, added to the manifest with what it requires, and the server restarts", async () => {
    await open({ packs: [] });
    expect(await state()).toEqual({ readOnly: false, levels: "content/levels", missing: ["starter", "worldbuilder"], restarting: false, building: false });
    expect((await post("world-random", { out: "content/levels/A", world: WORLD })).status).toBe(409);
    const added = await post("world-builder/pack");
    expect(await added.json()).toEqual({ added: ["starter", "worldbuilder"] });
    const manifest = await readFile(join(root, "forge.project.json"), "utf8");
    expect(JSON.parse(manifest)).toMatchObject({ contentPacks: ["starter", "worldbuilder"], startLevel: "content/levels/main" });
    await expect.poll(() => restarts).toBe(1);
    expect(await state()).toMatchObject({ missing: [], restarting: true });
  });

  test("a read-only project refuses both writes", async () => {
    await open({ readOnly: true });
    expect((await post("world-builder/pack")).status).toBe(403);
    expect((await post("world-random", { out: "content/levels/A", world: WORLD })).status).toBe(403);
    expect(started).toEqual([]);
    expect(JSON.parse(await readFile(join(root, "forge.project.json"), "utf8")).contentPacks).toEqual(["starter"]);
  });

  test("only contentPacks changes in the manifest's text", () => {
    expect(withContentPacks('{\n  "id": "a",\n  "contentPacks": ["starter"],\n  "x": 1\n}\n', ["starter", "worldbuilder"]))
      .toBe('{\n  "id": "a",\n  "contentPacks": ["starter", "worldbuilder"],\n  "x": 1\n}\n');
    expect(JSON.parse(withContentPacks('{ "id": "a" }', ["worldbuilder"]))).toEqual({ id: "a", contentPacks: ["worldbuilder"] });
  });
});
