import { describe, expect, test } from "vitest";
import type { SaveClient, SaveRequestBody, SaveResponseBody } from "../../core/index.ts";
import { applyTerrainBrush, createTerrainEditWorld } from "../../engine/terrain/terrainEdit.ts";
import { createTerrainEditing } from "../../engine/terrain/terrainEditing.ts";
import { TerrainEditSession } from "../../engine/terrain/terrainEditSession.ts";
import { decodeTerrainTile } from "../../engine/terrain/terrainTileCodec.ts";
import { createFlatWorldTerrain } from "../../engine/terrain/worldTerrainCreate.ts";
import { createLandscapeSave } from "./landscapeSave.ts";

const GUID = `ast_${"3".repeat(32)}`;
const DOCUMENT = "content/terrain/hill.terrain.json";

/** A 2 × 1 terrain read from "disk" with revisions; tile 1_0 stands in for a failed read when `failed`. */
function session(failed = false) {
  const flat = createFlatWorldTerrain({ name: "hill", tilesX: 2, tilesZ: 1, tileQuads: 64, spacing: 1, baseHeight: 0 });
  const world = createTerrainEditWorld(flat.def, []);
  const edit = new TerrainEditSession(world, { document: "d000000000000000", global: "g000000000000000" });
  for (const [key, tile] of flat.tiles) {
    world.tiles.set(key, tile);
    if (!(failed && key === "1_0")) edit.recordTile(key, tile, "f32", `t${key}`);
  }
  edit.global = null;
  return edit;
}

function client(answer: (request: SaveRequestBody) => SaveResponseBody, saves: SaveRequestBody[], staged: Uint8Array[]): SaveClient {
  return {
    stageBinary: async (bytes: Uint8Array) => { staged.push(bytes); return { id: `s${staged.length}`, size: bytes.length, revision: "x" }; },
    save: async (request: SaveRequestBody) => { saves.push(request); return answer(request); },
  } as unknown as SaveClient;
}

describe("saving edited terrains (plan 5d step 2)", () => {
  test("a stroke saves its tiles, the far map and the definition with the revisions they were read with", async () => {
    const edit = session();
    const editing = createTerrainEditing();
    editing.session(GUID, () => edit);
    const [ox, , oz] = edit.world.def.origin;
    const result = applyTerrainBrush(edit.world, { mode: "raise", x: ox + 10, z: oz + 10, radius: 3, strength: 0.5, falloff: 1 });
    edit.markTiles(result.dirty.keys());
    const saves: SaveRequestBody[] = [];
    const staged: Uint8Array[] = [];
    const saved = (request: SaveRequestBody): SaveResponseBody => ({ status: "saved", warnings: [], files: request.writes.map((write) => ({ path: write.path, revision: `n${write.path.length}`.padEnd(16, "0") })) });
    const save = createLandscapeSave({ editing, client: client(saved, saves, staged), documentPath: () => DOCUMENT, writable: () => true, readFile: async () => null });
    expect(save.dirty()).toBe(1);
    const report = await save.save();
    expect(report).toEqual({ ok: true, files: 3, message: "Saved 3 terrain files" });
    expect(saves[0]!.writes.map((write) => [write.path, write.base])).toEqual([
      ["content/terrain/hill.tiles/0_0.tile.bin", "t0_0"],
      ["content/terrain/hill.global.bin", "g000000000000000"],
      [DOCUMENT, "d000000000000000"],
    ]);
    expect(Math.max(...decodeTerrainTile(staged[0]!).heights)).toBeGreaterThan(0.4);
    expect(save.dirty()).toBe(0);
    // The next save names the revisions this one wrote.
    edit.markTiles(["0_0"]);
    await save.save();
    expect(saves[1]!.writes[0]!.base).toBe(`n${"content/terrain/hill.tiles/0_0.tile.bin".length}`.padEnd(16, "0"));
  });

  test("a conflict writes nothing and keeps the tiles dirty; a read-only terrain is refused", async () => {
    const edit = session();
    const editing = createTerrainEditing();
    editing.session(GUID, () => edit);
    edit.markTiles(["1_0"]);
    const saves: SaveRequestBody[] = [];
    const conflict = (): SaveResponseBody => ({ status: "conflict", conflicts: [{ path: DOCUMENT, base: "d000000000000000", current: "e000000000000000" }] });
    const save = createLandscapeSave({ editing, client: client(conflict, saves, []), documentPath: () => DOCUMENT, writable: () => true, readFile: async () => null });
    expect(await save.save()).toMatchObject({ ok: false, conflict: true });
    expect(save.dirty()).toBe(1);
    const readOnly = createLandscapeSave({ editing, client: client(conflict, saves, []), documentPath: () => DOCUMENT, writable: () => false, readFile: async () => null });
    expect((await readOnly.save()).message).toContain("read only");
    expect(saves.length).toBe(1);
  });

  test("a stand-in for a failed read is not readable; a clean session goes when its files change on disk, a dirty one stays", () => {
    const edit = session(true);
    expect([edit.readable("0_0"), edit.readable("1_0")]).toEqual([true, false]);
    const editing = createTerrainEditing();
    editing.session(GUID, () => edit);
    const save = createLandscapeSave({ editing, client: client(() => ({ status: "saved", warnings: [], files: [] }), [], []), documentPath: () => DOCUMENT, writable: () => true, readFile: async () => null });
    // Its own revisions coming back change nothing.
    expect(save.diskChanged([{ path: DOCUMENT, revision: "d000000000000000" }])).toEqual([]);
    edit.markTiles(["0_0"]);
    expect(save.diskChanged([{ path: DOCUMENT, revision: "f000000000000000" }])).toEqual([]);
    expect(editing.sessions().has(GUID)).toBe(true);
    const clean = session();
    const other = createTerrainEditing();
    other.session(GUID, () => clean);
    const watcher = createLandscapeSave({ editing: other, client: client(() => ({ status: "saved", warnings: [], files: [] }), [], []), documentPath: () => DOCUMENT, writable: () => true, readFile: async () => null });
    expect(watcher.diskChanged([{ path: "content/terrain/hill.tiles/0_0.tile.bin", revision: "f000000000000000" }])).toEqual([GUID]);
    expect(other.sessions().has(GUID)).toBe(false);
  });
});
