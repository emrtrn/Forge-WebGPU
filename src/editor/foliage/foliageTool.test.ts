import { describe, expect, test } from "vitest";
import type { ActorId, AssetId, LevelId, SaveClient, SaveRequestBody, Vec3, WorldActor } from "../../core/index.ts";
import { buildLevelFoliage, decodeFoliageCell } from "../../core/level/foliageCells.ts";
import { normalizeFoliageTypeParams } from "../../engine/foliage/foliageTypeParams.ts";
import { createTerrainEditing } from "../../engine/terrain/terrainEditing.ts";
import type { ProbedSurface } from "../../render/editor/surfaceProbe.ts";
import type { SessionStep } from "../session/editorSession.ts";
import { createFoliageEdits } from "./foliageEdits.ts";
import { createFoliageTools, rayBox, type FoliageToolPointer, type FoliageTypeInfo } from "./foliageTool.ts";

const LEVEL = `lvl_${"1".repeat(32)}` as LevelId;
const GRASS = `ast_${"a".repeat(32)}` as AssetId;
const TREE = `ast_${"b".repeat(32)}` as AssetId;
const GROUND = `act_${"1".repeat(32)}` as ActorId;
const BOX = `act_${"2".repeat(32)}` as ActorId;
const FOLDER = "content/levels/test";

/** Flat ground at 0 (a terrain) with a 10 m box (a static mesh, its top at 2) at x 20..30, z 0..10; the pointer's client position is the world X / Z. */
function setup(painted: { type: AssetId; at: Vec3 }[] = []) {
  const files = new Map<string, { text?: string; bytes?: Uint8Array; revision: string }>();
  const { index, cells } = buildLevelFoliage({
    level: LEVEL, cellSize: 64,
    groups: painted.map(({ type, at }, i) => ({ type, instances: [{ position: at, rotation: [0, 0, 0, 1] as [number, number, number, number], scale: 1, seed: i + 1 }] })),
  });
  if (painted.length > 0) {
    files.set(`${FOLDER}/foliage.json`, { text: JSON.stringify(index), revision: "i0" });
    for (const [key, bytes] of cells) files.set(`${FOLDER}/foliage/${key}.bin`, { bytes, revision: `${key}-0` });
  }
  const requests: SaveRequestBody[] = [];
  const staged = new Map<string, Uint8Array>();
  let answer: "saved" | "conflict" = "saved";
  const client = {
    read: async (path: string) => {
      const file = files.get(path);
      return file?.text !== undefined ? { text: file.text, revision: file.revision } : null;
    },
    stageBinary: async (bytes: Uint8Array) => {
      const id = `s${staged.size}`;
      staged.set(id, bytes);
      return { id, size: bytes.byteLength, revision: id };
    },
    save: async (request: SaveRequestBody) => {
      requests.push(request);
      if (answer === "conflict") return { status: "conflict", conflicts: [{ path: `${FOLDER}/foliage.json` }] };
      const saved = request.writes.map((write, i) => {
        const revision = `r${requests.length}-${i}`;
        const { text, staged: id } = write as { text?: string; staged?: string };
        files.set(write.path, text !== undefined ? { text, revision } : { bytes: staged.get(id!)!, revision });
        return { path: write.path, revision };
      });
      for (const gone of request.deletes) files.delete(gone.path);
      return { status: "saved", files: saved };
    },
  } as unknown as SaveClient;
  const steps: SessionStep[] = [];
  const messages: string[] = [];
  const edits = createFoliageEdits({
    editor: { pushStep: (step: SessionStep) => void steps.push(step) }, client, folder: FOLDER, level: LEVEL, cellSize: () => 64, writable: true,
    readFile: async (path) => {
      const file = files.get(path);
      return file?.bytes ? { bytes: file.bytes, revision: file.revision } : null;
    },
    status: (message) => void messages.push(message),
  });
  const surface = (x: number, z: number): ProbedSurface => (x >= 20 && x <= 30 && z >= 0 && z <= 10
    ? { actor: BOX, point: [x, 2, z], normal: [0, 1, 0] } : { actor: GROUND, point: [x, 0, z], normal: [0, 1, 0] });
  const component = (type: string): WorldActor => ({ components: { one: { type } } }) as unknown as WorldActor;
  let active: AssetId | null = GRASS;
  const cages: number[] = [];
  const info: FoliageTypeInfo = { params: { ...normalizeFoliageTypeParams({}), radius: 0.5, density: 1 }, box: { min: [-0.5, 0, -0.5], max: [0.5, 2, 0.5] } };
  const tools = createFoliageTools({
    edits, editing: createTerrainEditing(), activeType: () => active, typeInfo: async () => info, status: (message) => void messages.push(message),
    actor: (id) => component(id === GROUND ? "forge.terrain@2" : "forge.staticMesh@2"),
    viewport: {
      pointerRay: (x, z) => ({ origin: [x, 100, z], direction: [0, -1, 0] }),
      raycast: (origin) => {
        const hit = surface(origin[0], origin[2]);
        return { distance: origin[1] - hit.point[1], ...hit };
      },
      surfaceProbe: () => surface,
      worldBox: () => ({ min: [20, 0, 0], max: [30, 2, 10] }),
      setBrushCursor: () => {},
      setFoliageSelection: (list) => void cages.push(list.length),
    },
  });
  const pointer = (x: number, z: number, keys: Partial<FoliageToolPointer> = {}): FoliageToolPointer =>
    ({ pointerId: 1, button: 0, altKey: false, ctrlKey: false, shiftKey: false, clientX: x, clientY: z, ...keys });
  const stroke = async (points: readonly (readonly [number, number])[], keys: Partial<FoliageToolPointer> = {}): Promise<void> => {
    const [first, ...rest] = points.map(([x, z]) => pointer(x, z, keys));
    tools.pointerDown(first!);
    for (const move of rest) tools.pointerMove(move);
    tools.pointerUp(first!);
    await tools.idle();
  };
  const all = (type: AssetId) => edits.session.loadedCells().flatMap((key) => [...(edits.session.instances(key).get(type) ?? [])]);
  return { edits, tools, steps, messages, requests, files, staged, cages, stroke, pointer, all, pick: (type: AssetId | null) => { active = type; }, answer: (next: "saved" | "conflict") => { answer = next; } };
}

describe("Foliage tools (plan 5d step 6)", () => {
  test("no tool: the viewport keeps the pointer; a tool takes it, but Alt stays the camera's", () => {
    const { tools, pointer } = setup();
    expect([tools.active, tools.pointerDown(pointer(0, 0)), tools.pointerMove(pointer(0, 0))]).toEqual([false, false, false]);
    tools.update({ tool: "paint" });
    expect([tools.active, tools.pointerDown(pointer(0, 0, { altKey: true })), tools.pointerDown(pointer(0, 0))]).toEqual([true, false, true]);
  });

  test("Paint: one undo step per stroke, on the surface the press was on, spaced; saved and read back", async () => {
    const { edits, tools, steps, requests, files, stroke, all } = setup();
    await edits.refresh();
    tools.update({ tool: "paint", brushSize: 4, paintDensity: 1 });
    await stroke([[10, 5], [14, 5], [16, 5], [18, 5]]);
    const painted = all(GRASS);
    expect(painted.length).toBeGreaterThan(20);
    // The box (a static mesh) is not the ground the stroke began on.
    expect(painted.every(({ position: [x, y, z] }) => y === 0 && !(x >= 20 && z >= 0 && z <= 10))).toBe(true);
    for (const a of painted) for (const b of painted) if (a !== b) expect(Math.hypot(a.position[0] - b.position[0], a.position[2] - b.position[2])).toBeGreaterThanOrEqual(0.4999);
    expect(steps.map((step) => step.label)).toEqual(["Paint Foliage"]);
    steps[0]!.undo();
    expect([all(GRASS).length, edits.dirty()]).toEqual([0, 0]);
    steps[0]!.redo();
    expect(all(GRASS)).toEqual(painted);

    expect(await edits.save()).toMatchObject({ ok: true });
    expect(requests[0]!.writes.map((write) => [write.path, write.base])).toEqual([[`${FOLDER}/foliage/0_0.bin`, null], [`${FOLDER}/foliage.json`, null]]);
    expect(edits.dirty()).toBe(0);
    expect(decodeFoliageCell(files.get(`${FOLDER}/foliage/0_0.bin`)!.bytes!)[0]!.scales).toHaveLength(painted.length);
    // Its own save's file events change nothing; a second save names the revisions written.
    await edits.diskChanged([{ path: `${FOLDER}/foliage.json`, revision: "r1-1" }, { path: `${FOLDER}/foliage/0_0.bin`, revision: "r1-0" }]);
    expect(all(GRASS)).toEqual(painted);
    await stroke([[40, 40]]);
    await edits.save();
    expect(requests[1]!.writes.map((write) => write.base)).toEqual(["r1-0", "r1-1"]);
  });

  test("the filters: a surface kind that is off takes nothing", async () => {
    const { tools, stroke, all } = setup();
    tools.update({ tool: "paint", landscape: false });
    await stroke([[5, 5]]);
    expect(all(GRASS)).toEqual([]);
    await stroke([[25, 5]]);
    expect(all(GRASS).length).toBeGreaterThan(0);
    expect(all(GRASS).every(({ position }) => position[1] === 2)).toBe(true);
  });

  test("Erase takes every type under the brush, Remove the active one, Shift + Paint erases; cells load first", async () => {
    const { edits, tools, steps, stroke } = setup([{ type: GRASS, at: [5, 0, 5] }, { type: TREE, at: [6, 0, 5] }, { type: GRASS, at: [40, 0, 5] }, { type: GRASS, at: [100, 0, 5] }]);
    await edits.refresh();
    const counts = (): number[] => [edits.session.count(GRASS), edits.session.count(TREE)];
    tools.update({ tool: "remove" });
    await stroke([[5, 5]]);
    expect(counts()).toEqual([2, 1]);
    expect(edits.session.loadedCells()).toEqual(["0_0"]);
    tools.update({ tool: "erase" });
    await stroke([[5, 5], [40, 5]]);
    expect([counts(), steps.length]).toEqual([[1, 0], 2]);
    steps[1]!.undo();
    expect(counts()).toEqual([2, 1]);
    tools.update({ tool: "paint" });
    await stroke([[100, 5]], { shiftKey: true });
    expect(counts()).toEqual([1, 1]);
    expect(steps.at(-1)!.label).toBe("Paint Foliage");
  });

  test("Single and Fill act once per click; Fill covers the clicked actor", async () => {
    const { tools, steps, stroke, all, messages, pick } = setup();
    tools.update({ tool: "single" });
    await stroke([[1, 1], [5, 5]]);
    expect(all(GRASS).map(({ position }) => position)).toEqual([[1, 0, 1]]);
    await stroke([[1.2, 1]]);
    expect([all(GRASS).length, steps.length]).toEqual([1, 1]);
    tools.update({ tool: "fill", paintDensity: 1 });
    pick(TREE);
    await stroke([[25, 5]]);
    const filled = all(TREE);
    expect(filled.length).toBeGreaterThan(100);
    expect(filled.every(({ position: [x, y, z] }) => x >= 20 && x <= 30 && z >= 0 && z <= 10 && y === 2)).toBe(true);
    expect(messages.at(-1)).toBe(`Filled ${filled.length} foliage instances.`);
    pick(null);
    await stroke([[25, 5]]);
    expect(messages.at(-1)).toBe("Select a Foliage Type first.");
  });

  test("Select, Lasso, Reattach, Reapply, Remove Selected and Select Invalid; an undo drops what it took from the selection", async () => {
    const { edits, tools, steps, stroke, all } = setup([{ type: GRASS, at: [5, 3, 5] }, { type: GRASS, at: [7, 0, 5] }, { type: TREE, at: [100, 0, 5] }]);
    await edits.refresh();
    tools.update({ tool: "select" });
    await stroke([[5.2, 5]]);
    expect(tools.selectionSize()).toBe(1);
    await stroke([[7, 5]], { ctrlKey: true });
    expect(tools.selectionSize()).toBe(2);
    await stroke([[50, 50]]);
    expect(tools.selectionSize()).toBe(0);
    // Floating 3 m above the ground.
    await tools.selectInvalid();
    expect(tools.selectionSize()).toBe(1);
    await tools.reattach();
    expect(all(GRASS).map(({ position }) => position[1])).toEqual([0, 0]);
    expect([tools.selectionSize(), steps.length]).toEqual([1, 1]);
    await tools.selectInvalid();
    expect(tools.selectionSize()).toBe(0);

    tools.update({ tool: "lasso", brushSize: 4 });
    await stroke([[6, 5]]);
    expect(tools.selectionSize()).toBe(2);
    await tools.reapply();
    expect([tools.selectionSize(), steps.at(-1)!.label]).toEqual([2, "Reapply Foliage"]);
    tools.removeSelected();
    await tools.idle();
    expect([all(GRASS).length, tools.selectionSize()]).toEqual([0, 0]);
    steps.at(-1)!.undo();
    expect(all(GRASS)).toHaveLength(2);
    await stroke([[6, 5]], { ctrlKey: false });
    expect(tools.selectionSize()).toBe(2);
    steps.at(-2)!.undo();
    expect(tools.selectionSize()).toBe(0);
  });

  test("a conflict keeps the edits; a disk change follows only a clean session; erasing everything deletes the files", async () => {
    const { edits, tools, stroke, requests, files, answer, all } = setup([{ type: GRASS, at: [5, 0, 5] }]);
    await edits.refresh();
    tools.update({ tool: "erase" });
    await stroke([[5, 5]]);
    answer("conflict");
    expect(await edits.save()).toMatchObject({ ok: false, conflict: true });
    expect(edits.dirty()).toBe(1);
    await edits.diskChanged([{ path: `${FOLDER}/foliage.json`, revision: "other" }]);
    expect(edits.dirty()).toBe(1);
    answer("saved");
    expect(await edits.save()).toMatchObject({ ok: true, files: 2 });
    expect(requests.at(-1)!.deletes).toEqual([{ path: `${FOLDER}/foliage/0_0.bin`, base: "0_0-0" }, { path: `${FOLDER}/foliage.json`, base: "i0" }]);
    expect(files.size).toBe(0);
    expect([edits.source.index, all(GRASS)]).toEqual([null, []]);
  });

  test("the ray test against an instance's box is in world metres", () => {
    const box = { min: [-1, 0, -1] as Vec3, max: [1, 2, 1] as Vec3 };
    const instance = { position: [10, 0, 0] as Vec3, rotation: [0, 0, 0, 1] as [number, number, number, number], scale: 2, seed: 1 };
    expect(rayBox({ origin: [10, 50, 0], direction: [0, -1, 0] }, instance, box)).toBeCloseTo(46, 6);
    expect(rayBox({ origin: [13, 50, 0], direction: [0, -1, 0] }, instance, box)).toBeNull();
    expect(rayBox({ origin: [0, 1, 0], direction: [1, 0, 0] }, instance, box)).toBeCloseTo(8, 6);
  });
});
