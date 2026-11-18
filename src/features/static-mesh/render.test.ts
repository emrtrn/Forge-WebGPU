import { describe, expect, test } from "vitest";
import { BoxGeometry, Color, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, MeshStandardNodeMaterial, Object3D, Scene, Vector3, type Material } from "three/webgpu";
import type { ComponentEntry, WorldActor } from "../../core/index.ts";
import { modelMaterialSlots } from "../../render/resources/modelSetup.ts";
import type { ModelTemplate, WorldResources } from "../../render/resources/worldResources.ts";
import type { RenderBindingContext } from "../../render/sync/renderBinding.ts";
import { slotOfHit } from "../../render/sync/pickTags.ts";
import { createZoneDrawing, type ZoneDrawing } from "../../render/sync/zoneDrawing.ts";
import binding, { assignSlotMaterials, modelParts, slotMaterialIds, staticMeshBatchKey } from "./render.ts";

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
  test("each part knows the model slot it draws, for picking (a dropped material goes to the slot under the pointer)", () => {
    const { template, body, trim } = twoSlotModel();
    const parts = modelParts(template, [body, trim]);
    // The two body boxes merge into one slot geometry (plan 5c R8.1).
    expect(parts.map((part) => part.slots)).toEqual([[0], [1]]);
    const mesh = new InstancedMesh(parts[1]!.geometry, parts[1]!.material, 1);
    expect(slotOfHit({ object: mesh, face: { materialIndex: 0 } })).toBeNull();
    mesh.userData.forgePickSlots = parts[1]!.slots;
    expect(slotOfHit({ object: mesh, face: { materialIndex: 0 } })).toBe(1);
  });

  test("slot merging bakes matrices, keeps mirrored winding outward and splits multi-material groups (plan 5c R8.1)", () => {
    const body = new MeshStandardMaterial({ name: "Body" }), trim = new MeshStandardMaterial({ name: "Trim" });
    const scene = new Group();
    const left = new Mesh(new BoxGeometry(1, 1, 1), body);
    left.position.set(-5, 0, 0);
    const mirrored = new Mesh(new BoxGeometry(1, 1, 1), body);
    mirrored.position.set(5, 0, 0);
    mirrored.scale.set(-1, 1, 1);
    // BoxGeometry has six groups (materialIndex 0..5): faces 0-1 trim, the rest body.
    const multi = new Mesh(new BoxGeometry(1, 1, 1), [trim, trim, body, body, body, body]);
    multi.position.set(0, 0, 5);
    scene.add(left, mirrored, multi);
    const template: ModelTemplate = { scene, slots: modelMaterialSlots(scene), slotMaterials: [] };
    const parts = modelParts(template, []);
    expect(parts.map((part) => [part.slots, part.material])).toEqual([[[0], body], [[1], trim]]);
    const [merged, trimPart] = parts;
    expect(merged!.local.equals(new Matrix4())).toBe(true);
    expect(merged!.geometry.index!.count).toBe(36 + 36 + 24);
    expect(trimPart!.geometry.index!.count).toBe(12);
    merged!.geometry.computeBoundingBox();
    expect(merged!.geometry.boundingBox!.min.x).toBeCloseTo(-5.5);
    expect(merged!.geometry.boundingBox!.max.x).toBeCloseTo(5.5);
    // Every merged triangle faces away from its own box's centre (winding kept outward).
    const p = merged!.geometry.getAttribute("position"), index = merged!.geometry.index!;
    const corner = (i: number) => new Vector3().fromBufferAttribute(p, index.getX(i));
    for (let t = 0; t < index.count / 3; t += 1) {
      const [a, b, c] = [corner(3 * t), corner(3 * t + 1), corner(3 * t + 2)];
      const normal = new Vector3().subVectors(b, a).cross(new Vector3().subVectors(c, a));
      const centre = new Vector3(Math.round(a.x / 5) * 5, 0, Math.round(a.z / 5) * 5);
      expect(normal.dot(new Vector3().subVectors(a, centre))).toBeGreaterThan(0);
    }
    // Merged once per template: the same geometry on every ask.
    expect(modelParts(template, [])[0]!.geometry).toBe(merged!.geometry);
  });

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
function harness(placements: Record<string, unknown>[], zones?: ZoneDrawing, modelBounds?: RenderBindingContext["modelBounds"]) {
  const { template, body, trim } = twoSlotModel();
  const materials = new Map([[MOSS, new MeshStandardNodeMaterial({ name: "moss", color: "#b9c0c6" })], [BRICK, new MeshStandardNodeMaterial({ name: "brick" })]]);
  const released: string[] = [];
  const loaded: string[] = [];
  const actors = placements.map((data, index) => ({
    id: `act_0000000000000000000000000000000${index + 1}`,
    name: `Rock ${index + 1}`,
    transform: { p: [index * 10, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] },
    components: { mesh: { type: "forge.staticMesh@2", parent: null, local: { p: [0, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] }, mesh: MODEL, materials: [], color: null, castShadow: true, collision: true, ...data } },
  })) as unknown as WorldActor[];
  const resources = {
    model: async (guid: string) => { loaded.push(guid); return template; },
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
    ...(zones ? { zones } : {}),
    ...(modelBounds ? { modelBounds } : {}),
    quality: () => ({ foliageCullDistanceScale: 1 }),
  } as unknown as RenderBindingContext;
  const instance = binding.create(ctx);
  instance.actorsAdded?.(actors);
  const frame = () => instance.sync?.({ dt: 0, camera: null });
  return { instance, actors, root, loaded, released, body, trim, materials, frame };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const instanced = (root: Object3D): InstancedMesh[] => root.children.filter((child): child is InstancedMesh => child instanceof InstancedMesh);

test("rekeys model placements after loading bounds and leaves a protruding model unzoned", async () => {
  const zone = {
    id: "act_a0000000000000000000000000000001", parent: null,
    transform: { p: [4.9, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] },
    components: { zone: { type: "forge.zone@1", parent: null, size: [10.9, 3, 3] } },
  } as unknown as WorldActor;
  const zones = createZoneDrawing({
    services: null as unknown as RenderBindingContext["world"]["services"],
    actor: () => zone,
    componentsOf: (type) => type === "forge.zone" ? [{ actor: zone, key: "zone", component: zone.components.zone! }] : [],
  });
  zones.refresh([zone]);

  const { instance, root, frame } = harness([{}, {}], zones);
  expect(zones.stats().tracked).toBe(0);
  await settle();
  frame();
  expect(zones.stats().tracked).toBe(1);
  expect(instanced(root).map(mesh => mesh.count)).toEqual([1, 1, 1, 1]);
  instance.dispose?.();
  expect(zones.stats().tracked).toBe(0);
});

test("an indexed interior model stays unloaded until prefetch and releases its cache uses on departure", async () => {
  const zone = {
    id: "room", parent: null, transform: { p: [0, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] },
    components: { zone: { type: "forge.zone@1", parent: null, size: [4, 4, 4] } },
  } as unknown as WorldActor;
  const door = {
    id: "door", parent: null, transform: { p: [0, 0, -2], r: [0, 0, 0, 1], s: [1, 1, 1] },
    components: { portal: { type: "forge.portal@1", parent: null, size: [2, 2], zoneA: zone.id, zoneB: null } },
  } as unknown as WorldActor;
  const zones = createZoneDrawing({
    services: null as unknown as RenderBindingContext["world"]["services"],
    actor: (id) => id === zone.id ? zone : door,
    componentsOf: (type) => type === "forge.zone" ? [{ actor: zone, key: "zone", component: zone.components.zone! }]
      : type === "forge.portal" ? [{ actor: door, key: "portal", component: door.components.portal! }] : [],
  }, () => 1);
  zones.refresh([zone, door]);
  const { actors, loaded, released, frame, instance, root } = harness([{}], zones,
    () => ({ min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] }));
  zones.residency!.update([0, 0, -70]);
  expect(loaded).toEqual([]);
  zones.residency!.update([0, 0, -57]);
  expect(loaded).toEqual([MODEL]);
  expect(instance.isActorReady?.(actors[0]!.id)).toBe(true);
  await settle();
  frame();
  expect(zones.residency?.inspect(zone.id)).toMatchObject({ phase: "prefetch", resident: 1, ready: 1 });
  zones.residency!.update([0, 0, 0]);
  expect(loaded).toEqual([MODEL]);
  zones.residency!.update([0, 0, -55]);
  expect(released).toEqual([`model:${MODEL}`, `material:${BRICK}:none`]);
  expect(instanced(root)).toHaveLength(0);
  instance.dispose?.();
});

describe("static mesh binding (instanced)", () => {
  test("one batch per model: an instanced mesh per part with the slot materials, cast as the component says, always received", async () => {
    const { root, body, materials, frame } = harness([{ castShadow: false }, { castShadow: false }]);
    await settle();
    frame();
    const meshes = instanced(root);
    expect(meshes[0]!.material).toBe(body);
    expect((meshes[1]!.material as Material).name).toBe(materials.get(BRICK)!.name);
    expect((meshes[1]!.material as MeshStandardNodeMaterial).maskNode).not.toBeNull();
    expect(materials.get(BRICK)!.maskNode).toBeNull();
    // The model's two body boxes are one merged slot mesh (plan 5c R8.1).
    expect(meshes).toHaveLength(2);
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
    expect(instanced(root)).toHaveLength(6);
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
    expect((mesh!.material as MeshStandardNodeMaterial).color).toEqual(moss.color);
    expect((mesh!.material as MeshStandardNodeMaterial).maskShadowNode).not.toBeNull();
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

  test("a transform-only change moves the placement in place: the model is not released and asked again", async () => {
    const { instance, actors, root, released, frame } = harness([{}]);
    await settle();
    frame();
    const meshes = instanced(root);
    const actor = actors[0]!;
    actor.transform = { p: [3, 2, 1], r: [0, 0, 0, 1], s: [1, 1, 1] };
    instance.actorsChanged?.([{ actor, previous: actor, transformOnly: true }]);
    frame();
    expect(instanced(root)).toEqual(meshes);
    expect(released).toEqual([]);
    expect(meshes[0]!.boundingBox!.min.toArray()).toEqual([2.5, 1.5, 0.5]);
  });
});
