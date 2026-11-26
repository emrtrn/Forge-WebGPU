// One GPU-driven batch (phase 5c step 5.1, decision 5; spike result: one
// GPU-driven path for statics and foliage). A template (its LODs, each a list
// of parts) drawn at every instance of a `GpuInstances` set:
//
// - Per view, three compute dispatches: reset the per-LOD counters; cull one
//   thread per instance (bounding sphere against the six planes, measured
//   distance against the cull end, LOD by distance; the same rules as the CPU
//   reference `engine/world/instanceCulling.ts`) and append its index to its
//   LOD's visible list with an atomic counter; write each draw's
//   `instanceCount` from its LOD's counter. No CPU readback.
// - Every (LOD, part, material group) is one `drawIndexedIndirect`: a mesh
//   whose geometry shares the part's attributes and index, with its own
//   arguments (index count and first index of its group). The vertex stage
//   reads `visible[lod × capacity + instance_index]` and that instance's
//   matrix × the part's matrix replaces the model matrices through an
//   override context (the material's own position / normal nodes still run
//   in model space, as for an ordinary mesh).
// - The fade band dithers in the material (5b's screen-door threshold,
//   `detailFade.ts`), times the instance's own fade (extras.x).
// - Views (5.2): view 0 is the main camera; views 1.. are shadow views (each
//   cascade of a cascaded sun, each other directional shadow map; gpuDriven.ts
//   finds them). Every view has its own counters, visible list, arguments,
//   compute nodes and meshes. A shadow view's meshes live on layer k only
//   (`shadowViewLayer`); gpuDriven adds that layer to the shadow camera, so
//   only that shadow pass draws them and no other camera sees them. The
//   shadow pass draws with three's shared shadow material
//   (`scene.overrideMaterial`), which keeps a material's
//   `castShadowPositionNode` and `maskShadowNode` but not its context: the
//   instance transform is the position node there. A shadow view measures
//   distances from the main camera, so what the main view culls casts no
//   shadow and what it fades casts a fading one. The main view's meshes cast
//   none. Point and spot light shadows do not see GPU-driven batches.
// - Camera views (R9a step 1): a camera that draws the scene besides the
//   main one (a planar reflection's virtual camera) is a view of its own,
//   lit like the main view, with its own lists and layer
//   (`cameraViewLayer`). The main view's meshes live on `MAIN_VIEW_LAYER`,
//   not layer 0, so such a camera never draws the main camera's lists.
//   Views carry their role and layer (`GpuCullView`); a slot whose role
//   changes (a shadow view count change shifts the camera views) rebuilds.
// - Render bundle (5.3, `bundle: true`; off by default): every view's opaque
//   meshes sit in the batch's own `BundleGroup`; three records it once per
//   camera (the main camera and each shadow camera) and replays it every
//   frame. The instance counts live in the indirect arguments, so culling
//   never re-records. Measured (R3, `npm run measure:gpu-driven`): no gain
//   within noise, because three r187 refreshes every render object of a
//   material with node properties in full each frame, bundled or not
//   (`NodeMaterialObserver.needsRefresh`); the bundle saves only the
//   encoding, about a tenth of the per-draw cost. The bundle is recorded again
//   (`bundleUpdates`) only when its meshes change: a view built or rebuilt
//   (first use, instance buffers grown) or the number of views changed.
//   Transparent materials stay out of it: three executes bundles at the end
//   of the pass, after the transparent objects it draws directly, so bundled
//   transparency would draw out of order. Opaque bundled draws after a
//   non-bundled transparent surface in front of them are the known cost.
//   Nothing here records per-frame CPU state into the meshes: what changes
//   per frame is uniforms and GPU buffers.
// - The instance buffers growing replaces the compute nodes, materials and
//   meshes (`GpuInstances.generation`); nothing else does.
// - Nothing batch-specific is a shader constant: the capacity and the draw
//   and LOD counts are uniforms, and the compute nodes carry no name (three
//   writes a node's name into the WGSL as a comment). three keys programs by
//   their WGSL text and Dawn its pipelines by their descriptor, so batches of
//   one source material share them and a growth rebuild compiles nothing new
//   (World Builder forests compiled ~600 pipelines on first view before).
// - WebGPU only: the WebGL2 test backend has no compute atomics or indirect
//   draws; there `gpuDriven.ts` builds the CPU twin (`cpuDrivenBatch.ts`).

import {
  BufferGeometry,
  BundleGroup,
  DoubleSide,
  IndirectStorageBufferAttribute,
  Matrix4,
  Mesh,
  StorageBufferAttribute,
  Uint32BufferAttribute,
  Vector2,
  Vector3,
  Vector4,
  type ComputeNode,
  type Material,
  type InstancedBufferAttribute,
  type Node,
  type NodeMaterial,
  type Object3D,
  type WebGPURenderer,
} from "three/webgpu";
import {
  Fn,
  If,
  Return,
  atomicAdd,
  atomicStore,
  bool,
  cameraViewMatrix,
  context,
  distance,
  dot,
  float,
  instanceIndex,
  length,
  mat3,
  max,
  modelNormalMatrix,
  modelPosition,
  modelViewPosition,
  modelWorldMatrix,
  modelWorldMatrixInverse,
  materialColor,
  overrideNodes,
  positionLocal,
  select,
  smoothstep,
  storage,
  uint,
  uniform,
  uniformArray,
  varying,
  vec4,
  vec3,
  velocity,
} from "three/tsl";
import type { Vec3 } from "../../core/schema/fields.ts";
import { SCENE_SOURCE_KEY } from "../../engine/perf/sceneCost.ts";
import {
  MAX_INSTANCE_LODS,
  NO_CULL_DISTANCE,
  type InstanceCullBatch,
  type InstanceCullView,
  type InstanceDistanceMode,
} from "../../engine/world/instanceCulling.ts";
import { CASTER_FADE_START } from "../../engine/world/shadowCasters.ts";
import { detailFadeDither } from "../materials/detailFade.ts";
import { createGpuInstances, type GpuInstances } from "./gpuInstances.ts";
import { applyGpuInstanceShading, type InstanceShading } from "./instanceShading.ts";

/** Most shadow views a batch draws into (cascades and other directional maps together). */
export const MAX_SHADOW_VIEWS = 8;
/** The layer of shadow view `view` (1-based; layer 0 stays every camera's default). */
export const shadowViewLayer = (view: number): number => view;
/**
 * The main view's layer (R9a step 1): off layer 0, so a camera that draws the
 * scene for another view (a reflection) does not draw the main camera's
 * visible lists. `gpuDriven.ts` enables it on the main camera.
 */
export const MAIN_VIEW_LAYER = MAX_SHADOW_VIEWS + 1;
/** Most camera views (cameras that draw the scene besides the main one, e.g. reflections). */
export const MAX_CAMERA_VIEWS = 4;
/** The layer of camera view `index` (0-based). */
export const cameraViewLayer = (index: number): number => MAIN_VIEW_LAYER + 1 + index;

/**
 * How a batch in a zone draws this frame (plan 5c R9b): `visible` as usual,
 * `shadow` into the shadow views only (a hidden zone that always casts),
 * `hidden` not at all (`gpuDriven.ts` skips its cull).
 */
export type ZoneMode = "visible" | "shadow" | "hidden";
/** Instanced meshes of a hidden zone that still casts: only shadow cameras have it (`gpuDriven.ts`). */
export const ZONE_SHADOW_LAYER = cameraViewLayer(MAX_CAMERA_VIEWS);
/** Instanced meshes of a hidden zone: no camera has it. */
export const ZONE_HIDDEN_LAYER = ZONE_SHADOW_LAYER + 1;
/** Precipitation cover views (plan phase W3): its top-down cameras, near and far. */
export const MAX_COVER_VIEWS = 2;
/** The layer of cover view `index` (0-based), past the shadow caster layers (16..25, shadowCasterLayers.ts). */
export const coverViewLayer = (index: number): number => 26 + index;
/**
 * Meshes drawn on the CPU that cover precipitation (static batches, shapes,
 * roads, HLOD proxies) carry this layer besides their own; only the cover
 * cameras have it.
 */
export const COVER_LAYER = 28;
/** `userData` key of a mesh that covers precipitation (keeps {@link COVER_LAYER} through layer changes). */
export const COVER_KEY = "forgePrecipitationCover";

/** Sets `object`'s one drawing layer, keeping its cover layer (plan phase W3). */
export function setDrawLayer(object: Object3D, layer: number): void {
  const mask = (1 << layer) | (object.userData[COVER_KEY] === true ? 1 << COVER_LAYER : 0);
  if (object.layers.mask !== mask) object.layers.mask = mask;
}

/** Marks a CPU-drawn mesh as covering precipitation (plan phase W3). */
export function markCover(object: Object3D): void {
  object.userData[COVER_KEY] = true;
  object.layers.enable(COVER_LAYER);
}

/**
 * Moves the slot already built for `source`'s role and layer to `index`
 * (swapping it with what is there), so a view list that changes frame to
 * frame does not rebuild its views. Both batch paths use it.
 */
export function reuseView<T extends { role: GpuCullView["role"]; layer: number }>(views: T[], index: number, source: Pick<GpuCullView, "role" | "layer">): void {
  const here = views[index];
  if (!here || (here.role === source.role && here.layer === source.layer)) return;
  const other = views.findIndex((view, at) => at > index && view.role === source.role && view.layer === source.layer);
  if (other < 0) return;
  views[index] = views[other]!;
  views[other] = here;
}

/** Views drawn with three's shadow material: shadow maps and the precipitation cover. */
export const depthOnlyView = (role: GpuCullView["role"]): boolean => role === "shadow" || role === "cover";
/** The role an instance shading hook sees: the cover is a shadow to it. */
export const shadingRole = (role: GpuCullView["role"]): "main" | "shadow" | "camera" => (role === "cover" ? "shadow" : role);
/**
 * u32 words of one zone mask (plan 5c R9b): bit `slot` of the mask says
 * whether zone slot `slot` draws; slot 0 (no zone) always does. The masks
 * buffer holds the main view's mask, then the shadow views' (`gpuDriven.ts`).
 */
export const ZONE_MASK_WORDS = 64;
/** Zone slots the masks can tell apart; zones past it get slot 0 (always drawn). */
export const MAX_ZONE_SLOTS = ZONE_MASK_WORDS * 32;

/**
 * A view as a batch draws it: `main` the main camera, `shadow` a shadow map
 * (three's shadow material, casts only), `camera` another camera that draws
 * the scene lit (a reflection), `cover` the precipitation cover's top-down
 * camera (drawn like a shadow view, only by batches that cover; plan phase
 * W3). Each view's meshes live on `layer` only.
 */
export interface GpuCullView extends InstanceCullView {
  readonly role: "main" | "shadow" | "camera" | "cover";
  readonly layer: number;
  readonly cascade?: number;
}

/** u32 arguments of one `drawIndexedIndirect`: index count, instance count, first index, base vertex, first instance. */
const ARGS = 5;
const WORKGROUP = 64;

export interface GpuBatchPart {
  readonly geometry: BufferGeometry;
  readonly material: Material | Material[];
  /** The part's matrix in the template. */
  readonly local: Matrix4;
  readonly name: string;
}

export interface GpuDrivenBatchOptions {
  readonly name: string;
  readonly parent: Object3D;
  /** LOD 0 first; each LOD the template's parts at that detail. */
  readonly lods: readonly (readonly GpuBatchPart[])[];
  /** The template's bounding sphere, template space (every LOD inside it). */
  readonly bounds: { readonly center: Readonly<Vec3>; readonly radius: number };
  readonly distanceMode: InstanceDistanceMode;
  /** The `?debug` scene-cost bucket (`SCENE_SOURCE_KEY`). */
  readonly source?: string;
  /** Draws into the shadow views (default true). */
  readonly castShadow?: boolean;
  /** Draws into the precipitation cover views (plan phase W3; statics, not foliage). Default false. */
  readonly precipitationCover?: boolean;
  /** Records the opaque draws in a render bundle (5.3; default false, see the header). */
  readonly bundle?: boolean;
  readonly capacity?: number;
  /** Optional source-slot RGB, compacted with the visible list (R7). */
  readonly instanceColors?: InstancedBufferAttribute;
  /** The host's zone masks (plan 5c R9b, `ZONE_MASK_WORDS` × 2 u32): each instance's zone slot (extras.z) is culled by them. */
  readonly zoneMasks?: StorageBufferAttribute;
  /** Per-instance shading (wind, plant response; `instanceShading.ts`), applied in every view on both paths. */
  readonly instanceShading?: InstanceShading;
  /** Enables stable per-instance distance fade offsets in this batch's shaders. */
  readonly staggeredFade?: boolean;
  /** `renderOrder` of each LOD's main draws (near LODs first: what they cover is not shaded again); default 0. */
  readonly lodOrder?: readonly number[];
}

/** The fade band and LOD starts, in measured distance (the owner applies the quality scales). */
export interface GpuBatchDistances {
  readonly fadeStart: number;
  /** Culled from here; {@link NO_CULL_DISTANCE} never. */
  readonly cullEnd: number;
  readonly fadeSpread?: number;
  readonly lodStarts: readonly number[];
  /** The shadow views' LOD starts (default the same): a coarser LOD casts. */
  readonly shadowLodStarts?: readonly number[];
}

export interface GpuDrivenBatch {
  readonly name: string;
  readonly fadeSpread: number;
  /** `gpu`: compute culling and indirect draws; `cpu`: the WebGL2 twin (CPU culling, instanced draws). */
  readonly path: "gpu" | "cpu";
  /** Draws of the last prepare (every view) that `renderer.info` does not count (all of the GPU path's, none of the CPU path's). */
  readonly uncountedDraws: number;
  readonly instances: GpuInstances;
  /** The main view's meshes (one per indirect draw on the GPU path), under `parent`. */
  readonly meshes: readonly Mesh[];
  /** Every view's meshes, the main view's first. */
  readonly allMeshes: readonly Mesh[];
  readonly lodCount: number;
  /** Draws one view issues: one per mesh and material pass (a transparent double-sided material draws twice). */
  readonly draws: number;
  /** Triangles one instance draws at each LOD (every pass counted, as three counts them). */
  readonly lodTriangles: readonly number[];
  /** Views the last prepare culled (the main view, its shadow views, camera views). */
  readonly views: number;
  /** Layers of the prepared views, in readCounts index order. */
  readonly viewLayers: readonly number[];
  /** Draws of the last prepare, every view (the CPU twin: only meshes with instances, as three skips empty ones). */
  readonly lastDraws: number;
  /** Times the render bundle was marked for recording again (each camera then records it once). */
  readonly bundleUpdates: number;
  setDistances(distances: GpuBatchDistances): void;
  /** Its zone's mode now (R9b; default `visible`). */
  readonly zoneMode: ZoneMode;
  setZoneMode(mode: ZoneMode): void;
  /** The CPU reference's view of this batch (bounds, distances) as the GPU culls it. */
  readonly cullBatch: InstanceCullBatch;
  /** The same for the shadow views (their LOD starts). */
  readonly shadowCullBatch: InstanceCullBatch;
  /**
   * Uploads instance changes and each view's uniforms; returns the dispatches,
   * in order. `views[0]` is the main camera; shadow views are skipped without
   * `castShadow`; past the view limit they are ignored, and the meshes of
   * views not prepared do not draw. A slot whose role or layer changed rebuilds.
   */
  prepare(views: readonly GpuCullView[]): readonly ComputeNode[];
  /** View `view`'s visible count per LOD in the last cull, read back (tests, measurements). */
  readCounts(renderer: WebGPURenderer, view?: number): Promise<number[]>;
  dispose(): void;
}

interface Draw {
  readonly lod: number;
  readonly part: GpuBatchPart;
  readonly material: Material;
  readonly start: number;
  readonly count: number;
}

/** Whether some distance draws LOD `lod` (a start at or under the one before it, or past the cull end, leaves none). */
export function lodHasRange(starts: readonly number[], lod: number, cullEnd: number): boolean {
  const from = lod === 0 ? 0 : starts[lod - 1]!;
  return from < cullEnd && (starts[lod] ?? Infinity) > from;
}

/** The part's draws: one per material group, or the whole index for a single material. */
function partDraws(lod: number, part: GpuBatchPart): Draw[] {
  const index = part.geometry.getIndex();
  const total = index ? index.count : part.geometry.getAttribute("position").count;
  const materials = Array.isArray(part.material) ? part.material : [part.material];
  if (!Array.isArray(part.material) || part.geometry.groups.length === 0) return [{ lod, part, material: materials[0]!, start: 0, count: total }];
  return part.geometry.groups.flatMap((group) => {
    const material = materials[group.materialIndex ?? 0];
    const count = Math.min(group.count, total - group.start);
    return material && count > 0 ? [{ lod, part, material, start: group.start, count }] : [];
  });
}

/** The part's geometry for an indirect draw: its attributes and index, no groups (one material a draw). */
function indirectGeometry(source: BufferGeometry): BufferGeometry {
  const geometry = new BufferGeometry();
  for (const [name, attribute] of Object.entries(source.attributes)) geometry.setAttribute(name, attribute);
  let index = source.getIndex();
  if (!index) {
    const count = source.getAttribute("position").count;
    index = new Uint32BufferAttribute(Uint32Array.from({ length: count }, (_, i) => i), 1);
  }
  geometry.setIndex(index);
  return geometry;
}

/** Passes three draws a material in: two for a transparent double-sided one (back faces, then front faces). */
export function drawPasses(material: Material): number {
  return material.transparent && material.side === DoubleSide && !material.forceSinglePass ? 2 : 1;
}

/** A node-material copy of `source` (a plain material through the renderer's node library). */
export function cloneNodeMaterial(renderer: WebGPURenderer, source: Material, batch: string): NodeMaterial {
  const node = (source as NodeMaterial).isNodeMaterial ? source : renderer.library.fromMaterial(source);
  if (!node) throw new Error(`gpu batch ${batch}: no node material for ${source.type}`);
  return node.clone() as NodeMaterial;
}

/** The dither mask of a fade: kept where the screen-door threshold is below `shown` (and the material's own mask). */
export function maskWithFade(material: NodeMaterial, shown: Node<"float">): void {
  const keeps = detailFadeDither.lessThan(shown);
  material.maskNode = material.maskNode ? bool(material.maskNode as Node<"bool">).and(keeps) : keeps;
  material.maskShadowNode = material.maskShadowNode ? bool(material.maskShadowNode as Node<"bool">).and(keeps) : keeps;
}

interface View {
  readonly index: number;
  role: GpuCullView["role"];
  layer: number;
  readonly counters: StorageBufferAttribute;
  readonly args: IndirectStorageBufferAttribute;
  readonly planes: Vector4[];
  readonly planesNode: Node;
  readonly origin: Vector3;
  readonly originNode: Node<"vec3">;
  readonly casterRadii: Vector4;
  readonly casterRadiiNode: Node<"vec4">;
  readonly casterEnds: Vector3;
  readonly casterEndsNode: Node<"vec3">;
  visible: StorageBufferAttribute | null;
  dispatches: ComputeNode[];
  meshes: Mesh[];
  materials: Material[];
  built: number;
}

export function createGpuDrivenBatch(renderer: WebGPURenderer, options: GpuDrivenBatchOptions): GpuDrivenBatch {
  const lodCount = options.lods.length;
  if (lodCount < 1 || lodCount > MAX_INSTANCE_LODS) throw new Error(`gpu batch ${options.name}: 1 to ${MAX_INSTANCE_LODS} LODs`);
  const instances = createGpuInstances(options.capacity, options.staggeredFade);
  const draws = options.lods.flatMap((parts, lod) => parts.flatMap((part) => partDraws(lod, part)));
  const drawCount = draws.reduce((sum, draw) => sum + drawPasses(draw.material), 0);
  const lodTriangles = options.lods.map((_, lod) => draws.filter((draw) => draw.lod === lod)
    .reduce((sum, draw) => sum + Math.floor(draw.count / 3) * drawPasses(draw.material), 0));
  const drawLodBuffer = new StorageBufferAttribute(Uint32Array.from(draws.map((draw) => draw.lod)), 1);
  const maxViews = 1 + MAX_SHADOW_VIEWS + MAX_CAMERA_VIEWS + MAX_COVER_VIEWS;
  const colorBuffer = options.instanceColors ? new StorageBufferAttribute(new Float32Array(options.instanceColors.count * 4), 4) : null;
  let colorVersion = -1;

  // Uniforms every view shares (the compute passes and the materials).
  const count = uniform(0, "uint");
  const cullEnd = uniform(NO_CULL_DISTANCE);
  const lodStarts = uniform(new Vector4(NO_CULL_DISTANCE, NO_CULL_DISTANCE, NO_CULL_DISTANCE, NO_CULL_DISTANCE));
  const shadowLodStarts = uniform(new Vector4(NO_CULL_DISTANCE, NO_CULL_DISTANCE, NO_CULL_DISTANCE, NO_CULL_DISTANCE));
  const bounds = uniform(new Vector4(...options.bounds.center, options.bounds.radius));
  const fade = uniform(new Vector2(NO_CULL_DISTANCE * 0.5, NO_CULL_DISTANCE));
  const fadeSpread = uniform(0);
  const capacityNode = uniform(instances.capacity, "uint");
  const lodCountNode = uniform(lodCount, "uint");
  const drawsNode = uniform(draws.length, "uint");
  const scaled = options.distanceMode === "scaled";
  let distances: GpuBatchDistances = { fadeStart: NO_CULL_DISTANCE, cullEnd: NO_CULL_DISTANCE, lodStarts: [] };

  const views: View[] = [];
  let prepared = 0;
  let lastDraws = 0;
  let zoneMode: ZoneMode = "visible";
  let bundleUpdates = 0;
  let bundleDirty = false;
  const bundle = options.bundle === true ? new BundleGroup() : null;
  if (bundle) {
    bundle.name = `${options.name} bundle`;
    options.parent.add(bundle);
  }

  const createView = (index: number): View => {
    const argsArray = new Uint32Array(draws.length * ARGS);
    draws.forEach((draw, at) => { argsArray[at * ARGS] = draw.count; argsArray[at * ARGS + 2] = draw.start; });
    const planes = Array.from({ length: 6 }, () => new Vector4(0, 0, 0, 1));
    const origin = new Vector3();
    const casterRadii = new Vector4(), casterEnds = new Vector3();
    return {
      index, role: "main", layer: MAIN_VIEW_LAYER,
      counters: new StorageBufferAttribute(new Uint32Array(lodCount), 1),
      args: new IndirectStorageBufferAttribute(argsArray, 1),
      planes, planesNode: uniformArray(planes, "vec4"),
      origin, originNode: uniform(origin),
      casterRadii, casterRadiiNode: uniform(casterRadii), casterEnds, casterEndsNode: uniform(casterEnds),
      visible: null, dispatches: [], meshes: [], materials: [], built: -1,
    };
  };

  const releaseView = (view: View): void => {
    for (const mesh of view.meshes) { mesh.removeFromParent(); mesh.geometry.dispose(); }
    for (const material of view.materials) material.dispose();
    for (const node of view.dispatches) node.dispose();
    view.visible?.dispose();
    view.meshes = []; view.materials = []; view.dispatches = []; view.visible = null; view.built = -1;
    bundleDirty = true;
  };

  /** (Re)binds everything of one view that reads the instance buffers. */
  const buildView = (view: View): void => {
    releaseView(view);
    const shadow = depthOnlyView(view.role);
    const capacity = instances.capacity;
    const visibleBuffer = new StorageBufferAttribute(new Uint32Array(capacity * lodCount), 1);
    view.visible = visibleBuffer;
    const planes = view.planesNode as unknown as { element(index: number): Node<"vec4"> };
    const origin = view.originNode;
    const matrixRead = storage(instances.matrixBuffer, "mat4", capacity).toReadOnly();
    const extraRead = storage(instances.extraBuffer, "vec4", capacity).toReadOnly();
    const visibleRead = storage(visibleBuffer, "uint", capacity * lodCount).toReadOnly();
    const measure = (matrix: Node<"mat4">): { origin: Node<"vec3">; scale: Node<"float">; measured: Node<"float"> } => {
      const scale = max(max(length(matrix.mul(vec4(1, 0, 0, 0)).xyz), length(matrix.mul(vec4(0, 1, 0, 0)).xyz)), length(matrix.mul(vec4(0, 0, 1, 0)).xyz));
      const at = matrix.mul(vec4(0, 0, 0, 1)).xyz;
      const raw = distance(at, origin);
      return { origin: at, scale, measured: scaled ? raw.div(max(scale, 1e-6)) : raw };
    };
    const label = view.role === "main" ? options.name : `${options.name} ${view.role}${view.index}`;

    const counters = storage(view.counters, "uint", lodCount).toAtomic();
    const reset = Fn(() => {
      If(instanceIndex.lessThan(lodCountNode), () => { atomicStore(counters.element(instanceIndex), uint(0)); });
    })().compute(lodCount, [WORKGROUP]);

    const visibleWrite = storage(visibleBuffer, "uint", capacity * lodCount);
    const matrixCull = storage(instances.matrixBuffer, "mat4", capacity).toReadOnly();
    const extraCull = storage(instances.extraBuffer, "vec4", capacity).toReadOnly();
    const zoneMasks = options.zoneMasks ? storage(options.zoneMasks, "uint", ZONE_MASK_WORDS * 2).toReadOnly() : null;
    const cull = Fn(() => {
      If(instanceIndex.greaterThanEqual(count), () => { Return(); });
      const matrix = matrixCull.element(instanceIndex).toVar();
      const { scale, measured } = measure(matrix);
      const radius = bounds.w.mul(scale).toVar();
      if (shadow) If(radius.lessThan(view.casterRadiiNode.x), () => { Return(); });
      const distanceVar = measured.toVar();
      const center = matrix.mul(vec4(bounds.xyz, 1)).xyz.toVar();
      const reach = radius.negate().toVar();
      let inside: Node<"bool"> = bool(true);
      for (let plane = 0; plane < 6; plane += 1) {
        const p = planes.element(plane);
        inside = inside.and(dot(p.xyz, center).add(p.w).greaterThanEqual(reach));
      }
      const end = options.staggeredFade ? cullEnd.sub(extraCull.element(instanceIndex).w.mul(fadeSpread)) : cullEnd;
      let keep: Node<"bool"> = inside.and(distanceVar.lessThan(end));
      if (zoneMasks) {
        // R9b: the instance's zone draws in this view (shadow views read the casting mask).
        const zone = uint(extraCull.element(instanceIndex).z).toVar();
        const word = zoneMasks.element(zone.shiftRight(uint(5)).add(uint(shadow ? ZONE_MASK_WORDS : 0)));
        keep = keep.and(word.shiftRight(zone.bitAnd(uint(31))).bitAnd(uint(1)).equal(uint(1)));
      }
      If(keep, () => {
        let lod: Node<"uint"> = uint(0);
        const starts = shadow ? shadowLodStarts : lodStarts;
        for (let k = 0; k < lodCount - 1; k += 1) lod = lod.add(select(distanceVar.greaterThanEqual([starts.x, starts.y, starts.z][k]!), uint(1), uint(0)));
        const lodVar = lod.toVar();
        const slot = atomicAdd(counters.element(lodVar), uint(1)).toVar();
        visibleWrite.element(lodVar.mul(capacityNode).add(slot)).assign(instanceIndex);
      });
    })().compute(capacity, [WORKGROUP]);

    const countersRead = storage(view.counters, "uint", lodCount).toReadOnly();
    const drawLod = storage(drawLodBuffer, "uint", draws.length).toReadOnly();
    const args = storage(view.args, "uint", draws.length * ARGS);
    const writeArgs = Fn(() => {
      If(instanceIndex.lessThan(drawsNode), () => {
        args.element(instanceIndex.mul(uint(ARGS)).add(uint(1))).assign(countersRead.element(drawLod.element(instanceIndex)));
      });
    })().compute(draws.length, [WORKGROUP]);
    view.dispatches = [reset, cull, writeArgs];

    const sources = new Map<string, NodeMaterial>();
    draws.forEach((draw, index) => {
      const key = `${draw.lod}/${options.lods[draw.lod]!.indexOf(draw.part)}/${draw.material.uuid}`;
      let material = sources.get(key);
      if (!material) {
        material = cloneNodeMaterial(renderer, draw.material, options.name);
        // The vertex's instance: its LOD's visible list at instance_index; the fragment reads it flat.
        const slot = varying(visibleRead.element(uint(draw.lod).mul(capacityNode).add(instanceIndex)), "vForgeGpuInstance");
        const instanceMatrix = matrixRead.element(slot);
        const world = instanceMatrix.mul(uniform(draw.part.local.clone()));
        if (options.instanceShading) {
          applyGpuInstanceShading(options.instanceShading, material, shadingRole(view.role), {
            instance: instanceMatrix, world, scale: measure(instanceMatrix).scale, extraY: extraRead.element(slot).y, partLocal: draw.part.local,
          });
        }
        if (shadow) {
          // The shadow material keeps only the position: the instance's world position, back in the mesh's own space.
          const local = (material.castShadowPositionNode as Node<"vec3"> | null) ?? (material.positionNode as Node<"vec3"> | null) ?? positionLocal;
          material.castShadowPositionNode = modelWorldMatrixInverse.mul(world.mul(vec4(local, 1))).xyz;
        } else {
          const worldPosition = world.mul(vec4(0, 0, 0, 1)).xyz;
          material.contextNode = context(overrideNodes([
            [modelWorldMatrix, world],
            [modelWorldMatrixInverse, world.inverse()],
            [modelNormalMatrix, mat3(world).inverse().transpose()],
            [modelPosition, worldPosition],
            [modelViewPosition, cameraViewMatrix.mul(vec4(worldPosition, 1)).xyz],
            [velocity.previousModelWorldMatrix, world],
          ]), (material.contextNode as unknown as { getFlowContextData(): Record<string, unknown> } | null)?.getFlowContextData() ?? {});
        }
        const placement = measure(instanceMatrix);
        if (!shadow && colorBuffer) {
          const color = varying(storage(colorBuffer, "vec4", colorBuffer.count).toReadOnly().element(slot).xyz);
          material.colorNode = vec3((material.colorNode as Node<"vec3"> | null) ?? materialColor.rgb).mul(color);
        }
        const fadeDistance = options.staggeredFade ? placement.measured.add(extraRead.element(slot).w.mul(fadeSpread)) : placement.measured;
        let opacity = float(1).sub(smoothstep(fade.x, fade.y, fadeDistance)).mul(extraRead.element(slot).x);
        if (shadow) {
          const radius = bounds.w.mul(placement.scale);
          const { y: second, z: third, w: fourth } = view.casterRadiiNode;
          const { x, y, z } = view.casterEndsNode;
          const end = select(radius.lessThan(second), x,
            select(radius.lessThan(third), y, select(radius.lessThan(fourth), z, float(NO_CULL_DISTANCE))));
          opacity = opacity.mul(float(1).sub(smoothstep(end.mul(CASTER_FADE_START), end, distance(placement.origin, origin))));
        }
        const shown = varying(opacity, "vForgeGpuFade");
        maskWithFade(material, shown);
        sources.set(key, material);
        view.materials.push(material);
      }
      // One geometry object per draw (the indirect offset is the geometry's), sharing the part's buffers.
      const geometry = indirectGeometry(draw.part.geometry);
      geometry.setIndirect(view.args, index * ARGS * 4);
      const mesh = new Mesh(geometry, material);
      mesh.name = `${label}/lod${draw.lod}/${draw.part.name}`;
      mesh.frustumCulled = false;
      mesh.castShadow = shadow;
      mesh.receiveShadow = !shadow;
      mesh.matrixAutoUpdate = false;
      mesh.layers.set(view.layer);
      if (!shadow) mesh.renderOrder = options.lodOrder?.[draw.lod] ?? 0;
      if (options.source !== undefined) mesh.userData[SCENE_SOURCE_KEY] = options.source;
      (bundle && !material.transparent ? bundle : options.parent).add(mesh);
      view.meshes.push(mesh);
    });
    view.built = instances.generation;
  };

  const batch: GpuDrivenBatch = {
    name: options.name,
    path: "gpu",
    get uncountedDraws() { return lastDraws; },
    instances,
    get meshes() { return views[0]?.meshes ?? []; },
    get allMeshes() { return views.flatMap((view) => view.meshes); },
    lodCount,
    draws: drawCount,
    lodTriangles,
    get views() { return prepared; },
    get viewLayers() { return views.slice(0, prepared).map(view => view.layer); },
    get lastDraws() { return lastDraws; },
    get bundleUpdates() { return bundleUpdates; },
    get zoneMode() { return zoneMode; },
    setZoneMode(mode) {
      zoneMode = mode;
      // Hidden: no cull runs, so nothing else would hide the last frame's draws.
      if (mode === "hidden") for (const view of views) for (const mesh of view.meshes) mesh.visible = false;
    },
    setDistances(next) {
      if (next.lodStarts.length !== lodCount - 1 || (next.shadowLodStarts ?? next.lodStarts).length !== lodCount - 1) throw new Error(`gpu batch ${options.name}: ${lodCount - 1} LOD starts`);
      distances = next;
      const end = Math.min(next.cullEnd, NO_CULL_DISTANCE);
      cullEnd.value = end;
      fadeSpread.value = next.fadeSpread ?? 0;
      // A band without width is a hard cut at the end: the compute pass culls there already.
      fade.value.set(Math.min(next.fadeStart, end * 0.999999), end);
      const four = (starts: readonly number[]) => [0, 1, 2, 3].map((k) => starts[k] ?? NO_CULL_DISTANCE) as [number, number, number, number];
      lodStarts.value.set(...four(next.lodStarts));
      shadowLodStarts.value.set(...four(next.shadowLodStarts ?? next.lodStarts));
    },
    get cullBatch() {
      return { center: options.bounds.center, radius: options.bounds.radius, distanceMode: options.distanceMode, cullEnd: Math.min(distances.cullEnd, NO_CULL_DISTANCE), lodStarts: distances.lodStarts };
    },
    get shadowCullBatch() { return { ...batch.cullBatch, lodStarts: distances.shadowLodStarts ?? distances.lodStarts }; },
    get fadeSpread() { return options.staggeredFade ? distances.fadeSpread ?? 0 : 0; },
    prepare(list) {
      if (colorBuffer && options.instanceColors && colorVersion !== options.instanceColors.version) {
        for (let i = 0; i < options.instanceColors.count; i += 1) colorBuffer.setXYZW(i, options.instanceColors.getX(i), options.instanceColors.getY(i), options.instanceColors.getZ(i), 1);
        colorBuffer.needsUpdate = true; colorVersion = options.instanceColors.version;
      }
      instances.flush();
      count.value = instances.count;
      // Every view drawn this frame is (re)built below for this capacity; the others are hidden.
      capacityNode.value = instances.capacity;
      const accepted = list.filter((view) => (view.role !== "shadow" || options.castShadow !== false) && (view.role !== "cover" || options.precipitationCover === true)).slice(0, maxViews);
      const next = accepted.length;
      if (next !== prepared) bundleDirty = true;
      prepared = next;
      const dispatches: ComputeNode[] = [];
      lastDraws = 0;
      for (let index = 0; index < prepared; index += 1) {
        const source = accepted[index]!;
        // A view that comes and goes (the precipitation cover) keeps its built slot: the one built for this role and layer moves here.
        reuseView(views, index, source);
        const view = views[index] ?? (views[index] = createView(index));
        if (view.built !== instances.generation || view.role !== source.role || view.layer !== source.layer) {
          view.role = source.role; view.layer = source.layer;
          buildView(view);
        }
        for (let plane = 0; plane < 6; plane += 1) {
          view.planes[plane]!.set(source.planes[plane * 4]!, source.planes[plane * 4 + 1]!, source.planes[plane * 4 + 2]!, source.planes[plane * 4 + 3]!);
        }
        view.origin.set(...source.origin);
        const profile = source.casterProfile;
        const threshold = (index: number) => (profile?.texels[index] ?? 0) * (profile?.minTexels ?? 0);
        view.casterRadii.set(source.minCasterRadius ?? 0, threshold(1), threshold(2), threshold(3));
        view.casterEnds.set(profile?.splits[0] ?? NO_CULL_DISTANCE, profile?.splits[1] ?? NO_CULL_DISTANCE, profile?.splits[2] ?? NO_CULL_DISTANCE);
        // A zone that only casts draws its shadow views (R9b).
        const shown = zoneMode !== "shadow" || depthOnlyView(view.role);
        const starts = depthOnlyView(view.role) ? distances.shadowLodStarts ?? distances.lodStarts : distances.lodStarts;
        view.meshes.forEach((mesh, at) => {
          const { lod, material } = draws[at]!;
          mesh.visible = shown && lodHasRange(starts, lod, distances.cullEnd);
          if (mesh.visible) lastDraws += drawPasses(material);
        });
        dispatches.push(...view.dispatches);
      }
      for (let index = prepared; index < views.length; index += 1) for (const mesh of views[index]!.meshes) mesh.visible = false;
      if (bundle && bundleDirty) { bundle.needsUpdate = true; bundleUpdates += 1; }
      bundleDirty = false;
      return dispatches;
    },
    async readCounts(target, view = 0) {
      const source = views[view];
      if (!source) return new Array<number>(lodCount).fill(0);
      const buffer = await target.getArrayBufferAsync(source.counters);
      return Array.from(new Uint32Array(buffer).slice(0, lodCount));
    },
    dispose() {
      for (const view of views) { releaseView(view); view.args.dispose(); view.counters.dispose(); }
      views.length = 0;
      bundle?.removeFromParent();
      instances.dispose();
      drawLodBuffer.dispose();
      colorBuffer?.dispose();
    },
  };
  return batch;
}
