import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { fileRevision } from "../assets/revision.ts";
import { createFileEvents, watchContentRoots, watchedPath, type ChangedFile } from "./fileEvents.ts";

let project: string;
let engine: string;

beforeEach(async () => {
  project = await mkdtemp(join(tmpdir(), "forge-events-"));
  engine = await mkdtemp(join(tmpdir(), "forge-events-engine-"));
});

afterEach(async () => {
  await rm(project, { recursive: true, force: true });
  await rm(engine, { recursive: true, force: true });
});

const roots = () => [
  { dir: join(project, "content"), label: "content" },
  { dir: join(engine, "content/packs/starter"), label: "engine:content/packs/starter" },
];

describe("file events", () => {
  test("a file under a content root goes by its label; hidden names and other places do not count", () => {
    expect(watchedPath(roots(), join(project, "content/levels/main/level.json"))).toBe("content/levels/main/level.json");
    expect(watchedPath(roots(), join(engine, "content/packs/starter/classes/a.json"))).toBe("engine:content/packs/starter/classes/a.json");
    expect(watchedPath(roots(), join(project, "content/levels/main/.level.json.abc.tmp"))).toBeNull();
    expect(watchedPath(roots(), join(project, "content/.forge-cache/x.json"))).toBeNull();
    expect(watchedPath(roots(), join(project, ".forge-journal/save.lock"))).toBeNull();
    expect(watchedPath(roots(), join(project, "src/game.ts"))).toBeNull();
    expect(watchedPath(roots(), join(project, "content"))).toBeNull();
  });

  test("changes close together are one batch, sorted, each with the revision on disk (null when gone)", async () => {
    const batches: ChangedFile[][] = [];
    const events = createFileEvents({ roots: roots(), emit: (files) => void batches.push([...files]), quietMs: 30 });
    await mkdir(join(project, "content/levels/main/cells"), { recursive: true });
    await writeFile(join(project, "content/levels/main/level.json"), "{}\n");
    await writeFile(join(project, "content/levels/main/cells/0_0.json"), "[]\n");
    events.push(join(project, "content/levels/main/level.json"));
    events.push(join(project, "content/levels/main/cells/0_0.json"));
    events.push(join(project, "content/levels/main/.cells.json.x.tmp"));
    events.push(join(project, "content/levels/main/level.json"));
    events.push(join(project, "content/levels/main/gone.json"));
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(batches).toEqual([
      [
        { path: "content/levels/main/cells/0_0.json", revision: fileRevision(Buffer.from("[]\n")) },
        { path: "content/levels/main/gone.json", revision: null },
        { path: "content/levels/main/level.json", revision: fileRevision(Buffer.from("{}\n")) },
      ],
    ]);
    events.dispose();
  });

  test("a steady stream still goes out after the longest wait; nothing is sent after dispose", async () => {
    const batches: ChangedFile[][] = [];
    const events = createFileEvents({ roots: roots(), emit: (files) => void batches.push([...files]), quietMs: 40, maxWaitMs: 100 });
    const started = Date.now();
    while (Date.now() - started < 220) {
      events.push(join(project, "content/a.json"));
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
    expect(batches.length).toBeGreaterThanOrEqual(2);
    events.dispose();
    const sent = batches.length;
    events.push(join(project, "content/a.json"));
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(batches.length).toBe(sent);
  });

  test("flush sends at once", async () => {
    const batches: ChangedFile[][] = [];
    const events = createFileEvents({ roots: roots(), emit: (files) => void batches.push([...files]), quietMs: 10_000 });
    events.push(join(project, "content/b.json"));
    await events.flush();
    expect(batches).toEqual([[{ path: "content/b.json", revision: null }]]);
    await events.flush();
    expect(batches).toHaveLength(1);
    events.dispose();
  });

  test("the content roots are watched on disk: a save's renames, and a level folder deleted and made again", async () => {
    const level = join(project, "content/levels/main");
    await mkdir(join(level, "cells"), { recursive: true });
    const seen = new Set<string>();
    const events = createFileEvents({ roots: roots(), emit: (files) => void files.forEach((file) => seen.add(file.path)), quietMs: 30 });
    const stop = watchContentRoots(roots(), events);
    const settle = () => new Promise((resolve) => setTimeout(resolve, 250));
    const save = async (text: string) => {
      await mkdir(join(level, "cells"), { recursive: true });
      await writeFile(join(level, "cells/.0_0.json.t.tmp"), text);
      await rename(join(level, "cells/.0_0.json.t.tmp"), join(level, "cells/0_0.json"));
      await writeFile(join(level, ".level.json.t.tmp"), text);
      await rename(join(level, ".level.json.t.tmp"), join(level, "level.json"));
    };
    try {
      await settle();
      await save("1");
      await settle();
      expect([...seen].sort()).toEqual(expect.arrayContaining(["content/levels/main/cells/0_0.json", "content/levels/main/level.json"]));
      seen.clear();
      await rm(level, { recursive: true, force: true });
      await mkdir(level, { recursive: true });
      await writeFile(join(level, "level.json"), "2");
      await settle();
      seen.clear();
      await save("3");
      await settle();
      expect([...seen].sort()).toEqual(expect.arrayContaining(["content/levels/main/cells/0_0.json", "content/levels/main/level.json"]));
      // Saved again over the replaced files, twice: still seen.
      for (const text of ["4", "5"]) {
        seen.clear();
        await save(text);
        await settle();
        expect([...seen].sort()).toEqual(expect.arrayContaining(["content/levels/main/cells/0_0.json", "content/levels/main/level.json"]));
      }
      // A folder made with files written at once: the files are reported.
      seen.clear();
      await mkdir(join(project, "content/levels/other/cells"), { recursive: true });
      await writeFile(join(project, "content/levels/other/cells/1_1.json"), "{}");
      await settle();
      expect([...seen]).toContain("content/levels/other/cells/1_1.json");
      expect([...seen].some((path) => path.includes(".tmp"))).toBe(false);
    } finally {
      stop();
      events.dispose();
    }
  });
});
