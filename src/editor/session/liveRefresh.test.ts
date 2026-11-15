import { describe, expect, test } from "vitest";
import type { ReadLevel, RebaseMode } from "../../core/index.ts";
import { createLiveRefresh, levelChange, type ChangedFile } from "./liveRefresh.ts";

const FOLDER = "content/levels/main";
const known: Record<string, string> = {
  [`${FOLDER}/level.json`]: "aaaaaaaaaaaaaaaa",
  [`${FOLDER}/cells/0_0.json`]: "bbbbbbbbbbbbbbbb",
};
const at = (path: string): string | undefined => known[path];

describe("level change", () => {
  test("a level file whose revision is not the session's is a change; the index, other files and own revisions are not", () => {
    expect(levelChange(FOLDER, [{ path: `${FOLDER}/level.json`, revision: "aaaaaaaaaaaaaaaa" }], at)).toBe("none");
    expect(levelChange(FOLDER, [{ path: `${FOLDER}/cells.json`, revision: "cccccccccccccccc" }], at)).toBe("none");
    expect(levelChange(FOLDER, [{ path: "content/levels/other/level.json", revision: "dddddddddddddddd" }], at)).toBe("none");
    expect(levelChange(FOLDER, [{ path: `${FOLDER}/main.worldbrief.json`, revision: "dddddddddddddddd" }], at)).toBe("none");
    expect(levelChange(FOLDER, [{ path: `${FOLDER}/cells/0_0.json`, revision: "eeeeeeeeeeeeeeee" }], at)).toBe("changed");
    expect(levelChange(FOLDER, [{ path: `${FOLDER}/cells/1_0.json`, revision: "eeeeeeeeeeeeeeee" }], at)).toBe("changed");
    expect(levelChange(FOLDER, [{ path: `${FOLDER}/cells/0_0.json`, revision: null }], at)).toBe("changed");
    expect(levelChange(FOLDER, [{ path: `${FOLDER}/cells/5_5.json`, revision: null }], at)).toBe("none");
    expect(levelChange(FOLDER, [{ path: `${FOLDER}/level.json`, revision: null }], at)).toBe("removed");
  });
});

function fakeEditor(options: { dirty: number; saving?: Promise<void> }) {
  const calls: string[] = [];
  let dirty = options.dirty;
  let revision = "aaaaaaaaaaaaaaaa";
  const editor = {
    level: { folder: FOLDER, fileRevision: (path: string) => (path === `${FOLDER}/level.json` ? revision : undefined) },
    dirty: () => dirty,
    idle: () => options.saving ?? Promise.resolve(),
    readDisk: async () => {
      calls.push("read");
      return {} as ReadLevel;
    },
    rebase: (_disk: ReadLevel, how: RebaseMode) => {
      calls.push(`rebase ${how.mode}`);
      return { ok: true, issues: [] };
    },
  };
  return {
    editor: editor as never,
    calls,
    setDirty: (value: number) => (dirty = value),
    setRevision: (value: string) => (revision = value),
  };
}

const change = (revision: string | null): ChangedFile[] => [
  { path: `${FOLDER}/cells.json`, revision: "cccccccccccccccc" },
  { path: `${FOLDER}/level.json`, revision },
];

describe("live refresh", () => {
  test("a clean level is read again by itself; others hear every batch after the level", async () => {
    const fake = fakeEditor({ dirty: 0 });
    const strip: string[] = [];
    const status: string[] = [];
    const others: number[] = [];
    const live = createLiveRefresh({ editor: fake.editor, strip: { show: (message) => strip.push(message) }, status: (message) => status.push(message), others: (files) => void others.push(files.length) });
    await live.handle(change("ffffffffffffffff"));
    expect(fake.calls).toEqual(["read", "rebase reload"]);
    expect(strip).toEqual([]);
    expect(status).toEqual(["Level updated from disk (level.json; undo history cleared)"]);
    expect(others).toEqual([2]);
    await live.handle(change("aaaaaaaaaaaaaaaa"));
    expect(fake.calls).toHaveLength(2);
    expect(others).toEqual([2, 2]);
  });

  test("a dirty level shows the strip and keeps the session", async () => {
    const fake = fakeEditor({ dirty: 3 });
    const strip: string[] = [];
    const live = createLiveRefresh({ editor: fake.editor, strip: { show: (message) => strip.push(message) }, status: () => undefined });
    await live.handle(change("ffffffffffffffff"));
    expect(fake.calls).toEqual([]);
    expect(strip).toEqual(["Changed on disk (level.json) while you have unsaved changes: compare or reload"]);
  });

  test("an edit made while the disk is read is not dropped: the strip instead", async () => {
    const fake = fakeEditor({ dirty: 0 });
    const strip: string[] = [];
    const editor = fake.editor as { readDisk: () => Promise<ReadLevel> };
    const read = editor.readDisk;
    editor.readDisk = async () => {
      const disk = await read();
      fake.setDirty(1);
      return disk;
    };
    const live = createLiveRefresh({ editor: fake.editor, strip: { show: (message) => strip.push(message) }, status: () => undefined });
    await live.handle(change("ffffffffffffffff"));
    expect(fake.calls).toEqual(["read"]);
    expect(strip).toHaveLength(1);
  });

  test("the editor's own save: the batch waits for it and then matches the session's revisions", async () => {
    let finish!: () => void;
    const saving = new Promise<void>((resolve) => (finish = resolve));
    const fake = fakeEditor({ dirty: 2, saving });
    const strip: string[] = [];
    const live = createLiveRefresh({ editor: fake.editor, strip: { show: (message) => strip.push(message) }, status: () => undefined });
    const handled = live.handle(change("ffffffffffffffff"));
    // The save answers: the session now holds what it wrote and is clean.
    fake.setRevision("ffffffffffffffff");
    fake.setDirty(0);
    finish();
    await handled;
    expect(fake.calls).toEqual([]);
    expect(strip).toEqual([]);
  });

  test("a removed level.json is reported, the session stays", async () => {
    const fake = fakeEditor({ dirty: 0 });
    const status: string[] = [];
    const live = createLiveRefresh({ editor: fake.editor, strip: { show: () => undefined }, status: (message) => status.push(message) });
    await live.handle(change(null));
    expect(fake.calls).toEqual([]);
    expect(status[0]).toMatch(/level\.json was removed on disk/);
  });
});
