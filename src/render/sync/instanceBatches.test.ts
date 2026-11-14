import { describe, expect, test } from "vitest";
import { BoxGeometry, Color, Group, Matrix4, MeshStandardNodeMaterial } from "three/webgpu";
import { createInstanceBatch, instanceColorOver } from "./instanceBatches.ts";
import { actorOfHit, instanceActorsOf } from "./pickTags.ts";

const at = (x: number) => new Matrix4().makeTranslation(x, 0, 0);

function batch() {
  const parent = new Group();
  const material = new MeshStandardNodeMaterial({ color: "#ffffff" });
  const instances = createInstanceBatch({ name: "test", parent, castShadow: true });
  instances.setParts([{ geometry: new BoxGeometry(1, 1, 1), material, local: new Matrix4().makeScale(2, 2, 2), name: "box" }]);
  return { parent, material, instances };
}

describe("instance batches", () => {
  test("nothing is drawn before parts arrive; placements set before them draw once they do", () => {
    const parent = new Group();
    const instances = createInstanceBatch({ name: "late", parent, castShadow: false });
    instances.set("a", at(1), null, "act_1");
    instances.flush();
    expect(parent.children).toEqual([]);
    instances.setParts([{ geometry: new BoxGeometry(), material: new MeshStandardNodeMaterial(), local: new Matrix4(), name: "box" }]);
    instances.flush();
    expect(instances.meshes).toHaveLength(1);
    expect(instances.meshes[0]!.count).toBe(1);
  });

  test("instance matrix = placement x the part's matrix in the template", () => {
    const { instances } = batch();
    instances.set("a", at(5), null, "act_1");
    instances.flush();
    const out = new Matrix4();
    instances.meshes[0]!.getMatrixAt(0, out);
    expect(out.equals(at(5).multiply(new Matrix4().makeScale(2, 2, 2)))).toBe(true);
  });

  test("buffers are rewritten in place until the capacity grows or the colour buffer comes", () => {
    const { parent, instances } = batch();
    for (let i = 0; i < 16; i += 1) instances.set(`p${i}`, at(i), null, "act_1");
    instances.flush();
    const first = instances.meshes[0];
    instances.delete("p3");
    instances.set("p0", at(-1), null, "act_1");
    instances.flush();
    expect(instances.meshes[0]).toBe(first);
    expect(first!.count).toBe(15);
    instances.set("p99", at(99), null, "act_1");
    instances.set("p100", at(100), null, "act_1");
    instances.flush();
    expect(instances.meshes[0]).not.toBe(first);
    expect(instances.meshes[0]!.instanceMatrix.count).toBe(32);
    const grown = instances.meshes[0];
    instances.set("p0", at(0), "#336699", "act_1");
    instances.flush();
    expect(instances.meshes[0]).not.toBe(grown);
    expect(instances.meshes[0]!.instanceColor).not.toBeNull();
    expect(parent.children).toHaveLength(1);
  });

  test("the last placement going leaves nothing drawn; dispose removes the meshes", () => {
    const { parent, instances } = batch();
    instances.set("a", at(0), null, "act_1");
    instances.flush();
    instances.delete("a");
    instances.flush();
    expect(parent.children).toEqual([]);
    instances.set("b", at(0), null, "act_1");
    instances.flush();
    instances.dispose();
    expect(parent.children).toEqual([]);
    expect(instances.size).toBe(0);
  });

  test("each mesh carries its instance -> actor table, in instance order, rebuilt with the batch", () => {
    const { instances } = batch();
    instances.set("act_a/mesh", at(0), null, "act_a");
    instances.set("act_b/mesh", at(1), null, "act_b");
    instances.set("act_c/mesh", at(2), null, "act_c");
    instances.flush();
    const mesh = instances.meshes[0]!;
    expect(instanceActorsOf(mesh)).toEqual(["act_a", "act_b", "act_c"]);
    expect(actorOfHit({ object: mesh, instanceId: 1 })).toBe("act_b");
    instances.delete("act_a/mesh");
    instances.flush();
    expect(actorOfHit({ object: mesh, instanceId: 1 })).toBe("act_c");
  });

  test("the instance colour divides by the material's base colour; a zero channel keeps the colour", () => {
    const shown = instanceColorOver(new Color(0.5, 0.25, 0.8), new Color(0.5, 0.5, 0));
    expect(shown.toArray()).toEqual([1, 0.5, 0.8]);
    expect(instanceColorOver(new Color(0.2, 0.3, 0.4), null).toArray()).toEqual([0.2, 0.3, 0.4]);
  });
});
