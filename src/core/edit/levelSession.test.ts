import { describe, expect, test } from "vitest";
import type { ActorId } from "../id.ts";
import { splitLevel } from "../level/levelParts.ts";
import type { ActorDoc, LevelDoc } from "../level/model.ts";
import { normalizeLevel } from "../level/normalizeLevel.ts";
import { actorId, createOptions, levelId, summary } from "../level/testKit.ts";
import { createHistory, mergeChanges } from "./history.ts";
import { openLevelSession, type LevelSession, type SavePlan } from "./levelSession.ts";
import type { SaveResponseBody } from "./saveProtocol.ts";

const OPTIONS = createOptions(true);
const FOLDER = "content/levels/main";
const rev = (n: number): string => n.toString(16).padStart(16, "0");

function actor(seed: string, x: number, z: number, extra: Record<string, unknown> = {}): unknown {
  return { id: actorId(seed), name: seed, transform: { p: [x, 0, z] }, components: {}, ...extra };
}

/** a, b in 0_0; c in 1_0; d in 2_0 (on disk, not loaded); p persistent. */
function open(loadAll = false): LevelSession {
  const level = normalizeLevel(
    {
      schema: "forge.level/1",
      id: levelId("1"),
      settings: { cellSize: 100 },
      actors: [actor("a", 10, 10), actor("b", 20, 20), actor("c", 150, 10), actor("d", 250, 10), actor("e", 5, 5, { spatiallyLoaded: false })],
    },
    OPTIONS,
  ).value as LevelDoc;
  const split = splitLevel(level, OPTIONS);
  const cells = split.cells.filter((cell) => loadAll || cell.cell !== "2_0");
  return openLevelSession(
    {
      folder: FOLDER,
      persistent: split.persistent,
      persistentRevision: rev(1),
      index: { schema: "forge.levelCells/1", level: level.id, persistent: rev(1), cells: { "0_0": rev(2), "1_0": rev(3), "2_0": rev(4) } },
      cells: cells.map((doc) => ({ doc, revision: rev({ "0_0": 2, "1_0": 3, "2_0": 4 }[doc.cell]!) })),
    },
    OPTIONS,
  );
}

const moved = (session: LevelSession, seed: string, x: number, z: number): ActorDoc => {
  const current = structuredClone(session.actor(actorId(seed))!);
  current.transform.p = [x, 0, z];
  return current;
};
const move = (session: LevelSession, seed: string, x: number, z: number, coalesce?: string) =>
  session.edit(`Move ${seed}`, (tx) => tx.setActor(moved(session, seed, x, z)), coalesce === undefined ? {} : { coalesce });
const ready = (plan: SavePlan) => {
  if (plan.status !== "ready") throw new Error(`expected ready, got ${plan.status}`);
  return plan;
};
const names = (ids: readonly ActorId[]) => ids.map((id) => id.slice(4, 5)).sort();
const savedResponse = (plan: ReturnType<typeof ready>, start = 10): SaveResponseBody => ({
  status: "saved",
  files: [
    ...plan.request.writes.map((write, index) => ({ path: write.path, revision: rev(start + index) })),
    ...plan.request.deletes.map((entry) => ({ path: entry.path, revision: null })),
    { path: `${FOLDER}/cells.json`, revision: rev(99) },
  ],
  warnings: [],
});

describe("opening and editing", () => {
  test("a freshly opened level is clean", () => {
    const session = open();
    expect(session.planSave()).toEqual({ status: "clean" });
    expect(session.level.actors.map((entry) => entry.name)).toEqual(["e", "a", "b", "c"]);
    expect(session.isLoaded("0_0")).toBe(true);
    expect(session.isLoaded("2_0")).toBe(false);
    expect(session.isLoaded("7_7")).toBe(true); // no file: nothing to load
  });

  test("moving an actor inside its cell writes that cell against its revision", () => {
    const session = open();
    expect(move(session, "a", 30, 30).ok).toBe(true);
    expect(names(session.dirtyActors())).toEqual(["a"]);
    const plan = ready(session.planSave());
    expect(plan.request.writes.map((write) => [write.path, write.base])).toEqual([[`${FOLDER}/cells/0_0.json`, rev(2)]]);
    expect(JSON.parse(plan.request.writes[0]!.text!).actors.map((entry: ActorDoc) => entry.name)).toEqual(["a", "b"]);
  });

  test("moving across a cell edge writes both cells; into a cell with no file, base null", () => {
    const session = open();
    move(session, "a", 150, 50);
    expect(ready(session.planSave()).request.writes.map((write) => write.path)).toEqual([`${FOLDER}/cells/0_0.json`, `${FOLDER}/cells/1_0.json`]);
    move(session, "c", 550, 550);
    const plan = ready(session.planSave());
    expect(plan.request.writes.map((write) => [write.path, write.base])).toEqual([
      [`${FOLDER}/cells/0_0.json`, rev(2)],
      [`${FOLDER}/cells/1_0.json`, rev(3)],
      [`${FOLDER}/cells/5_5.json`, null],
    ]);
  });

  test("a cell that would be rewritten but is not loaded stops the plan until it is", () => {
    const session = open();
    move(session, "a", 250, 50);
    expect(session.planSave()).toEqual({ status: "needs-load", cells: ["2_0"] });
    const all = open(true);
    const cell = splitLevel({ ...all.level, actors: all.level.actors.filter((entry) => entry.name === "d") }, OPTIONS).cells[0]!;
    expect(session.loadCells([{ doc: cell, revision: rev(4) }])).toEqual([]);
    const plan = ready(session.planSave());
    const twoZero = plan.request.writes.find((write) => write.path.endsWith("2_0.json"))!;
    expect(twoZero.base).toBe(rev(4));
    // Level order: d joined the level when its cell was loaded, after a.
    expect(JSON.parse(twoZero.text!).actors.map((entry: ActorDoc) => entry.name)).toEqual(["a", "d"]);
  });

  test("a cell left empty is deleted against its revision", () => {
    const session = open();
    move(session, "c", 10, 90);
    const plan = ready(session.planSave());
    expect(plan.request.deletes).toEqual([{ path: `${FOLDER}/cells/1_0.json`, base: rev(3) }]);
  });

  test("removing a parent refuses to leave its child behind; removing or reparenting the child in the same edit is fine", () => {
    const session = open();
    session.edit("Parent", (tx) => tx.setActor({ ...structuredClone(session.actor(actorId("b"))!), parent: actorId("a") }));
    const refused = session.edit("Remove a", (tx) => tx.removeActor(actorId("a")));
    expect(refused.ok).toBe(false);
    expect(summary(refused.issues)).toEqual([`error invalid-parent ${actorId("b")}.parent`]);
    expect(session.actor(actorId("a"))).toBeDefined();
    expect(session.edit("Remove both", (tx) => {
      tx.removeActor(actorId("a"));
      tx.removeActor(actorId("b"));
    }).ok).toBe(true);
    session.undo();
    expect(session.edit("Unparent and remove", (tx) => {
      tx.setActor({ ...structuredClone(session.actor(actorId("b"))!), parent: null });
      tx.removeActor(actorId("a"));
    }).ok).toBe(true);
  });

  test("an invalid edit is refused whole and changes nothing", () => {
    const session = open();
    const result = session.edit("Bad", (tx) => {
      tx.setActor(moved(session, "a", 30, 30));
      tx.setActor({ ...moved(session, "b", 30, 30), layer: "sky" });
    });
    expect(result.ok).toBe(false);
    expect(summary(result.issues)).toEqual([`error unknown-field ${actorId("b")}.layer`]);
    expect(session.dirtyActors()).toEqual([]);
    expect(session.actor(actorId("a"))?.transform.p).toEqual([10, 0, 10]);
    const orphan = session.edit("Orphan", (tx) => tx.setActor(actor("f", 1, 1, { parent: actorId("9") })));
    expect(summary(orphan.issues)).toEqual([`error invalid-parent ${actorId("f")}.parent`]);
  });
});

describe("saving", () => {
  test("a saved answer marks the sent versions clean and moves the bases on", () => {
    const session = open();
    move(session, "a", 150, 50);
    const plan = ready(session.planSave());
    session.applySaveResult(plan, savedResponse(plan));
    expect(session.dirtyActors()).toEqual([]);
    move(session, "a", 160, 50);
    // a is in 1_0 on disk now, at the revision the server gave.
    expect(ready(session.planSave()).request.writes.map((write) => [write.path, write.base])).toEqual([[`${FOLDER}/cells/1_0.json`, rev(11)]]);
  });

  test("an edit made while the save was on its way stays dirty (F01)", () => {
    const session = open();
    move(session, "a", 30, 30);
    const plan = ready(session.planSave());
    move(session, "a", 40, 40);
    move(session, "b", 40, 40);
    session.applySaveResult(plan, savedResponse(plan));
    expect(names(session.dirtyActors())).toEqual(["a", "b"]);
    expect(ready(session.planSave()).request.writes[0]?.base).toBe(rev(10));
  });

  test("a conflict or a refusal changes nothing", () => {
    const session = open();
    move(session, "a", 30, 30);
    const plan = ready(session.planSave());
    session.applySaveResult(plan, { status: "conflict", conflicts: [{ path: `${FOLDER}/cells/0_0.json`, base: rev(2), current: rev(7) }] });
    session.applySaveResult(plan, { status: "rejected", reason: "document", issues: [] });
    expect(names(session.dirtyActors())).toEqual(["a"]);
    expect(ready(session.planSave()).request.writes[0]?.base).toBe(rev(2));
  });

  test("a deleted cell leaves the session's files; the next write there starts from null", () => {
    const session = open();
    move(session, "c", 10, 90);
    const plan = ready(session.planSave());
    session.applySaveResult(plan, savedResponse(plan));
    move(session, "a", 150, 10);
    expect(ready(session.planSave()).request.writes.find((write) => write.path.endsWith("1_0.json"))?.base).toBeNull();
  });
});

describe("undo and redo", () => {
  test("undo restores, redo reapplies; an added actor goes and comes back; a removed one returns to its place", () => {
    const session = open();
    move(session, "a", 30, 30);
    session.edit("Add", (tx) => tx.setActor(actor("f", 40, 40)));
    session.edit("Remove", (tx) => tx.removeActor(actorId("b")));
    expect(session.level.actors.map((entry) => entry.name)).toEqual(["e", "a", "c", "f"]);
    session.undo();
    expect(session.level.actors.map((entry) => entry.name)).toEqual(["e", "a", "b", "c", "f"]);
    session.undo();
    session.undo();
    expect(session.actor(actorId("a"))?.transform.p).toEqual([10, 0, 10]);
    expect(session.actor(actorId("f"))).toBeUndefined();
    expect(session.undo()).toBe(false);
    session.redo();
    session.redo();
    expect(session.actor(actorId("f"))?.transform.p).toEqual([40, 0, 40]);
    expect(session.history.redoStack).toHaveLength(1);
    move(session, "c", 160, 20);
    expect(session.history.redoStack).toHaveLength(0);
  });

  test("listeners hear each applied change in the direction applied (the editor mirrors them into its world)", () => {
    const session = open();
    const heard: string[] = [];
    const describe = (doc: ActorDoc | null) => (doc === null ? "-" : `${doc.name}@${doc.transform.p[0]}`);
    // The history is already up to date when listeners run (an editor enables Undo from it).
    const stacks: string[] = [];
    const stop = session.onApplied((changes, cause) => {
      heard.push(`${cause} ${changes.map((change) => `${describe(change.before)}>${describe(change.after)}`).join(" ")}`);
      stacks.push(`${session.history.undoStack.length}/${session.history.redoStack.length}`);
    });
    move(session, "a", 30, 30);
    session.edit("Add and remove", (tx) => {
      tx.setActor(actor("f", 40, 40));
      tx.removeActor(actorId("b"));
    });
    session.undo();
    session.redo();
    session.edit("Refused", (tx) => tx.setActor({ id: actorId("g"), layer: 1 }));
    stop();
    session.undo();
    expect(heard).toEqual([
      "edit a@10>a@30",
      "edit ->f@40 b@20>-",
      "undo ->b@20 f@40>-",
      "redo ->f@40 b@20>-",
    ]);
    expect(stacks).toEqual(["1/0", "2/0", "1/1", "2/0"]);
  });

  test("undoing back to the saved state still saves (the file must match memory)", () => {
    const session = open();
    move(session, "a", 30, 30);
    const plan = ready(session.planSave());
    session.applySaveResult(plan, savedResponse(plan));
    session.undo();
    expect(names(session.dirtyActors())).toEqual(["a"]);
    expect(JSON.parse(ready(session.planSave()).request.writes[0]!.text!).actors[0].transform.p).toEqual([10, 0, 10]);
  });

  test("a drag coalesces into one undo step; another key or a pause starts a new one", () => {
    const session = open();
    move(session, "a", 11, 10, "drag:a");
    move(session, "a", 12, 10, "drag:a");
    move(session, "a", 13, 10, "drag:a");
    expect(session.history.undoStack).toHaveLength(1);
    move(session, "b", 21, 20, "drag:b");
    expect(session.history.undoStack).toHaveLength(2);
    session.history.seal();
    move(session, "b", 22, 20, "drag:b");
    expect(session.history.undoStack).toHaveLength(3);
    session.undo();
    session.undo();
    session.undo();
    expect(session.actor(actorId("a"))?.transform.p).toEqual([10, 0, 10]);
    expect(session.actor(actorId("b"))?.transform.p).toEqual([20, 0, 20]);
  });

  test("the history keeps at most its limit", () => {
    const history = createHistory(3);
    for (let i = 0; i < 5; i += 1) history.push({ label: `t${i}`, coalesce: null, changes: [] });
    expect(history.undoStack.map((entry) => entry.label)).toEqual(["t2", "t3", "t4"]);
  });

  test("merging keeps the first before and the last after per actor", () => {
    const a = actorId("a");
    const one = { id: a, before: null, beforeIndex: 0, after: { name: "1" } as unknown as ActorDoc };
    const two = { id: a, before: one.after, beforeIndex: 0, after: { name: "2" } as unknown as ActorDoc };
    expect(mergeChanges([one], [two])).toEqual([{ id: a, before: null, beforeIndex: 0, after: two.after }]);
  });
});

describe("loading and unloading cells", () => {
  test("a dirty cell cannot be unloaded; a saved one can, and its actors leave memory", () => {
    const session = open();
    move(session, "c", 160, 20);
    expect(session.unloadCell("1_0")).toEqual({ ok: false, reason: "Cell 1_0 has unsaved changes." });
    const plan = ready(session.planSave());
    session.applySaveResult(plan, savedResponse(plan));
    expect(session.unloadCell("1_0")).toEqual({ ok: true });
    expect(session.actor(actorId("c"))).toBeUndefined();
    expect(session.isLoaded("1_0")).toBe(false);
  });

  test("a cell whose actor is already loaded reports it and keeps the loaded one", () => {
    const session = open();
    const copy = { schema: "forge.levelCell/1" as const, level: session.level.id, cell: "2_0", actors: [{ ...session.actor(actorId("a"))!, transform: { p: [250, 0, 0] as [number, number, number], r: [0, 0, 0, 1] as [number, number, number, number], s: [1, 1, 1] as [number, number, number] } }] };
    const issues = session.loadCells([{ doc: copy, revision: rev(4) }]);
    expect(issues.map((found) => found.code)).toEqual(["duplicate-id"]);
    expect(session.actor(actorId("a"))?.transform.p).toEqual([10, 0, 10]);
  });
});
