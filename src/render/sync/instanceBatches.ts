// Automatic instancing (plan phase 3 step 8, spike mode (b); architecture
// §4.4: instancing is not a data type, it is the render layer's batching).
// Forge WebGL's createInstancedModelGroup, rewritten as a live batch:
//
// - A batch draws every placement that shares its key (the binding decides:
//   a model and its slot materials and shadow switch, a shape primitive) with
//   one `InstancedMesh` per renderable part of the template; instance i's
//   matrix is placement i's world matrix times the part's matrix in the
//   template (Forge's `item.matrix × object.matrixWorld`).
// - A placement colour is a per-instance colour over the part's material:
//   the colour divided by the material's base colour (Forge's
//   applyInstanceColors), so the drawn base colour is exactly the placement's
//   and textures still apply; uncoloured instances are white (the material's
//   own). No colour in the batch: no colour buffer.
// - Placements come and go between frames; `flush()` (once per frame, from
//   the binding's sync) rebuilds what changed. Meshes are rebuilt only when
//   the capacity grows or the colour buffer appears / goes; otherwise the
//   instance buffers are rewritten in place (on the automatic LOD path too:
//   its binding follows the source's count, R9.1). A rebuilt set that must
//   prepare (compileAsync, LOD data) does not blank the batch: the drawn set
//   stays until the new one shows.
// - An edit that only moves an actor (`actorsChanged` with `transformOnly`,
//   plan phase 4 decision 3) moves its placements with `move`: the next flush
//   rewrites only their matrices, in place (no colours, no instance table, no
//   new meshes), and the batch never empties on the way, so it keeps its
//   meshes and its model's cache use. `changeInstances` is that rule for a
//   binding: transform-only changes move, any other is removed then added.
// - Each mesh is frustum culled by the bounds of all its instances.
// - Each mesh carries its instance -> actor table (pickTags.ts) for picking.
//
// Geometry and materials are the batch owner's (cache uses); the batch owns
// only its instanced meshes and their buffers.

import { Box3, Color, InstancedBufferAttribute, InstancedMesh, Matrix4, Sphere, Vector3, type BufferGeometry, type Camera, type Material, type Object3D } from "three/webgpu";
import type { ActorId, WorldActor, WorldActorChange } from "../../core/index.ts";
import { SCENE_SOURCE_KEY } from "../../engine/perf/sceneCost.ts";
import { tagInstanceActors, tagPartSlots } from "./pickTags.ts";
import { detailBatchCulled, detailCullDistance } from "../../engine/world/detailCulling.ts";
import { createCasterFade, createDetailFade } from "../materials/detailFade.ts";
import type { LodPiece, TriangleBinding, TriangleDrawing } from "../triangles/triangleDrawing.ts";
import { lodParts, s12Candidate, type StaticPath } from "../triangles/staticPath.ts";
import type { InstancedShadowCasters } from "./shadowCasterLayers.ts";
import { markCover, setDrawLayer, ZONE_HIDDEN_LAYER, ZONE_SHADOW_LAYER, type ZoneMode } from "../gpu/gpuDrivenBatch.ts";

export interface InstancePart {
  readonly geometry: BufferGeometry;
  readonly material: Material | Material[];
  /** The part's matrix inside the template (its world matrix under the template root). */
  readonly local: Matrix4;
  readonly name: string;
  /** The model slot each of its materials draws (picking: a dropped material's slot). */
  readonly slots?: readonly number[];
  /** A baked / merged geometry's raw pieces: its automatic LOD comes from theirs (R9.2). */
  readonly lodPieces?: readonly LodPiece[];
}

export interface InstanceBatch {
  readonly ready: boolean;
  /** Adds or moves a placement of `actor`; `color` is `#rrggbb` or null. */
  set(id: string, matrix: Matrix4, color: string | null, actor: ActorId): void;
  delete(id: string): void;
  /** Moves a placement: only its matrix changes. False when there is no such placement. */
  move(id: string, matrix: Matrix4): boolean;
  readonly size: number;
  /** Scale-1 detail cell size for an S12 candidate; queried before the first build. */
  s12CellSize(): number;
  /** The parts to draw; until set, placements wait and nothing is drawn. */
  setParts(parts: readonly InstancePart[], detailRadius?: number, casterRadius?: number, placementBounds?: Box3): void;
  updateCulling(camera: Camera | null, qualityScale: number): void;
  /** Rebuilds the instanced meshes if anything changed since the last flush. */
  flush(): void;
  readonly meshes: readonly InstancedMesh[];
  /** Its zone's mode now (plan 5c R9b, `zoneDrawing.ts`); default `visible`. */
  readonly zoneMode: ZoneMode;
  setZoneMode(mode: ZoneMode): void;
  dispose(): void;
}

export interface InstanceBatchOptions {
  readonly prepare?: (meshes: readonly Object3D[], signal?: AbortSignal) => Promise<void>;
  /** The GPU-driven automatic LOD path (R7); which parts take it is `staticPath`'s (R9.3 / R9.4). */
  readonly triangles?: TriangleDrawing;
  /** The path rule now (`staticPath.ts`); with `triangles` and no rule every eligible part takes it. */
  readonly staticPath?: () => StaticPath;
  readonly name: string;
  /** The `?debug` scene-cost bucket its meshes count in (`SCENE_SOURCE_KEY`), e.g. `staticMesh`. */
  readonly source?: string;
  readonly parent: Object3D;
  readonly castShadow: boolean;
  readonly shadowCasters?: InstancedShadowCasters;
  readonly invalidateReadiness?: () => void;
  /** False: what it draws is not picked or outlined (a terrain's spline meshes). Default true. */
  readonly pick?: boolean;
  /** Its meshes block rain and snow (plan phase W3: statics, shapes, roads); `coverChanged` hears every drawn change. */
  readonly precipitationCover?: boolean;
  readonly coverChanged?: () => void;
}

const WHITE = new Color(1, 1, 1);

/** The instance colour that shows `color` over a material whose base colour is `base` (Forge's divisor rule). */
export function instanceColorOver(color: Color, base: Color | null, out = new Color()): Color {
  const divisor = base ?? WHITE;
  return out.setRGB(
    divisor.r > 0 ? color.r / divisor.r : color.r,
    divisor.g > 0 ? color.g / divisor.g : color.g,
    divisor.b > 0 ? color.b / divisor.b : color.b,
  );
}

function baseColorOf(material: Material | Material[]): Color | null {
  const first = Array.isArray(material) ? material[0] : material;
  const color = (first as { color?: unknown } | undefined)?.color;
  return color instanceof Color ? color : null;
}

const capacityFor = (count: number): number => {
  let capacity = 16;
  while (capacity < count) capacity *= 2;
  return capacity;
};

export function createInstanceBatch(options: InstanceBatchOptions): InstanceBatch {
  const placements = new Map<string, { matrix: Matrix4; color: string | null; actor: ActorId }>();
  let parts: readonly InstancePart[] | null = null;
  let placementBounds: Box3 | undefined;
  let meshes: InstancedMesh[] = [];
  let capacity = 0;
  let colored = false;
  let dirty = false;
  let prepared = false, preparing = false, generation = 0;
  let preparation: AbortController | null = null;
  let preparationWork: Promise<void> | null = null;
  let cullDistance: number | null = null;
  let fade: ReturnType<typeof createDetailFade> | null = null;
  let fadePlacements: InstancedBufferAttribute | null = null;
  let casterFade: ReturnType<typeof createCasterFade> | null = null;
  let casterRadius: number | undefined;
  let casterScale = { value: 0 };
  let untrackCaster: (() => void) | undefined;
  let triangleBindings: TriangleBinding[] = [];
  /** Per mesh of the current set: drawn by the automatic LOD path (its source stays for picking). */
  let lodOf: boolean[] = [];
  let cullOnly = false;
  let detailRadius: number | undefined;
  let maxScale = 0;
  const cameraPosition = new Vector3(), sphere = new Sphere();
  /** Placements moved since the last flush (their matrices only). */
  const moved = new Set<string>();
  /** Placement -> its instance index, as the last full flush wrote it. */
  const indexOf = new Map<string, number>();
  const matrix = new Matrix4();
  const color = new Color();
  const shown = new Color();

  let measuredCellSize: number | undefined;
  const s12CellSize = (): number => measuredCellSize ??= measureS12CellSize();
  const measureS12CellSize = (): number => {
    if (!parts || placements.size < 64 || cullDistance === null) return 0;
    const bounds = new Box3(), p = new Vector3();
    for (const { matrix } of placements.values()) bounds.expandByPoint(p.setFromMatrixPosition(matrix));
    const spreadRadius = bounds.getBoundingSphere(new Sphere()).radius;
    return s12Candidate(parts, placements.size, spreadRadius, cullDistance) ? cullDistance : 0;
  };

  /** A drawn set kept on screen while its replacement prepares (R9.1); released when that one shows. */
  let retired: (() => void) | null = null;
  const releaseRetired = (): void => { const release = retired; retired = null; release?.(); };

  // R9b zones: instanced meshes by layer (shadow cameras alone have the shadow
  // layer, no camera the hidden one), so the detail fade keeps `visible`; the
  // automatic LOD path's batches by their own mode.
  let zoneMode: ZoneMode = "visible";
  const applyZoneMode = (): void => {
    const layer = zoneMode === "visible" ? 0 : zoneMode === "shadow" ? ZONE_SHADOW_LAYER : ZONE_HIDDEN_LAYER;
    for (const mesh of meshes) setDrawLayer(mesh, layer);
    for (const binding of triangleBindings) binding.batch.setZoneMode(zoneMode);
  };

  /** `keep`: a prepared set stays drawn until the next set is prepared (capacity growth, colour buffer). */
  const removeMeshes = (keep = false): void => {
    preparation?.abort(); preparation = null;
    const wasPrepared = prepared;
    generation += 1; prepared = false; preparing = false;
    if (wasPrepared && placements.size > 0) options.invalidateReadiness?.();
    const oldMeshes = meshes, oldFade = fade, oldTriangles = triangleBindings, oldPlacements = fadePlacements;
    const oldCasterFade = casterFade, untrackOldCaster = untrackCaster;
    untrackCaster = undefined;
    casterFade = null;
    casterScale = { value: 0 };
    triangleBindings = [];
    const release = (): void => {
      untrackOldCaster?.();
      for (const binding of oldTriangles) binding.dispose();
      for (const mesh of oldMeshes) { mesh.removeFromParent(); mesh.dispose(); }
      oldCasterFade?.dispose();
      oldFade?.dispose();
      // The meshes' own instance buffers go with mesh.dispose(); this one is the batch's (5c gate: one GPU
      // buffer per rebuilt batch stayed until a garbage collection, measure:forest's cell cycle).
      oldPlacements?.dispose();
    };
    if (keep && wasPrepared && oldMeshes.length > 0 && (options.prepare || options.triangles)) {
      releaseRetired();
      retired = release;
    } else {
      if (!keep) releaseRetired();
      for (const mesh of oldMeshes) mesh.removeFromParent();
      // A renderer may still be linking these objects. Deleting their programs
      // before compileAsync settles can strand a WebGL parallel-link poll.
      if (preparationWork) void preparationWork.then(release, release);
      else release();
    }
    preparationWork = null;
    meshes = [];
    capacity = 0;
    fade = null; fadePlacements = null;
  };

  return {
    get ready() { return placements.size === 0 || (meshes.length > 0 && prepared); },
    set(id, placement, placementColor, actor) {
      placements.set(id, { matrix: placement.clone(), color: placementColor, actor });
      measuredCellSize = undefined;
      dirty = true;
    },
    delete(id) {
      if (placements.delete(id)) { dirty = true; measuredCellSize = undefined; }
    },
    move(id, placement) {
      const entry = placements.get(id);
      if (!entry) return false;
      entry.matrix.copy(placement);
      measuredCellSize = undefined;
      moved.add(id);
      return true;
    },
    get size() {
      return placements.size;
    },
    s12CellSize,
    setParts(next, radius, shadowRadius = radius, bounds) {
      parts = next;
      measuredCellSize = undefined;
      placementBounds = bounds;
      detailRadius = radius;
      casterRadius = shadowRadius;
      cullDistance = radius === undefined ? null : detailCullDistance(radius);
      removeMeshes();
      dirty = true;
    },
    flush() {
      if (parts === null) return;
      if (!dirty) {
        if (moved.size === 0 || meshes.length === 0) return;
        options.coverChanged?.();
        meshes.forEach((mesh, partIndex) => {
          const local = parts![partIndex]!.local;
          for (const id of moved) {
            const index = indexOf.get(id);
            if (index !== undefined) {
              const placement = placements.get(id)!.matrix;
              mesh.setMatrixAt(index, matrix.multiplyMatrices(placement, local));
              fadePlacements?.setXYZW(index, placement.elements[12]!, placement.elements[13]!, placement.elements[14]!, placement.getMaxScaleOnAxis());
            }
          }
          mesh.instanceMatrix.needsUpdate = true;
          mesh.computeBoundingSphere();
          mesh.computeBoundingBox();
        });
        moved.clear();
        maxScale = 0;
        for (const entry of placements.values()) maxScale = Math.max(maxScale, entry.matrix.getMaxScaleOnAxis());
        casterScale.value = maxScale;
        if (fadePlacements) fadePlacements.needsUpdate = true;
        return;
      }
      dirty = false;
      options.coverChanged?.();
      moved.clear();
      indexOf.clear();
      let at = 0;
      for (const id of placements.keys()) indexOf.set(id, at++);
      const count = placements.size;
      const needsColor = [...placements.values()].some((entry) => entry.color !== null);
      if (count === 0) {
        removeMeshes();
        return;
      }
      const path = options.staticPath?.() ?? "gpu";
      const s12 = path === "s12-gpu" && (cullOnly || s12CellSize() > 0);
      if (count > capacity || needsColor !== colored || meshes.length === 0 || s12 !== cullOnly) {
        removeMeshes(true);
        capacity = capacityFor(count);
        colored = needsColor;
        // R9.3 / R9.4: decided per set; the LOD path fades and culls on the GPU itself.
        cullOnly = s12;
        lodOf = options.triangles ? lodParts(s12 ? "gpu" : path, parts) : parts.map(() => false);
        const detail = cullDistance !== null && lodOf.some(lod => !lod);
        const caster = options.castShadow && options.shadowCasters && casterRadius !== undefined;
        if (detail || caster) {
          fadePlacements = new InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
          if (detail) fade = createDetailFade(cullDistance!, fadePlacements);
          if (caster) casterFade = createCasterFade(fadePlacements);
        }
        const materialOf = (one: Material): Material => {
          const detailed = fade?.material(one) ?? one;
          return casterFade?.material(detailed) ?? detailed;
        };
        meshes = parts.map((part, partIndex) => {
          const material = lodOf[partIndex] ? part.material
            : Array.isArray(part.material) ? part.material.map(materialOf) : materialOf(part.material);
          const mesh = new InstancedMesh(part.geometry, material, capacity);
          mesh.name = `${options.name}/${part.name}`;
          mesh.castShadow = options.castShadow;
          mesh.receiveShadow = true;
          mesh.matrixAutoUpdate = false;
          if (options.source !== undefined) mesh.userData[SCENE_SOURCE_KEY] = options.source;
          if (options.precipitationCover) markCover(mesh);
          if (part.slots && options.pick !== false) tagPartSlots(mesh, part.slots);
          if (!options.prepare && !lodOf.includes(true)) options.parent.add(mesh);
          return mesh;
        });
        if (casterFade && casterRadius !== undefined) {
          const radius = casterRadius, scale = casterScale;
          untrackCaster = options.shadowCasters?.add({
            parent: options.parent, meshes, fade: casterFade,
            radius: () => radius * scale.value,
            zoneMode: () => zoneMode,
          });
        }
        applyZoneMode();
      }
      const actors = [...placements.values()].map((entry) => entry.actor);
      maxScale = 0;
      let placementIndex = 0;
      for (const entry of placements.values()) {
        const scale = entry.matrix.getMaxScaleOnAxis(); maxScale = Math.max(maxScale, scale);
        fadePlacements?.setXYZW(placementIndex++, entry.matrix.elements[12]!, entry.matrix.elements[13]!, entry.matrix.elements[14]!, scale);
      }
      casterScale.value = maxScale;
      if (fadePlacements) fadePlacements.needsUpdate = true;
      meshes.forEach((mesh, partIndex) => {
        if (options.pick !== false) tagInstanceActors(mesh, actors);
        const part = parts![partIndex]!;
        const base = baseColorOf(part.material);
        let index = 0;
        for (const entry of placements.values()) {
          mesh.setMatrixAt(index, matrix.multiplyMatrices(entry.matrix, part.local));
          if (colored) mesh.setColorAt(index, entry.color === null ? WHITE : instanceColorOver(color.set(entry.color), base, shown));
          index += 1;
        }
        mesh.count = count;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.computeBoundingSphere();
        mesh.computeBoundingBox();
      });
      const anyLod = lodOf.includes(true);
      if (!options.prepare && !anyLod) { prepared = true; releaseRetired(); }
      else if (!prepared && !preparing && meshes.length > 0) {
        preparing = true;
        preparation = new AbortController();
        const ticket = generation, pending = [...meshes], lods = lodOf;
        const pendingBindings = triangleBindings, signal = preparation.signal;
        const pendingCasterFade = casterFade, pendingBounds = placementBounds;
        const pendingCullOnly = cullOnly;
        const locals = parts!.map((part) => part.local.clone()), pieces = parts!.map((part) => part.lodPieces);
        preparationWork = anyLod ? (async () => {
          for (let i = 0; i < pending.length; i += 1) {
            if (!lods[i]) continue;
            try {
              pendingBindings.push(await options.triangles!.prepare(pending[i]!, detailRadius, false, locals[i], pieces[i], pendingBounds, pendingCullOnly));
            } catch (error) {
              // R9.3: a part the LOD path cannot take draws instanced (unfaded) in the same batch.
              if (signal.aborted) return;
              if (pendingCullOnly) throw error;
              lods[i] = false;
              if (pendingCasterFade) {
                const mesh = pending[i]!, material = mesh.material;
                mesh.material = Array.isArray(material) ? material.map(one => pendingCasterFade.material(one))
                  : pendingCasterFade.material(material);
              }
              console.warn(`forge render: ${pending[i]!.name} stays instanced`, error);
            }
          }
          if (signal.aborted) return;
          await options.prepare?.([...pendingBindings.flatMap((binding) => binding.objects), ...pending.filter((_, i) => !lods[i])], signal);
        })() : options.prepare!(pending, signal);
        preparationWork.then(() => {
          if (ticket !== generation) return;
          for (const mesh of pending) options.parent.add(mesh);
          for (const binding of pendingBindings) binding.activate();
          applyZoneMode();
          releaseRetired();
          prepared = true; preparing = false; preparationWork = null;
          options.coverChanged?.();
        }).catch((error: unknown) => {
          if (ticket === generation) { preparing = false; console.warn(`forge render: batch warmup failed (${options.name})`, error); }
        });
      }
    },
    get meshes() {
      return meshes;
    },
    get zoneMode() { return zoneMode; },
    setZoneMode(mode) {
      if (mode === zoneMode) return;
      zoneMode = mode;
      applyZoneMode();
    },
    updateCulling(camera, qualityScale) {
      if (!camera || cullDistance === null || !fade) return;
      camera.getWorldPosition(cameraPosition); fade.update(cameraPosition, qualityScale);
      for (const [index, mesh] of meshes.entries()) {
        // A LOD source's visibility is its draw's (triangleDrawing); the GPU culls and fades it.
        if (lodOf[index] || !mesh.boundingSphere) continue;
        sphere.copy(mesh.boundingSphere).applyMatrix4(mesh.matrixWorld);
        mesh.visible = !detailBatchCulled(sphere.center.distanceTo(cameraPosition), sphere.radius, cullDistance, maxScale, qualityScale);
      }
    },
    dispose() {
      removeMeshes();
      placements.clear();
      moved.clear();
      indexOf.clear();
      parts = null;
    },
  };
}

/** How a binding that draws through instance batches applies an edit. */
export interface InstanceChangeTarget {
  /** Moves the actor's placements to its current world matrices. */
  move(actor: WorldActor): void;
  removed(actors: readonly WorldActor[]): void;
  added(actors: readonly WorldActor[]): void;
}

/** Transform-only changes move the actor's placements in place; any other change is removed, then added. */
export function changeInstances(changes: readonly WorldActorChange[], target: InstanceChangeTarget): void {
  const rebuilt = changes.filter((change) => !change.transformOnly);
  for (const change of changes) if (change.transformOnly) target.move(change.actor);
  if (rebuilt.length === 0) return;
  target.removed(rebuilt.map((change) => change.previous));
  target.added(rebuilt.map((change) => change.actor));
}
