// R7 opt-in automatic LOD infrastructure. General static migration is R9.
import { BufferAttribute, BufferGeometry, Group, Matrix4, Vector2, type Box3, type Camera, type InstancedMesh, type Material, type Object3D, type WebGPURenderer } from "three/webgpu";
import { mergeTriangleLods } from "../../engine/geometry/mergeTriangleLods.ts";
import { projectedLodStarts, TRIANGLE_VERSION, type TriangleData, type TriangleInput } from "../../engine/geometry/triangleData.ts";
import { detailCullDistance, detailCullWindow } from "../../engine/world/detailCulling.ts";
import { NO_CULL_DISTANCE } from "../../engine/world/instanceCulling.ts";
import type { ZoneBox } from "../../engine/world/zones.ts";
import type { GpuDrivenDrawing } from "../gpu/gpuDriven.ts";
import { MAIN_VIEW_LAYER, shadowViewLayer, type GpuDrivenBatch } from "../gpu/gpuDrivenBatch.ts";
import { placementBox } from "../sync/batchCells.ts";
import { triangleInput } from "./triangleSource.ts";

/**
 * Where a baked / merged geometry's triangles came from (R9.2): each raw
 * primitive in vertex order. Its automatic LOD chain, cached per raw
 * primitive, is offset into the merged geometry instead of simplifying the
 * merged geometry anew (whose key no cache holds).
 */
export interface LodPiece {
  /** The raw primitive (its LOD cache key). */
  readonly geometry: BufferGeometry;
  readonly vertexOffset: number;
  readonly vertexCount: number;
  /** Mirrored bake: the winding was flipped. */
  readonly flip: boolean;
  /** Largest axis scale of the baked matrix. */
  readonly scale: number;
  /** The piece's index range of the raw primitive (a material group); null for all of it. */
  readonly range: { readonly start: number; readonly count: number } | null;
}

export interface TriangleBinding {
  readonly path: "gpu" | "cpu";
  readonly source: InstancedMesh;
  readonly objects: readonly Object3D[];
  readonly batch: GpuDrivenBatch;
  activate(): void;
  dispose(): void;
}
/** The world's zones as the LOD path needs them (`render/sync/zoneDrawing.ts`). */
export interface TriangleZones {
  slotOf(box: ZoneBox): number;
  readonly revision: number;
}

export interface TriangleDrawing {
  /** Detached sources retain their CPU geometry / picking tags. Await this
   * preprocessing and the owner's compileAsync before activating. A source
   * whose count changes within its capacity, or whose matrices / colours are
   * rewritten, keeps its binding (R9.1); only a new source (capacity, colour
   * buffer, parts) replaces it.
   * The owner retains sources through compilation, including cancelled work.
   */
  prepare(source: InstancedMesh, detailRadius?: number, bundle?: boolean, local?: Matrix4, pieces?: readonly LodPiece[], placementBounds?: Box3, cullOnly?: boolean): Promise<TriangleBinding>;
  /** Once a frame before the cull; `zones` (plan 5c R9b) gives each instance its zone slot when the set or the matrices change. */
  update(camera: Camera, qualityScale: number, zones?: TriangleZones | null): void;
  dispose(): void;
}

export function createTriangleDrawing(renderer: WebGPURenderer, gpu: GpuDrivenDrawing, load: (input: TriangleInput) => Promise<TriangleData>): TriangleDrawing {
  const bindings = new Set<{ update(qualityScale: number, pixelScale: number, perspective: boolean, zones: TriangleZones | null): void; dispose(): void }>();
  const viewport = new Vector2();
  let disposed = false;
  /** LOD data per geometry object (templates' geometries are immutable and shared across rebuilds). */
  const memo = new WeakMap<BufferGeometry, Promise<TriangleData>>();
  const dataOf = (geometry: BufferGeometry): Promise<TriangleData> => {
    let pending = memo.get(geometry);
    if (!pending) {
      pending = Promise.resolve().then(() => load(triangleInput(geometry)));
      pending.catch(() => { if (memo.get(geometry) === pending) memo.delete(geometry); });
      memo.set(geometry, pending);
    }
    return pending;
  };
  /** A merged / baked part's LOD chain from its raw pieces' cached chains (R9.2). */
  const mergedData = async (pieces: readonly LodPiece[]): Promise<TriangleData> => {
    const chains = await Promise.all(pieces.map(async (piece): Promise<TriangleData> => {
      if (piece.range === null) return dataOf(piece.geometry);
      // A material group of a raw primitive: its own triangles, one level.
      const index = piece.geometry.index, all = index ? index.count : piece.vertexCount;
      const indices: number[] = [];
      for (let i = piece.range.start; i < Math.min(all, piece.range.start + piece.range.count); i += 1) indices.push(index ? index.getX(i) : i);
      return { version: TRIANGLE_VERSION, key: "", lods: [{ indices, error: 0 }] };
    }));
    return mergeTriangleLods(pieces.map((piece, i) => ({ data: chains[i]!, vertexOffset: piece.vertexOffset, vertexCount: piece.vertexCount, flip: piece.flip, scale: piece.scale })), `merged:${chains.map((chain) => chain.key).join("+")}`);
  };
  return {
    async prepare(source, detailRadius, bundle = false, local = new Matrix4(), pieces, placementBounds, cullOnly = false) {
      if (disposed) throw new Error("triangles: drawing disposed");
      if (source.geometry.drawRange.start !== 0 || source.geometry.drawRange.count !== Infinity || Object.keys(source.geometry.morphAttributes).length) throw new Error("triangles: source must be a complete, static triangle primitive");
      const cullDistance = detailRadius === undefined ? null : detailCullDistance(detailRadius);
      // S12 compares vertex work with identical source geometry on all paths.
      const data = cullOnly ? { lods: [{ indices: [], error: 0, groups: undefined }] }
        : pieces && pieces.length > 0 ? await mergedData(pieces) : await dataOf(source.geometry);
      if (disposed) throw new Error("triangles: drawing disposed during preprocessing");
      const root = new Group(); root.name = `${cullOnly ? "s12" : "automaticLOD"}/${source.name}`; root.matrixAutoUpdate = false;
      // Its draws sit in template space (the instances transform them on the GPU): the
      // level's framing (`NOT_FRAMED`, levelViewer.ts) takes the source's bounds instead.
      root.userData.framing = false;
      let active = false, released = false;
      const derived: BufferGeometry[] = [], hidden: Material[] = [];
      const authored = source.material;
      source.geometry.computeBoundingSphere();
      const sphere = source.geometry.boundingSphere!.clone().applyMatrix4(local);
      const localScale = local.getMaxScaleOnAxis();
      const batch = gpu.createBatch({ name: root.name, parent: root, capacity: source.instanceMatrix.count, bounds: { center: [sphere.center.x, sphere.center.y, sphere.center.z], radius: sphere.radius }, distanceMode: "scaled", castShadow: source.castShadow, bundle,
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
      batch.prepare(Array.from({ length: source.castShadow ? 4 : 1 }, (_, index) => ({
        planes, origin: [0, 0, 0] as const,
        ...(index === 0 ? { role: "main" as const, layer: MAIN_VIEW_LAYER } : { role: "shadow" as const, layer: shadowViewLayer(index) }),
      })));
      // compileAsync stages and detaches these objects. Preserve their actual
      // draw parents (including the optional bundle) for atomic activation.
      const preparedParents = new Map(batch.allMeshes.map((mesh) => [mesh, mesh.parent]));
      let version = -1, maxScale = 1, zoneRevision = -1;
      const matrix = new Matrix4(), inverseLocal = local.clone().invert();
      const owner = {
        update(qualityScale: number, pixelScale: number, perspective: boolean, zones: TriangleZones | null) {
          if (!active || released) return;
          if (root.parent !== source.parent) source.parent?.add(root);
          root.visible = source.visible;
          source.updateWorldMatrix(true, false);
          // Instances are world matrices, including on the CPU twin. The draw
          // root cancels its parent's transform instead of applying it twice.
          root.matrix.copy(source.parent?.matrixWorld ?? new Matrix4()).invert(); root.updateMatrixWorld(true);
          // R9.1: the source's count follows its placements within its capacity.
          // Handles come and go at the end only, so slot i stays source instance i
          // (the colour buffer and the CPU twin read colours by slot).
          if (source.count !== handles.length) {
            while (handles.length < source.count) handles.push(batch.instances.add(source.instanceMatrix.array, handles.length * 16));
            while (handles.length > source.count) batch.instances.remove(handles.pop()!);
            version = -1;
          }
          const zonesNow = zones?.revision ?? 0;
          if (source.instanceMatrix.version !== version || !source.matrixWorld.equals(matrix) || zonesNow !== zoneRevision) {
            const placement = new Matrix4(); maxScale = 0;
            for (let i = 0; i < source.count; i += 1) {
              source.getMatrixAt(i, placement); placement.multiply(inverseLocal).premultiply(source.matrixWorld);
              batch.instances.move(handles[i]!, placement.elements); maxScale = Math.max(maxScale, placement.getMaxScaleOnAxis());
              const slot = zones && placementBounds ? zones.slotOf(placementBox(placementBounds, placement)) : 0;
              batch.instances.setZone(handles[i]!, slot);
            }
            version = source.instanceMatrix.version; matrix.copy(source.matrixWorld); zoneRevision = zonesNow;
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
    update(camera, qualityScale, zones = null) {
      renderer.getDrawingBufferSize?.(viewport);
      const pixelScale = Math.abs(camera.projectionMatrix.elements[5]!) * Math.max(1, viewport.y) / 2;
      const perspective = (camera as Camera & { isPerspectiveCamera?: boolean }).isPerspectiveCamera === true;
      for (const binding of bindings) binding.update(qualityScale, pixelScale, perspective, zones);
    },
    dispose() { disposed = true; for (const binding of [...bindings]) binding.dispose(); },
  };
}
