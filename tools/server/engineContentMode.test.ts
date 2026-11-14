// Phase 4 / 6g: only temporary engine/project content is written. Exercise
// the public endpoints and the real editor save client, not routing mocks.
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { buildAssetIndex, createSaveClient, openLevelFromServer, saveLevelSession, type ActorDoc, type ContentListingBody, type ContentOpBody } from "../../src/core/index.ts";
import { createAssetTestRegistry } from "../../src/core/assets/testKit.ts";
import { engineContentRoots } from "../assets/engineContent.ts";
import { scanRoots } from "../assets/scan.ts";
import { createForgeServer } from "./forgeServer.ts";

const ENGINE = "engine:content/engine";
const PACK = "engine:content/packs/a";
const OTHER = "engine:content/packs/b";
const HEADERS = { "X-Forge-Request": "1", "Content-Type": "application/json" };
const TEX = `ast_${"1".repeat(32)}`;
const MESH = `ast_${"2".repeat(32)}`;
const ACTOR = `act_${"3".repeat(32)}` as ActorDoc["id"];
const registry = createAssetTestRegistry();
type Classes = { classes: unknown[] };
let folder: string;
let engineRoot: string;
let project: string;
const servers: Server[] = [];

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "forge-engine-mode-"));
  engineRoot = join(folder, "engine");
  project = join(folder, "project");
  for (const dir of [join(project, "content"), join(engineRoot, "content/engine"), join(engineRoot, "content/packs/a/sub"), join(engineRoot, "content/packs/b")]) await mkdir(dir, { recursive: true });
  await writeFile(join(project, "forge.project.json"), '{"startLevel":"content/main"}\n');
  const meta = (id: string, type: string, extra = {}) => JSON.stringify({ schema: "forge.assetMeta/1", id, type, license: "CC0-1.0", source: { origin: "6g test" }, ...extra });
  await writeFile(join(engineRoot, "content/packs/a/t.png"), "png");
  await writeFile(join(engineRoot, "content/packs/a/t.png.meta.json"), meta(TEX, "test.texture@1"));
  await writeFile(join(engineRoot, "content/packs/a/car.glb"), "glb");
  await writeFile(join(engineRoot, "content/packs/a/car.glb.meta.json"), meta(MESH, "test.mesh@1", { import: { textures: [TEX] } }));
});

afterEach(async () => {
  for (const server of servers.splice(0)) await new Promise<void>((done) => server.close(() => done()));
  await rm(folder, { recursive: true, force: true });
});

async function serve(mode = true, readOnly = true) {
  const forge = await createForgeServer({ root: project, registry, contentRoots: ["content"], readOnly,
    readOnlyRoots: engineContentRoots(engineRoot, ["a", "b"]), ...(mode ? { engineContent: { root: engineRoot } } : {}) });
  const server = createServer((req, res) => forge.middleware(req, res, () => res.end()));
  servers.push(server);
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (route: string, body: unknown) => fetch(`${base}/__forge/${route}`, { method: "POST", headers: HEADERS, body: JSON.stringify(body) });
  const get = async <T>(route: string): Promise<T> => (await fetch(`${base}/__forge/${route}`, { headers: HEADERS })).json() as Promise<T>;
  const op = (body: ContentOpBody) => post("content", body);
  const client = createSaveClient({ baseUrl: base, fetch });
  return { base, get, post, op, client };
}

describe("engine content mode", () => {
  test("only the engine roots become writable; samples and their manifest stay protected", async () => {
    const api = await serve();
    expect((await api.get<ContentListingBody>("content")).roots).toEqual([
      { label: "content", writable: false }, { label: ENGINE, writable: true }, { label: PACK, writable: true }, { label: OTHER, writable: true },
    ]);
    expect((await api.op({ op: "mkdir", path: "content/blocked" })).status).toBe(403);
    expect((await api.post("save", { writes: [{ path: "content/test.actor.json", base: null, text: "{}" }] })).status).toBe(403);
    expect((await api.op({ op: "startLevel", level: `${ENGINE}/main` })).status).toBe(403);
    expect(await readFile(join(project, "forge.project.json"), "utf8")).toBe('{"startLevel":"content/main"}\n');
  });

  test("new, rename, move, copy and reference-safe delete within a pack", async () => {
    const api = await serve();
    expect((await api.op({ op: "mkdir", path: `${PACK}/new` })).status).toBe(200);
    expect((await api.op({ op: "rename", item: `${PACK}/t.png`, name: "paint" })).status).toBe(200);
    expect((await api.op({ op: "move", items: [`${PACK}/paint.png`], to: `${PACK}/new` })).status).toBe(200);
    expect((await api.op({ op: "delete", items: [`${PACK}/new/paint.png`] })).status).toBe(409);
    expect((await api.op({ op: "copy", items: [`${PACK}/new/paint.png`], to: `${PACK}/sub` })).status).toBe(200);
    const copied = JSON.parse(await readFile(join(engineRoot, "content/packs/a/sub/paint.png.meta.json"), "utf8"));
    expect(copied.id).not.toBe(TEX);
    expect((await api.op({ op: "delete", items: [`${PACK}/sub/paint.png`] })).status).toBe(200);
    const scan = await scanRoots(engineContentRoots(engineRoot, ["a", "b"]));
    expect(buildAssetIndex(scan.files, { registry, strict: true }).issues).toEqual([]);
  });

  test("cross-root binary and materialised JSON copies are refused before any write", async () => {
    const api = await serve();
    expect((await api.op({ op: "create", folder: PACK, name: "Class", kind: "actorClass" })).status).toBe(200);
    for (const item of [`${PACK}/car.glb`, `${PACK}/Class.actor.json`]) {
      for (const to of [ENGINE, OTHER]) {
        const response = await api.op({ op: "copy", items: [item], to });
        expect(response.status).toBe(409);
        expect(await response.json()).toMatchObject({ status: "refused", reason: "dependency" });
      }
    }
    expect((await api.op({ op: "move", items: [`${PACK}/car.glb`], to: OTHER })).status).toBe(409);
    expect(await readdir(join(engineRoot, "content/engine"))).toEqual([]);
    expect(await readdir(join(engineRoot, "content/packs/b"))).toEqual([]);
  });

  test("classes are refreshed after create, copy, edit, rename and delete", async () => {
    const api = await serve();
    const path = `${ENGINE}/Class.actor.json`;
    await api.op({ op: "create", folder: ENGINE, name: "Class", kind: "actorClass" });
    expect((await api.get<Classes>("classes")).classes).toHaveLength(1);
    const read = (await api.client.read(path))!;
    const doc = JSON.parse(read.text);
    expect(await api.client.save({ writes: [{ path, base: read.revision, text: JSON.stringify({ ...doc, name: "Edited" }) }], deletes: [] })).toMatchObject({ status: "saved" });
    expect((await api.get<Classes>("classes")).classes).toEqual([expect.objectContaining({ name: "Edited" })]);
    await api.op({ op: "copy", items: [path], to: ENGINE });
    expect((await api.get<Classes>("classes")).classes).toHaveLength(2);
    await api.op({ op: "rename", item: path, name: "Renamed" });
    expect((await api.get<Classes>("classes")).classes).toHaveLength(2);
    await api.op({ op: "delete", items: [`${ENGINE}/Renamed.actor.json`] });
    expect((await api.get<Classes>("classes")).classes).toHaveLength(1);
  });

  test("import and reimport keep metadata and GUIDs on the engine side", async () => {
    const api = await serve();
    const first = await api.client.stageBinary(new TextEncoder().encode("first png"));
    expect((await api.op({ op: "import", folder: ENGINE, files: [{ name: "pic.png", staged: first.id }], license: "CC0-1.0", source: { origin: "test" } })).status).toBe(200);
    const file = join(engineRoot, "content/engine/pic.png");
    const before = await readFile(`${file}.meta.json`, "utf8");
    const second = await api.client.stageBinary(new TextEncoder().encode("second png"));
    expect((await api.op({ op: "reimport", item: `${ENGINE}/pic.png`, staged: second.id })).status).toBe(200);
    expect(await readFile(file, "utf8")).toBe("second png");
    expect(await readFile(`${file}.meta.json`, "utf8")).toBe(before);
  });

  test("level edits round-trip with labelled indexes, deletions and conflicts", async () => {
    const api = await serve();
    const level = `${ENGINE}/main`;
    await api.op({ op: "create", folder: ENGINE, name: "main", kind: "level", actors: [{ id: ACTOR, name: "Before", spatiallyLoaded: false }] });
    const open = async () => (await openLevelFromServer(api.client, level, { registry, strict: true, resolveClass: () => undefined })).session;
    const a = await open(), b = await open();
    for (const [session, name] of [[a, "Saved"], [b, "Conflict"]] as const) {
      expect(session.edit("Rename", (tx) => tx.setActor({ ...session.actor(ACTOR)!, name })).ok).toBe(true);
    }
    expect(await saveLevelSession(a, api.client)).toMatchObject({ response: { status: "saved", files: expect.arrayContaining([
      expect.objectContaining({ path: `${level}/level.json` }), expect.objectContaining({ path: `${level}/cells.json` }),
    ]) } });
    expect(a.dirtyActors()).toEqual([]);
    expect(await saveLevelSession(b, api.client)).toMatchObject({ response: { status: "conflict", conflicts: [expect.objectContaining({ path: `${level}/level.json` })] } });
    expect((await open()).actor(ACTOR)?.name).toBe("Saved");
    const cell = `${level}/cells/0_0.json`;
    expect(await api.client.save({ writes: [{ path: cell, base: null, text: JSON.stringify({ schema: "forge.levelCell/1", level: a.level.id, cell: "0_0", actors: [] }) }], deletes: [] })).toMatchObject({ status: "saved" });
    const read = (await api.client.read(cell))!;
    expect(await api.client.save({ writes: [], deletes: [{ path: cell, base: read.revision }] })).toMatchObject({ status: "saved", files: expect.arrayContaining([expect.objectContaining({ path: cell, revision: null })]) });
    expect(JSON.parse((await api.client.read(`${level}/cells.json`))!.text).cells).toEqual({});
  });

  test("mixed roots, traversal across a pack boundary and unknown roots cannot write", async () => {
    const api = await serve();
    const write = (path: string) => ({ path, base: null, text: JSON.stringify({ schema: "forge.actorClass/1", id: TEX, components: {} }) });
    for (const paths of [[`${ENGINE}/a.actor.json`, "content/a.actor.json"], [`${ENGINE}/a.actor.json`, `${PACK}/a.actor.json`], [`${PACK}/../b/a.actor.json`], ["engine:content/packs/unknown/a.actor.json"]]) {
      expect((await api.post("save", { writes: paths.map(write) })).status).toBe(403);
    }
    expect((await api.op({ op: "mkdir", path: `${PACK}/../b/escaped` })).status).toBe(404);
    expect(await readdir(join(engineRoot, "content/engine"))).toEqual([]);
    expect(await readdir(join(engineRoot, "content/packs/b"))).toEqual([]);
  });
});

describe("normal project mode remains read-only for engine content", () => {
  test("engine writes and uploads are refused in a read-only sample", async () => {
    const api = await serve(false);
    expect((await api.get<ContentListingBody>("content")).roots.every((root) => !root.writable)).toBe(true);
    expect((await api.op({ op: "mkdir", path: `${ENGINE}/blocked` })).status).toBe(403);
    expect((await api.post("save", { writes: [{ path: `${ENGINE}/a.json`, base: null, text: "{}" }] })).status).toBe(403);
    expect((await fetch(`${api.base}/__forge/stage-binary`, { method: "POST", headers: HEADERS, body: "png" })).status).toBe(403);
  });

  test.each([false, true])("engine-to-project copy remains available (engine mode %s)", async (mode) => {
    const api = await serve(mode, false);
    expect((await api.op({ op: "copy", items: [`${PACK}/t.png`], to: "content" })).status).toBe(200);
    expect(await readFile(join(project, "content/t.png"), "utf8")).toBe("png");
    expect((await api.op({ op: "copy", items: ["content/t.png"], to: ENGINE })).status).toBe(mode ? 409 : 403);
    expect((await api.post("save", { writes: [{ path: `${ENGINE}/forbidden.json`, base: null, text: "{}" }] })).status).toBe(mode ? 422 : 403);
  });
});
