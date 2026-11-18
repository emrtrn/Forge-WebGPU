import { expect, test, vi } from "vitest";
import { BoxGeometry, DoubleSide, Group, InstancedMesh, Matrix4, Mesh, MeshStandardNodeMaterial, PerspectiveCamera, Raycaster, SphereGeometry, Vector3, type WebGPURenderer } from "three/webgpu";
import { prepareTriangles } from "../../engine/geometry/prepareTriangles.ts";
import { projectedLodStarts, triangleKey } from "../../engine/geometry/triangleData.ts";
import { createGpuDriven } from "../gpu/gpuDriven.ts";
import { actorOfHit, tagInstanceActors, tagPartSlots, slotOfHit } from "../sync/pickTags.ts";
import { triangleInput } from "./triangleSource.ts";
import { createTriangleDrawing } from "./triangleDrawing.ts";
import { createInstanceBatch } from "../sync/instanceBatches.ts";
import { disposeMergedParts, modelParts } from "../resources/modelParts.ts";
import { lodParts } from "./staticPath.ts";

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


test("R9.1: placements come and go on the drawn binding; a growing batch stays drawn until its next set is ready", async () => {
  const renderer = { backend: { isWebGPUBackend: false }, shadowMap: { enabled: false } } as unknown as WebGPURenderer;
  const gpu = createGpuDriven(renderer), triangles = createTriangleDrawing(renderer, gpu, prepareTriangles);
  const parent = new Group(); let hold: Promise<void> | null = null;
  const batch = createInstanceBatch({ name: "r9-edit", parent, castShadow: false, triangles, prepare: () => hold ?? Promise.resolve() });
  const geometry = new SphereGeometry(1, 32, 16), material = new MeshStandardNodeMaterial(), camera = new PerspectiveCamera();
  const at = (x: number) => new Matrix4().makeTranslation(x, 0, 0);
  batch.setParts([{ geometry, material, local: new Matrix4(), name: "sphere" }]);
  for (let i = 0; i < 3; i += 1) batch.set(`p${i}`, at(i), null, "act_r9");
  batch.flush(); await vi.waitFor(() => expect(batch.ready).toBe(true));
  triangles.update(camera, 1);
  const drawn = gpu.stats(), source = batch.meshes[0]!;
  expect(drawn.batches).toBe(1); expect(drawn.instances).toBe(3);
  batch.delete("p1"); batch.set("p3", at(30), "#ff0000", "act_r9"); batch.flush();
  // The colour buffer arriving is a new set; within it, edits keep the binding.
  await vi.waitFor(() => expect(batch.ready).toBe(true));
  triangles.update(camera, 1);
  const coloured = batch.meshes[0]!;
  batch.delete("p0"); batch.set("p4", at(40), null, "act_r9"); batch.set("p5", at(50), null, "act_r9"); batch.flush();
  triangles.update(camera, 1);
  expect(batch.meshes[0]).toBe(coloured); expect(batch.ready).toBe(true);
  expect(gpu.stats()).toMatchObject({ batches: 1, instances: 4 });
  expect(source).not.toBe(coloured);
  // Growth past the capacity (16): the drawn set stays until the new one is prepared.
  let finish!: () => void; hold = new Promise<void>((resolve) => { finish = resolve; });
  for (let i = 6; i < 20; i += 1) batch.set(`p${i}`, at(i * 10), null, "act_r9");
  batch.flush();
  expect(batch.ready).toBe(false); expect(coloured.parent).toBe(parent);
  await vi.waitFor(() => expect(gpu.stats().batches).toBe(2));
  expect(coloured.parent).toBe(parent);
  finish(); await vi.waitFor(() => expect(batch.ready).toBe(true));
  expect(coloured.parent).toBeNull(); expect(gpu.stats().batches).toBe(1);
  triangles.update(camera, 1); expect(gpu.stats().instances).toBe(18);
  batch.dispose(); triangles.dispose(); gpu.dispose(); geometry.dispose(); material.dispose();
});

test("R9.2: a merged slot's LOD comes from its raw primitives' cached chains, never the merged geometry's key", async () => {
  const renderer = { backend: { isWebGPUBackend: false }, shadowMap: { enabled: false } } as unknown as WebGPURenderer;
  const gpu = createGpuDriven(renderer);
  const asked: string[] = [];
  const load = (input: Parameters<typeof prepareTriangles>[0]) => { asked.push(triangleKey(input)); return prepareTriangles(input); };
  const triangles = createTriangleDrawing(renderer, gpu, load);
  const raw = new SphereGeometry(1, 48, 24), material = new MeshStandardNodeMaterial(), scene = new Group();
  const left = new Mesh(raw, material), right = new Mesh(raw, material);
  left.position.x = -3; right.position.x = 3; right.scale.x = -2; scene.add(left, right);
  const parts = modelParts({ scene, slots: [material], slotMaterials: [null] }, [material]);
  expect(parts).toHaveLength(1);
  const part = parts[0]!;
  expect(part.lodPieces?.map((piece) => [piece.vertexOffset, piece.flip, piece.scale])).toEqual([[0, false, 1], [raw.attributes.position!.count, true, 2]]);
  const source = new InstancedMesh(part.geometry, material, 1); source.setMatrixAt(0, new Matrix4());
  const binding = await triangles.prepare(source, undefined, false, part.local, part.lodPieces);
  // The shared raw sphere is read once; the merged geometry is never simplified.
  expect(asked).toEqual([triangleKey(triangleInput(raw))]);
  expect(binding.batch.lodCount).toBeGreaterThan(1);
  binding.dispose(); triangles.dispose(); gpu.dispose(); disposeMergedParts(scene);
});

test("R9.3 / R9b S1: auto keeps light batches instanced whatever their count; a transparent part stays instanced beside LOD parts", async () => {
  const renderer = { backend: { isWebGPUBackend: false }, shadowMap: { enabled: false } } as unknown as WebGPURenderer;
  const gpu = createGpuDriven(renderer), triangles = createTriangleDrawing(renderer, gpu, prepareTriangles);
  const box = new BoxGeometry(), sphere = new SphereGeometry(1, 96, 48); // ~9 k triangles, over the auto threshold
  const opaque = new MeshStandardNodeMaterial(), glass = new MeshStandardNodeMaterial({ transparent: true });
  expect(lodParts("auto", [{ geometry: box, material: opaque }])).toEqual([false]);
  expect(lodParts("auto", [{ geometry: sphere, material: opaque }])).toEqual([true]);
  expect(lodParts("auto", [{ geometry: sphere, material: glass }, { geometry: box, material: opaque }])).toEqual([false, false]);
  expect(lodParts("instanced", [{ geometry: sphere, material: opaque }])).toEqual([false]);
  expect(lodParts("gpu", [{ geometry: box, material: glass }, { geometry: box, material: opaque }])).toEqual([false, true]);
  const parent = new Group();
  const batch = createInstanceBatch({ name: "r9-mixed", parent, castShadow: true, triangles, staticPath: () => "auto", prepare: () => Promise.resolve() });
  batch.setParts([{ geometry: sphere, material: opaque, local: new Matrix4(), name: "body" }, { geometry: box, material: glass, local: new Matrix4(), name: "glass" }], 1);
  batch.set("a", new Matrix4(), null, "act_r9"); batch.flush();
  await vi.waitFor(() => expect(batch.ready).toBe(true));
  const [body, pane] = batch.meshes;
  expect(gpu.stats().batches).toBe(1);
  expect(pane!.material).not.toBe(glass); // faded (instanced) clone of the glass
  expect((body!.material as MeshStandardNodeMaterial).visible).toBe(false); // the LOD source only picks
  expect(pane!.parent).toBe(parent); expect(body!.parent).toBe(parent);
  batch.dispose(); triangles.dispose(); gpu.dispose();
});

test("projected error follows resolution, projection and instance scale, without fixed distance cutoffs", () => {
  const errors = [0, .01, .05];
  expect(projectedLodStarts(errors, 1, 540, true, 1)).toEqual([6.4, 28]);
  expect(projectedLodStarts(errors, 1, 1080, true, 1)).toEqual([11.8, 55]);
  expect(projectedLodStarts(errors, 1, 10, false, 1)).toEqual([0, 0]);
  expect(projectedLodStarts(errors, 1, 100, false, 1)).toEqual([0, 3e38]);
  expect(projectedLodStarts(errors, 1, 100, false, 2)).toEqual([3e38, 3e38]);
});
