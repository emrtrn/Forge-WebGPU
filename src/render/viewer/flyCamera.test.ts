import { describe, expect, test } from "vitest";
import { BoxGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, PerspectiveCamera, Vector3 } from "three/webgpu";
import { createFlyCamera, FLY_CAMERA_SPEED } from "./flyCamera.ts";
import { sceneRoomBounds } from "./levelViewer.ts";

function camera(): PerspectiveCamera {
  const made = new PerspectiveCamera(44, 1, 0.1, 2000);
  made.position.set(0, 2, 0);
  made.lookAt(0, 2, -10);
  made.updateMatrixWorld();
  return made;
}

describe("viewer fly camera (Forge's default camera controls)", () => {
  test("W moves along the ground facing at 6 m/s; E flies up; releasing stops", () => {
    const view = camera();
    const fly = createFlyCamera(view);
    expect(fly.key("KeyW", true)).toBe(true);
    expect(fly.update(0.5)).toBe(true);
    expect(view.position.z).toBeCloseTo(-FLY_CAMERA_SPEED * 0.5, 9);
    expect(view.position.y).toBe(2);
    fly.key("KeyW", false);
    fly.key("KeyE", true);
    fly.update(1);
    expect(view.position.y).toBeCloseTo(2 + FLY_CAMERA_SPEED, 9);
    fly.release();
    expect(fly.update(1)).toBe(false);
    expect(fly.key("KeyZ", true)).toBe(false);
    expect(fly.touched).toBe(true);
  });

  test("a right-drag turns the view; moving right turns right, and WASD follows the new facing", () => {
    const view = camera();
    const fly = createFlyCamera(view);
    expect(fly.touched).toBe(false);
    fly.look(100, 0);
    fly.update(0.016);
    const facing = view.getWorldDirection(new Vector3());
    // Forge's check: a right-drag of 100 px yaws the default camera right (x > 0.1).
    expect(facing.x).toBeGreaterThan(0.1);
    expect(facing.y).toBeCloseTo(0, 9);
    fly.key("ArrowUp", true);
    fly.update(1);
    expect(view.position.x).toBeGreaterThan(0);
    expect(fly.update(0)).toBe(false);
  });
});

// Forge WebGL's "scene runtime room bounds unions placements and honors asset filters"
// (tools/engine-tests.ts 1737), rewritten: the framing bounds union the placements (an
// instanced batch with all its instances); the terrain, marked not framed, is left out.
describe("viewer framing bounds", () => {
  test("room bounds union the placements and leave the terrain out", () => {
    const root = new Group();
    const room = new InstancedMesh(new BoxGeometry(1, 1, 1).translate(0.5, 0.5, 0.5), new MeshBasicMaterial(), 2);
    room.setMatrixAt(0, new Matrix4().makeTranslation(1, 0, 0));
    room.setMatrixAt(1, new Matrix4().makeTranslation(0, 0, 2));
    room.computeBoundingBox();
    const terrain = new Mesh(new BoxGeometry(1000, 1, 1000), new MeshBasicMaterial());
    terrain.userData.framing = false;
    root.add(room, terrain);
    const bounds = sceneRoomBounds(root);
    expect(bounds.min.toArray()).toEqual([0, 0, 0]);
    expect(bounds.max.toArray()).toEqual([2, 1, 3]);
  });
});
