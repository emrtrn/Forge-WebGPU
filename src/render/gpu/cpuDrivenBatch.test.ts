import { describe, expect, test } from "vitest";
import { BoxGeometry, Group, Matrix4, MeshBasicNodeMaterial, StorageBufferAttribute, type InstancedBufferAttribute, type InstancedMesh, type WebGPURenderer } from "three/webgpu";
import { cullInstanceCounts, frustumPlanesOf, mirrorCullView } from "../../engine/world/instanceCulling.ts";
import { CPU_FADE_KEY, createCpuDrivenBatch } from "./cpuDrivenBatch.ts";
import { cameraViewLayer, MAIN_VIEW_LAYER, shadowViewLayer, ZONE_MASK_WORDS } from "./gpuDrivenBatch.ts";

// A camera at the origin looking down -Z, WebGL clip depth (the WebGL2 twin's backend).
const f = 1 / Math.tan(Math.PI / 6);
const projection = [f, 0, 0, 0, 0, f, 0, 0, 0, 0, -1.0002, -1, 0, 0, -0.20002, 0];
const VIEW = { planes: frustumPlanesOf(projection, "minusOneToOne"), origin: [0, 0, 0] as [number, number, number], role: "main" as const, layer: MAIN_VIEW_LAYER };
const at = (x: number, y: number, z: number): number[] => new Matrix4().makeTranslation(x, y, z).toArray();

describe("cpu-driven batch (the WebGL2 twin)", () => {
  test("draws the reference's visible instances per LOD, part matrix and fade applied", () => {
    const parent = new Group();
    const local = new Matrix4().makeTranslation(0, 1, 0);
    const material = new MeshBasicNodeMaterial();
    const geometry = new BoxGeometry();
    const batch = createCpuDrivenBatch({} as WebGPURenderer, {
      name: "test", parent, distanceMode: "origin", bounds: { center: [0, 1, 0], radius: 1 },
      lods: [[{ geometry, material, local, name: "near" }], [{ geometry, material, local, name: "far" }]],
    });
    batch.setDistances({ fadeStart: 40, cullEnd: 60, lodStarts: [20] });
    const handles = batch.instances.addMany([...at(0, 0, -10), ...at(0, 0, 10), ...at(0, 0, -30), ...at(0, 0, -50), ...at(0, 0, -100)], 5);
    batch.instances.setFade(handles[0]!, 0.5);
    expect(batch.prepare([VIEW])).toEqual([]);

    const [near, far] = batch.meshes as InstancedMesh[];
    expect(parent.children).toEqual([near, far]);
    expect([near!.count, far!.count]).toEqual([1, 2]);
    const matrix = new Matrix4();
    near!.getMatrixAt(0, matrix);
    expect(matrix.elements.slice(12, 15)).toEqual([0, 1, -10]);
    far!.getMatrixAt(1, matrix);
    expect(matrix.elements.slice(12, 15)).toEqual([0, 1, -50]);
    // The fade attribute: its own fade 0.5 near; past the band start, the smoothstep (50 m: half).
    const shown = (mesh: InstancedMesh | undefined, slot: number): number => (mesh!.userData[CPU_FADE_KEY] as InstancedBufferAttribute).getX(slot);
    expect(shown(near, 0)).toBe(0.5);
    expect([shown(far, 0), shown(far, 1)]).toEqual([1, 0.5]);
    expect(batch.draws).toBe(2);
    expect(batch.uncountedDraws).toBe(0);
    const reference = cullInstanceCounts(batch.instances.matrices(), 5, batch.cullBatch, VIEW);
    expect(reference.counts).toEqual([1, 2]);

    // Moving out of view and the instance's own changes reach the next frame.
    batch.instances.move(handles[0]!, at(0, 0, 10));
    batch.prepare([VIEW]);
    expect([near!.count, far!.count]).toEqual([0, 2]);
    batch.dispose();
    expect(parent.children).toEqual([]);
  });

  test("staggered foliage fades before culling, with stable ranks after buffer compaction", async () => {
    const parent = new Group();
    const geometry = new BoxGeometry(), material = new MeshBasicNodeMaterial(), local = new Matrix4();
    const batch = createCpuDrivenBatch({} as WebGPURenderer, {
      name: "grass", parent, distanceMode: "origin", bounds: { center: [0, 0, 0], radius: 1 },
      lods: [[{ geometry, material, local, name: "tuft" }]], staggeredFade: true,
    });
    batch.setDistances({ fadeStart: 45, cullEnd: 65, fadeSpread: 30, lodStarts: [] });
    const handles = Array.from({ length: 64 }, (_, seed) => batch.instances.add(at(0, 0, -50), 0, seed));
    batch.prepare([VIEW]);
    const mesh = batch.meshes[0] as InstancedMesh;
    const drawn = (await batch.readCounts({} as WebGPURenderer, 0))[0]!;
    expect(drawn).toBeGreaterThan(0);
    expect(drawn).toBeLessThan(64);
    const shown = mesh.userData[CPU_FADE_KEY] as InstancedBufferAttribute;
    expect(Array.from({ length: drawn }, (_, i) => shown.getX(i)).every(value => value > 0 && value < 1)).toBe(true);
    const extras = batch.instances.extraBuffer.array;
    const lastRank = extras[63 * 4 + 3];
    batch.instances.remove(handles[0]!);
    expect(extras[3]).toBe(lastRank);
    batch.setDistances({ fadeStart: 45, cullEnd: 65, fadeSpread: 0, lodStarts: [] });
    batch.prepare([VIEW]);
    expect((await batch.readCounts({} as WebGPURenderer, 0))[0]).toBe(63);
    expect(shown.getX(0)).toBeCloseTo(0.84375);
    batch.dispose(); geometry.dispose(); material.dispose();
  });

  test("shadow views (5.2): own meshes on their layer, culled by their planes, distances from the main camera", () => {
    const parent = new Group();
    const batch = createCpuDrivenBatch({} as WebGPURenderer, {
      name: "test", parent, distanceMode: "origin", bounds: { center: [0, 0, 0], radius: 1 },
      lods: [[{ geometry: new BoxGeometry(), material: new MeshBasicNodeMaterial(), local: new Matrix4(), name: "part" }]],
    });
    batch.setDistances({ fadeStart: 80, cullEnd: 100, lodStarts: [] });
    batch.instances.addMany([...at(0, 0, -10), ...at(0, 0, 10), ...at(0, 0, -150)], 3);
    // A shadow view looking the other way (+Z), measuring from the main camera.
    const behind = { planes: frustumPlanesOf(new Matrix4().fromArray(projection).multiply(new Matrix4().makeRotationY(Math.PI)).elements, "minusOneToOne"), origin: VIEW.origin, role: "shadow" as const, layer: shadowViewLayer(1) };
    batch.prepare([VIEW, behind]);
    expect(batch.views).toBe(2);
    const [main, shadow] = batch.allMeshes as InstancedMesh[];
    expect([main!.count, shadow!.count]).toEqual([1, 1]);
    expect([main!.castShadow, shadow!.castShadow]).toEqual([false, true]);
    expect([main!.layers.mask, shadow!.layers.mask]).toEqual([1 << MAIN_VIEW_LAYER, 2]);
    expect(batch.lastDraws).toBe(2);
    // Fewer views next frame: the shadow view's meshes stop drawing.
    batch.prepare([VIEW]);
    expect([main!.visible, shadow!.visible]).toEqual([true, false]);
    const noShadow = createCpuDrivenBatch({} as WebGPURenderer, {
      name: "flat", parent, distanceMode: "origin", bounds: { center: [0, 0, 0], radius: 1 }, castShadow: false,
      lods: [[{ geometry: new BoxGeometry(), material: new MeshBasicNodeMaterial(), local: new Matrix4(), name: "part" }]],
    });
    noShadow.prepare([VIEW, behind]);
    expect(noShadow.views).toBe(1);
    batch.dispose(); noShadow.dispose();
  });

  test("camera views (R9a step 1): a mirrored view draws lit on its own layer, culled from the mirrored eye", () => {
    const parent = new Group();
    const batch = createCpuDrivenBatch({} as WebGPURenderer, {
      name: "test", parent, distanceMode: "origin", bounds: { center: [0, 0, 0], radius: 1 }, castShadow: false,
      lods: [[{ geometry: new BoxGeometry(), material: new MeshBasicNodeMaterial(), local: new Matrix4(), name: "part" }]],
    });
    batch.setDistances({ fadeStart: 80, cullEnd: 100, lodStarts: [] });
    // The eye at the origin looking down -Z; a mirror at z = -5 facing it (+Z). One instance beyond the mirror
    // (the eye sees it, its reflection is behind the eye), one behind the eye: only the mirror sees that one.
    batch.instances.addMany([...at(0, 0, -20), ...at(0, 1, 10)], 2);
    const mirrored = { ...mirrorCullView(VIEW, [0, 0, 1, 5]), role: "camera" as const, layer: cameraViewLayer(0) };
    batch.prepare([VIEW, mirrored]);
    expect(batch.views).toBe(2);
    const [main, reflected] = batch.allMeshes as InstancedMesh[];
    expect([main!.count, reflected!.count]).toEqual([1, 1]);
    const matrix = new Matrix4();
    reflected!.getMatrixAt(0, matrix);
    expect(matrix.elements.slice(12, 15)).toEqual([0, 1, 10]);
    expect([reflected!.castShadow, reflected!.receiveShadow, reflected!.layers.mask]).toEqual([false, true, 1 << cameraViewLayer(0)]);
    batch.dispose();
  });

  test("caster size and the last eligible split affect only the shadow view", async () => {
    const batch = createCpuDrivenBatch({} as WebGPURenderer, {
      name: "casters", parent: new Group(), distanceMode: "origin", bounds: { center: [0, 0, 0], radius: 1 },
      lods: [[{ geometry: new BoxGeometry(), material: new MeshBasicNodeMaterial(), local: new Matrix4(), name: "part" }]],
    });
    batch.instances.addMany([...at(0, 0, -8), ...at(0, 0, -9.25), ...at(0, 0, -10),
      ...new Matrix4().makeScale(.25, .25, .25).setPosition(0, 0, -8).elements], 4);
    const first = { ...VIEW, role: "shadow" as const, layer: shadowViewLayer(1), minCasterRadius: .5,
      casterProfile: { texels: [.25, .75], splits: [10, 30], minTexels: 2 } };
    batch.prepare([VIEW, first, { ...first, layer: shadowViewLayer(2), minCasterRadius: 1.5 }]);
    expect(await batch.readCounts({} as WebGPURenderer, 0)).toEqual([4]);
    expect(await batch.readCounts({} as WebGPURenderer, 1)).toEqual([3]);
    expect(await batch.readCounts({} as WebGPURenderer, 2)).toEqual([0]);
    const fade = (batch.allMeshes[1]!.userData[CPU_FADE_KEY] as InstancedBufferAttribute);
    expect([fade.getX(0), fade.getX(1), fade.getX(2)]).toEqual([1, .5, 0]);
    batch.dispose();
  });

  test("zone modes (R9b): shadow-only draws the shadow views alone, hidden draws nothing until visible again", () => {
    const parent = new Group();
    const batch = createCpuDrivenBatch({} as WebGPURenderer, {
      name: "test", parent, distanceMode: "origin", bounds: { center: [0, 0, 0], radius: 1 },
      lods: [[{ geometry: new BoxGeometry(), material: new MeshBasicNodeMaterial(), local: new Matrix4(), name: "part" }]],
    });
    batch.setDistances({ fadeStart: 80, cullEnd: 100, lodStarts: [] });
    batch.instances.addMany(at(0, 0, -10), 1);
    const shadowView = { ...VIEW, role: "shadow" as const, layer: shadowViewLayer(1) };
    const visible = (): boolean[] => (batch.allMeshes as InstancedMesh[]).map((mesh) => mesh.visible);
    batch.prepare([VIEW, shadowView]);
    expect(visible()).toEqual([true, true]);
    batch.setZoneMode("shadow");
    batch.prepare([VIEW, shadowView]);
    expect(visible()).toEqual([false, true]);
    batch.setZoneMode("hidden");
    expect(visible()).toEqual([false, false]);
    batch.setZoneMode("visible");
    batch.prepare([VIEW, shadowView]);
    expect(visible()).toEqual([true, true]);
    batch.dispose();
  });

  test("zone masks (R9b): an instance draws in a view only while its zone's bit is set; slot 0 always", () => {
    const parent = new Group();
    const masks = new StorageBufferAttribute(new Uint32Array(ZONE_MASK_WORDS * 2).fill(0xffffffff), 1);
    const batch = createCpuDrivenBatch({} as WebGPURenderer, {
      name: "test", parent, distanceMode: "origin", bounds: { center: [0, 0, 0], radius: 1 }, zoneMasks: masks,
      lods: [[{ geometry: new BoxGeometry(), material: new MeshBasicNodeMaterial(), local: new Matrix4(), name: "part" }]],
    });
    batch.setDistances({ fadeStart: 80, cullEnd: 100, lodStarts: [] });
    const [, zoned] = batch.instances.addMany([...at(0, 0, -10), ...at(1, 0, -10)], 2);
    batch.instances.setZone(zoned!, 37);
    const shadowView = { ...VIEW, role: "shadow" as const, layer: shadowViewLayer(1) };
    const words = masks.array as Uint32Array;
    words.fill(0); words[0] = 1; words[ZONE_MASK_WORDS] = 1; words[ZONE_MASK_WORDS + 1] = 1 << 5; // shadow: slot 37
    batch.prepare([VIEW, shadowView]);
    const [main, shadow] = batch.allMeshes as InstancedMesh[];
    expect([main!.count, shadow!.count]).toEqual([1, 2]);
    words.fill(0xffffffff);
    batch.prepare([VIEW, shadowView]);
    expect([main!.count, shadow!.count]).toEqual([2, 2]);
    batch.dispose();
  });
});
