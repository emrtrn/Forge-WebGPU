import { expect, test, vi } from "vitest";
import { BoxGeometry, DoubleSide, Group, InstancedMesh, Matrix4, MeshStandardNodeMaterial, PerspectiveCamera, Raycaster, SphereGeometry, Vector3, type WebGPURenderer } from "three/webgpu";
import { prepareTriangles } from "../../engine/geometry/prepareTriangles.ts";
import { projectedLodStarts, triangleKey } from "../../engine/geometry/triangleData.ts";
import { createGpuDriven } from "../gpu/gpuDriven.ts";
import { actorOfHit, tagInstanceActors, tagPartSlots, slotOfHit } from "../sync/pickTags.ts";
import { triangleInput } from "./triangleSource.ts";
import { createTriangleDrawing } from "./triangleDrawing.ts";
import { createInstanceBatch } from "../sync/instanceBatches.ts";

test("deterministic derivatives keep source indices valid, preserve seams and skip small primitives", async () => {
  const small = await prepareTriangles(triangleInput(new BoxGeometry()));
  expect(small.lods).toHaveLength(1);
  const input = triangleInput(new SphereGeometry(8, 64, 32));
  const first = await prepareTriangles(input), second = await prepareTriangles(input);
  expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  expect(first.lods.length).toBeGreaterThan(1);
  first.lods.forEach((lod, i) => { expect(lod.indices.every((index) => index < input.attributes.position!.values.length / 3)).toBe(true); if (i) expect(lod.indices.length).toBeLessThan(first.lods[i - 1]!.indices.length * .85 + 1); });
  expect(triangleKey({ ...input, attributes: Object.fromEntries(Object.entries(input.attributes).reverse()) })).toBe(first.key);

});

test("automatic LOD never moves triangles between authored material groups", async () => {
  const geometry = new SphereGeometry(8, 64, 32), half = geometry.index!.count / 2;
  geometry.addGroup(0, half, 2); geometry.addGroup(half, half, 7);
  const input = triangleInput(geometry), data = await prepareTriangles(input);
  expect(data.lods.length).toBeGreaterThan(1);
  const allowed = [new Set(input.indices.slice(0, half)), new Set(input.indices.slice(half))];
  for (const lod of data.lods) {
    expect(lod.groups!.map((group) => group.materialIndex)).toEqual([2, 7]);
    lod.groups!.forEach((group, i) => expect(lod.indices.slice(group.start, group.start + group.count).every((index) => allowed[i]!.has(index))).toBe(true));
  }
});

test("WebGL fallback keeps the full source for picking, local transforms for fade, and releases only owned resources", async () => {
  const renderer = { backend: { isWebGPUBackend: false }, shadowMap: { enabled: false } } as unknown as WebGPURenderer;
  const gpu = createGpuDriven(renderer), triangles = createTriangleDrawing(renderer, gpu, prepareTriangles);
  const geometry = new SphereGeometry(1, 32, 16), material = new MeshStandardNodeMaterial({ side: DoubleSide });
  const mesh = new InstancedMesh(geometry, material, 1), root = new Group();
  mesh.setMatrixAt(0, new Matrix4().makeScale(.1, .1, .1)); root.add(mesh);
  tagInstanceActors(mesh, ["act_r7"]); tagPartSlots(mesh, [3]);
  let geometryDisposed = false, materialDisposed = false;
  geometry.addEventListener("dispose", () => { geometryDisposed = true; }); material.addEventListener("dispose", () => { materialDisposed = true; });
  const binding = await triangles.prepare(mesh, 1, false, new Matrix4().makeScale(.1, .1, .1));
  const staging = new Group(); staging.add(...binding.objects); staging.clear();
  binding.activate(); triangles.update(new PerspectiveCamera(), 1);
  expect(binding.objects.every((object) => object.parent !== null)).toBe(true);
  expect(binding.path).toBe("cpu"); expect(binding.batch!.cullBatch.cullEnd).toBe(200);
  expect(binding.batch!.instances.matrices()[0]).toBeCloseTo(1);
  const hit = new Raycaster(new Vector3(0, 0, 3), new Vector3(0, 0, -1)).intersectObject(mesh)[0]!;
  expect(actorOfHit(hit)).toBe("act_r7"); expect(slotOfHit(hit)).toBe(3);
  binding.dispose(); expect(mesh.material).toBe(material); expect(gpu.stats().batches).toBe(0);
  expect(geometryDisposed || materialDisposed).toBe(false);
  triangles.dispose(); gpu.dispose(); geometry.dispose(); material.dispose();
});


test("R7 batch readiness includes derivative compilation; cancellation retains in-flight objects", async () => {
  const renderer = { backend: { isWebGPUBackend: false }, shadowMap: { enabled: false } } as unknown as WebGPURenderer;
  const gpu = createGpuDriven(renderer), triangles = createTriangleDrawing(renderer, gpu, prepareTriangles);
  const parent = new Group(); let finish!: () => void, compiling = false;
  const batch = createInstanceBatch({ name: "r7-ready", parent, castShadow: true, triangles, prepare: async (objects) => {
    expect(objects.length).toBeGreaterThan(1); compiling = true;
    await new Promise<void>((resolve) => { finish = resolve; });
  } });
  const geometry = new SphereGeometry(1, 32, 16), material = new MeshStandardNodeMaterial();
  batch.setParts([{geometry, material, local: new Matrix4(), name: "sphere"}], 1);
  batch.set("a", new Matrix4(), null, "act_r7"); batch.flush();
  expect(batch.ready).toBe(false); expect(parent.children).toHaveLength(0);
  await vi.waitFor(() => expect(compiling).toBe(true));
  let released = false; batch.meshes[0]!.addEventListener("dispose", () => { released = true; });
  batch.dispose(); expect(released).toBe(false); expect(gpu.stats().batches).toBe(1);
  finish(); await vi.waitFor(() => expect(released).toBe(true));
  expect(parent.children).toHaveLength(0); expect(gpu.stats().batches).toBe(0);
  triangles.dispose(); gpu.dispose(); geometry.dispose(); material.dispose();
});


test("projected error follows resolution, projection and instance scale, without fixed distance cutoffs", () => {
  const errors = [0, .01, .05];
  expect(projectedLodStarts(errors, 1, 540, true, 1)).toEqual([6.4, 28]);
  expect(projectedLodStarts(errors, 1, 1080, true, 1)).toEqual([11.8, 55]);
  expect(projectedLodStarts(errors, 1, 10, false, 1)).toEqual([0, 0]);
  expect(projectedLodStarts(errors, 1, 100, false, 1)).toEqual([0, 3e38]);
  expect(projectedLodStarts(errors, 1, 100, false, 2)).toEqual([3e38, 3e38]);
});
