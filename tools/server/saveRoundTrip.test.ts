// End to end: open a level through the dev server endpoints, edit it, save,
// read it back; two sessions on one cell meet a 409. On a temporary copy of
// tests/fixtures/assets (the fixture itself is never written, A9).

import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  buildAssetIndex,
  createSaveClient,
  normalizeActorClass,
  openLevelFromServer,
  saveLevelSession,
  type ActorClassDoc,
  type ActorDoc,
  type AssetId,
  type CellAssignOptions,
  type LevelSession,
  type SaveClient,
} from "../../src/core/index.ts";
import { createAssetTestRegistry } from "../../src/core/assets/testKit.ts";
import { scanContentRoots } from "../assets/scan.ts";
import { createForgeServer } from "./forgeServer.ts";

const fixture = join(resolve(dirname(fileURLToPath(import.meta.url)), "../.."), "tests/fixtures/assets");
const FOLDER = "content/levels/main";
const MESH_ACTOR = "act_22222222222222222222222222222222";
const registry = createAssetTestRegistry();

let project: string;
let server: Server;
let client: SaveClient;
let options: CellAssignOptions;

beforeEach(async () => {
  project = await mkdtemp(join(tmpdir(), "forge-roundtrip-"));
  await cp(fixture, project, { recursive: true });
  const forge = await createForgeServer({ root: project, registry });
  server = createServer((req, res) => forge.middleware(req, res, () => res.end()));
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  client = createSaveClient({ fetch, baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}` });
  const classFile = await client.read("content/classes/car.json");
  const car = normalizeActorClass(JSON.parse(classFile!.text), { strict: true, registry }).value as ActorClassDoc;
  options = { strict: true, registry, resolveClass: (id: AssetId) => (id === car.id ? car : undefined) };
});

afterEach(async () => {
  await new Promise<void>((done) => server.close(() => done()));
  await rm(project, { recursive: true, force: true });
});

const open = async (): Promise<LevelSession> => {
  const opened = await openLevelFromServer(client, FOLDER, options);
  expect(opened.issues).toEqual([]);
  return opened.session;
};

const moveTo = (session: LevelSession, id: string, x: number, z: number) => {
  const actor = structuredClone(session.actor(id as ActorDoc["id"])!);
  actor.transform.p = [x, 0, z];
  return session.edit("Move", (tx) => tx.setActor(actor));
};

async function gateIssues(): Promise<string[]> {
  const scan = await scanContentRoots(project, ["content"]);
  return buildAssetIndex(scan.files, { strict: true, registry }).issues.map((found) => `${found.code} ${found.file}`);
}

describe("save round trip", () => {
  test("edit, save, read back: the same level, and the asset gate stays clean", async () => {
    const session = await open();
    expect(moveTo(session, MESH_ACTOR, 300, 10).ok).toBe(true);
    const outcome = await saveLevelSession(session, client);
    expect(outcome).toMatchObject({ status: "sent", response: { status: "saved" } });
    expect(session.dirtyActors()).toEqual([]);

    const again = await open();
    expect(again.level.actors).toEqual(session.level.actors);
    expect(again.isLoaded("2_0")).toBe(true);
    expect(Object.keys(JSON.parse(await readFile(join(project, FOLDER, "cells.json"), "utf8")).cells)).toEqual(["0_0", "2_0"]);
    expect(await gateIssues()).toEqual([]);

    // Saving with nothing dirty sends nothing.
    expect(await saveLevelSession(again, client)).toEqual({ status: "clean" });
  });

  test("two sessions on one cell: the second save is a 409; after reopening it goes through", async () => {
    const first = await open();
    const second = await open();
    moveTo(first, MESH_ACTOR, 10, 10);
    moveTo(second, MESH_ACTOR, 20, 20);
    expect(await saveLevelSession(first, client)).toMatchObject({ response: { status: "saved" } });
    const refused = await saveLevelSession(second, client);
    expect(refused).toMatchObject({ status: "sent", response: { status: "conflict", conflicts: [{ path: `${FOLDER}/cells/0_0.json` }] } });
    expect(second.dirtyActors()).toEqual([MESH_ACTOR]);

    const reopened = await open();
    expect(reopened.actor(MESH_ACTOR)?.transform.p).toEqual([10, 0, 10]);
    moveTo(reopened, MESH_ACTOR, 20, 20);
    expect(await saveLevelSession(reopened, client)).toMatchObject({ response: { status: "saved" } });
    expect(await gateIssues()).toEqual([]);
  });

  test("undo, then save: the file returns to what it was", async () => {
    const before = await readFile(join(project, FOLDER, "cells/0_0.json"), "utf8");
    const session = await open();
    moveTo(session, MESH_ACTOR, 40, 40);
    await saveLevelSession(session, client);
    session.undo();
    await saveLevelSession(session, client);
    expect(await readFile(join(project, FOLDER, "cells/0_0.json"), "utf8")).toBe(before);
  });
});
