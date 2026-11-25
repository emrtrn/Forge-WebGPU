import { describe, expect, test } from "vitest";
import type { ActorId, Vec3 } from "../../core/index.ts";
import { createTerrainEditWorld } from "../../engine/terrain/terrainEdit.ts";
import { createTerrainEditing, type EditableTerrain } from "../../engine/terrain/terrainEditing.ts";
import { TerrainEditSession } from "../../engine/terrain/terrainEditSession.ts";
import { createFlatWorldTerrain } from "../../engine/terrain/worldTerrainCreate.ts";
import type { EditorSession, SessionStep } from "../session/editorSession.ts";
import { clickIds, segmentFormValue, segmentPatch } from "./landscapeSplinePanel.ts";
import { createLandscapeSplines } from "./landscapeSplines.ts";

const ACTOR = "act_00000000000000000000000000000001" as ActorId;

/** A 2 × 1 terrain (128 m × 64 m, flat at 0) drawn in a fake editor. */
function setup() {
  const flat = createFlatWorldTerrain({ name: "hill", tilesX: 2, tilesZ: 1, tileQuads: 64, spacing: 1, baseHeight: 0 });
  flat.def.origin = [0, 0, 0];
  const world = createTerrainEditWorld(flat.def, []);
  const session = new TerrainEditSession(world, { document: "d", global: "g" });
  for (const [key, tile] of flat.tiles) {
    world.tiles.set(key, tile);
    session.recordTile(key, tile, "f32", `t${key}`);
  }
  const editing = createTerrainEditing({ mode: "splines" });
  const calls = { splines: 0, held: 0 };
  const terrain: EditableTerrain = {
    actor: ACTOR, component: "terrain", guid: "g", session, streams: false,
    changed: () => {},
    definitionChanged: async () => {},
    splinesChanged: () => { calls.splines += 1; },
    roads: () => ({ chunks: 0, pieces: 0, triangles: 0, problems: [], building: false }),
    demand: async () => { calls.held += 1; },
    release: () => { calls.held -= 1; },
  };
  editing.register(terrain);
  const steps: SessionStep[] = [];
  const editor = {
    level: { actor: () => ({ id: ACTOR, locked: false, class: null, components: {} }) },
    pushStep: (step: SessionStep) => steps.push(step),
  } as unknown as EditorSession;
  const messages: string[] = [];
  const splines = createLandscapeSplines({ editor, editing, status: (message) => messages.push(message), assetLabel: () => null, pickAsset: async () => null });
  const heights = (): number => Math.max(...world.tiles.get("0_0")!.heights);
  return { session, editing, splines, steps, calls, messages, heights };
}

describe("Landscape splines (plan 5d step 5)", () => {
  test("Draw puts points on the ground, one undo step each; undo and redo carry the selection and the meshes", async () => {
    const { session, editing, splines, steps, calls } = setup();
    expect(await splines.draw(ACTOR, [10, 99, 20])).toBe(true);
    expect(await splines.draw(ACTOR, [40, 99, 20])).toBe(true);
    expect(splines.list(ACTOR)[0]!.points.map((point) => point.position)).toEqual([[10, 0, 20], [40, 0, 20]]);
    expect(steps.map((step) => step.label)).toEqual(["Add Landscape Spline Point", "Add Landscape Spline Point"]);
    expect([editing.settings.activeSplineId, editing.settings.activeSplinePointId]).toEqual(["spline-1", "point-2"]);
    expect(session.dirty).toBe(true);
    expect(session.dirtyKeys()).toEqual([]);
    expect(calls).toEqual({ splines: 2, held: 0 });
    steps[1]!.undo();
    expect(splines.list(ACTOR)[0]!.points).toHaveLength(1);
    expect(editing.settings.activeSplinePointId).toBe("point-1");
    steps[1]!.redo();
    expect(splines.list(ACTOR)[0]!.segments).toHaveLength(1);
    expect(calls.splines).toBe(4);
    // Outside the terrain nothing is added.
    expect(await splines.draw(ACTOR, [-500, 0, 0])).toBe(false);
  });

  test("a point drag is shown live and is one step; cancelling puts it back", async () => {
    const { splines, steps, calls } = setup();
    await splines.draw(ACTOR, [10, 0, 20]);
    await splines.draw(ACTOR, [40, 0, 20]);
    const at = (): Vec3 => splines.list(ACTOR)[0]!.points[1]!.position;
    splines.drag(ACTOR, [40, 5, 25]);
    expect(at()).toEqual([40, 5, 25]);
    expect(splines.create(ACTOR)).toBe(false);
    splines.undrag(ACTOR);
    expect([at(), steps.length, calls.splines]).toEqual([[40, 0, 20], 2, 2]);
    splines.drag(ACTOR, [40, 5, 25]);
    splines.drag(ACTOR, [40, 6, 25]);
    splines.drop(ACTOR);
    expect([at(), steps.length, calls.splines]).toEqual([[40, 6, 25], 3, 3]);
    steps[2]!.undo();
    expect(at()).toEqual([40, 0, 20]);
    // Back on the ground.
    steps[2]!.redo();
    expect(await splines.snapPoint(ACTOR)).toBe(true);
    expect(at()).toEqual([40, 0, 25]);
  });

  test("Apply Deform and Apply Paint are separate steps on the corridor's tiles; nothing enabled says so", async () => {
    const { session, editing, splines, steps, calls, messages, heights } = setup();
    await splines.draw(ACTOR, [10, 0, 20]);
    await splines.draw(ACTOR, [40, 0, 20]);
    expect(await splines.apply(ACTOR, "deform")).toBe(false);
    expect(messages.at(-1)).toMatch(/No spline deform change/);
    editing.update({ activeSplineSegmentId: "segment-1", splineSegmentIds: ["segment-1"] });
    expect(splines.setSegments(ACTOR, { deform: { enabled: true, targetOffset: 2 } })).toBe(true);
    expect(await splines.apply(ACTOR, "deform")).toBe(true);
    expect(heights()).toBe(2);
    expect(session.dirtyKeys()).toEqual(["0_0"]);
    expect(await splines.apply(ACTOR, "paint")).toBe(false);
    expect(splines.setSegments(ACTOR, { paint: { enabled: true } })).toBe(true);
    expect(await splines.apply(ACTOR, "paint")).toBe(true);
    expect(steps.slice(-3).map((step) => step.label)).toEqual(["Apply Spline Terrain Deform", "Edit Landscape Spline Segments", "Apply Spline Layer Paint"]);
    steps.at(-1)!.undo();
    steps.at(-2)!.undo();
    steps.at(-3)!.undo();
    expect(heights()).toBe(0);
    expect(calls.held).toBe(0);
  });

  test("the panel's several-item picks and the segment form", () => {
    const all = ["a", "b", "c", "d"];
    expect(clickIds(all, ["a"], "a", "c", { ctrl: false, shift: false })).toEqual({ ids: ["c"], active: "c" });
    expect(clickIds(all, ["a"], "a", "c", { ctrl: true, shift: false })).toEqual({ ids: ["a", "c"], active: "c" });
    expect(clickIds(all, ["a", "c"], "c", "c", { ctrl: true, shift: false })).toEqual({ ids: ["a"], active: "a" });
    expect(clickIds(all, ["a"], "a", "a", { ctrl: true, shift: false })).toEqual({ ids: ["a"], active: "a" });
    expect(clickIds(all, ["d"], "d", "b", { ctrl: false, shift: true })).toEqual({ ids: ["b", "c", "d"], active: "b" });
    expect(segmentFormValue({ id: "s", startPointId: "a", endPointId: "b" }, "dirt")).toMatchObject({ deformEnabled: false, deformFlatten: true, paintLayer: "dirt", meshAsset: null, meshFit: true });
    expect(segmentPatch("meshAsset", null)).toEqual({ mesh: { assetId: "" } });
    expect(segmentPatch("deformOffset", 2)).toEqual({ deform: { targetOffset: 2 } });
    expect(segmentPatch("other", 1)).toBeNull();
  });
});
