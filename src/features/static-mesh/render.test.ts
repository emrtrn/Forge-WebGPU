import { describe, expect, test } from "vitest";
import { BoxGeometry, Color, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, MeshStandardNodeMaterial, Object3D, Scene, Vector3, type Material } from "three/webgpu";
import type { ComponentEntry, WorldActor } from "../../core/index.ts";
import { modelMaterialSlots } from "../../render/resources/modelSetup.ts";
import type { ModelTemplate, WorldResources } from "../../render/resources/worldResources.ts";
import type { RenderBindingContext } from "../../render/sync/renderBinding.ts";
import binding, { assignSlotMaterials, slotMaterialIds, staticMeshBatchKey } from "./render.ts";

const MODEL = "ast_00000000000000000000000000000001";
const MOSS = "ast_00000000000000000000000000000002";
const BRICK = "ast_00000000000000000000000000000003";

function twoSlotModel(): { template: ModelTemplate; body: Material; trim: Material } {
  const body = new MeshStandardMaterial({ name: "Body" });
  const trim = new MeshStandardMaterial({ name: "Trim" });
  const scene = new Group();
  scene.add(new Mesh(new BoxGeometry(1, 1, 1), body), new Mesh(new BoxGeometry(1, 1, 1), trim), new Mesh(new BoxGeometry(1, 1, 1), body));
  return { template: { scene, slots: modelMaterialSlots(scene), slotMaterials: [null, BRICK] }, body, trim };
}

const meshMaterials = (object: Object3D): Material[] => {
  const out: Material[] = [];
  object.traverse((child) => {
    if (child instanceof Mesh) out.push(child.material as Material);
  });
  return out;
};

// Forge WebGL's "static mesh material slots follow unique GLB material order across primitive meshes"
// (tools/engine-tests.ts 19411), rewritten for the model's slot list and the placement's overrides.
describe("static mesh material slots", () => {
  test("slots follow the unique material order; an override replaces only its slot", () => {
    const { template, body, trim } = twoSlotModel();
    expect(template.slots).toEqual([body, trim]);
    const override = new MeshStandardMaterial({ name: "Override Trim" });
    const clone = template.scene.clone();
    assignSlotMaterials(clone, template.slots, [body, override]);
    expect(meshMaterials(clone)).toEqual([body, override, body]);
  });

  test("the placement's override wins over the model's default, which wins over the GLB's", () => {
    const { template } = twoSlotModel();
    expect(slotMaterialIds(template, [])).toEqual([null, BRICK]);
    expect(slotMaterialIds(template, [MOSS, null])).toEqual([MOSS, BRICK]);
    expect(slotMaterialIds(template, [MOSS, MOSS, MOSS])).toEqual([MOSS, MOSS]);
  });
});


/** A world with static mesh actors (one component each), and the resources the binding asks. */
function harness(placements: Record<string, unknown>[]) {
  const { template, body, trim } = twoSlotModel();
  const materials = new Map([[MOSS, new MeshStandardNodeMaterial({ name: "moss", color: "#b9c0c6" })], [BRICK, new MeshStandardNodeMaterial({ name: "brick" })]]);
  const released: string[] = [];
  const actors = placements.map((data, index) => ({
    id: `act_0000000000000000000000000000000${index + 1}`,
    name: `Rock ${index + 1}`,
    transform: { p: [index * 10, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] },
    components: { mesh: { type: "forge.staticMesh@2", parent: null, local: { p: [0, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] }, mesh: MODEL, materials: [], color: null, castShadow: true, collision: true, ...data } },
  })) as unknown as WorldActor[];
  const resources = {
    model: async () => template,
    material: async (guid: string) => materials.get(guid)!,
    materialKey: (guid: string) => `material:${guid}:none`,
    release: (key: string) => released.push(key),
  } as unknown as WorldResources;
  const root = new Group();
  const ctx = {
    world: { services: null, actor: (id: string) => actors.find((actor) => actor.id === id), componentsOf: () => [] as ComponentEntry[] },
    scene: new Scene(),
    root,
    resources,
    lighting: null,
    quality: () => null,
  } as unknown as RenderBindingContext;
  const instance = binding.create(ctx);
  instance.actorsAdded?.(actors);
  const frame = () => instance.sync?.({ dt: 0, camera: null });
  return { instance, actors, root, released, body, trim, materials, frame };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const instanced = (root: Object3D): InstancedMesh[] => root.children.filter((child): child is InstancedMesh => child instanceof InstancedMesh);

describe("static mesh binding (instanced)", () => {
  test("one batch per model: an instanced mesh per part with the slot materials, cast as the component says, always received", async () => {
    const { root, body, materials, frame } = harness([{ castShadow: false }, { castShadow: false }]);
    await settle();
    frame();
    const meshes = instanced(root);
    expect(meshes.map((mesh) => mesh.material)).toEqual([body, materials.get(BRICK), body]);
    for (const mesh of meshes) {
      expect([mesh.count, mesh.castShadow, mesh.receiveShadow]).toEqual([2, false, true]);
    }
    // Instance i is placement i's world matrix times the part's matrix in the model.
    const placed = new Matrix4();
    meshes[0]!.getMatrixAt(1, placed);
    expect(new Vector3().setFromMatrixPosition(placed).toArray()).toEqual([10, 0, 0]);
  });

  test("another shadow switch or slot override is another batch", async () => {
    const { root, frame } = harness([{}, { castShadow: false }, { materials: [MOSS] }]);
    await settle();
    frame();
    expect(instanced(root)).toHaveLength(9);
    expect(staticMeshBatchKey({ mesh: MODEL, materials: [MOSS, null], castShadow: true } as never)).toBe(`${MODEL}|${MOSS},|cast`);
  });

  // Forge WebGL's placementColor checks (tests/engine/placementColor.test.ts 41), rewritten for the batch:
  // a coloured instance shows its colour over the material's, an uncoloured one keeps the material's.
  test("instances show their colour over the material's; uncoloured ones keep it; no colour, no colour buffer", async () => {
    const { root, materials, frame } = harness([{ color: "#f2a65a", materials: [MOSS] }, { materials: [MOSS] }]);
    await settle();
    frame();
    const [mesh] = instanced(root);
    const moss = materials.get(MOSS)!;
    expect(mesh!.material).toBe(moss);
    expect(moss.color.getHexString()).toBe("b9c0c6");
    const shown = (index: number) => {
      const color = new Color();
      mesh!.getColorAt(index, color);
      return color.multiply(moss.color);
    };
    expect(shown(0).getHexString()).toBe("f2a65a");
    expect(shown(1).getHexString()).toBe("b9c0c6");
    const plain = harness([{}]);
    await settle();
    plain.frame();
    expect(instanced(plain.root)[0]!.instanceColor).toBeNull();
  });

  test("removing placements shrinks the batch; the last gives the batch's uses back", async () => {
    const { instance, actors, root, released, frame } = harness([{ materials: [MOSS] }, { materials: [MOSS] }]);
    await settle();
    frame();
    instance.actorsRemoved?.([actors[0]!]);
    frame();
    expect(instanced(root)[0]!.count).toBe(1);
    expect(released).toEqual([]);
    instance.actorsRemoved?.([actors[1]!]);
    expect(root.children).toEqual([]);
    expect(released.sort()).toEqual([`material:${MOSS}:none`, `material:${BRICK}:none`, `model:${MODEL}`]);
  });

  // Forge WebGL's "scene runtime computes local model bounds keyed by asset id" (tools/engine-tests.ts 1996),
  // rewritten: a batch is culled by the bounds of its instances, the part's own extent placed at each.
  test("a batch's bounds cover every instance of the model", async () => {
    const { root, frame } = harness([{}, {}]);
    await settle();
    frame();
    const box = instanced(root)[0]!.boundingBox!;
    expect(box.min.toArray()).toEqual([-0.5, -0.5, -0.5]);
    expect(box.max.toArray()).toEqual([10.5, 0.5, 0.5]);
    expect(instanced(root)[0]!.frustumCulled).toBe(true);
  });
});
