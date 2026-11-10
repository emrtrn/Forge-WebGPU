import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { buildAssetIndex, stringifyDocument } from "../../src/core/index.ts";
import { createAssetTestRegistry } from "../../src/core/assets/testKit.ts";
import { fileRevision } from "../assets/revision.ts";
import { scanContentRoots } from "../assets/scan.ts";
import { createWritePolicy, type WritePolicy } from "../server/projectPaths.ts";
import { JOURNAL_DIR, writeJournal } from "./journal.ts";
import { createSaveService, SimulatedCrash, type SaveRequest, type SaveResult } from "./transaction.ts";

const LEVEL = "lvl_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const FOLDER = "content/levels/main";
const actor = (seed: string, x: number) => ({
  id: `act_${seed.repeat(32)}`,
  name: "A",
  class: null,
  parent: null,
  spatiallyLoaded: true,
  transform: { p: [x, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] },
  components: {},
});
const levelText = () => stringifyDocument({ schema: "forge.level/1", id: LEVEL, settings: { cellSize: 128 }, actors: [] });
const cellText = (key: string, ...actors: unknown[]) =>
  stringifyDocument({ schema: "forge.levelCell/1", level: LEVEL, cell: key, actors });

let project: string;
let policy: WritePolicy;

beforeEach(async () => {
  project = await mkdtemp(join(tmpdir(), "forge-save-"));
  await mkdir(join(project, "content"), { recursive: true });
  policy = createWritePolicy(project);
});

afterEach(async () => {
  await rm(project, { recursive: true, force: true });
});

const read = (path: string) => readFile(join(project, path), "utf8");
const revisionOf = async (path: string) => fileRevision(await readFile(join(project, path)));

function saved(result: SaveResult) {
  if (result.status !== "saved") throw new Error(`expected saved, got ${JSON.stringify(result)}`);
  return result;
}

/** Every file under the project, with its text: the state a save leaves. */
async function snapshot(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const walk = async (dir: string, rel: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = rel === "" ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory()) await walk(join(dir, entry.name), path);
      else out[path] = await readFile(join(dir, entry.name), "utf8");
    }
  };
  await walk(project, "");
  return out;
}

async function createLevel(): Promise<void> {
  const service = createSaveService({ policy });
  saved(
    await service.commit({
      writes: [
        { path: `${FOLDER}/level.json`, base: null, text: levelText() },
        { path: `${FOLDER}/cells/0_0.json`, base: null, text: cellText("0_0", actor("1", 10)) },
        { path: `${FOLDER}/cells/1_0.json`, base: null, text: cellText("1_0", actor("2", 130)) },
      ],
    }),
  );
}

describe("a save", () => {
  test("writes new files and builds the level index from their bytes", async () => {
    await createLevel();
    const index = JSON.parse(await read(`${FOLDER}/cells.json`));
    expect(index).toEqual({
      schema: "forge.levelCells/1",
      level: LEVEL,
      persistent: await revisionOf(`${FOLDER}/level.json`),
      cells: { "0_0": await revisionOf(`${FOLDER}/cells/0_0.json`), "1_0": await revisionOf(`${FOLDER}/cells/1_0.json`) },
    });
    // The asset gate agrees: no revision mismatch, no orphan.
    const scan = await scanContentRoots(project, ["content"]);
    expect(buildAssetIndex(scan.files, { strict: true, registry: createAssetTestRegistry() }).issues).toEqual([]);
    expect(await readdir(join(project, JOURNAL_DIR))).toEqual([]);
  });

  test("updates one cell: only its index entry changes; the result lists the new revisions", async () => {
    await createLevel();
    const before = JSON.parse(await read(`${FOLDER}/cells.json`));
    const result = saved(
      await createSaveService({ policy }).commit({
        writes: [
          { path: `${FOLDER}/cells/0_0.json`, base: await revisionOf(`${FOLDER}/cells/0_0.json`), text: cellText("0_0", actor("1", 20)) },
        ],
      }),
    );
    const after = JSON.parse(await read(`${FOLDER}/cells.json`));
    expect(after.persistent).toBe(before.persistent);
    expect(after.cells["1_0"]).toBe(before.cells["1_0"]);
    expect(after.cells["0_0"]).toBe(await revisionOf(`${FOLDER}/cells/0_0.json`));
    expect(result.files).toEqual([
      { path: `${FOLDER}/cells/0_0.json`, revision: after.cells["0_0"] },
      { path: `${FOLDER}/cells.json`, revision: await revisionOf(`${FOLDER}/cells.json`) },
    ]);
  });

  test("deleting a cell takes it out of the index", async () => {
    await createLevel();
    saved(
      await createSaveService({ policy }).commit({
        deletes: [{ path: `${FOLDER}/cells/1_0.json`, base: await revisionOf(`${FOLDER}/cells/1_0.json`) }],
      }),
    );
    expect(Object.keys(JSON.parse(await read(`${FOLDER}/cells.json`)).cells)).toEqual(["0_0"]);
  });

  test("deleting a level needs its cells deleted with it, and removes the index", async () => {
    await createLevel();
    const service = createSaveService({ policy });
    const level = { path: `${FOLDER}/level.json`, base: await revisionOf(`${FOLDER}/level.json`) };
    const partial = await service.commit({ deletes: [level] });
    expect(partial).toMatchObject({ status: "rejected", reason: "request", issues: [{ code: "cells-left" }] });
    saved(
      await service.commit({
        deletes: [
          level,
          { path: `${FOLDER}/cells/0_0.json`, base: await revisionOf(`${FOLDER}/cells/0_0.json`) },
          { path: `${FOLDER}/cells/1_0.json`, base: await revisionOf(`${FOLDER}/cells/1_0.json`) },
        ],
      }),
    );
    expect(Object.keys(await snapshot()).filter((path) => path.startsWith(FOLDER))).toEqual([]);
  });
});

describe("refused saves write nothing", () => {
  test("a base revision that does not match is a conflict (409) listing the current revisions", async () => {
    await createLevel();
    const before = await snapshot();
    const current = await revisionOf(`${FOLDER}/cells/0_0.json`);
    const result = await createSaveService({ policy }).commit({
      writes: [
        { path: `${FOLDER}/cells/0_0.json`, base: "0000000000000000", text: cellText("0_0") },
        { path: `${FOLDER}/cells/2_0.json`, base: null, text: cellText("2_0") },
        { path: `${FOLDER}/cells/1_0.json`, base: null, text: cellText("1_0") },
      ],
    });
    expect(result).toEqual({
      status: "conflict",
      conflicts: [
        { path: `${FOLDER}/cells/0_0.json`, base: "0000000000000000", current },
        { path: `${FOLDER}/cells/1_0.json`, base: null, current: await revisionOf(`${FOLDER}/cells/1_0.json`) },
      ],
    });
    expect(await snapshot()).toEqual(before);
  });

  test.each([
    ["a fixture", "tests/fixtures/assets/content/x.json", "read-only"],
    ["outside the writable roots", "src/main.ts", "read-only"],
    ["a dot name", "content/.secret.json", "hidden"],
    ["a level index", `${FOLDER}/cells.json`, "server-owned"],
    ["an escape", "content/../../x.json", "outside-root"],
  ])("%s", async (_name, path, code) => {
    const result = await createSaveService({ policy }).commit({ writes: [{ path, base: null, text: "{}" }] });
    expect(result).toMatchObject({ status: "rejected", reason: "path", issues: [{ code }] });
    expect(Object.keys(await snapshot())).toEqual([]);
  });

  test("a request naming a file twice, an empty request, a cell without its level", async () => {
    const service = createSaveService({ policy });
    const twice: SaveRequest = { writes: [{ path: "content/a.json", base: null, text: "{}" }], deletes: [{ path: "content/a.json", base: "x" }] };
    expect(await service.commit(twice)).toMatchObject({ status: "rejected", issues: [{ code: "duplicate-path" }] });
    expect(await service.commit({})).toMatchObject({ status: "rejected", reason: "request" });
    const orphan = await service.commit({ writes: [{ path: `${FOLDER}/cells/0_0.json`, base: null, text: cellText("0_0") }] });
    expect(orphan).toMatchObject({ status: "rejected", reason: "request", issues: [{ code: "no-level" }] });
    expect(Object.keys(await snapshot()).filter((path) => !path.startsWith(JOURNAL_DIR))).toEqual([]);
  });

  test("a document check with an error refuses the save; its rewritten text is what gets written", async () => {
    const check = async ({ path, text }: { path: string; text: string }) => ({
      text: text.replace("draft", "final"),
      issues: path.endsWith("bad.json") ? [{ file: path, path: "x", code: "invalid-value", severity: "error" as const, message: "no" }] : [],
    });
    const service = createSaveService({ policy, check });
    const refused = await service.commit({
      writes: [
        { path: "content/good.json", base: null, text: "draft" },
        { path: "content/bad.json", base: null, text: "draft" },
      ],
    });
    expect(refused).toMatchObject({ status: "rejected", reason: "document", issues: [{ file: "content/bad.json" }] });
    const result = saved(await service.commit({ writes: [{ path: "content/good.json", base: null, text: "draft" }] }));
    expect(await read("content/good.json")).toBe("final");
    expect(result.files[0]?.revision).toBe(fileRevision("final"));
  });
});

describe("interrupted saves", () => {
  test("a crash after any step is finished by recovery: all or nothing", async () => {
    await createLevel();
    const base = await snapshot();
    const request: SaveRequest = {
      writes: [
        { path: `${FOLDER}/level.json`, base: await revisionOf(`${FOLDER}/level.json`), text: levelText().replace("128", "256") },
        { path: `${FOLDER}/cells/0_0.json`, base: await revisionOf(`${FOLDER}/cells/0_0.json`), text: cellText("0_0", actor("1", 30)) },
      ],
      deletes: [{ path: `${FOLDER}/cells/1_0.json`, base: await revisionOf(`${FOLDER}/cells/1_0.json`) }],
    };
    // The complete result, for comparison.
    saved(await createSaveService({ policy }).commit(request));
    const complete = await snapshot();
    const steps = 4; // two renames, one delete, the index rename

    for (let crashAfter = 1; crashAfter < steps; crashAfter += 1) {
      await rm(join(project, "content"), { recursive: true, force: true });
      for (const [path, text] of Object.entries(base)) {
        await mkdir(join(project, path, ".."), { recursive: true });
        await writeFile(join(project, path), text);
      }
      const crashing = createSaveService({ policy, failAfterSteps: crashAfter });
      await expect(crashing.commit(request)).rejects.toBeInstanceOf(SimulatedCrash);
      expect(await snapshot()).not.toEqual(complete);
      const report = await createSaveService({ policy }).recover();
      expect(report.rolledForward).toHaveLength(1);
      expect(await snapshot()).toEqual(complete);
    }
  });

  test("a save that stopped before its commit point is undone", async () => {
    await createLevel();
    const before = await snapshot();
    const temp = `${FOLDER}/cells/.0_0.json.tx1.tmp`;
    await writeJournal(project, {
      schema: "forge.saveJournal/1",
      txid: "tx1",
      state: "prepared",
      temps: [temp],
      steps: [{ op: "rename", from: temp, to: `${FOLDER}/cells/0_0.json` }],
    });
    await writeFile(join(project, temp), "half");
    const report = await createSaveService({ policy }).recover();
    expect(report).toEqual({ rolledForward: [], rolledBack: ["tx1"] });
    expect(await snapshot()).toEqual(before);
  });

  test("the next save recovers first", async () => {
    await createLevel();
    const request: SaveRequest = {
      writes: [{ path: `${FOLDER}/cells/0_0.json`, base: await revisionOf(`${FOLDER}/cells/0_0.json`), text: cellText("0_0") }],
    };
    await expect(createSaveService({ policy, failAfterSteps: 1 }).commit(request)).rejects.toBeInstanceOf(SimulatedCrash);
    // The index was not renamed yet; the next save finishes the first one, then runs.
    const next = await createSaveService({ policy }).commit({
      writes: [{ path: "content/other.json", base: null, text: "{}" }],
    });
    saved(next);
    const index = JSON.parse(await read(`${FOLDER}/cells.json`));
    expect(index.cells["0_0"]).toBe(await revisionOf(`${FOLDER}/cells/0_0.json`));
  });
});

describe("the binary channel", () => {
  test("a staged upload is moved into place and its stage file removed", async () => {
    const staged = join(project, ".forge-staging-test.bin");
    await writeFile(staged, Buffer.from([0, 1, 2, 255]));
    const result = saved(
      await createSaveService({ policy }).commit({
        writes: [
          { path: "content/meshes/a.glb", base: null, staged },
          { path: "content/meshes/a.glb.meta.json", base: null, text: "{}" },
        ],
      }),
    );
    expect([...(await readFile(join(project, "content/meshes/a.glb")))]).toEqual([0, 1, 2, 255]);
    expect(result.files[0]?.revision).toBe(fileRevision(Buffer.from([0, 1, 2, 255])));
    await expect(readFile(staged)).rejects.toThrow();
  });
});
