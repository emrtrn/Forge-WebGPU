// The transform tools over a real editor session and world (plan phase 4
// step 4): a drag previews in the world only and commits one undo step with
// every selected root; Escape puts the world back; snap to floor and the
// pivot presets are one step each; snap settings are kept by the page.
import { describe, expect, test } from "vitest";
import { normalizeLevel, openLevelSession, splitLevel, type ActorId, type LevelDoc, type SaveClient, type Vec3 } from "../core/index.ts";
import { actorId, createOptions, levelId } from "../core/level/testKit.ts";
import type { GizmoHandle } from "../engine/gizmo/axes.ts";
import { assembleLevel } from "../runtime/assembler.ts";
import { createWorld } from "../runtime/world.ts";
import { createEditorSession } from "./session/editorSession.ts";
import { createTransformTools, SNAP_STORAGE_KEY, type ToolPointer, type TransformToolsViewport } from "./transformTools.ts";

const OPTIONS = createOptions(true);

function open() {
  const actor = (seed: string, p: Vec3, extra: Record<string, unknown> = {}) => ({ id: actorId(seed), name: seed, transform: { p }, ...extra });
  const level = normalizeLevel(
    { schema: "forge.level/1", id: levelId("1"), actors: [actor("a", [0, 0, 0]), actor("b", [5, 0, 0]), actor("c", [1, 0, 0], { parent: actorId("b") })] },
    OPTIONS,
  ).value as LevelDoc;
  const split = splitLevel(level, OPTIONS);
  const session = openLevelSession(
    {
      folder: "content/levels/main",
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
  const editor = createEditorSession({ level: session, world, client: {} as SaveClient });
  const position = (id: ActorId): Vec3 => {
    const own = world.context.actor(id)!;
    const parent = own.parent === null ? null : world.context.actor(own.parent)!;
    return [own.transform.p[0] + (parent?.transform.p[0] ?? 0), own.transform.p[1] + (parent?.transform.p[1] ?? 0), own.transform.p[2] + (parent?.transform.p[2] ?? 0)];
  };
  // Every actor draws a 1 m box round its origin; nothing else is in the level (no surface: the floor plane).
  let handle: GizmoHandle | null = { tool: "move", axis: "x" };
  const viewport: TransformToolsViewport = {
    pickHandle: () => handle,
    // The pointer's x in pixels is the world x / 100 under a camera looking straight down.
    pointerRay: (clientX) => ({ origin: [clientX / 100, 10, 0], direction: [0, -1, 0] }),
    viewDirection: () => [0, -1, 0],
    raycast: () => null,
    worldBox: (ids) => {
      const p = position(ids[0]!);
      return { min: [p[0] - 0.5, p[1] - 0.5, p[2] - 0.5], max: [p[0] + 0.5, p[1] + 0.5, p[2] + 0.5] };
    },
    localBox: () => ({ min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] }),
  };
  const stored = new Map<string, string>();
  const storage = { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => void stored.set(key, value) } as unknown as Storage;
  const messages: string[] = [];
  const tools = createTransformTools({ editor, viewport, storage, status: (message) => messages.push(message) });
  return { editor, world, tools, stored, messages, position, setHandle: (next: GizmoHandle | null) => (handle = next) };
}

const pointer = (clientX: number, extra: Partial<ToolPointer> = {}): ToolPointer => ({ pointerId: 1, button: 0, buttons: 1, altKey: false, clientX, clientY: 0, ...extra });

describe("the transform tools (plan phase 4 step 4)", () => {
  test("a drag previews in the world only; releasing it is one undo step for every selected root", () => {
    const { editor, tools, position } = open();
    // c is b's child: selecting both drags b, and c follows it.
    editor.selection.set([actorId("a"), actorId("b"), actorId("c")]);
    expect(tools.pointerDown(pointer(0))).toBe(true);
    tools.pointerMove(pointer(220));
    expect(position(actorId("a"))).toEqual([2, 0, 0]);
    expect(position(actorId("c"))).toEqual([8, 0, 0]);
    expect(editor.level.actor(actorId("a"))!.transform.p).toEqual([0, 0, 0]);
    expect(editor.canUndo()).toBe(false);
    tools.pointerUp(pointer(220, { buttons: 0 }));
    expect(editor.level.actor(actorId("a"))!.transform.p).toEqual([2, 0, 0]);
    expect(editor.level.actor(actorId("b"))!.transform.p).toEqual([7, 0, 0]);
    expect(editor.level.actor(actorId("c"))!.transform.p).toEqual([1, 0, 0]);
    expect(editor.level.history.undoStack.map((entry) => entry.label)).toEqual(["Move 2 actors"]);
    editor.undo();
    expect(position(actorId("a"))).toEqual([0, 0, 0]);
    expect(position(actorId("c"))).toEqual([6, 0, 0]);
  });

  test("Escape puts the world back and leaves no step; a press off the handles is not the tools'", () => {
    const { editor, tools, position, setHandle } = open();
    editor.selection.set([actorId("a")]);
    tools.pointerDown(pointer(0));
    tools.pointerMove(pointer(300));
    expect(position(actorId("a"))).toEqual([3, 0, 0]);
    expect(tools.cancel()).toBe(true);
    expect(position(actorId("a"))).toEqual([0, 0, 0]);
    tools.pointerUp(pointer(300, { buttons: 0 }));
    expect(editor.canUndo()).toBe(false);
    setHandle(null);
    expect(tools.pointerDown(pointer(0))).toBe(false);
    setHandle({ tool: "rotate", axis: "y" });
    // The Move tool does not grab a Rotate handle; the Select tool grabs nothing.
    expect(tools.pointerDown(pointer(0))).toBe(false);
    tools.setTool("select");
    expect(tools.gizmo()).toBeNull();
  });

  test("a drag that ends where it started commits nothing", () => {
    const { editor, tools } = open();
    editor.selection.set([actorId("a")]);
    tools.pointerDown(pointer(0));
    tools.pointerMove(pointer(30)); // 0.3 m: the 1 m snap keeps it at 0
    tools.pointerUp(pointer(30, { buttons: 0 }));
    expect(editor.canUndo()).toBe(false);
  });

  test("snap to floor rests the box on the floor plane in one step; resting already, it says so", () => {
    const { editor, tools, messages } = open();
    const raised = structuredClone(editor.level.actor(actorId("a"))!);
    raised.transform.p = [0, 3, 0];
    editor.edit("Raise", (tx) => tx.setActor(raised));
    editor.selection.set([actorId("a")]);
    tools.snapToFloor();
    expect(editor.level.actor(actorId("a"))!.transform.p).toEqual([0, 0.5, 0]);
    expect(editor.level.history.undoStack.at(-1)!.label).toBe("Snap to floor");
    tools.snapToFloor();
    expect(messages.at(-1)).toBe("Already resting on a surface.");
  });

  test("pivot presets write the actor's pivot (one step); the pivot drag moves the pivot, not the actor", () => {
    const { editor, tools } = open();
    editor.selection.set([actorId("a")]);
    tools.setPivotPreset("base");
    expect(editor.level.actor(actorId("a"))!.pivot).toEqual([0, -0.5, 0]);
    tools.setPivotPreset("reset");
    expect(editor.level.actor(actorId("a"))!.pivot).toBeUndefined();
    tools.setPivotEdit(true);
    tools.pointerDown(pointer(0));
    tools.pointerMove(pointer(200));
    tools.pointerUp(pointer(200, { buttons: 0 }));
    expect(editor.level.actor(actorId("a"))!.pivot).toEqual([2, 0, 0]);
    expect(editor.level.actor(actorId("a"))!.transform.p).toEqual([0, 0, 0]);
    expect(editor.level.history.undoStack.at(-1)!.label).toBe("Edit pivot");
    // Switching tool leaves pivot editing (Forge).
    tools.setTool("rotate");
    expect(tools.pivotEdit).toBe(false);
  });

  test("snap settings are kept by the page", () => {
    const { tools, stored } = open();
    expect(tools.snap.move).toBe(1);
    tools.setSnap({ move: 0.25, rotateEnabled: false });
    expect(JSON.parse(stored.get(SNAP_STORAGE_KEY)!)).toMatchObject({ move: 0.25, rotateEnabled: false, scale: 0.1 });
  });
});
