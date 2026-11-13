// Ported from Forge WebGL src/scene/runtimeDebugSnapshot.ts @ forge-webgl-final (04b5fb23); docs/PORT_LOG.md §2.
// The `?debug` scene-cost traversal and the drawing buffer shape (plan phase 3
// step 8). Structural, three-free: the panel hands it the renderer's scene.

/**
 * The drawing buffer actually being shaded: CSS size in `width`/`height` times
 * the effective `pixelRatio`, which the quality profile caps and scales.
 */
export interface DrawingBufferSnapshot {
  readonly width: number;
  readonly height: number;
  readonly pixelRatio: number;
}

/**
 * What `renderer.render` actually walks, per pass (`?debug` scene-graph line).
 *
 * Draw calls say how much reaches the GPU; this says how much the CPU had to
 * look at to decide that, and the two come apart completely — instancing
 * collapses a forest into one draw call while leaving every one of its nodes in
 * the graph, and a shadowing light walks the whole thing a second time. Counted
 * over visible subtrees only, because an invisible parent costs the renderer
 * nothing below it.
 */
export interface SceneGraphCost {
  readonly objects: number;
  readonly meshes: number;
}

/** Shadow-casting geometry attributed to one scene source (a `?debug` bucket). */
export interface ShadowCasterBucket {
  /** Where the geometry came from — see {@link sceneSourceOf}. */
  readonly source: string;
  /** Draw-time meshes, with an `InstancedMesh`'s live `count` already applied. */
  readonly meshes: number;
  readonly triangles: number;
}

/** The two traversal-derived readouts, built from one walk of the scene. */
export interface SceneCostSnapshot {
  readonly graph: SceneGraphCost;
  readonly shadows: readonly ShadowCasterBucket[];
}

/**
 * The minimum of `THREE.Object3D` this module needs. Declared structurally
 * rather than imported so the snapshot builder stays testable with plain
 * objects, and so this module keeps carrying no runtime import at all.
 */
export interface SceneCostObject {
  readonly name?: string;
  readonly type?: string;
  readonly userData?: Record<string, unknown>;
  readonly parent?: SceneCostObject | null;
  readonly children?: readonly SceneCostObject[];
  readonly visible?: boolean;
  readonly castShadow?: boolean;
  readonly isMesh?: boolean;
  readonly isInstancedMesh?: boolean;
  /** Live instance count of an `InstancedMesh` (`count`, not `instanceMatrix`). */
  readonly count?: number;
  readonly geometry?: {
    readonly index?: { readonly count: number } | null;
    readonly attributes?: { readonly position?: { readonly count: number } };
  };
}

/** userData key a scene builder tags an object with to name its content source. */
export const SCENE_SOURCE_KEY = "forgeSceneSource";

/**
 * Names the content source of a subtree the shell just built, for the shadow
 * inventory. The tag is authored by whoever builds the object, never inferred
 * here: the engine has no content taxonomy, and a fork that adds a content kind
 * gets its own bucket by tagging it, without editing the readout.
 */
export function tagSceneSource<T extends { userData: Record<string, unknown> }>(
  object: T,
  source: string,
): T {
  object.userData[SCENE_SOURCE_KEY] = source;
  return object;
}

/**
 * Which content bucket an object belongs to, generically.
 *
 * The template has no fixed content taxonomy, so the label is *data*: the
 * nearest ancestor (or the object itself) carrying a {@link SCENE_SOURCE_KEY}
 * tag wins, and an untagged object falls back to the name — else the type — of
 * the top-level scene child it hangs under. That keeps the bucket meaningful in
 * a fork that tags nothing, without the engine ever naming a game concept.
 */
export function sceneSourceOf(object: SceneCostObject, root: SceneCostObject): string {
  let node: SceneCostObject | null | undefined = object;
  let topLevel: SceneCostObject = object;
  while (node && node !== root) {
    const tag = node.userData?.[SCENE_SOURCE_KEY];
    if (typeof tag === "string" && tag.length > 0) return tag;
    topLevel = node;
    node = node.parent;
  }
  const name = topLevel.name;
  if (typeof name === "string" && name.length > 0) return name;
  return topLevel.type ?? "other";
}

/** Triangle count of one geometry (indexed or not); 0 when it has no positions. */
function triangleCount(object: SceneCostObject): number {
  const geometry = object.geometry;
  if (!geometry) return 0;
  const indexed = geometry.index?.count;
  if (typeof indexed === "number") return Math.floor(indexed / 3);
  const positions = geometry.attributes?.position?.count;
  return typeof positions === "number" ? Math.floor(positions / 3) : 0;
}

export interface SceneCostOptions {
  /** Bucket labeller; defaults to {@link sceneSourceOf}. */
  readonly classify?: (object: SceneCostObject, root: SceneCostObject) => string;
  /** Buckets kept before the rest collapse into `other` (0 = keep all). */
  readonly maxBuckets?: number;
}

/**
 * Walks the visible scene once and builds both traversal readouts.
 *
 * Deliberately *not* per frame: the overlay samples it on its own half-second
 * cadence, because a full `traverseVisible` run charged to every frame would
 * become part of the cost it exists to explain.
 */
export function buildSceneCostSnapshot(
  root: SceneCostObject,
  options: SceneCostOptions = {},
): SceneCostSnapshot {
  const classify = options.classify ?? sceneSourceOf;
  const maxBuckets = options.maxBuckets ?? 6;
  let objects = 0;
  let meshes = 0;
  const buckets = new Map<string, { meshes: number; triangles: number }>();

  const visit = (node: SceneCostObject): void => {
    if (node.visible === false) return;
    objects += 1;
    if (node.isMesh) {
      meshes += 1;
      if (node.castShadow) {
        // An InstancedMesh draws `count` copies of one geometry; charging it as
        // a single mesh understates a painted forest by four orders of magnitude.
        const instances = node.isInstancedMesh ? Math.max(0, node.count ?? 0) : 1;
        const source = classify(node, root);
        const bucket = buckets.get(source) ?? { meshes: 0, triangles: 0 };
        bucket.meshes += instances;
        bucket.triangles += triangleCount(node) * instances;
        buckets.set(source, bucket);
      }
    }
    for (const child of node.children ?? []) visit(child);
  };
  for (const child of root.children ?? []) visit(child);

  const sorted = [...buckets.entries()]
    .map(([source, bucket]) => ({ source, ...bucket }))
    .sort((a, b) => b.triangles - a.triangles || a.source.localeCompare(b.source));
  if (maxBuckets <= 0 || sorted.length <= maxBuckets) {
    return { graph: { objects, meshes }, shadows: sorted };
  }
  const kept = sorted.slice(0, maxBuckets);
  const rest = sorted.slice(maxBuckets);
  kept.push({
    source: "other",
    meshes: rest.reduce((sum, bucket) => sum + bucket.meshes, 0),
    triangles: rest.reduce((sum, bucket) => sum + bucket.triangles, 0),
  });
  return { graph: { objects, meshes }, shadows: kept };
}
