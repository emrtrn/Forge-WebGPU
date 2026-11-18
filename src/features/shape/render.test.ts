import { describe, expect, test } from "vitest";
import { BoxGeometry, Color, Group, InstancedMesh, Matrix4, MeshStandardNodeMaterial, PerspectiveCamera, Scene } from "three/webgpu";
import type { ComponentEntry, WorldActor } from "../../core/index.ts";
import type { WorldResources } from "../../render/resources/worldResources.ts";
import { ZONE_HIDDEN_LAYER, ZONE_SHADOW_LAYER } from "../../render/gpu/gpuDrivenBatch.ts";
import type { RenderBindingContext, RenderWorldView } from "../../render/sync/renderBinding.ts";
import { createZoneDrawing, type ZoneDrawing } from "../../render/sync/zoneDrawing.ts";
import binding, { SHAPE_BASE_COLOR } from "./render.ts";

function harness(shapes: Record<string, unknown>[], cellSize = 0, zones?: ZoneDrawing) {
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
    staticCellSize: () => cellSize,
    ...(zones ? { zones } : {}),
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

  test("cells (R9a): a batch holds one cell's shapes; a move within its cell stays, into another cell changes batch", async () => {
    // Shapes at x = 0, 1, 2 with 2 m cells: cells 0, 0, 1.
    const { instance, actors, root, frame } = harness([{}, {}, {}], 2);
    await settle();
    frame();
    const counts = (): number[] => (root.children as InstancedMesh[]).map((mesh) => mesh.count).sort();
    expect(counts()).toEqual([1, 2]);
    const second = actors[1]!;
    second.transform = { p: [1.5, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] };
    instance.actorsChanged?.([{ actor: second, previous: second, transformOnly: true }]);
    frame();
    expect(counts()).toEqual([1, 2]);
    second.transform = { p: [3, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] };
    instance.actorsChanged?.([{ actor: second, previous: second, transformOnly: true }]);
    await settle();
    frame();
    expect(counts()).toEqual([1, 2]);
    const out = new Matrix4();
    const moved = (root.children as InstancedMesh[]).find((mesh) => mesh.count === 2)!;
    moved.getMatrixAt(1, out);
    expect([out.elements[12]]).toEqual([3]);
  });

  test("zones (R9b): a batch holds one zone's shapes, hidden zones draw nothing or only their shadow, a zone edit re-keys", async () => {
    // Zone A holds x in [-1, 1.5], zone B x in [1.5, 4]; shapes at x = 0, 1, 2 (A, A, B). No portal joins them.
    const zone = (id: string, x: number, size: number, alwaysCastShadows = false) => ({
      id, name: id, parent: null, transform: { p: [x, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] },
      components: { zone: { type: "forge.zone@1", parent: null, local: { p: [0, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] }, size: [size, 4, 4], zoneName: "", alwaysCastShadows, generated: false } },
    }) as unknown as WorldActor;
    let zoneActors = [zone("act_a0000000000000000000000000000001", 0.25, 2.5), zone("act_b0000000000000000000000000000001", 2.75, 2.5)];
    const view: RenderWorldView = {
      services: null as unknown as RenderWorldView["services"],
      actor: (id) => zoneActors.find((actor) => actor.id === id),
      componentsOf: (type) => (type === "forge.zone" ? zoneActors.map((actor) => ({ actor, key: "zone", component: actor.components.zone! })) : []),
    };
    const zones = createZoneDrawing(view);
    zones.refresh(zoneActors);
    const { root, frame } = harness([{}, {}, {}], 0, zones);
    await settle();
    frame();
    const meshes = (): InstancedMesh[] => root.children as InstancedMesh[];
    expect(meshes().map((mesh) => mesh.count).sort()).toEqual([1, 2]);
    const camera = new PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.set(0, 0, 0); camera.lookAt(10, 0, 0);
    zones.update(camera);
    const layerOf = (count: number): number => meshes().find((mesh) => mesh.count === count)!.layers.mask;
    expect([layerOf(2), layerOf(1)]).toEqual([1, 1 << ZONE_HIDDEN_LAYER]);
    expect(zones.stats()).toMatchObject({ zones: 2, cameraZone: "act_a0000000000000000000000000000001", visible: 1, tracked: 2, hidden: 1 });
    // B always casts: hidden, it still reaches the shadow cameras.
    zoneActors = [zoneActors[0]!, zone("act_b0000000000000000000000000000001", 2.75, 2.5, true)];
    zones.refresh(zoneActors);
    await settle(); frame();
    zones.update(camera);
    expect(layerOf(1)).toBe(1 << ZONE_SHADOW_LAYER);
    // Without zone B the third shape is in no zone: untracked, always drawn.
    zoneActors = [zoneActors[0]!];
    zones.refresh(zoneActors);
    await settle(); frame();
    zones.update(camera);
    expect(meshes().map((mesh) => mesh.count).sort()).toEqual([1, 2]);
    expect(layerOf(1)).toBe(1);
    expect(zones.stats()).toMatchObject({ zones: 1, tracked: 1, hidden: 0 });
  });
});
