import { describe, expect, test } from "vitest";
import { BoxGeometry, Color, Group, InstancedMesh, MeshStandardNodeMaterial, Scene } from "three/webgpu";
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
});
