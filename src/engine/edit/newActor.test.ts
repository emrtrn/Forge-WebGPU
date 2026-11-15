import { describe, expect, test } from "vitest";
import { actorId, CAR_CLASS_ID, createOptions } from "../../core/level/testKit.ts";
import { newActorDoc } from "./newActor.ts";

const OPTIONS = createOptions(true);

describe("a new actor (Add Actor, and the agent's add)", () => {
  test("a plain actor: a unique name, spatially loaded, its components at their defaults, rotation from degrees", () => {
    const level = [{ name: "Fog" }, { name: "Fog 2" }] as never;
    const result = newActorDoc({ id: actorId("a"), label: "Fog", components: { fog: { type: "test.fog@1" } }, position: [1, 2, 3], rotation: [0, 90, 0] }, level, OPTIONS);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.doc).toMatchObject({ id: actorId("a"), name: "Fog 3", class: null, parent: null, spatiallyLoaded: true, transform: { p: [1, 2, 3], s: [1, 1, 1] } });
    expect(result.doc.transform.r[1]).toBeCloseTo(Math.SQRT1_2, 9);
    expect(Object.keys((result.doc as { components: Record<string, Record<string, unknown>> }).components.fog!)).toContain("density");
  });

  test("a class actor has no overrides; a name kept as given; a scale and a parent", () => {
    const result = newActorDoc({ label: "Car", uniqueName: false, classId: CAR_CLASS_ID, parent: actorId("d"), position: [0, 0, 0], scale: [2, 2, 2] }, [{ name: "Car" }] as never, OPTIONS);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.doc).toMatchObject({ name: "Car", class: CAR_CLASS_ID, parent: actorId("d"), overrides: {}, transform: { s: [2, 2, 2] } });
    expect(result.doc.id).toMatch(/^act_[0-9a-f]{32}$/);
  });

  test("a component that does not normalise is refused with its issues", () => {
    const result = newActorDoc({ label: "X", components: { x: { type: "test.nothing@1" } }, position: [0, 0, 0] }, [], OPTIONS);
    expect(result.ok).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });
});
