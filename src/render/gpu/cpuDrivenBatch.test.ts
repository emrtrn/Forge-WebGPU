import { describe, expect, test } from "vitest";
import { BoxGeometry, Group, Matrix4, MeshBasicNodeMaterial, type InstancedBufferAttribute, type InstancedMesh, type WebGPURenderer } from "three/webgpu";
import { cullInstanceCounts, frustumPlanesOf } from "../../engine/world/instanceCulling.ts";
import { CPU_FADE_KEY, createCpuDrivenBatch } from "./cpuDrivenBatch.ts";

// A camera at the origin looking down -Z, WebGL clip depth (the WebGL2 twin's backend).
const f = 1 / Math.tan(Math.PI / 6);
const projection = [f, 0, 0, 0, 0, f, 0, 0, 0, 0, -1.0002, -1, 0, 0, -0.20002, 0];
const VIEW = { planes: frustumPlanesOf(projection, "minusOneToOne"), origin: [0, 0, 0] as [number, number, number] };
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
    expect(batch.prepare(VIEW)).toEqual([]);

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
    batch.prepare(VIEW);
    expect([near!.count, far!.count]).toEqual([0, 2]);
    batch.dispose();
    expect(parent.children).toEqual([]);
  });
});

