import { expect, test } from "vitest";
import { normalizeLevel, openLevelSession, splitLevel, type SaveClient } from "../../core/index.ts";
import { actorId, createOptions, levelId } from "../../core/level/testKit.ts";
import { createEditorCellStreaming } from "./cellStreaming.ts";
import { createLiveRefresh } from "./liveRefresh.ts";

function setup() {
  const read = createOptions(true);
  const doc = normalizeLevel({ schema: "forge.level/1", id: levelId("1"), settings: { cellSize: 128, loadRange: 128 }, actors: [
    { id: actorId("a"), name: "near", transform: { p: [10, 0, 10] } },
    { id: actorId("b"), name: "far", transform: { p: [1300, 0, 10] } },
  ] }, read).value!;
  const parts = splitLevel(doc, read);
  const index = { schema: "forge.levelCells/1" as const, level: doc.id, persistent: "1111111111111111", cells: Object.fromEntries(parts.cells.map((cell) => [cell.cell, "2222222222222222"])) };
  const level = openLevelSession({ folder: "level", persistent: parts.persistent, persistentRevision: index.persistent, index }, read);
  const files = new Map(parts.cells.map((cell) => [`level/cells/${cell.cell}.json`, JSON.stringify(cell)]));
  files.set("level/cells.json", JSON.stringify(index));
  const reads: string[] = [];
  const client = { read: async (path: string) => { reads.push(path); const text = files.get(path); return text ? { text, revision: "2222222222222222" } : null; } } as SaveClient;
  const errors: string[] = [];
  const streaming = createEditorCellStreaming({ level, client, read, status: (message) => errors.push(message) });
  return { level, files, reads, errors, streaming };
}

const flush = async () => { for (let n = 0; n < 8; n++) await Promise.resolve(); };

test("camera cells enter and leave; dirty cells survive until saved, explicit held cells survive the camera", async () => {
  const { level, streaming, errors } = setup();
  streaming.update([10, 10]); await flush();
  expect(level.actor(actorId("a"))).toBeDefined();
  expect(level.actor(actorId("b"))).toBeUndefined();
  const near = level.actor(actorId("a"))!;
  expect(level.edit("rename", (tx) => tx.setActor({ ...near, name: "changed" })).ok).toBe(true);
  streaming.update([1300, 10]); await flush();
  expect(level.actor(actorId("a"))?.name).toBe("changed");
  expect(level.actor(actorId("b"))).toBeDefined();
  const plan = level.planSave(); expect(plan.status).toBe("ready");
  if (plan.status === "ready") level.applySaveResult(plan, { status: "saved", warnings: [], files: plan.request.writes.map((write) => ({ path: write.path, revision: "3333333333333333" })) });
  streaming.update([1300, 10]);
  expect(level.actor(actorId("a"))).toBeUndefined();
  expect(await streaming.load(["0_0"])).toBe(true);
  streaming.update([1300, 10]);
  expect(level.actor(actorId("a"))).toBeDefined();
  streaming.hold(["0_0"], false); streaming.update([1300, 10]);
  expect(level.actor(actorId("a"))).toBeUndefined();
  expect(errors).toEqual([]); streaming.dispose();
});

test("disk changes in an unloaded cell refresh its index without conflicting with another cell's edits", async () => {
  const { level, streaming, files, reads } = setup();
  streaming.update([10, 10]); await flush();
  level.edit("rename", (tx) => tx.setActor({ ...level.actor(actorId("a"))!, name: "mine" }));
  const far = JSON.parse(files.get("level/cells/10_0.json")!);
  far.actors[0].name = "disk"; files.set("level/cells/10_0.json", JSON.stringify(far));
  const conflicts: string[] = [];
  const editor = { level, streaming, dirty: () => level.dirtyActors().length, idle: async () => {}, readDisk: async () => { throw new Error("must not read loaded actors"); }, rebase: () => { throw new Error("must not rebase"); } };
  const live = createLiveRefresh({ editor: editor as never, strip: { show: (message) => conflicts.push(message) }, status: () => {} });
  await live.handle([{ path: "level/cells/10_0.json", revision: "4444444444444444" }]);
  expect(conflicts).toEqual([]);
  expect(reads).not.toContain("level/cells/10_0.json");
  streaming.update([1300, 10]); await flush();
  expect(level.actor(actorId("b"))?.name).toBe("disk");
  expect(level.actor(actorId("a"))?.name).toBe("mine");
  streaming.dispose();
});

test("failed reads do not create actors; manual Load retries, disposed pending reads cannot join", async () => {
  const { level, streaming, files } = setup();
  const file = files.get("level/cells/0_0.json")!; files.delete("level/cells/0_0.json");
  streaming.update([10, 10]); await flush();
  expect(streaming.cells().find((cell) => cell.key === "0_0")?.failed).toBe(true);
  expect(level.level.actors).toHaveLength(0);
  files.set("level/cells/0_0.json", file);
  expect(await streaming.load(["0_0"])).toBe(true);
  streaming.update([1300, 10]); streaming.dispose(); await flush();
  expect(level.actor(actorId("b"))).toBeUndefined();
});

test("a dragged held rectangle loads remote cells and shares its terrain bounds until released", async () => {
  const { level, streaming } = setup();
  const bounds = { minX: 1280, minZ: 0, maxX: 1408, maxZ: 128 };
  streaming.holdRegion(bounds); streaming.update([10, 10]); await flush();
  expect(level.actor(actorId("b"))).toBeDefined();
  expect(streaming.regions()).toEqual([bounds]);
  streaming.holdRegion(null); streaming.update([10, 10]);
  expect(level.actor(actorId("b"))).toBeUndefined();
  streaming.dispose();
});
