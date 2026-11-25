import { expect, test } from "vitest";
import { Box3, BoxGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, Object3D, Vector3 } from "three/webgpu";
import type { ActorId } from "../../core/index.ts";
import { tagActorObject, tagInstanceActors, tagPickSurface } from "../sync/pickTags.ts";
import { createSurfaceProbe } from "./surfaceProbe.ts";

const id = (n: number): ActorId => `act_${String(n).padStart(32, "0")}` as ActorId;

/** A flat terrain at 0 (known only for x < 100), a tagged box on it, two instances (one mirrored) and an untagged box. */
function scene(): Group {
  const root = new Group();
  const terrain = new Object3D();
  tagActorObject(terrain, id(1));
  tagPickSurface(terrain, {
    raycast: (origin) => origin.y,
    bounds: () => new Box3(new Vector3(-200, 0, -200), new Vector3(200, 0, 200)),
    normal: (x) => (x < 100 ? [0, 1, 0] : null),
  });
  const box = new Mesh(new BoxGeometry(2, 2, 2), new MeshBasicMaterial());
  box.position.set(10, 1, 0);
  tagActorObject(box, id(2));
  const batch = new InstancedMesh(new BoxGeometry(2, 2, 2), new MeshBasicMaterial(), 2);
  batch.setMatrixAt(0, new Matrix4().makeTranslation(20, 4, 0));
  batch.setMatrixAt(1, new Matrix4().makeTranslation(30, 4, 0).multiply(new Matrix4().makeScale(-1, 1, 1)));
  tagInstanceActors(batch, [id(3), id(4)]);
  const road = new Mesh(new BoxGeometry(2, 2, 2), new MeshBasicMaterial());
  road.position.set(40, 1, 0);
  root.add(terrain, box, batch, road);
  return root;
}

test("the topmost tagged surface under a point, its point and an upward normal", () => {
  const probe = createSurfaceProbe(scene(), { minX: -50, minZ: -50, maxX: 150, maxZ: 50 });
  const at = (x: number, z = 0): [ActorId, number, number] | null => {
    const found = probe(x, z);
    return found && [found.actor, Number(found.point[1].toFixed(5)), Number(found.normal[1].toFixed(5))];
  };
  expect(at(0)).toEqual([id(1), 0, 1]);
  expect(at(10.5, 0.5)).toEqual([id(2), 2, 1]);
  expect(at(20)).toEqual([id(3), 5, 1]);
  expect(at(30)).toEqual([id(4), 5, 1]);
  // Not tagged (a terrain's spline meshes): the ground under it.
  expect(at(40)).toEqual([id(1), 0, 1]);
  // The terrain's tile is not loaded there.
  expect(at(120)).toBeNull();
});

test("only what overlaps the area is gathered", () => {
  const probe = createSurfaceProbe(scene(), { minX: -5, minZ: -5, maxX: 5, maxZ: 5 });
  expect(probe(0, 0)?.actor).toBe(id(1));
  expect(createSurfaceProbe(null, { minX: 0, minZ: 0, maxX: 1, maxZ: 1 })(0, 0)).toBeNull();
});
