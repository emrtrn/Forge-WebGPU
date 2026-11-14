import { describe, expect, test } from "vitest";
import { normalizeLevel, openLevelSession, type ActorId, type LevelDoc, type SaveClient } from "../../core/index.ts";
import { actorId, CAR_CLASS_ID, createCarClass, createOptions, levelId } from "../../core/level/testKit.ts";
import { DEFAULT_SNAP } from "../../engine/gizmo/snap.ts";
import { assembleLevel } from "../../runtime/assembler.ts";
import { createWorld } from "../../runtime/world.ts";
import { createEditorCatalog } from "../host/editorCatalog.ts";
import { defineFeatureEditor } from "../host/featureEditor.ts";
import { createEditorSession } from "../session/editorSession.ts";
import { menuCategories } from "./addActorMenu.ts";
import { createActorPlacer, dropPosition, EMPTY_ACTOR, surfacePoint } from "./actorPlacer.ts";

const OPTIONS = createOptions(true);
const crates = defineFeatureEditor({
  feature: "test.crates",
  addActor: [
    { key: "test:box", label: "Box", category: "Shapes", icon: "shapeCube", restOnSurface: true, components: { box: { type: "test.collider@1" } } },
    { key: "test:lamp", label: "Lamp", category: "Lights", icon: "light", lift: 1.5, rotation: [0, 90, 0], components: { driver: { type: "test.driver@1", targetSpeed: 3 } } },
    { key: "test:fog", label: "Fog", category: "Visual Effects", icon: "cloud", components: { fog: { type: "test.fog@2" } } },
  ],
});

let counter = 0;
const newId = (): ActorId => `act_${(0xb00 + (counter += 1)).toString(16).padStart(32, "0")}`;

function open(withFog = false) {
  const level = normalizeLevel(
    { schema: "forge.level/1", id: levelId("1"), actors: withFog ? [{ id: actorId("f"), name: "Fog", class: null, parent: null, spatiallyLoaded: false, transform: {}, components: { fog: { type: "test.fog@2" } } }] : [] },
    OPTIONS,
  ).value as LevelDoc;
  const session = openLevelSession({ folder: "content/levels/x", persistent: level, persistentRevision: null, index: null }, OPTIONS);
  const world = createWorld({ ...OPTIONS, features: [], mode: "editor" });
  world.init();
  assembleLevel(world, session.level, OPTIONS);
  world.beginPlay();
  const editor = createEditorSession({ level: session, world, client: {} as SaveClient });
  const messages: string[] = [];
  const placer = createActorPlacer({
    editor,
    registry: OPTIONS.registry,
    resolveClass: OPTIONS.resolveClass,
    classes: () => [createCarClass(OPTIONS.registry)],
    catalog: createEditorCatalog([crates], OPTIONS.registry),
    // A camera at (0, 10, 10) looking at the origin; nothing drawn (the ground plane is hit).
    viewport: {
      pointerRay: (x) => {
        const [dx, dy, dz] = [x / 100, -10, -10];
        const length = Math.hypot(dx, dy, dz);
        return { origin: [0, 10, 10], direction: [dx / length, dy / length, dz / length] };
      },
      raycast: () => null,
      localBox: () => ({ min: [-0.5, -0.25, -0.5], max: [0.5, 0.25, 0.5] }),
      centre: () => ({ x: 0, y: 0 }),
      nextFrame: async () => {},
    },
    snap: () => DEFAULT_SNAP,
    status: (message) => messages.push(message),
    newId,
  });
  return { editor, placer, messages };
}

describe("where a new actor goes (Forge)", () => {
  test("the hit, else the ground plane ahead, else ten metres along the ray", () => {
    expect(surfacePoint({ origin: [0, 5, 0], direction: [0, -1, 0] }, { point: [1, 2, 3] })).toEqual([1, 2, 3]);
    expect(surfacePoint({ origin: [0, 5, 0], direction: [0, -1, 0] }, null)).toEqual([0, 0, 0]);
    expect(surfacePoint({ origin: [0, 5, 0], direction: [1, 0, 0] }, null)).toEqual([10, 5, 0]);
  });

  test("x / z on the move snap; a light lifted 1,5 m; a mesh's base on the surface", () => {
    const [lamp, box] = [crates.addActor[1]!, crates.addActor[0]!];
    expect(dropPosition([1.4, 2, -0.6], lamp, DEFAULT_SNAP, null)).toEqual([1, 3.5, -1]);
    expect(dropPosition([1.4, 2, -0.6], box, DEFAULT_SNAP, -0.25)).toEqual([1, 2.25, -1]);
    expect(dropPosition([1.4, 2, -0.6], box, { ...DEFAULT_SNAP, moveEnabled: false }, null)).toEqual([1.4, 2, -0.6]);
  });
});

describe("the Add Actor entries and placing", () => {
  test("the features' entries, Empty Actor and the project's classes; singletons are clicked only; categories in Forge's order", () => {
    const { placer } = open();
    const entries = placer.entries();
    expect(entries.map((entry) => entry.key)).toEqual(["test:box", "test:lamp", "test:fog", EMPTY_ACTOR.key, `class:${CAR_CLASS_ID}`]);
    expect(entries.find((entry) => entry.key === "test:fog")?.singleton).toBe(true);
    expect(menuCategories(entries).map((category) => category.label)).toEqual(["Lights", "Shapes", "Visual Effects", "Gameplay", "Classes"]);
  });

  test("a click places at the middle of the viewport, normalised, named, selected, one undo step", async () => {
    const { editor, placer } = open();
    const id = (await placer.click("test:lamp"))!;
    const doc = editor.level.actor(id)!;
    expect(doc.name).toBe("Lamp");
    expect(doc.transform.p).toEqual([0, 1.5, 0]);
    expect(doc.class === null ? doc.components.driver : null).toMatchObject({ targetSpeed: 3, target: null });
    expect(editor.selection.ids()).toEqual([id]);
    expect(editor.world.context.actor(id)).toBeDefined();
    expect(editor.level.actor((await placer.click("test:lamp"))!)?.name).toBe("Lamp 2");
    const car = (await placer.click(`class:${CAR_CLASS_ID}`))!;
    expect(editor.level.actor(car)).toMatchObject({ class: CAR_CLASS_ID, overrides: {} });
    expect(editor.level.history.undoStack).toHaveLength(3);
  });

  test("a singleton the level has is selected instead of a second one", async () => {
    const { editor, placer, messages } = open(true);
    expect(await placer.click("test:fog")).toBe(actorId("f"));
    expect(editor.level.level.actors).toHaveLength(1);
    expect(messages.at(-1)).toMatch(/already has a Fog/);
    expect(placer.dragOver("test:fog", 0, 0)).toBe(false);
  });

  test("a drag shows the actor in the world only; the drop places it with its base on the surface", () => {
    const { editor, placer } = open();
    expect(placer.dragOver("test:box", 0, 0)).toBe(true);
    expect([...editor.world.context.actors()]).toHaveLength(1);
    expect(editor.level.level.actors).toHaveLength(0);
    placer.dragOver("test:box", 140, 0);
    placer.dragLeave();
    expect([...editor.world.context.actors()]).toHaveLength(0);
    placer.dragOver("test:box", 140, 0);
    const id = placer.drop("test:box", 140, 0)!;
    expect(editor.level.actor(id)?.transform.p).toEqual([1, 0.25, 0]);
    expect([...editor.world.context.actors()].map((actor) => actor.id)).toEqual([id]);
    placer.endDrag();
    expect(editor.level.history.undoStack).toHaveLength(1);
  });
});
