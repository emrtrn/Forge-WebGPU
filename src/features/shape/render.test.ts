import { describe, expect, test } from "vitest";
import { BoxGeometry, Color, Group, InstancedMesh, Matrix4, MeshStandardNodeMaterial, Scene } from "three/webgpu";
import type { ComponentEntry, WorldActor } from "../../core/index.ts";
import type { WorldResources } from "../../render/resources/worldResources.ts";
import type { RenderBindingContext } from "../../render/sync/renderBinding.ts";
import binding, { SHAPE_BASE_COLOR } from "./render.ts";

function harness(shapes: Record<string, unknown>[]) {
  const actors = shapes.map((data, index) => ({
    id: `act_0000000000000000000000000000000${index + 1}`,
    name: `Shape ${index + 1}`,
    transform: { p: [index, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] },
    components: { shape: { type: "forge.shape@2", parent: null, local: { p: [0, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] }, primitive: "cube", color: "#cccccc", castShadow: true, collision: true, ...data } },
  })) as unknown as WorldActor[];
  const asked: string[] = [];
  const released: string[] = [];
  const resources = {
    shapeGeometry: async (primitive: string) => {
      asked.push(`shape:${primitive}`);
      return new BoxGeometry();
    },
    shapeMaterial: async (color: string, doubleSided: boolean) => {
      asked.push(`material:${color}:${doubleSided}`);
      return new MeshStandardNodeMaterial({ color });
    },
    release: (key: string) => released.push(key),
  } as unknown as WorldResources;
  const root = new Group();
  const ctx = {
    world: { services: null, actor: (id: string) => actors.find((actor) => actor.id === id), componentsOf: () => [] as ComponentEntry[] },
    scene: new Scene(),
    root,
    resources,
  } as unknown as RenderBindingContext;
  const instance = binding.create(ctx);
  instance.actorsAdded?.(actors);
  return { instance, actors, root, asked, released, frame: () => instance.sync?.({ dt: 0, camera: null }) };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("shape binding (instanced)", () => {
  test("shapes of one primitive and shadow switch are one batch on a white material; each draws its own colour", async () => {
    const { root, asked, frame } = harness([{ color: "#ff0000" }, { color: "#00ff00" }, { castShadow: false }, { primitive: "plane" }]);
    await settle();
    frame();
    const meshes = root.children as InstancedMesh[];
    expect(meshes.map((mesh) => [mesh.name, mesh.count, mesh.castShadow])).toEqual([
      ["shape/cube/cube", 2, true],
      ["shape/cube/cube", 1, false],
      ["shape/plane/plane", 1, true],
    ]);
    expect(asked).toContain(`material:${SHAPE_BASE_COLOR}:true`);
    expect(asked.filter((key) => key.startsWith("material:")).every((key) => key.startsWith(`material:${SHAPE_BASE_COLOR}`))).toBe(true);
    const color = new Color();
    meshes[0]!.getColorAt(1, color);
    expect(color.getHexString()).toBe("00ff00");
  });

  test("the last shape of a batch gives its uses back", async () => {
    const { instance, actors, root, released, frame } = harness([{}]);
    await settle();
    frame();
    instance.actorsRemoved?.(actors);
    expect(root.children).toEqual([]);
    expect(released.sort()).toEqual(["shape:cube", `shapeMaterial:${SHAPE_BASE_COLOR}:single`]);
  });

  test("a transform-only change moves the instance in place; any other change rebuilds", async () => {
    const { instance, actors, root, released, frame } = harness([{}]);
    await settle();
    frame();
    const mesh = root.children[0] as InstancedMesh;
    const actor = actors[0]!;
    actor.transform = { p: [7, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] };
    instance.actorsChanged?.([{ actor, previous: actor, transformOnly: true }]);
    frame();
    // The only shape of its batch: no remove + add, so the batch, its mesh and its uses stay.
    expect(root.children).toEqual([mesh]);
    expect(released).toEqual([]);
    const out = new Matrix4();
    mesh.getMatrixAt(0, out);
    expect(out.elements[12]).toBe(7);
    // A field change (another primitive) is removed and added again.
    const next = { ...actor, components: { shape: { ...actor.components.shape!, primitive: "sphere" } } } as WorldActor;
    instance.actorsChanged?.([{ actor: next, previous: actor, transformOnly: false }]);
    await settle();
    frame();
    expect((root.children as InstancedMesh[]).map((child) => child.name)).toEqual(["shape/sphere/sphere"]);
    expect(released.sort()).toEqual(["shape:cube", `shapeMaterial:${SHAPE_BASE_COLOR}:single`]);
  });
});
