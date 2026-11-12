import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { buildAssetIndex, stringifyDocument } from "../../src/core/index.ts";
import { createAssetTestRegistry } from "../../src/core/assets/testKit.ts";
import { fileRevision } from "../assets/revision.ts";
import { scanContentRoots } from "../assets/scan.ts";
import { createWritePolicy } from "../server/projectPaths.ts";
import { createClassStore, createDocumentCheck } from "./documentCheck.ts";
import { createSaveService, type SaveRequest, type SaveResult, type SaveService } from "./transaction.ts";

const LEVEL = "lvl_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const CAR = "ast_cccccccccccccccccccccccccccccccc";
const NEW_CLASS = "ast_dddddddddddddddddddddddddddddddd";
const FOLDER = "content/levels/main";
const registry = createAssetTestRegistry();

let project: string;
let service: SaveService;

const carClass = (components: Record<string, unknown>) => ({ schema: "forge.actorClass/1", id: CAR, name: "Car", components });

beforeEach(async () => {
  project = await mkdtemp(join(tmpdir(), "forge-check-"));
  await mkdir(join(project, "content/classes"), { recursive: true });
  await mkdir(join(project, FOLDER), { recursive: true });
  await writeFile(join(project, "content/classes/car.json"), JSON.stringify(carClass({ driver: { type: "test.driver@1" } })));
  await writeFile(join(project, FOLDER, "level.json"), JSON.stringify({ schema: "forge.level/1", id: LEVEL }));
  const scan = await scanContentRoots(project, ["content"]);
  const classes = createClassStore(project, registry, buildAssetIndex(scan.files, { strict: false, registry }));
  service = createSaveService({
    policy: createWritePolicy(project),
    check: createDocumentCheck(registry, classes),
    afterSave: (files) => classes.refresh(files.map((file) => file.path)),
  });
});

afterEach(async () => {
  await rm(project, { recursive: true, force: true });
});

const read = (path: string) => readFile(join(project, path), "utf8");
const rev = async (path: string) => fileRevision(await readFile(join(project, path)));
const write = async (path: string, json: unknown, base?: string | null): Promise<SaveResult> => {
  let given = base;
  if (given === undefined) {
    try {
      given = await rev(path);
    } catch {
      given = null;
    }
  }
  return service.commit({ writes: [{ path, base: given, text: JSON.stringify(json) }] });
};
const codes = (result: SaveResult) =>
  result.status === "rejected" ? result.issues.map((found) => `${found.severity} ${found.code} ${found.file} ${found.path}`.trimEnd()) : [];

const cell = (key: string, actors: unknown[], level = LEVEL) => ({ schema: "forge.levelCell/1", level, cell: key, actors });
const carActor = (overrides: unknown, cls = CAR) => ({ id: `act_${"1".repeat(32)}`, class: cls, transform: { p: [10, 0, 10] }, overrides });

describe("documents are written in canonical form", () => {
  test("a sparse level is completed and written as normalisation gives it", async () => {
    const result = await write(`${FOLDER}/level.json`, { id: LEVEL, schema: "forge.level/1" });
    expect(result.status).toBe("saved");
    const text = await read(`${FOLDER}/level.json`);
    expect(text).toBe(stringifyDocument({ schema: "forge.level/1", id: LEVEL, settings: { cellSize: 128 }, actors: [] }));
  });

  test("a clamped value is written and reported; a loss refuses the save", async () => {
    const clamped = await write(`${FOLDER}/level.json`, { schema: "forge.level/1", id: LEVEL, settings: { cellSize: 2 } });
    expect(clamped).toMatchObject({ status: "saved", warnings: [{ code: "clamped", path: "settings.cellSize" }] });
    expect(JSON.parse(await read(`${FOLDER}/level.json`)).settings.cellSize).toBe(16);

    const before = await read(`${FOLDER}/level.json`);
    const lossy = await write(`${FOLDER}/level.json`, { schema: "forge.level/1", id: LEVEL, layer: "sky" });
    expect(codes(lossy)).toEqual([`error unknown-field ${FOLDER}/level.json layer`]);
    expect(await read(`${FOLDER}/level.json`)).toBe(before);
  });
});

describe("level files", () => {
  test("a level must be named level.json", async () => {
    expect(codes(await write("content/levels/other/main.json", { schema: "forge.level/1", id: LEVEL }))).toEqual([
      "error invalid-document content/levels/other/main.json",
    ]);
  });

  test("a cell must match its file name and its folder's level", async () => {
    expect(codes(await write(`${FOLDER}/cells/0_0.json`, cell("1_0", [])))).toEqual([`error invalid-value ${FOLDER}/cells/0_0.json cell`]);
    const other = "lvl_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    expect(codes(await write(`${FOLDER}/cells/0_0.json`, cell("0_0", [], other)))).toEqual([`error invalid-value ${FOLDER}/cells/0_0.json level`]);
    expect(codes(await write("content/levels/main-cells/0_0.json", cell("0_0", [])))).toEqual([
      "error orphan-part content/levels/main-cells/0_0.json",
    ]);
    expect((await write(`${FOLDER}/cells/0_0.json`, cell("0_0", []))).status).toBe("saved");
  });

  test("a class actor is checked against its class from the store", async () => {
    expect((await write(`${FOLDER}/cells/0_0.json`, cell("0_0", [carActor({ driver: { targetSpeed: 20 } })]))).status).toBe("saved");
    expect(codes(await write(`${FOLDER}/cells/0_0.json`, cell("0_0", [carActor({ body: { mesh: null } })])))).toEqual([
      `error invalid-override ${FOLDER}/cells/0_0.json actors[0].overrides.body`,
    ]);
    expect(codes(await write(`${FOLDER}/cells/0_0.json`, cell("0_0", [carActor({}, NEW_CLASS)])))).toEqual([
      `error dangling-reference ${FOLDER}/cells/0_0.json actors[0].class`,
    ]);
  });

  test("a class written in the same save is used; after a save the store knows the new class", async () => {
    const both: SaveRequest = {
      writes: [
        { path: "content/classes/new.json", base: null, text: JSON.stringify({ schema: "forge.actorClass/1", id: NEW_CLASS, components: { hull: { type: "test.collider@1", parent: null } } }) },
        { path: `${FOLDER}/cells/0_0.json`, base: null, text: JSON.stringify(cell("0_0", [carActor({ hull: { size: [2, 2, 2] } }, NEW_CLASS)])) },
      ],
    };
    expect((await service.commit(both)).status).toBe("saved");

    // The car class changes: its driver becomes a collider. The store follows the save.
    expect((await write("content/classes/car.json", carClass({ chassis: { type: "test.collider@1", parent: null } }))).status).toBe("saved");
    expect((await write(`${FOLDER}/cells/1_0.json`, cell("1_0", [{ ...carActor({ chassis: { size: [3, 1, 3] } }), transform: { p: [130, 0, 0] } }]))).status).toBe("saved");
  });
});

describe("other files", () => {
  test("a meta file needs type, licence and source, and a type that takes the file", async () => {
    const meta = { schema: "forge.assetMeta/1", id: "ast_eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", type: "test.texture@1", license: "CC0-1.0", source: { origin: "test" } };
    expect((await write("content/textures/a.png.meta.json", meta)).status).toBe("saved");
    expect(codes(await write("content/textures/b.png.meta.json", { ...meta, license: "Unknown" }))).toEqual([
      "error invalid-value content/textures/b.png.meta.json license",
    ]);
    expect(codes(await write("content/textures/c.glb.meta.json", meta))).toEqual(["error asset-type-mismatch content/textures/c.glb.meta.json type"]);
  });

  test("a data document is written in its envelope, under its type's suffix; its content is kept", async () => {
    const terrain = { schema: "forge.terrain/1", id: "ast_ffffffffffffffffffffffffffffffff", data: { type: "worldTerrain", tiles: [1, 2] } };
    expect((await write(`${FOLDER}/valley.terrain.json`, { data: terrain.data, id: terrain.id, schema: terrain.schema })).status).toBe("saved");
    expect(await read(`${FOLDER}/valley.terrain.json`)).toBe(stringifyDocument(terrain));
    expect(codes(await write(`${FOLDER}/valley.json`, terrain))).toEqual([`error invalid-document ${FOLDER}/valley.json`]);
    expect(codes(await write(`${FOLDER}/b.terrain.json`, { ...terrain, extra: 1 }))).toEqual([`error unknown-field ${FOLDER}/b.terrain.json extra`]);
  });

  test("JSON that is not a known document, or not JSON, is refused; a binary passes", async () => {
    expect(codes(await write("content/notes.json", { hello: 1 }))).toEqual(["error unrecognized-file content/notes.json"]);
    const broken = await service.commit({ writes: [{ path: "content/broken.json", base: null, text: "{" }] });
    expect(codes(broken)).toEqual(["error invalid-document content/broken.json"]);
    const staged = join(project, ".stage.bin");
    await writeFile(staged, "png");
    expect((await service.commit({ writes: [{ path: "content/textures/a.png", base: null, staged }] })).status).toBe("saved");
  });
});
