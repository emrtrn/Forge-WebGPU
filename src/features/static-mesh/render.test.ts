import { describe, expect, test } from "vitest";
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, MeshStandardNodeMaterial, Object3D, Scene, type Material } from "three/webgpu";
import type { ComponentEntry, WorldActor } from "../../core/index.ts";
import { modelMaterialSlots } from "../../render/resources/modelSetup.ts";
import type { ModelTemplate, WorldResources } from "../../render/resources/worldResources.ts";
import type { RenderBindingContext } from "../../render/sync/renderBinding.ts";
import binding, { assignSlotMaterials, slotMaterialIds } from "./render.ts";

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

/** A world with one static mesh actor, and the resources the binding asks. */
function harness(data: Record<string, unknown>) {
  const { template, body, trim } = twoSlotModel();
  const materials = new Map([[MOSS, new MeshStandardNodeMaterial({ name: "moss" })], [BRICK, new MeshStandardNodeMaterial({ name: "brick" })]]);
  const released: string[] = [];
  const actor = {
    id: "act_00000000000000000000000000000001",
    name: "Rock",
    transform: { p: [0, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] },
    components: { mesh: { type: "forge.staticMesh@2", parent: null, local: { p: [0, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] }, mesh: MODEL, materials: [], color: null, castShadow: true, collision: true, ...data } },
  } as unknown as WorldActor;
  const resources = {
    model: async () => template,
    material: async (guid: string) => materials.get(guid)!,
    materialKey: (guid: string) => `material:${guid}:none`,
    release: (key: string) => released.push(key),
  } as unknown as WorldResources;
  const root = new Group();
  const ctx = {
    world: { services: null, actor: () => actor, componentsOf: () => [] as ComponentEntry[] },
    scene: new Scene(),
    root,
    resources,
    lighting: null,
    quality: () => null,
  } as unknown as RenderBindingContext;
  const instance = binding.create(ctx);
  instance.actorsAdded?.([actor]);
  return { instance, actor, root, released, body, trim, materials };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("static mesh binding", () => {
  test("slot materials, shadows: the model's default slot material, cast as the component says, always received", async () => {
    const { root, body, materials } = harness({ castShadow: false });
    await settle();
    const [placed] = root.children;
    expect(meshMaterials(placed!)).toEqual([body, materials.get(BRICK), body]);
    placed!.traverse((child) => {
      if (child instanceof Mesh) expect([child.castShadow, child.receiveShadow]).toEqual([false, true]);
    });
  });

  // Forge WebGL's placementColor checks (tests/engine/placementColor.test.ts 41, 61), rewritten:
  // a coloured placement draws copies with its colour, owned and disposed with it; an uncoloured one shares.
  test("a placement colour tints its own copies; removing the placement gives its uses back", async () => {
    const { instance, actor, root, released, materials } = harness({ color: "#ff0000", materials: [MOSS] });
    await settle();
    const drawn = meshMaterials(root.children[0]!) as MeshStandardMaterial[];
    expect(drawn.map((material) => material.color.getHexString())).toEqual(["ff0000", "ff0000", "ff0000"]);
    expect(drawn[0]).not.toBe(materials.get(MOSS));
    expect(drawn[0]!.name).toBe("moss");
    expect(materials.get(MOSS)!.color.getHexString()).toBe("ffffff");
    let disposed = 0;
    drawn[0]!.addEventListener("dispose", () => (disposed += 1));
    instance.actorsRemoved?.([actor]);
    expect(root.children).toEqual([]);
    expect(disposed).toBe(1);
    expect(released.sort()).toEqual([`material:${MOSS}:none`, `material:${BRICK}:none`, `model:${MODEL}`]);
  });

  test("an uncoloured placement shares the cached materials", async () => {
    const first = harness({ materials: [MOSS] });
    await settle();
    expect(meshMaterials(first.root.children[0]!)[0]).toBe(first.materials.get(MOSS));
  });
});
