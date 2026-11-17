import { describe, expect, test } from "vitest";
import { splitLevel } from "../level/levelParts.ts";
import type { ActorDoc, LevelCellDoc, LevelDoc } from "../level/model.ts";
import { normalizeLevel } from "../level/normalizeLevel.ts";
import { actorId, createOptions, levelId } from "../level/testKit.ts";
import { openLevelSession, type AppliedChange, type ApplyCause, type LevelSession, type LoadedCell, type SavePlan } from "./levelSession.ts";
import type { SaveResponseBody } from "./saveProtocol.ts";

const OPTIONS = createOptions(true);
const FOLDER = "content/levels/main";
const rev = (n: number): string => n.toString(16).padStart(16, "0");
const actor = (seed: string, x: number, extra: Record<string, unknown> = {}): unknown => ({
  id: actorId(seed), name: seed, transform: { p: [x, 0, 10] }, components: {}, ...extra,
});

/** The same grid as levelSession.test.ts: a/b in 0_0, c in 1_0, d in 2_0, e persistent. */
function fixture(loadAll = false, actors?: unknown[]) {
  const level = normalizeLevel({
    schema: "forge.level/1", id: levelId("1"), settings: { cellSize: 100 },
    actors: actors ?? [actor("a", 10), actor("b", 20), actor("c", 150), actor("d", 250), actor("e", 5, { spatiallyLoaded: false })],
  }, OPTIONS).value as LevelDoc;
  const split = splitLevel(level, OPTIONS);
  const cells: LoadedCell[] = split.cells.map((doc, index) => ({ doc, revision: rev(index + 2) }));
  const index = {
    schema: "forge.levelCells/1" as const, level: level.id, persistent: rev(1),
    cells: Object.fromEntries(cells.map((cell) => [cell.doc.cell, cell.revision])),
  };
  const session = openLevelSession({
    folder: FOLDER, persistent: split.persistent, persistentRevision: rev(1), index,
    cells: cells.filter((cell) => loadAll || cell.doc.cell !== "2_0"),
  }, OPTIONS);
  return { session, cells, index };
}

const moved = (session: LevelSession, seed: string, x: number): ActorDoc => {
  const doc = structuredClone(session.actor(actorId(seed))!);
  doc.transform.p[0] = x;
  return doc;
};
const move = (session: LevelSession, seed: string, x: number, coalesce?: string) =>
  session.edit(`Move ${seed}`, (tx) => tx.setActor(moved(session, seed, x)), coalesce === undefined ? {} : { coalesce });
const ready = (plan: SavePlan) => {
  if (plan.status !== "ready") throw new Error(`expected ready, got ${plan.status}`);
  return plan;
};
const response = (plan: ReturnType<typeof ready>): Extract<SaveResponseBody, { status: "saved" }> => ({
  status: "saved", warnings: [],
  files: [
    ...plan.request.writes.map((write, index) => ({ path: write.path, revision: rev(index + 10) })),
    ...plan.request.deletes.map((entry) => ({ path: entry.path, revision: null })),
  ],
});
/** What the server just saved, suitable for streaming the cell back in. */
function save(session: LevelSession): LoadedCell[] {
  const plan = ready(session.planSave());
  const saved = response(plan);
  session.applySaveResult(plan, saved);
  return plan.request.writes.flatMap((write) => write.path.includes("/cells/") ? [{
    doc: JSON.parse(write.text!) as LevelCellDoc,
    revision: saved.files.find((file) => file.path === write.path)!.revision!,
  }] : []);
}
const stacks = (session: LevelSession) => ({ undo: [...session.history.undoStack], redo: [...session.history.redoStack] });
const snapshot = (session: LevelSession) => ({
  level: structuredClone(session.level), dirty: session.dirtyActors(), cells: session.dirtyCells(),
  settingsDirty: session.settingsDirty(), history: stacks(session), plan: session.planSave(),
});

describe("editor cell streaming", () => {
  test("new unsaved occupied cells appear on the map and cannot unload", () => {
    const { session } = fixture();
    expect(session.edit("new cell", (tx) => tx.setActor(actor("f", 550))).ok).toBe(true);
    expect(session.cellKeys()).toContain("5_0");
    expect(session.dirtyCells()).toContain("5_0");
    expect(session.unloadCell("5_0").ok).toBe(false);
    expect(session.actor(actorId("f"))).toBeDefined();
  });
  test("cell keys combine the index and loaded cells; index refresh preserves dirty data and revisions", () => {
    const { session, index } = fixture();
    expect(session.cellKeys()).toEqual(["0_0", "1_0", "2_0"]);
    expect(session.dirtyCells()).toEqual([]);
    expect(move(session, "a", 160).ok).toBe(true);
    const before = snapshot(session);
    const original = session.actor(actorId("a"));
    session.updateCellIndex({ ...index, cells: { "0_0": rev(90), "3_0": rev(91) } });
    expect(new Set(session.cellKeys())).toEqual(new Set(["0_0", "1_0", "3_0"]));
    expect(session.unloadedCells()).toEqual(["3_0"]);
    expect(session.actor(actorId("a"))).toBe(original);
    expect(session.fileRevision(`${FOLDER}/cells/0_0.json`)).toBe(rev(2));
    expect(snapshot(session)).toEqual(before);
    expect(() => session.updateCellIndex({ ...index, level: levelId("2") })).toThrow("belongs to level");
    expect(session.unloadedCells()).toEqual(["3_0"]);
    session.updateCellIndex(null);
    expect(new Set(session.cellKeys())).toEqual(new Set(["0_0", "1_0"]));
    expect(session.unloadedCells()).toEqual([]);
    expect(session.dirtyCells()).toEqual(["0_0", "1_0"]);
  });

  test("stream additions and removals announce complete actor changes after updating state without dirtying or history", () => {
    const { session, cells } = fixture();
    const heard: { changes: readonly AppliedChange[]; cause: ApplyCause }[] = [];
    const states: boolean[] = [];
    session.onApplied((changes, cause) => {
      heard.push({ changes, cause });
      states.push(session.isLoaded("2_0"));
      expect(session.dirtyActors()).toEqual([]);
      expect(session.history.undoStack).toHaveLength(0);
      expect(session.history.redoStack).toHaveLength(0);
    });
    const two = cells.find((cell) => cell.doc.cell === "2_0")!;
    expect(session.loadCells([two])).toEqual([]);
    const d = session.actor(actorId("d"))!;
    expect(session.baseActor(d.id)).toBe(d);
    expect(session.fileRevision(`${FOLDER}/cells/2_0.json`)).toBe(two.revision);
    expect(session.loadCells([two])).toEqual([]); // already held: no second notification
    expect(session.unloadCell("2_0")).toEqual({ ok: true });
    expect(session.unloadCell("2_0")).toEqual({ ok: true });
    expect(heard).toEqual([
      { cause: "stream", changes: [{ id: d.id, before: null, after: d }] },
      { cause: "stream", changes: [{ id: d.id, before: d, after: null }] },
    ]);
    expect(states).toEqual([true, false]);
    expect(session.actor(d.id)).toBeUndefined();
    expect(session.baseActor(d.id)).toBeUndefined();
    expect(session.fileRevision(`${FOLDER}/cells/2_0.json`)).toBeUndefined();
    expect(session.planSave()).toEqual({ status: "clean" });
    expect(session.settingsDirty()).toBe(false);
  });

  test("dirty source and destination cells are retained, including removals; persistent changes have no dirty cell", () => {
    const { session } = fixture();
    expect(move(session, "a", 160).ok).toBe(true);
    expect(session.dirtyCells()).toEqual(["0_0", "1_0"]);
    const before = snapshot(session);
    for (const cell of ["0_0", "1_0"]) expect(session.unloadCell(cell)).toEqual({ ok: false, reason: `Cell ${cell} has unsaved changes.` });
    expect(snapshot(session)).toEqual(before);
    save(session);
    expect(session.dirtyCells()).toEqual([]);
    session.edit("Remove saved a", (tx) => tx.removeActor(actorId("a")));
    expect(session.dirtyCells()).toEqual(["1_0"]);
    expect(session.unloadCell("1_0").ok).toBe(false);
    const persistent = fixture().session;
    expect(move(persistent, "e", 160).ok).toBe(true);
    persistent.edit("Settings", (tx) => tx.setSettings({ loadRange: 600 }));
    expect(persistent.dirtyCells()).toEqual([]);
  });

  test("streaming preserves existing unsaved versions and both history stacks", () => {
    const { session, cells } = fixture();
    expect(move(session, "a", 30).ok).toBe(true);
    expect(move(session, "a", 40).ok).toBe(true);
    expect(session.undo()).toBe(true);
    const before = { history: stacks(session), dirty: session.dirtyActors(), plan: session.planSave() };
    expect(session.loadCells([cells.find((cell) => cell.doc.cell === "2_0")!])).toEqual([]);
    expect(session.unloadCell("1_0")).toEqual({ ok: true });
    expect({ history: stacks(session), dirty: session.dirtyActors(), plan: session.planSave() }).toEqual(before);
    expect(session.redo()).toBe(true);
    expect(session.actor(actorId("a"))?.transform.p[0]).toBe(40);
  });

  test("an unloaded destination rejects the entire actor batch and settings patch without consuming versions", () => {
    const { session, cells } = fixture();
    const before = snapshot(session);
    const heard: ApplyCause[] = [];
    session.onApplied((_, cause) => heard.push(cause));
    const result = session.edit("Batch", (tx) => {
      tx.setActor(moved(session, "a", 260));
      tx.setActor(moved(session, "b", 30));
      tx.setSettings({ loadRange: 600 });
    });
    expect(result).toEqual({ ok: false, issues: [{
      code: "invalid-value", severity: "error", path: "cells.2_0", message: "Load cell 2_0 before editing",
    }] });
    expect(snapshot(session)).toEqual(before);
    expect(heard).toEqual([]);
    expect(session.loadCells([cells.find((cell) => cell.doc.cell === "2_0")!])).toEqual([]);
    expect(move(session, "a", 260).ok).toBe(true);
    expect([...ready(session.planSave()).versions.values()]).toEqual([1]);
  });

  test("full proposed assignment guards descendants released from a persistent root", () => {
    const { session, cells } = fixture(false, [
      actor("a", 10, { spatiallyLoaded: false }),
      actor("b", 250, { parent: actorId("a") }),
      actor("d", 260),
    ]);
    const before = snapshot(session);
    // a stays persistent; b becomes a root in an unloaded cell.
    const result = session.edit("Release child", (tx) => {
      tx.setActor({ ...session.actor(actorId("b"))!, parent: null });
      tx.setSettings({ loadRange: 600 });
    });
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.path)).toEqual(["cells.2_0"]);
    expect(snapshot(session)).toEqual(before);
    session.loadCells(cells);
    expect(session.edit("Release child", (tx) => tx.setActor({ ...session.actor(actorId("b"))!, parent: null })).ok).toBe(true);
    expect(session.dirtyCells()).toEqual(["2_0"]);
  });

  test("a root move takes every descendant into the proposed cell and retains their source", () => {
    const { session, cells } = fixture(false, [
      actor("a", 10), actor("b", 20, { parent: actorId("a") }),
      actor("c", 30, { parent: actorId("b") }), actor("d", 250),
    ]);
    const before = snapshot(session);
    expect(move(session, "a", 260).ok).toBe(false);
    expect(snapshot(session)).toEqual(before);
    session.loadCells(cells);
    expect(move(session, "a", 260).ok).toBe(true);
    expect(session.dirtyCells()).toEqual(["0_0", "2_0"]);
    expect(session.unloadCell("0_0").ok).toBe(false);
    expect(session.unloadCell("2_0").ok).toBe(false);
    const destination = ready(session.planSave()).request.writes.find((write) => write.path.endsWith("2_0.json"))!;
    expect(JSON.parse(destination.text!).actors.map((doc: ActorDoc) => doc.name)).toEqual(["a", "b", "c", "d"]);
  });

  test("save still returns needs-load when a newly indexed disk cell overlaps a dirty destination", () => {
    const { session, index } = fixture();
    expect(move(session, "a", 350).ok).toBe(true); // new cell, no file yet
    session.updateCellIndex({ ...index, cells: { ...index.cells, "3_0": rev(50) } });
    expect(session.planSave()).toEqual({ status: "needs-load", cells: ["3_0"] });
  });
});

describe("streaming with undo and redo", () => {
  test("undo needs the original source after saving elsewhere, leaves the stack unchanged, then works after reload", () => {
    const { session } = fixture();
    session.edit("Move and settings", (tx) => {
      tx.setActor(moved(session, "a", 160));
      tx.setSettings({ loadRange: 600 });
    });
    const saved = save(session);
    expect(session.unloadCell("0_0")).toEqual({ ok: true }); // history does not pin it
    const before = snapshot(session);
    expect(session.undo()).toBe(false);
    expect(session.undo()).toBe(false);
    expect(snapshot(session)).toEqual(before);
    expect(session.loadCells(saved.filter((cell) => cell.doc.cell === "0_0"))).toEqual([]);
    expect(session.undo()).toBe(true);
    expect(session.actor(actorId("a"))?.transform.p[0]).toBe(10);
    expect(session.level.settings.loadRange).toBe(384);
    expect(session.history.redoStack).toHaveLength(1);
  });

  test("undo cannot recreate a saved actor streamed out of its current cell", () => {
    const { session } = fixture();
    expect(move(session, "a", 160).ok).toBe(true);
    const saved = save(session);
    expect(session.unloadCell("1_0")).toEqual({ ok: true });
    expect(session.baseActor(actorId("a"))).toBeUndefined();
    const before = snapshot(session);
    expect(session.undo()).toBe(false);
    expect(snapshot(session)).toEqual(before);
    expect(session.actor(actorId("a"))).toBeUndefined();
    expect(session.loadCells(saved.filter((cell) => cell.doc.cell === "1_0"))).toEqual([]);
    expect(session.undo()).toBe(true);
    expect(session.baseActor(actorId("a"))?.transform.p[0]).toBe(160);
    expect(session.actor(actorId("a"))?.transform.p[0]).toBe(10);
  });

  test("editing an actor streamed out since save requires its source even when a removal looks absent from memory", () => {
    const { session } = fixture();
    expect(move(session, "a", 160).ok).toBe(true);
    const doc = session.actor(actorId("a"))!;
    const saved = save(session);
    expect(session.unloadCell("1_0")).toEqual({ ok: true });
    const before = snapshot(session);
    for (const remove of [false, true]) {
      const result = session.edit("Edit streamed actor", (tx) => {
        if (remove) tx.removeActor(doc.id);
        else tx.setActor({ ...doc, name: "Changed" });
        tx.setSettings({ loadRange: 600 });
      });
      expect(result).toEqual({ ok: false, issues: [{
        code: "invalid-value", severity: "error", path: "cells.1_0", message: "Load cell 1_0 before editing",
      }] });
      expect(snapshot(session)).toEqual(before);
    }
    expect(session.loadCells(saved.filter((cell) => cell.doc.cell === "1_0"))).toEqual([]);
    expect(session.edit("Remove loaded actor", (tx) => tx.removeActor(doc.id)).ok).toBe(true);
  });

  test("redo checks both its destination and the saved actor unloaded since undo without moving its stack", () => {
    const { session } = fixture();
    expect(move(session, "a", 160).ok).toBe(true);
    save(session);
    expect(session.undo()).toBe(true);
    const undone = save(session);
    for (const cell of ["0_0", "1_0"]) expect(session.unloadCell(cell)).toEqual({ ok: true });
    const before = snapshot(session);
    expect(session.redo()).toBe(false);
    expect(snapshot(session)).toEqual(before);
    // Reload just the destination: the current saved source is still unknown.
    expect(session.loadCells(undone.filter((cell) => cell.doc.cell === "1_0"))).toEqual([]);
    const partial = snapshot(session);
    expect(session.redo()).toBe(false);
    expect(snapshot(session)).toEqual(partial);
    expect(session.loadCells(undone.filter((cell) => cell.doc.cell === "0_0"))).toEqual([]);
    expect(session.redo()).toBe(true);
    expect(session.actor(actorId("a"))?.transform.p[0]).toBe(160);
    expect(session.history.redoStack).toHaveLength(0);
  });

  test("coalesced history still remembers the source of a saved removal", () => {
    const { session } = fixture();
    expect(move(session, "a", 20, "drag:a").ok).toBe(true);
    session.edit("Remove a", (tx) => tx.removeActor(actorId("a")), { coalesce: "drag:a" });
    const saved = save(session);
    expect(session.history.undoStack).toHaveLength(1);
    expect(session.unloadCell("0_0")).toEqual({ ok: true });
    const before = snapshot(session);
    expect(session.undo()).toBe(false);
    expect(snapshot(session)).toEqual(before);
    expect(session.loadCells(saved)).toEqual([]);
    expect(session.undo()).toBe(true);
    expect(session.actor(actorId("a"))?.transform.p[0]).toBe(10);
  });
});

describe("strict streamed cell batches", () => {
  test("malformed cells, malformed actors and duplicates across fresh/existing cells reject the whole batch with every issue", () => {
    const { session, cells } = fixture();
    const two = cells.find((cell) => cell.doc.cell === "2_0")!;
    const d = two.doc.actors[0]!;
    const batch: LoadedCell[] = [
      two, // valid, but must not be added if any other cell fails
      { doc: { ...two.doc, cell: "3_0", actors: [{ ...d, transform: { ...d.transform, p: [350, 0, 10] } }] }, revision: rev(5) },
      { doc: { ...two.doc, cell: "4_0", actors: [{ ...session.actor(actorId("a"))!, transform: { ...d.transform, p: [450, 0, 10] } }] }, revision: rev(6) },
      { doc: { ...two.doc, cell: "5_0", actors: [{ ...d, id: actorId("f"), layer: "bad" }] } as unknown as LevelCellDoc, revision: rev(7) },
      { doc: { ...two.doc, cell: "6_0", schema: "bad" } as unknown as LevelCellDoc, revision: rev(8) },
    ];
    const before = snapshot(session);
    const heard: ApplyCause[] = [];
    session.onApplied((_, cause) => heard.push(cause));
    const issues = session.loadCells(batch);
    expect(issues.filter((issue) => issue.code === "duplicate-id")).toHaveLength(2);
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "unknown-field", severity: "error", file: "cells/5_0.json" }),
      expect.objectContaining({ code: "invalid-document", severity: "error", file: "cells/6_0.json" }),
    ]));
    expect(snapshot(session)).toEqual(before);
    expect(session.actor(d.id)).toBeUndefined();
    expect(session.baseActor(d.id)).toBeUndefined();
    expect(session.isLoaded("2_0")).toBe(false);
    expect(session.cellKeys()).toEqual(["0_0", "1_0", "2_0"]);
    for (const cell of batch) expect(session.fileRevision(`${FOLDER}/cells/${cell.doc.cell}.json`)).toBeUndefined();
    expect(heard).toEqual([]);
    expect(session.loadCells([two])).toEqual([]);
    expect(session.actor(d.id)?.name).toBe("d");
  });

  test("duplicate cell keys and duplicate ids within a cell reject without installing revisions", () => {
    const { session, cells } = fixture();
    const two = cells.find((cell) => cell.doc.cell === "2_0")!;
    const before = snapshot(session);
    const issues = session.loadCells([
      { ...two, doc: { ...two.doc, actors: [two.doc.actors[0]!, two.doc.actors[0]!] } },
      { ...two, revision: rev(90) },
    ]);
    expect(issues.filter((issue) => issue.code === "duplicate-id")).toHaveLength(2);
    expect(snapshot(session)).toEqual(before);
    expect(session.fileRevision(`${FOLDER}/cells/2_0.json`)).toBeUndefined();
  });

  test("a foreign-level cell rejects the valid fresh cells too", () => {
    const { session, cells } = fixture();
    const two = cells.find((cell) => cell.doc.cell === "2_0")!;
    const before = snapshot(session);
    const issues = session.loadCells([two, { ...two, doc: { ...two.doc, level: levelId("2"), cell: "3_0" } }]);
    expect(issues).toEqual([expect.objectContaining({ code: "invalid-value", path: "level", severity: "error" })]);
    expect(snapshot(session)).toEqual(before);
    expect(session.isLoaded("2_0")).toBe(false);
  });
});
