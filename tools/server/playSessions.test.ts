// Play sessions (plan phase 4 step 8): the editor's unsaved level read by a
// game tab through a layer, never written to the project. On a temporary copy
// of tests/fixtures/assets (the fixture itself is never written, A9).

import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vitest";
import {
  createSaveClient,
  normalizeActorClass,
  openLevelFromServer,
  PlaySessionGoneError,
  type ActorClassDoc,
  type ActorDoc,
  type AssetId,
  type CellAssignOptions,
  type SaveClient,
} from "../../src/core/index.ts";
import { createAssetTestRegistry } from "../../src/core/assets/testKit.ts";
import { createForgeServer } from "./forgeServer.ts";
import { createPlaySessions, PLAY_SESSION_DIR } from "./playSessions.ts";

const fixture = join(resolve(dirname(fileURLToPath(import.meta.url)), "../.."), "tests/fixtures/assets");
const FOLDER = "content/levels/main";
const MESH_ACTOR = "act_22222222222222222222222222222222";
const ID = "a".repeat(32);
const CAMERA = { position: [1, 2, 3], quaternion: [0, 0, 0, 1] } as const;
const registry = createAssetTestRegistry();

let project: string;
let server: Server | null = null;
let url: string;

async function serve(options: { readOnly?: boolean } = {}): Promise<{ client: SaveClient; options: CellAssignOptions }> {
  project = await mkdtemp(join(tmpdir(), "forge-play-"));
  await cp(fixture, project, { recursive: true });
  return restart(options);
}

async function restart(options: { readOnly?: boolean } = {}): Promise<{ client: SaveClient; options: CellAssignOptions }> {
  if (server) await new Promise<void>((done) => server!.close(() => done()));
  const forge = await createForgeServer({ root: project, registry, ...options });
  server = createServer((req, res) => forge.middleware(req, res, () => res.end()));
  await new Promise<void>((done) => server!.listen(0, "127.0.0.1", done));
  url = `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
  const client = createSaveClient({ fetch, baseUrl: url });
  const classFile = await client.read("content/classes/car.json");
  const car = normalizeActorClass(JSON.parse(classFile!.text), { strict: true, registry }).value as ActorClassDoc;
  return { client, options: { strict: true, registry, resolveClass: (id: AssetId) => (id === car.id ? car : undefined) } };
}

afterEach(async () => {
  if (server) await new Promise<void>((done) => server!.close(() => done()));
  server = null;
  await rm(project, { recursive: true, force: true });
});

/** The level with the mesh actor moved to cell 2_0, planned as a save would write it (nothing is sent). */
async function editedPlan(client: SaveClient, options: CellAssignOptions) {
  const { session } = await openLevelFromServer(client, FOLDER, options);
  const actor = structuredClone(session.actor(MESH_ACTOR as ActorDoc["id"])!);
  actor.transform.p = [300, 0, 10];
  expect(session.edit("Move", (tx) => tx.setActor(actor)).ok).toBe(true);
  const plan = session.planSave();
  if (plan.status !== "ready") throw new Error(plan.status);
  return {
    session,
    writes: plan.request.writes.map((write) => ({ path: write.path, text: write.text! })),
    deletes: plan.request.deletes.map((entry) => entry.path),
  };
}

const snapshot = async (): Promise<Record<string, string>> => {
  const out: Record<string, string> = {};
  for (const name of ["level.json", "cells.json", "cells/0_0.json"]) out[name] = await readFile(join(project, FOLDER, name), "utf8");
  return out;
};

describe("play sessions", () => {
  test("the game reads the unsaved level through the session; the project's files stay as they were", async () => {
    const { client, options } = await serve();
    const before = await snapshot();
    const { session, writes, deletes } = await editedPlan(client, options);
    expect(await client.play({ id: ID, level: FOLDER, camera: CAMERA, writes, deletes })).toEqual({ status: "ready", id: ID });
    expect(await snapshot()).toEqual(before);
    await expect(readFile(join(project, FOLDER, "cells/2_0.json"))).rejects.toThrow();

    expect(await client.playSession(ID)).toEqual({ id: ID, level: FOLDER, camera: CAMERA });
    const game = createSaveClient({ fetch, baseUrl: url, play: ID });
    const played = await openLevelFromServer(game, FOLDER, options);
    expect(played.issues).toEqual([]);
    expect(played.cells).toEqual(["0_0", "2_0"]);
    expect(played.session.level.actors).toEqual(session.level.actors);
    // The layer's index lists the session's cell with the revision of what it holds.
    const index = JSON.parse((await game.read(`${FOLDER}/cells.json`))!.text) as { cells: Record<string, string> };
    expect(index.cells["2_0"]).toBe((await game.read(`${FOLDER}/cells/2_0.json`))!.revision);
    // Without the session the game reads the disk.
    expect((await openLevelFromServer(client, FOLDER, options)).cells).toEqual(["0_0"]);
  });

  test("a read-only project plays (its saves stay refused)", async () => {
    const { client, options } = await serve({ readOnly: true });
    const { writes, deletes } = await editedPlan(client, options);
    expect(await client.play({ id: ID, level: FOLDER, writes, deletes })).toMatchObject({ status: "ready" });
    expect((await openLevelFromServer(createSaveClient({ fetch, baseUrl: url, play: ID }), FOLDER, options)).cells).toEqual(["0_0", "2_0"]);
    expect((await fetch(`${url}/__forge/save`, { method: "POST", headers: { "X-Forge-Request": "1" }, body: "{}" })).status).toBe(403);
  });

  test("a clean level plays from the disk; Play again replaces the session", async () => {
    const { client, options } = await serve();
    expect(await client.play({ id: ID, level: FOLDER, writes: [], deletes: [] })).toMatchObject({ status: "ready" });
    const game = createSaveClient({ fetch, baseUrl: url, play: ID });
    expect((await openLevelFromServer(game, FOLDER, options)).cells).toEqual(["0_0"]);
    const { writes, deletes } = await editedPlan(client, options);
    expect(await client.play({ id: ID, level: FOLDER, camera: CAMERA, writes, deletes })).toMatchObject({ status: "ready" });
    expect((await openLevelFromServer(game, FOLDER, options)).cells).toEqual(["0_0", "2_0"]);
    expect(await readdir(join(project, PLAY_SESSION_DIR))).toEqual([ID]);
  });

  test("a cell the session deletes is missing in it and in its index", async () => {
    const { client, options } = await serve();
    const { session } = await openLevelFromServer(client, FOLDER, options);
    const ids = session.level.actors.map((actor) => actor.id);
    // Take every actor of cell 0_0 out (children first), so the plan deletes the cell file.
    const removed = session.edit("Delete", (tx) => {
      for (const id of ids) tx.removeActor(id);
    });
    expect(removed.ok).toBe(true);
    const plan = session.planSave();
    if (plan.status !== "ready") throw new Error(plan.status);
    expect(plan.request.deletes.map((entry) => entry.path)).toContain(`${FOLDER}/cells/0_0.json`);
    const sent = await client.play({
      id: ID,
      level: FOLDER,
      writes: plan.request.writes.map((write) => ({ path: write.path, text: write.text! })),
      deletes: plan.request.deletes.map((entry) => entry.path),
    });
    expect(sent).toMatchObject({ status: "ready" });
    const game = createSaveClient({ fetch, baseUrl: url, play: ID });
    expect(await game.read(`${FOLDER}/cells/0_0.json`)).toBeNull();
    const played = await openLevelFromServer(game, FOLDER, options);
    expect(played.cells).toEqual([]);
    expect(played.session.level.actors).toEqual([]);
    expect(await readFile(join(project, FOLDER, "cells/0_0.json"), "utf8")).toBeTruthy();
  });

  test("refusals: other files, bad ids and documents, unknown sessions", async () => {
    const { client } = await serve();
    const level = await readFile(join(project, FOLDER, "level.json"), "utf8");
    expect(await client.play({ id: ID, level: FOLDER, writes: [{ path: "content/classes/car.json", text: "{}" }], deletes: [] })).toMatchObject({
      status: "rejected",
      reason: "path",
    });
    expect(await client.play({ id: "../x", level: FOLDER, writes: [], deletes: [] })).toMatchObject({ status: "rejected", reason: "request" });
    expect(await client.play({ id: ID, level: "../outside", writes: [], deletes: [] })).toMatchObject({ status: "rejected", reason: "path" });
    expect(await client.play({ id: ID, level: FOLDER, writes: [], deletes: [`${FOLDER}/level.json`] })).toMatchObject({ status: "rejected", reason: "request" });
    const broken = JSON.stringify({ ...JSON.parse(level), settings: { cellSize: "big" } });
    const refused = await client.play({ id: ID, level: FOLDER, writes: [{ path: `${FOLDER}/level.json`, text: broken }], deletes: [] });
    expect(refused).toMatchObject({ status: "rejected", reason: "document" });
    expect(await client.play({ id: ID, level: "content/levels/none", writes: [], deletes: [] })).toMatchObject({ status: "rejected", reason: "document" });
    expect((await fetch(`${url}/__forge/play`, { method: "POST", headers: { "X-Forge-Request": "1" }, body: "not json" })).status).toBe(400);

    expect(await client.playSession(ID)).toBeNull();
    await expect(createSaveClient({ fetch, baseUrl: url, play: ID }).read(`${FOLDER}/level.json`)).rejects.toBeInstanceOf(PlaySessionGoneError);
    await expect(createSaveClient({ fetch, baseUrl: url, play: "../../x" }).read(`${FOLDER}/level.json`)).rejects.toBeInstanceOf(PlaySessionGoneError);
    // The authoring endpoints' origin rule holds here too.
    expect((await fetch(`${url}/__forge/play?id=${ID}`)).status).toBe(403);
  });

  test("a session does not outlive the server: the folder goes when it starts", async () => {
    const { client } = await serve();
    expect(await client.play({ id: ID, level: FOLDER, writes: [], deletes: [] })).toMatchObject({ status: "ready" });
    expect(await readdir(join(project, PLAY_SESSION_DIR))).toEqual([ID]);
    const again = await restart();
    await expect(readdir(join(project, PLAY_SESSION_DIR))).rejects.toThrow();
    expect(await again.client.playSession(ID)).toBeNull();
  });
});

describe("play session store", () => {
  test("keeps the newest sessions up to its limit", async () => {
    project = await mkdtemp(join(tmpdir(), "forge-play-store-"));
    await mkdir(join(project, FOLDER), { recursive: true });
    await writeFile(join(project, FOLDER, "level.json"), JSON.stringify({ schema: "forge.level/1", id: `lvl_${"b".repeat(32)}` }));
    let clock = 0;
    const plays = await createPlaySessions({
      root: project,
      resolve: (path) => join(project, ...path.split("/")),
      check: async (file) => ({ text: file.text, issues: [] }),
      limit: 2,
      now: () => clock++,
    });
    const ids = ["1", "2", "3"].map((digit) => digit.repeat(32));
    for (const id of ids) expect(await plays.create({ id, level: FOLDER, writes: [], deletes: [] })).toMatchObject({ status: "ready" });
    expect(plays.info(ids[0]!)).toBeNull();
    expect((await readdir(join(project, PLAY_SESSION_DIR))).sort()).toEqual([ids[1], ids[2]]);
    // Replacing a session makes it the newest.
    await plays.create({ id: ids[1], level: FOLDER, writes: [], deletes: [] });
    await plays.create({ id: ids[0], level: FOLDER, writes: [], deletes: [] });
    expect(plays.info(ids[2]!)).toBeNull();
    expect(plays.info(ids[1]!)).not.toBeNull();
  });
});
