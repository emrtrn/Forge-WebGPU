// The session against the level on disk (plan phase 4 step 8): the base it
// keeps, `compare`, and `rebase` (Reload / merge) after a 409.

import { describe, expect, test } from "vitest";
import type { ActorId } from "../id.ts";
import { splitLevel } from "../level/levelParts.ts";
import type { ActorDoc, LevelDoc } from "../level/model.ts";
import { normalizeLevel } from "../level/normalizeLevel.ts";
import { actorId, createOptions, levelId } from "../level/testKit.ts";
import { openLevelSession, type AppliedChange, type ApplyCause, type LevelSession, type OpenLevelOptions } from "./levelSession.ts";

const OPTIONS = createOptions(true);
const FOLDER = "content/levels/main";
const rev = (n: number): string => n.toString(16).padStart(16, "0");
const actor = (seed: string, x: number, extra: Record<string, unknown> = {}): unknown => ({ id: actorId(seed), name: seed, transform: { p: [x, 0, 10] }, components: {}, ...extra });

/** A level folder as read from disk: every cell, revisions from `start`. */
function disk(actors: unknown[], start: number, settings: Record<string, unknown> = { cellSize: 100 }): OpenLevelOptions {
  const level = normalizeLevel({ schema: "forge.level/1", id: levelId("1"), settings, actors }, OPTIONS).value as LevelDoc;
  const split = splitLevel(level, OPTIONS);
  const cells = split.cells.map((doc, index) => ({ doc, revision: rev(start + 1 + index) }));
  return {
    folder: FOLDER,
    persistent: split.persistent,
    persistentRevision: rev(start),
    index: { schema: "forge.levelCells/1", level: level.id, persistent: rev(start), cells: Object.fromEntries(cells.map((cell) => [cell.doc.cell, cell.revision])) },
    cells,
  };
}

const ORIGINAL = [actor("a", 10), actor("b", 20), actor("c", 150)];

function open(): { session: LevelSession; heard: [readonly AppliedChange[], ApplyCause][] } {
  const session = openLevelSession(disk(ORIGINAL, 1), OPTIONS);
  const heard: [readonly AppliedChange[], ApplyCause][] = [];
  session.onApplied((changes, cause) => heard.push([changes, cause]));
  return { session, heard };
}

const edited = (session: LevelSession, seed: string, change: (doc: ActorDoc) => void): ActorDoc => {
  const doc = structuredClone(session.actor(actorId(seed))!);
  change(doc);
  return doc;
};
const moveX = (session: LevelSession, seed: string, x: number) =>
  session.edit("Move", (tx) => tx.setActor(edited(session, seed, (doc) => (doc.transform.p = [x, 0, 10]))));
const seeds = (ids: readonly ActorId[]) => ids.map((id) => id.slice(4, 5)).sort();
const baseOf = (plan: ReturnType<LevelSession["planSave"]>, cell: string) =>
  plan.status === "ready" ? plan.request.writes.find((write) => write.path.endsWith(`${cell}.json`))?.base : undefined;

describe("the base", () => {
  test("is what was read, and what a save wrote once it is saved", () => {
    const { session } = open();
    const read = session.actor(actorId("a"));
    moveX(session, "a", 30);
    expect(session.baseActor(actorId("a"))).toBe(read);
    const plan = session.planSave();
    if (plan.status !== "ready") throw new Error(plan.status);
    session.applySaveResult(plan, { status: "saved", files: plan.request.writes.map((write) => ({ path: write.path, revision: rev(50) })), warnings: [] });
    expect(session.baseActor(actorId("a"))?.transform.p).toEqual([30, 0, 10]);
  });
});

describe("compare and rebase", () => {
  test("merge: the session's move stays unsaved, the disk's rename comes in clean, the files' revisions are the disk's; undo is cleared", () => {
    const { session, heard } = open();
    moveX(session, "a", 30);
    const theirs = disk([actor("a", 10), actor("b", 20, { name: "renamed" }), actor("c", 150)], 20);
    const { merge } = session.compare(theirs);
    expect(merge.conflicts).toEqual([]);
    expect(seeds(merge.fromMine)).toEqual(["a"]);
    expect(seeds(merge.fromTheirs)).toEqual(["b"]);

    expect(session.rebase(theirs, { mode: "merge" })).toEqual({ ok: true, issues: [] });
    expect(session.actor(actorId("a"))?.transform.p).toEqual([30, 0, 10]);
    expect(session.actor(actorId("b"))?.name).toBe("renamed");
    expect(seeds(session.dirtyActors())).toEqual(["a"]);
    expect(baseOf(session.planSave(), "0_0")).toBe(theirs.cells![0]!.revision);
    expect(session.history.undoStack).toEqual([]);
    expect(session.undo()).toBe(false);
    const [changes, cause] = heard.at(-1)!;
    expect(cause).toBe("reload");
    expect(seeds(changes.map((change) => change.id))).toEqual(["b"]);
  });

  test("a conflict picked theirs takes the disk's actor and it is clean; picked mine it stays unsaved", () => {
    const theirs = () => disk([actor("a", 99), actor("b", 20), actor("c", 150)], 20);
    const one = open().session;
    moveX(one, "a", 30);
    expect(one.compare(theirs()).merge.conflicts.map((conflict) => [conflict.label, conflict.fields.map((field) => field.path.join("."))])).toEqual([["a", ["transform.p"]]]);
    one.rebase(theirs(), { mode: "merge", pick: () => "theirs" });
    expect(one.actor(actorId("a"))?.transform.p).toEqual([99, 0, 10]);
    expect(one.dirtyActors()).toEqual([]);
    expect(one.planSave()).toEqual({ status: "clean" });

    const two = open().session;
    moveX(two, "a", 30);
    two.rebase(theirs(), { mode: "merge", pick: () => "mine" });
    expect(two.actor(actorId("a"))?.transform.p).toEqual([30, 0, 10]);
    expect(seeds(two.dirtyActors())).toEqual(["a"]);
  });

  test("reload drops the session's changes and takes the disk's level whole", () => {
    const { session, heard } = open();
    moveX(session, "a", 30);
    session.edit("Add", (tx) => tx.setActor(actor("d", 40)));
    const theirs = disk([actor("a", 10), actor("b", 25)], 20);
    expect(session.rebase(theirs, { mode: "reload" }).ok).toBe(true);
    expect(session.level.actors.map((one) => [one.name, one.transform.p[0]])).toEqual([
      ["a", 10],
      ["b", 25],
    ]);
    expect(session.dirtyActors()).toEqual([]);
    expect(session.isLoaded("1_0")).toBe(true); // no file for it on disk any more
    expect(seeds(heard.at(-1)![0].map((change) => change.id))).toEqual(["a", "b", "c", "d"]);
  });

  test("a removal on the disk of an actor the session left alone goes; a removal by the session stays a removal", () => {
    const { session } = open();
    session.edit("Delete", (tx) => tx.removeActor(actorId("c")));
    const theirs = disk([actor("a", 10)], 20);
    session.rebase(theirs, { mode: "merge" });
    expect(session.level.actors.map((one) => one.name)).toEqual(["a"]);
    expect(session.dirtyActors()).toEqual([]);

    const other = open().session;
    other.edit("Delete", (tx) => tx.removeActor(actorId("c")));
    other.rebase(disk([actor("a", 10), actor("b", 20), actor("c", 150)], 20), { mode: "merge" });
    expect(other.actor(actorId("c"))).toBeUndefined();
    expect(seeds(other.dirtyActors())).toEqual(["c"]);
    const plan = other.planSave();
    expect(plan.status === "ready" ? plan.request.deletes.map((entry) => [entry.path, entry.base]) : null).toEqual([[`${FOLDER}/cells/1_0.json`, rev(22)]]);
  });

  test("a merge that leaves a child without its parent is refused and changes nothing", () => {
    const { session, heard } = open();
    session.edit("Child", (tx) => tx.setActor(actor("d", 0, { parent: actorId("b") })));
    const count = heard.length;
    const theirs = disk([actor("a", 10), actor("c", 150)], 20);
    const result = session.rebase(theirs, { mode: "merge" });
    expect(result.ok).toBe(false);
    expect(result.issues.map((found) => found.code)).toEqual(["invalid-parent"]);
    expect(session.actor(actorId("b"))).toBeDefined();
    expect(session.history.undoStack).toHaveLength(1);
    expect(heard).toHaveLength(count);
  });

  test("settings changed on the disk come along with Reload and with a merge", () => {
    const { session } = open();
    session.rebase(disk(ORIGINAL, 20, { cellSize: 200 }), { mode: "merge" });
    expect(session.level.settings.cellSize).toBe(200);
  });
});

describe("file revisions", () => {
  test("are the ones read, then the ones a save or a rebase brought; files the session does not hold have none", () => {
    const { session } = open();
    expect(session.fileRevision(`${FOLDER}/level.json`)).toBe(rev(1));
    expect(session.fileRevision(`${FOLDER}/cells/0_0.json`)).toBe(rev(2));
    expect(session.fileRevision(`${FOLDER}/cells/1_0.json`)).toBe(rev(3));
    expect(session.fileRevision(`${FOLDER}/cells/9_9.json`)).toBeUndefined();
    expect(session.fileRevision(`${FOLDER}/cells.json`)).toBeUndefined();
    expect(session.fileRevision("content/levels/other/level.json")).toBeUndefined();
    moveX(session, "a", 30);
    const plan = session.planSave();
    if (plan.status !== "ready") throw new Error(plan.status);
    session.applySaveResult(plan, { status: "saved", files: plan.request.writes.map((write) => ({ path: write.path, revision: rev(50) })), warnings: [] });
    expect(session.fileRevision(`${FOLDER}/cells/0_0.json`)).toBe(rev(50));
    expect(session.rebase(disk(ORIGINAL, 70), { mode: "reload" }).ok).toBe(true);
    expect(session.fileRevision(`${FOLDER}/level.json`)).toBe(rev(70));
  });
});
