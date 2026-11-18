import { describe, expect, test } from "vitest";
import { BoxGeometry, Color, Group, Matrix4, MeshStandardNodeMaterial, PerspectiveCamera } from "three/webgpu";
import { createInstanceBatch, instanceColorOver } from "./instanceBatches.ts";
import { createInstancedShadowCasters, instancedCasterMask, VISIBLE_CASTER_LAYERS } from "./shadowCasterLayers.ts";
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
  test("detached batches become ready only after preparation; a disposed pending batch never returns", async () => {
    const parent = new Group(); let finish!: () => void, signal: AbortSignal | undefined;
    const instances = createInstanceBatch({ name: "prepare", parent, castShadow: true, prepare: (_meshes, pendingSignal) => new Promise<void>((resolve) => { finish = resolve; signal = pendingSignal; }) });
    const parts = [{ geometry: new BoxGeometry(), material: new MeshStandardNodeMaterial(), local: new Matrix4(), name: "box" }];
    instances.setParts(parts); instances.set("a", at(0), null, "act_1"); instances.flush();
    expect(instances.ready).toBe(false); expect(parent.children).toHaveLength(0);
    finish(); await Promise.resolve();
    expect(instances.ready).toBe(true); expect(parent.children).toHaveLength(1);
    instances.setParts(parts); instances.flush();
    expect(parent.children).toHaveLength(0);
    let released = false; instances.meshes[0]!.addEventListener("dispose", () => { released = true; });
    instances.dispose(); expect(signal?.aborted).toBe(true); expect(released).toBe(false);
    finish(); await Promise.resolve(); expect(released).toBe(true);
    expect(parent.children).toHaveLength(0);
  });
  test("detail fade owns its masks, scales per placement and releases cloned materials", () => {
    const parent = new Group(), material = new MeshStandardNodeMaterial();
    const instances = createInstanceBatch({ name: "detail", parent, castShadow: true });
    instances.setParts([{ geometry: new BoxGeometry(), material, local: new Matrix4().makeScale(.01, .01, .01), name: "cm" }], 1);
    instances.set("a", new Matrix4().makeScale(2, 2, 2), null, "act_1"); instances.flush();
    const mesh = instances.meshes[0]!, faded = mesh.material as MeshStandardNodeMaterial;
    expect(faded).not.toBe(material); expect(material.maskNode).toBeNull();
    expect(faded.maskNode).not.toBeNull(); expect(faded.maskShadowNode).toBe(faded.maskNode);
    const camera = new PerspectiveCamera(); camera.position.z = 300;
    instances.updateCulling(camera, 1); expect(mesh.visible).toBe(true);
    camera.position.z = 450; instances.updateCulling(camera, 1); expect(mesh.visible).toBe(false);
    instances.updateCulling(camera, 2); expect(mesh.visible).toBe(true);
    let disposed = false; faded.addEventListener("dispose", () => { disposed = true; });
    instances.dispose(); expect(disposed).toBe(true);
  });
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

  test("a moved placement rewrites only its matrix: same meshes, colours and actor table; bounds follow", () => {
    const { instances } = batch();
    instances.set("a", at(0), "#336699", "act_a");
    instances.set("b", at(1), null, "act_b");
    instances.flush();
    const mesh = instances.meshes[0]!;
    const colors = mesh.instanceColor;
    const table = instanceActorsOf(mesh);
    expect(instances.move("b", at(40))).toBe(true);
    expect(instances.move("missing", at(1))).toBe(false);
    instances.flush();
    expect(instances.meshes[0]).toBe(mesh);
    expect(mesh.instanceColor).toBe(colors);
    expect(instanceActorsOf(mesh)).toBe(table);
    const out = new Matrix4();
    mesh.getMatrixAt(1, out);
    expect(out.equals(at(40).multiply(new Matrix4().makeScale(2, 2, 2)))).toBe(true);
    mesh.getMatrixAt(0, out);
    expect(out.equals(at(0).multiply(new Matrix4().makeScale(2, 2, 2)))).toBe(true);
    expect(mesh.boundingBox!.max.x).toBe(41);
    // A later full flush keeps the moved matrix.
    instances.set("c", at(2), null, "act_c");
    instances.flush();
    instances.meshes[0]!.getMatrixAt(1, out);
    expect(out.elements[12]).toBe(40);
  });
});

test("caster layers combine zones with scale edits", () => {
  const scene = new Group(), parent = new Group();
  scene.add(parent);
  const shadowCasters = createInstancedShadowCasters();
  const camera = new PerspectiveCamera();
  const profile = { texels: [.1, .2, .4], splits: [10, 30, 100], minTexels: 2 };
  const casters = new Set([camera]);
  const material = new MeshStandardNodeMaterial();
  const instances = createInstanceBatch({ name: "shadow", parent, castShadow: true, shadowCasters });
  instances.setParts([{ geometry: new BoxGeometry(), material, local: new Matrix4(), name: "box" }], undefined, .3);
  instances.set("a", at(0), null, "act_a");
  instances.flush();

  const mesh = instances.meshes[0]!;
  expect((mesh.material as MeshStandardNodeMaterial).maskShadowNode).not.toBeNull();
  expect((mesh.material as MeshStandardNodeMaterial).maskNode).toBeNull();

  shadowCasters.update(scene, camera, profile, casters);
  expect(mesh.layers.mask & VISIBLE_CASTER_LAYERS).not.toBe(0);
  expect(mesh.layers.mask & instancedCasterMask(1)).not.toBe(0);
  expect(mesh.layers.mask & instancedCasterMask(2)).toBe(0);

  instances.move("a", new Matrix4().makeScale(4, 1, 1));
  instances.flush();
  instances.setZoneMode("shadow");
  shadowCasters.update(scene, camera, profile, casters);
  expect(mesh.layers.mask & VISIBLE_CASTER_LAYERS).toBe(0);
  expect(mesh.layers.mask & instancedCasterMask(3)).not.toBe(0);

  instances.setZoneMode("hidden");
  shadowCasters.update(scene, camera, profile, casters);
  expect(mesh.layers.mask & instancedCasterMask(1)).toBe(0);
  expect(shadowCasters.stats()).toEqual(Array.from({ length: 3 }, () => ({ batches: 0, instances: 0 })));

  instances.setZoneMode("visible");
  shadowCasters.update(scene, camera, null, new Set());
  expect(mesh.layers.mask).toBe(1);
  instances.dispose();
});
