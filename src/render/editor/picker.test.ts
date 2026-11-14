import { Box3, BoxGeometry, Group, InstancedMesh, Matrix4, MeshBasicNodeMaterial, PerspectiveCamera, Sprite, SpriteNodeMaterial, Vector2, Vector3 } from "three/webgpu";
import { describe, expect, test } from "vitest";
import { tagActorObject, tagInstanceActors, tagPickSurface } from "../sync/pickTags.ts";
import { createScenePicker } from "./picker.ts";

/** A camera at (0, 5, 10) looking at the origin. */
function camera(): PerspectiveCamera {
  const made = new PerspectiveCamera(44, 1, 0.1, 2000);
  made.position.set(0, 5, 10);
  made.lookAt(0, 0, 0);
  made.updateMatrixWorld();
  return made;
}

function scene() {
  const root = new Group();
  // Two instances of one batch: act_a at the origin, act_b 4 m to the right.
  const batch = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshBasicNodeMaterial(), 2);
  batch.setMatrixAt(0, new Matrix4().makeTranslation(0, 0.5, 0));
  batch.setMatrixAt(1, new Matrix4().makeTranslation(4, 0.5, 0));
  batch.computeBoundingSphere();
  tagInstanceActors(batch, ["act_a", "act_b"]);
  root.add(batch);
  // A flat "terrain" at y = 0 answering rays itself; its own triangles are not its surface.
  const ground = new Group();
  tagActorObject(ground, "act_t");
  tagPickSurface(ground, {
    raycast: (origin, direction, far) => {
      if (direction.y >= 0) return null;
      const distance = -origin.y / direction.y;
      return distance <= far ? distance : null;
    },
    bounds: () => new Box3(new Vector3(-50, 0, -50), new Vector3(50, 0, 50)),
  });
  root.add(ground);
  const helpers = new Group();
  return { root, helpers, picker: createScenePicker(() => root, () => helpers) };
}

/** The device coordinates of a world point seen by the camera. */
const ndcOf = (point: Vector3, view: PerspectiveCamera): Vector2 => {
  const projected = point.clone().project(view);
  return new Vector2(projected.x, projected.y);
};

describe("the editor's picking (plan phase 4 step 3)", () => {
  test("an instance picks its actor; the height field answers where no mesh is", () => {
    const { picker } = scene();
    const view = camera();
    expect(picker.pick(ndcOf(new Vector3(0, 0.5, 0), view), view)?.actor).toBe("act_a");
    expect(picker.pick(ndcOf(new Vector3(4, 0.5, 0), view), view)?.actor).toBe("act_b");
    const ground = picker.pick(ndcOf(new Vector3(-6, 0, 2), view), view);
    expect(ground?.actor).toBe("act_t");
    expect(ground!.point.y).toBeCloseTo(0);
    // Looking up at the sky: nothing.
    const up = camera();
    up.lookAt(0, 50, 0);
    up.updateMatrixWorld();
    expect(picker.pick(new Vector2(0, 0), up)).toBeNull();
  });

  test("a helper icon is drawn over the scene and wins, even behind a mesh", () => {
    const { picker, helpers } = scene();
    const view = camera();
    const icon = new Sprite(new SpriteNodeMaterial());
    icon.position.set(0, 0.5, -3);
    tagActorObject(icon, "act_light");
    helpers.add(icon);
    expect(picker.pick(ndcOf(new Vector3(0, 0.5, -3), view), view)?.actor).toBe("act_light");
  });

  test("bounds cover an actor's instances, its helpers and a surface's own bounds", () => {
    const { picker, helpers } = scene();
    const box = picker.bounds(new Set(["act_b"]))!;
    expect(box.min.toArray()).toEqual([3.5, 0, -0.5]);
    expect(box.max.toArray()).toEqual([4.5, 1, 0.5]);
    expect(picker.bounds(new Set(["act_t"]))!.max.x).toBe(50);
    expect(picker.bounds(new Set(["act_none"]))).toBeNull();
    const icon = new Sprite(new SpriteNodeMaterial());
    icon.position.set(10, 2, 0);
    tagActorObject(icon, "act_light");
    helpers.add(icon);
    expect(picker.bounds(new Set(["act_light"]))!.getCenter(new Vector3()).toArray()).toEqual([10, 2, 0]);
    const parts: number[] = [];
    picker.parts(new Set(["act_a", "act_b", "act_light"]), ({ matrix }) => parts.push(new Vector3().setFromMatrixPosition(matrix).x));
    expect(parts).toEqual([0, 4]);
  });
});
