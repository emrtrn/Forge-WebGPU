import { describe, expect, test } from "vitest";
import { normalizeLevel, openLevelSession, type ActorDoc, type ActorId, type LevelDoc, type SaveClient } from "../../core/index.ts";
import { actorId, createOptions, levelId } from "../../core/level/testKit.ts";
import { transformPoint } from "../../engine/math/affine.ts";
import { eulerDegreesToQuaternion } from "../../engine/math/euler.ts";
import { assembleLevel } from "../../runtime/assembler.ts";
import { createWorld } from "../../runtime/world.ts";
import { createEditorSession } from "../session/editorSession.ts";
import { copyText, deletionOf, duplicateActors, groupActors, pasteActors, readClipboard, selectTarget, ungroupActors, uniqueName, type OpsContext } from "./actorOps.ts";
import { createEditCommands, memoryClipboard } from "./editCommands.ts";
import { worldMatrixOf } from "./hierarchy.ts";

const OPTIONS = createOptions(true);
const IDENTITY = { p: [0, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] };
const actor = (seed: string, x: number, extra: Record<string, unknown> = {}) => ({ id: actorId(seed), name: `Cube ${seed}`, class: null, parent: null, spatiallyLoaded: false, transform: { ...IDENTITY, p: [x, 0, 0] }, components: {}, ...extra });

/** a at x 1; b at 4 holding c (local 1); f carries the singleton fog; e at 10. */
function level(): LevelDoc {
  return normalizeLevel(
    {
      schema: "forge.level/1",
      id: levelId("1"),
      actors: [
        actor("a", 1),
        actor("b", 4, { transform: { p: [4, 0, 0], r: eulerDegreesToQuaternion([0, 90, 0]), s: [1, 1, 1] } }),
        actor("c", 1, { parent: actorId("b") }),
        actor("f", 0, { name: "Fog", components: { fog: { type: "test.fog@2" } } }),
        actor("e", 10),
      ],
    },
    OPTIONS,
  ).value as LevelDoc;
}

let counter = 0;
const newId = (): ActorId => `act_${(0xa00 + (counter += 1)).toString(16).padStart(32, "0")}`;

function context(docs: ActorDoc[]): OpsContext {
  return { lookup: (id) => docs.find((doc) => doc.id === id), actors: () => docs, registry: OPTIONS.registry, resolveClass: OPTIONS.resolveClass, newId };
}
const worldAt = (docs: ActorDoc[], id: ActorId) => transformPoint(worldMatrixOf((one) => docs.find((doc) => doc.id === one), docs.find((doc) => doc.id === id)!), [0, 0, 0]).map((value) => Number(value.toFixed(9)));

describe("duplicate, delete, copy and paste (INV-A08)", () => {
  test("a duplicate copies the subtree with new GUIDs, remapped links and a unique root name; a singleton is refused", () => {
    const docs = level().actors;
    const copy = duplicateActors(context(docs), [actorId("c"), actorId("b"), actorId("f")]);
    expect(copy.refused).toEqual([actorId("f")]);
    expect(copy.docs.map((doc) => doc.name)).toEqual(["Cube b 2", "Cube c"]);
    expect(copy.docs[1]!.parent).toBe(copy.docs[0]!.id);
    expect(copy.docs[0]!.parent).toBeNull();
    expect(copy.docs.every((doc) => !docs.some((one) => one.id === doc.id))).toBe(true);
    expect(copy.roots).toEqual([copy.docs[0]!.id]);
    expect(uniqueName("Cube 2", new Set(["Cube 2", "Cube 3"]))).toBe("Cube 4");
  });

  test("delete takes the subtree", () => {
    expect(deletionOf(context(level().actors), [actorId("b")])).toEqual([actorId("b"), actorId("c")]);
  });

  test("copy writes forge.actors/1 with the roots in world space; paste gives new GUIDs at the same place", () => {
    const docs = level().actors;
    const copied = copyText(context(docs), [actorId("c")])!;
    const raw = readClipboard(copied.text)!;
    expect((raw[0] as ActorDoc).parent).toBeNull();
    const pasted = pasteActors(context(docs), raw);
    const after = [...docs, ...pasted.docs];
    expect(worldAt(after, pasted.roots[0]!)).toEqual(worldAt(docs, actorId("c")));
    expect(readClipboard("not json")).toBeNull();
    expect(readClipboard('{"schema":"forge.level/1","actors":[]}')).toBeNull();
    expect(pasteActors(context(docs), readClipboard(copyText(context(docs), [actorId("f")])!.text)!).refused).toEqual([actorId("f")]);
  });
});

describe("groups (phase 4 decision 10)", () => {
  test("a group is an empty actor at the roots' centre; its children keep their world places", () => {
    const docs = level().actors;
    const grouped = groupActors(context(docs), [actorId("a"), actorId("e"), actorId("c")])!;
    expect(grouped.group).toMatchObject({ name: "Group", class: null, parent: null, components: {} });
    const after = docs.map((doc) => grouped.docs.find((one) => one.id === doc.id) ?? doc).concat(grouped.group);
    expect(grouped.group.transform.p[0]).toBeCloseTo((1 + 10 + 4) / 3, 9);
    for (const id of [actorId("a"), actorId("e"), actorId("c")]) expect(worldAt(after, id)).toEqual(worldAt(docs, id));
    expect(selectTarget(context(after), actorId("a"))).toBe(grouped.group.id);
    expect(groupActors(context(docs), [actorId("a")])).toBeNull();
  });

  test("ungroup hands the children to the group's parent (past a dissolved outer group) and removes the groups", () => {
    const docs = level().actors;
    const inner = groupActors(context(docs), [actorId("a"), actorId("e")])!;
    let after = docs.map((doc) => inner.docs.find((one) => one.id === doc.id) ?? doc).concat(inner.group);
    const outer = groupActors(context(after), [inner.group.id, actorId("b")])!;
    after = after.map((doc) => outer.docs.find((one) => one.id === doc.id) ?? doc).concat(outer.group);
    expect(selectTarget(context(after), actorId("a"))).toBe(outer.group.id);
    const ungrouped = ungroupActors(context(after), [outer.group.id, inner.group.id])!;
    expect(ungrouped.removed.sort()).toEqual([inner.group.id, outer.group.id].sort());
    const final = after.filter((doc) => !ungrouped.removed.includes(doc.id)).map((doc) => ungrouped.docs.find((one) => one.id === doc.id) ?? doc);
    expect(final.filter((doc) => doc.parent === null).map((doc) => doc.name).sort()).toEqual(["Cube a", "Cube b", "Cube e", "Fog"]);
    for (const id of [actorId("a"), actorId("e"), actorId("c")]) expect(worldAt(final, id)).toEqual(worldAt(docs, id));
    expect(ungroupActors(context(docs), [actorId("a")])).toBeNull();
  });
});

describe("the commands on the editor session", () => {
  function open() {
    const doc = level();
    const session = openLevelSession({ folder: "content/levels/x", persistent: doc, persistentRevision: null, index: null }, OPTIONS);
    const world = createWorld({ ...OPTIONS, features: [], mode: "editor" });
    world.init();
    assembleLevel(world, session.level, OPTIONS);
    world.beginPlay();
    const editor = createEditorSession({ level: session, world, client: {} as SaveClient });
    const messages: string[] = [];
    const commands = createEditCommands({ editor, registry: OPTIONS.registry, resolveClass: OPTIONS.resolveClass, clipboard: memoryClipboard(), status: (message) => messages.push(message), newId });
    return { editor, commands, messages };
  }

  test("duplicate is one undo step that selects the copies; undo and redo keep the copies' ids", () => {
    const { editor, commands } = open();
    editor.selection.set([actorId("b")]);
    const [copy] = commands.duplicate();
    expect(editor.selection.ids()).toEqual([copy]);
    expect(editor.world.context.actor(copy!)).toBeDefined();
    editor.undo();
    expect(editor.level.actor(copy!)).toBeUndefined();
    editor.redo();
    expect(editor.level.actor(copy!)?.name).toBe("Cube b 2");
    expect(editor.level.history.undoStack).toHaveLength(1);
  });

  test("group and ungroup are one undo step each; delete takes children along; paste selects what it added", async () => {
    const { editor, commands } = open();
    editor.selection.set([actorId("a"), actorId("e")]);
    commands.group();
    const group = editor.selection.primary()!;
    expect(editor.level.actor(actorId("a"))?.parent).toBe(group);
    commands.ungroup();
    expect(editor.level.actor(group)).toBeUndefined();
    expect(editor.selection.ids()).toEqual([actorId("a"), actorId("e")]);
    editor.undo();
    expect(editor.level.actor(actorId("a"))?.parent).toBe(group);
    editor.undo();
    expect(editor.level.actor(group)).toBeUndefined();
    expect(editor.level.actor(actorId("a"))?.parent).toBeNull();

    editor.selection.set([actorId("b")]);
    await commands.copy();
    commands.remove();
    expect(editor.level.actor(actorId("c"))).toBeUndefined();
    await commands.paste();
    expect(editor.selection.ids()).toHaveLength(1);
    expect(editor.level.actor(editor.selection.primary()!)?.name).toBe("Cube b");
  });

  test("Alt + drag: the duplicate and the move merge into one undo step", () => {
    const { editor, commands } = open();
    editor.selection.set([actorId("a")]);
    expect(commands.duplicateForDrag("alt-duplicate:1")).toBe(true);
    const copy = editor.selection.primary()!;
    editor.edit("Move", (tx) => tx.setActor({ ...editor.level.actor(copy)!, transform: { ...IDENTITY, p: [7, 0, 0] } }), { coalesce: "alt-duplicate:1" });
    editor.level.history.seal();
    expect(editor.level.history.undoStack).toHaveLength(1);
    editor.undo();
    expect(editor.level.actor(copy)).toBeUndefined();
  });
});
