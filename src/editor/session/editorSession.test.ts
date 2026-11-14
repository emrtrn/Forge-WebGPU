import { describe, expect, test } from "vitest";
import { openLevelSession, splitLevel, normalizeLevel, type ActorDoc, type LevelDoc, type SaveClient, type SaveRequestBody } from "../../core/index.ts";
import { actorId, createOptions, levelId } from "../../core/level/testKit.ts";
import { assembleLevel } from "../../runtime/assembler.ts";
import { createWorld } from "../../runtime/world.ts";
import { createEditorSession } from "./editorSession.ts";

const OPTIONS = createOptions(true);
const FOLDER = "content/levels/main";

function actor(seed: string, x: number, extra: Record<string, unknown> = {}): unknown {
  return { id: actorId(seed), name: seed, transform: { p: [x, 0, 0] }, ...extra };
}

function open(saves: SaveRequestBody[] = [], hidden: readonly string[] = []) {
  const level = normalizeLevel(
    { schema: "forge.level/1", id: levelId("1"), actors: [actor("a", 1), actor("b", 2), actor("c", 3, { parent: actorId("b") })] },
    OPTIONS,
  ).value as LevelDoc;
  const split = splitLevel(level, OPTIONS);
  const session = openLevelSession(
    {
      folder: FOLDER,
      persistent: split.persistent,
      persistentRevision: "0000000000000001",
      index: { schema: "forge.levelCells/1", level: level.id, persistent: "0000000000000001", cells: Object.fromEntries(split.cells.map((cell) => [cell.cell, "0000000000000002"])) },
      cells: split.cells.map((doc) => ({ doc, revision: "0000000000000002" })),
    },
    OPTIONS,
  );
  const world = createWorld({ ...OPTIONS, features: [], mode: "editor" });
  world.init();
  assembleLevel(world, session.level, OPTIONS);
  world.beginPlay();
  const client = {
    save: async (request: SaveRequestBody) => {
      saves.push(request);
      return { status: "saved" as const, files: request.writes.map((write) => ({ path: write.path, revision: "0000000000000009" })), warnings: [] };
    },
  } as unknown as SaveClient;
  return createEditorSession({ level: session, world, client, hidden: hidden.map((seed) => actorId(seed)) });
}

const doc = (editor: ReturnType<typeof open>, seed: string): ActorDoc => structuredClone(editor.level.actor(actorId(seed))!);
const worldNames = (editor: ReturnType<typeof open>) => [...editor.world.context.actors()].map((entry) => `${entry.name}${entry.parent ? `<${entry.parent.slice(4, 5)}` : ""}`);

describe("the editor session mirrors edits into its world", () => {
  test("move, add, remove and their undo / redo reach the world", () => {
    const editor = open();
    const moved = doc(editor, "a");
    moved.transform.p = [9, 0, 0];
    expect(editor.edit("Move a", (tx) => tx.setActor(moved)).ok).toBe(true);
    expect(editor.world.context.actor(actorId("a"))!.transform.p).toEqual([9, 0, 0]);
    editor.edit("Add d", (tx) => tx.setActor(actor("d", 4)));
    // A parent goes with its children (the session refuses to leave a child behind).
    expect(editor.edit("Remove b alone", (tx) => tx.removeActor(actorId("b"))).ok).toBe(false);
    editor.edit("Remove b", (tx) => {
      tx.removeActor(actorId("b"));
      tx.removeActor(actorId("c"));
    });
    expect(worldNames(editor)).toEqual(["a", "d"]);
    editor.undo();
    expect(worldNames(editor)).toEqual(["a", "d", "b", "c<b"]);
    editor.undo();
    editor.undo();
    expect(editor.world.context.actor(actorId("a"))!.transform.p).toEqual([1, 0, 0]);
    expect(editor.canRedo()).toBe(true);
    editor.redo();
    expect(editor.world.context.actor(actorId("a"))!.transform.p).toEqual([9, 0, 0]);
  });

  test("grouping (a new parent) and ungrouping (removing it) in one transaction keep the children", () => {
    const editor = open();
    editor.edit("Group", (tx) => {
      tx.setActor(actor("e", 0, { name: "group" }));
      tx.setActor({ ...doc(editor, "a"), parent: actorId("e") });
    });
    expect(worldNames(editor)).toContain("a<e");
    editor.edit("Ungroup", (tx) => {
      tx.setActor({ ...doc(editor, "a"), parent: null });
      tx.removeActor(actorId("e"));
    });
    expect(worldNames(editor)).toEqual(["a", "b", "c<b"]);
    expect(editor.world.context.actor(actorId("e"))).toBeUndefined();
    editor.undo();
    expect(worldNames(editor)).toContain("a<e");
  });

  test("the selection keeps level actors only and drops removed ones; listeners hear every change", () => {
    const editor = open();
    let heard = 0;
    editor.onChange(() => (heard += 1));
    editor.selection.set([actorId("a"), actorId("f"), actorId("a"), actorId("b")]);
    expect(editor.selection.ids()).toEqual([actorId("a"), actorId("b")]);
    expect(editor.selection.primary()).toBe(actorId("a"));
    editor.edit("Remove a", (tx) => tx.removeActor(actorId("a")));
    expect(editor.selection.ids()).toEqual([actorId("b")]);
    expect(heard).toBe(2);
  });

  test("toggle adds an actor to the selection or takes it out (Ctrl / Shift click)", () => {
    const editor = open();
    editor.selection.toggle(actorId("a"));
    editor.selection.toggle(actorId("b"));
    expect(editor.selection.ids()).toEqual([actorId("a"), actorId("b")]);
    editor.selection.toggle(actorId("a"));
    expect(editor.selection.ids()).toEqual([actorId("b")]);
    editor.selection.toggle(actorId("f"));
    expect(editor.selection.ids()).toEqual([actorId("b")]);
  });

  test("save sends the dirty parts and reports in a few words; a clean level has nothing to save", async () => {
    const saves: SaveRequestBody[] = [];
    const editor = open(saves);
    expect(await editor.save()).toEqual({ ok: true, message: "Nothing to save" });
    const moved = doc(editor, "a");
    moved.transform.p = [5, 0, 0];
    editor.edit("Move a", (tx) => tx.setActor(moved));
    expect(editor.dirty()).toBe(1);
    const report = await editor.save();
    expect(report.ok).toBe(true);
    expect(report.message).toMatch(/^Saved \d+ files?$/);
    expect(saves).toHaveLength(1);
    expect(editor.dirty()).toBe(0);
  });
});

describe("hiding is a view of the editor (user decision 2026-11-14)", () => {
  test("a hidden actor and its children leave the world and the selection; showing brings them back; no undo step, nothing dirty", () => {
    const editor = open();
    editor.selection.set([actorId("c"), actorId("a")]);
    editor.visibility.set([actorId("b")], true);
    expect(worldNames(editor)).toEqual(["a"]);
    expect(editor.visibility.hidden(actorId("c"))).toBe(true);
    expect(editor.visibility.has(actorId("c"))).toBe(false);
    expect(editor.selection.ids()).toEqual([actorId("a")]);
    expect(editor.canUndo()).toBe(false);
    expect(editor.dirty()).toBe(0);
    editor.visibility.showAll();
    expect(worldNames(editor)).toEqual(["a", "b", "c<b"]);
    expect(editor.visibility.ids()).toEqual([]);
  });

  test("edits to hidden actors reach the level, and the world once shown; parenting under a hidden actor hides", () => {
    const editor = open([], ["b"]);
    expect(worldNames(editor)).toEqual(["a"]);
    const moved = doc(editor, "c");
    moved.transform.p = [7, 0, 0];
    editor.edit("Move c", (tx) => tx.setActor(moved));
    expect(editor.world.context.actor(actorId("c"))).toBeUndefined();
    editor.edit("Parent a to b", (tx) => tx.setActor({ ...doc(editor, "a"), parent: actorId("b") }));
    expect(worldNames(editor)).toEqual([]);
    editor.undo();
    expect(worldNames(editor)).toEqual(["a"]);
    editor.visibility.set([actorId("b")], false);
    expect(editor.world.context.actor(actorId("c"))!.transform.p).toEqual([7, 0, 0]);
    editor.edit("Add d", (tx) => tx.setActor(actor("d", 4, { parent: actorId("c") })));
    editor.visibility.set([actorId("c")], true);
    editor.edit("Remove c and d", (tx) => {
      tx.removeActor(actorId("c"));
      tx.removeActor(actorId("d"));
    });
    editor.undo();
    expect(worldNames(editor)).toEqual(["a", "b"]);
    expect(editor.visibility.ids()).toEqual([actorId("c")]);
  });
});
