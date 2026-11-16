import { expect, test } from "vitest";
import { createComponent, createSchemaRegistry, normalizeActorClass, normalizeLevel, openLevelSession, splitLevel, type LevelDoc, type SaveClient } from "../../core/index.ts";
import { actorId, assetId, levelId } from "../../core/level/testKit.ts";
import { detailsTarget } from "../../engine/edit/actorFields.ts";
import { planObjectShadows } from "../../engine/edit/objectShadows.ts";
import { DirectionalLight, ShadowSettings } from "../../features/light/schema.ts";
import { Shape } from "../../features/shape/schema.ts";
import { StaticMesh } from "../../features/static-mesh/schema.ts";
import { assembleLevel } from "../../runtime/assembler.ts";
import { createWorld } from "../../runtime/world.ts";
import { createEditorSession } from "../session/editorSession.ts";
import { setObjectShadows, setSceneShadows, shadowSettingsTarget } from "./sceneShadows.ts";

function boot(partial = false) {
  const registry = createSchemaRegistry();
  for (const def of [Shape, StaticMesh, ShadowSettings, DirectionalLight]) registry.registerComponent(def);
  const cls = normalizeActorClass({ schema: "forge.actorClass/1", id: assetId("c"), name: "House", components: {
    mesh: { type: "forge.staticMesh@2", castShadow: false }, shape: { type: "forge.shape@2", castShadow: false },
  } }, { registry, strict: true }).value!;
  const read = { registry, strict: true, resolveClass: (id: string) => id === cls.id ? cls : undefined };
  const level = normalizeLevel({ schema: "forge.level/1", id: levelId("1"), actors: [
    { id: actorId("a"), name: "Default", components: { shape: { type: "forge.shape@2" } } },
    { id: actorId("b"), name: "Disabled", components: { shape: { type: "forge.shape@2", castShadow: false } } },
    { id: actorId("c"), name: "Class", class: cls.id },
    { id: actorId("d"), name: "Light", components: { light: { type: "forge.directionalLight@1", castShadow: false } } },
  ] }, read).value as LevelDoc;
  const split = splitLevel(level, read);
  const session = openLevelSession({ folder: "content/levels/shadows", persistent: split.persistent,
    persistentRevision: "0000000000000001", index: { schema: "forge.levelCells/1", level: level.id, persistent: "0000000000000001",
      cells: Object.fromEntries([...split.cells.map((cell) => [cell.cell, "0000000000000002"]), ...(partial ? [["9_9", "0000000000000003"]] : [])]) },
    cells: split.cells.map((doc) => ({ doc, revision: "0000000000000002" })),
  }, read);
  const world = createWorld({ ...read, features: [], mode: "editor" });
  world.init(); assembleLevel(world, session.level, read); world.beginPlay();
  const editor = createEditorSession({ level: session, world, read, client: {} as SaveClient });
  return { editor, read, cls };
}

test("new object and scene defaults are on; viewing and an on no-op never author settings", () => {
  expect(createComponent(Shape).castShadow).toBe(true);
  expect(createComponent(StaticMesh).castShadow).toBe(true);
  expect(createComponent(ShadowSettings).enabled).toBe(true);
  const { editor, read } = boot();
  expect(shadowSettingsTarget(editor.level.level.actors, read.resolveClass)).toBeNull();
  expect(setSceneShadows(editor, read.resolveClass, true).ok).toBe(true);
  expect(editor.dirty()).toBe(0); expect(editor.canUndo()).toBe(false);
  editor.world.dispose();
});

test("scene gate persists with undo and redo and leaves object preferences unchanged", () => {
  const { editor, read } = boot();
  const before = structuredClone(editor.level.level.actors);
  expect(setSceneShadows(editor, read.resolveClass, false).ok).toBe(true);
  const settings = shadowSettingsTarget(editor.level.level.actors, read.resolveClass)!;
  expect(settings.enabled).toBe(false); expect(settings.target.doc.spatiallyLoaded).toBe(false);
  expect(editor.world.context.componentsOf("forge.shadowSettings")[0]?.component.enabled).toBe(false);
  expect(editor.level.level.actors.filter((actor) => actor.id !== settings.target.doc.id)).toEqual(before);
  const plan = editor.level.planSave();
  expect(plan.status).toBe("ready");
  if (plan.status === "ready") expect(plan.request.writes.some((write) => write.path.endsWith("/level.json"))).toBe(true);
  editor.undo(); expect(shadowSettingsTarget(editor.level.level.actors, read.resolveClass)).toBeNull();
  expect(editor.canUndo()).toBe(false);
  editor.redo(); expect(shadowSettingsTarget(editor.level.level.actors, read.resolveClass)?.enabled).toBe(false);
  setSceneShadows(editor, read.resolveClass, true);
  expect(editor.level.level.actors).toHaveLength(before.length + 1);
  expect(shadowSettingsTarget(editor.level.level.actors, read.resolveClass)?.enabled).toBe(true);
  editor.world.dispose();
});

test("bulk includes hidden class instances, preserves classes and lights, and undoes in one step", () => {
  const { editor, read, cls } = boot();
  const before = structuredClone(editor.level.level.actors), classBefore = structuredClone(cls);
  editor.visibility.set([actorId("c")], true);
  expect(setObjectShadows(editor, read.resolveClass, true).ok).toBe(true);
  const instance = editor.level.actor(actorId("c"))!;
  expect(detailsTarget(instance, read.resolveClass).components.mesh?.castShadow).toBe(true);
  expect(detailsTarget(instance, read.resolveClass).components.shape?.castShadow).toBe(true);
  expect(instance.class !== null && instance.overrides.mesh?.castShadow).toBe(true);
  expect(cls).toEqual(classBefore);
  expect(detailsTarget(editor.level.actor(actorId("d"))!, read.resolveClass).components.light?.castShadow).toBe(false);
  editor.undo(); expect(editor.level.level.actors).toEqual(before); expect(editor.canUndo()).toBe(false);
  editor.redo(); setObjectShadows(editor, read.resolveClass, false);
  expect(planObjectShadows(editor.level.level.actors, read.resolveClass, false)).toEqual([]);
  expect(shadowSettingsTarget(editor.level.level.actors, read.resolveClass)).toBeNull();
  editor.world.dispose();
});

test("bulk refuses unloaded cells atomically and unlocks when all cells load", () => {
  const { editor, read } = boot(true);
  const before = structuredClone(editor.level.level.actors);
  expect(editor.level.unloadedCells()).toEqual(["9_9"]);
  expect(setObjectShadows(editor, read.resolveClass, true).ok).toBe(false);
  expect(editor.level.level.actors).toEqual(before); expect(editor.canUndo()).toBe(false);
  editor.level.loadCells([{ doc: { schema: "forge.levelCell/1", level: editor.level.level.id, cell: "9_9", actors: [] }, revision: "0000000000000003" }]);
  expect(editor.level.unloadedCells()).toEqual([]);
  expect(setObjectShadows(editor, read.resolveClass, true).ok).toBe(true);
  editor.world.dispose();
});
