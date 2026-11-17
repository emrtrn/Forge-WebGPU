// R7 opt-in automatic LOD infrastructure. General static migration is R9.
import { BufferAttribute, BufferGeometry, Group, Matrix4, Vector2, type Camera, type InstancedMesh, type Material, type Object3D, type WebGPURenderer } from "three/webgpu";
import { projectedLodStarts, type TriangleData, type TriangleInput } from "../../engine/geometry/triangleData.ts";
import { detailCullDistance, detailCullWindow } from "../../engine/world/detailCulling.ts";
import { NO_CULL_DISTANCE } from "../../engine/world/instanceCulling.ts";
import type { GpuDrivenDrawing } from "../gpu/gpuDriven.ts";
import type { GpuDrivenBatch } from "../gpu/gpuDrivenBatch.ts";
import { triangleInput } from "./triangleSource.ts";

export interface TriangleBinding {
  readonly path: "gpu" | "cpu";
  readonly source: InstancedMesh;
  readonly objects: readonly Object3D[];
  readonly batch: GpuDrivenBatch;
  activate(): void;
  dispose(): void;
}
export interface TriangleDrawing {
  /** Detached sources retain their CPU geometry / picking tags. Await this
   * preprocessing and the owner's compileAsync before activating. Structural
   * changes replace the binding; transform-only edits update existing buffers.
   * The owner retains sources through compilation, including cancelled work.
   */
  prepare(source: InstancedMesh, detailRadius?: number, bundle?: boolean, local?: Matrix4): Promise<TriangleBinding>;
  update(camera: Camera, qualityScale: number): void;
  dispose(): void;
}

export function createTriangleDrawing(renderer: WebGPURenderer, gpu: GpuDrivenDrawing, load: (input: TriangleInput) => Promise<TriangleData>): TriangleDrawing {
  const bindings = new Set<{ update(qualityScale: number, pixelScale: number, perspective: boolean): void; dispose(): void }>();
  const viewport = new Vector2();
  let disposed = false;
  return {
    async prepare(source, detailRadius, bundle = false, local = new Matrix4()) {
      if (disposed) throw new Error("triangles: drawing disposed");
      if (source.geometry.drawRange.start !== 0 || source.geometry.drawRange.count !== Infinity || Object.keys(source.geometry.morphAttributes).length) throw new Error("triangles: source must be a complete, static triangle primitive");
      const cullDistance = detailRadius === undefined ? null : detailCullDistance(detailRadius);
      const data = await load(triangleInput(source.geometry));
      if (disposed) throw new Error("triangles: drawing disposed during preprocessing");
      const root = new Group(); root.name = `automaticLOD/${source.name}`; root.matrixAutoUpdate = false;
      let active = false, released = false;
      const derived: BufferGeometry[] = [], hidden: Material[] = [];
      const authored = source.material;
      source.geometry.computeBoundingSphere();
      const sphere = source.geometry.boundingSphere!.clone().applyMatrix4(local);
      const localScale = local.getMaxScaleOnAxis();
      const batch = gpu.createBatch({ name: root.name, parent: root, capacity: source.count, bounds: { center: [sphere.center.x, sphere.center.y, sphere.center.z], radius: sphere.radius }, distanceMode: "scaled", castShadow: source.castShadow, bundle,
        ...(source.instanceColor ? { instanceColors: source.instanceColor } : {}),
        lods: data.lods.map((lod, i) => {
          let geometry = source.geometry;
          if (i !== 0) {
            geometry = new BufferGeometry();
            for (const name of Object.keys(source.geometry.attributes)) geometry.setAttribute(name, source.geometry.getAttribute(name));
            geometry.setIndex(new BufferAttribute(Uint32Array.from(lod.indices), 1));
            for (const group of lod.groups ?? []) geometry.addGroup(group.start, group.count, group.materialIndex);
            geometry.boundingSphere = source.geometry.boundingSphere!.clone();
            derived.push(geometry);
          }
          return [{ geometry, material: authored, local, name: source.name }];
        }),
      });
      const handles = batch.instances.addMany(source.instanceMatrix.array, source.count);
      const end = cullDistance ?? NO_CULL_DISTANCE;
      batch.setDistances({ fadeStart: cullDistance === null ? NO_CULL_DISTANCE : end * .8, cullEnd: end, lodStarts: data.lods.slice(1).map(() => NO_CULL_DISTANCE) });
      const planes = new Float32Array(24); for (let i = 3; i < 24; i += 4) planes[i] = 1;
      // Main view and the three shadow cascades exist before readiness.
      batch.prepare(Array.from({ length: source.castShadow ? 4 : 1 }, () => ({ planes, origin: [0, 0, 0] as const })));
      // compileAsync stages and detaches these objects. Preserve their actual
      // draw parents (including the optional bundle) for atomic activation.
      const preparedParents = new Map(batch.allMeshes.map((mesh) => [mesh, mesh.parent]));
      let version = -1, maxScale = 1;
      const matrix = new Matrix4(), inverseLocal = local.clone().invert();
      const owner = {
        update(qualityScale: number, pixelScale: number, perspective: boolean) {
          if (!active || released) return;
          if (root.parent !== source.parent) source.parent?.add(root);
          root.visible = source.visible;
          source.updateWorldMatrix(true, false);
          // Instances are world matrices, including on the CPU twin. The draw
          // root cancels its parent's transform instead of applying it twice.
          root.matrix.copy(source.parent?.matrixWorld ?? new Matrix4()).invert(); root.updateMatrixWorld(true);
          if (source.count !== handles.length) throw new Error("triangles: count changed without rebuilding binding");
          if (source.instanceMatrix.version !== version || !source.matrixWorld.equals(matrix)) {
            const placement = new Matrix4(); maxScale = 0;
            for (let i = 0; i < source.count; i += 1) {
              source.getMatrixAt(i, placement); placement.multiply(inverseLocal).premultiply(source.matrixWorld);
              batch.instances.move(handles[i]!, placement.elements); maxScale = Math.max(maxScale, placement.getMaxScaleOnAxis());
            }
            version = source.instanceMatrix.version; matrix.copy(source.matrixWorld);
          }
          const [, end] = cullDistance === null ? [NO_CULL_DISTANCE, NO_CULL_DISTANCE] : detailCullWindow(cullDistance, qualityScale);
          batch.setDistances({ fadeStart: cullDistance === null ? NO_CULL_DISTANCE : end * .8, cullEnd: end,
            lodStarts: projectedLodStarts(data.lods.map((lod) => lod.error * localScale), sphere.radius + sphere.center.length(), pixelScale, perspective, maxScale),
          });
        },
        dispose() {
          if (released) return; released = true; bindings.delete(owner);
          gpu.removeBatch(batch); root.removeFromParent(); source.material = authored;
          for (const material of hidden) material.dispose();
          for (const geometry of derived) geometry.dispose();
        },
      };
      bindings.add(owner);
      return {
        path: batch.path, source, batch, objects: batch.allMeshes,
        activate() {
          if (released || active) return; active = true;
          for (const [mesh, parent] of preparedParents) parent?.add(mesh);
          const hide = (material: Material): Material => { const clone = material.clone(); clone.visible = false; hidden.push(clone); return clone; };
          source.material = Array.isArray(authored) ? authored.map(hide) : hide(authored);
          source.parent?.add(root);
        },
        dispose: owner.dispose,
      };
    },
    update(camera, qualityScale) {
      renderer.getDrawingBufferSize?.(viewport);
      const pixelScale = Math.abs(camera.projectionMatrix.elements[5]!) * Math.max(1, viewport.y) / 2;
      const perspective = (camera as Camera & { isPerspectiveCamera?: boolean }).isPerspectiveCamera === true;
      for (const binding of bindings) binding.update(qualityScale, pixelScale, perspective);
    },
    dispose() { disposed = true; for (const binding of [...bindings]) binding.dispose(); },
  };
}
