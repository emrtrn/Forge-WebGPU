import { describe, expect, test } from "vitest";
import { openLevelSession, splitLevel, normalizeLevel, type LevelDoc, type PlayRequestBody, type PlayResponseBody, type SaveClient } from "../../core/index.ts";
import { actorId, createOptions, levelId } from "../../core/level/testKit.ts";
import { createEditorPlay } from "./play.ts";

const OPTIONS = createOptions(true);
const FOLDER = "content/levels/main";
const CAMERA = { position: [1, 2, 3], quaternion: [0, 0, 0, 1] } as const;

function level() {
  const doc = normalizeLevel(
    { schema: "forge.level/1", id: levelId("1"), settings: { cellSize: 100 }, actors: [{ id: actorId("a"), name: "a", transform: { p: [10, 0, 10] }, components: {} }] },
    OPTIONS,
  ).value as LevelDoc;
  const split = splitLevel(doc, OPTIONS);
  return openLevelSession(
    {
      folder: FOLDER,
      persistent: split.persistent,
      persistentRevision: "0000000000000001",
      index: { schema: "forge.levelCells/1", level: doc.id, persistent: "0000000000000001", cells: { "0_0": "0000000000000002" } },
      cells: split.cells.map((cell) => ({ doc: cell, revision: "0000000000000002" })),
    },
    OPTIONS,
  );
}

function fakeClient(answer: (request: PlayRequestBody) => PlayResponseBody = (request) => ({ status: "ready", id: request.id! })) {
  const requests: PlayRequestBody[] = [];
  const client = {
    play: async (request: PlayRequestBody) => {
      requests.push(request);
      return answer(request);
    },
  } as unknown as SaveClient;
  return { client, requests };
}

function memoryStorage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => void values.set(key, value) };
}

describe("editor Play", () => {
  test("sends the level's dirty files with the camera and opens the game tab; the level stays dirty", async () => {
    const session = level();
    const actor = structuredClone(session.actor(actorId("a"))!);
    actor.transform.p = [20, 0, 10];
    session.edit("Move", (tx) => tx.setActor(actor));
    const { client, requests } = fakeClient();
    const opened: string[] = [];
    const play = createEditorPlay({ level: session, client, camera: () => CAMERA, storage: memoryStorage(), open: (url) => opened.push(url), newId: () => "c".repeat(32) });
    const report = await play.play();
    expect(report).toMatchObject({ ok: true, url: `/?play=${"c".repeat(32)}` });
    expect(opened).toEqual([`/?play=${"c".repeat(32)}`]);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ id: "c".repeat(32), level: FOLDER, camera: CAMERA, deletes: [] });
    expect(requests[0]!.writes.map((write) => write.path)).toEqual([`${FOLDER}/cells/0_0.json`]);
    expect(JSON.parse(requests[0]!.writes[0]!.text).actors[0].transform.p).toEqual([20, 0, 10]);
    // Play is not a save.
    expect(session.dirtyActors()).toEqual([actorId("a")]);
  });

  test("a clean level plays with no files; the tab keeps one session id", async () => {
    const storage = memoryStorage();
    const { client, requests } = fakeClient();
    let made = 0;
    const newId = () => String(++made).repeat(32);
    const first = createEditorPlay({ level: level(), client, camera: () => CAMERA, storage, open: () => {}, newId });
    await first.play();
    await first.play();
    const again = createEditorPlay({ level: level(), client, camera: () => CAMERA, storage, open: () => {}, newId });
    expect(again.id).toBe(first.id);
    expect(made).toBe(1);
    expect(requests.map((request) => [request.id, request.writes.length])).toEqual([
      [first.id, 0],
      [first.id, 0],
    ]);
  });

  test("a refused session opens nothing and says why", async () => {
    const { client } = fakeClient(() => ({ status: "rejected", reason: "document", message: "The level does not check.", issues: [{ file: "x", path: "y", code: "z", severity: "error", message: "bad" }] }));
    const opened: string[] = [];
    const report = await createEditorPlay({ level: level(), client, camera: () => CAMERA, storage: null, open: (url) => opened.push(url) }).play();
    expect(report).toEqual({ ok: false, message: "Play refused: The level does not check.; x y: bad" });
    expect(opened).toEqual([]);
  });
});
