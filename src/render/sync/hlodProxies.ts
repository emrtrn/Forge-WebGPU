// HLOD proxies (plan phase 5b decision 5; Forge WebL's src/scene/hlodProxies.ts
// @ forge-webgl-final, its rules unchanged), with layer 1 (plan 5c R8.3):
//
// - Every cell of the level's HLOD index shows its baked proxy while it is
//   within the view distance of the camera and its actors are not active;
//   when the cell activates, the real meshes take over and the proxy hides.
// - Layer 1: a 4 × 4 cluster with a proxy draws instead of its cells' proxies
//   past the switch distance (`hlodSwitchDistance`: twice the load range, at
//   least six cells, with the quality multiplier; 10 % hysteresis on the way
//   back) while none of its cells is active. Coming closer, the cluster stays
//   until each of its cells' proxies has been read (or failed), so no hole
//   opens; an active cell hides it at once (no proxy over real meshes).
// - Proxies are read on demand, at most MAX_IN_FLIGHT at once, and dropped
//   (geometry disposed) past RELEASE_FACTOR × the view distance. A failed read
//   is not retried for this world. A cell under a drawn cluster is not read.
// - One shared material for every proxy: no textures, rough, no shadow
//   casting. The colour comes from the proxy's COLOR_0 through `colorNode`,
//   not the `vertexColors` flag: three's meshlet pipeline refuses materials
//   with that flag (decision 10 keeps that path open). Proxies carry no
//   normals (plan R8.0: they blocked simplification) and shade flat.
//   They get wet and snowy as the statics they stand for (plan phase W4,
//   HV-12): the world's surface weather draws its copy of the material.
//
// - Landmarks (plan 5c R8.4): the level's landmark proxy is read once and drawn
//   as one mesh. Each vertex carries its placement's origin (`_center`); a
//   landmark whose origin is within the view distance (real meshes or the
//   proxies above draw it) or past the landmark distance collapses to a point.
//   The rest is pulled along the camera ray to just inside the far plane: the
//   same pixels, a nearer depth, so the camera's far plane, the shadow
//   cascades and every other culling stay as they are.
//
// The camera's far plane already includes the level's distance and the
// quality multiplier. Read it so proxies and real geometry share the range.

import { Mesh, MeshStandardNodeMaterial, type BufferGeometry, type Camera, type Group } from "three/webgpu";
import type { SurfaceWeather } from "../materials/surfaceWeather.ts";
import { attribute, cameraPosition, max, positionLocal, select, uniform } from "three/tsl";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { distanceToWorldCell } from "../../core/grid/worldGrid.ts";
import { parseCellKey, type LevelSettings } from "../../core/index.ts";
import { effectiveViewDistance } from "../../engine/world/viewDistance.ts";
import { markCover } from "../gpu/gpuDrivenBatch.ts";
import { HLOD_CLUSTER_CELLS, HLOD_LANDMARK_FILE, hlodCellFileOf, hlodClusterFileOf, hlodClusterOf, type HlodSource } from "../../engine/world/hlod.ts";

export const MAX_IN_FLIGHT = 4;
export const RELEASE_FACTOR = 1.25;
/** A drawn cluster gives way to its cells only this much nearer than the switch distance. */
export const CLUSTER_HYSTERESIS = 0.9;
const DEFAULT_LOAD_RANGE = 384;
/** Landmark Distance 0: this many view distances. */
export const DEFAULT_LANDMARK_FACTOR = 3;
/** Landmarks are pulled to this fraction of the far plane. */
const LANDMARK_DEPTH = 0.999;

/** How far landmarks show (plan 5c R8.4): the level's Landmark Distance × the quality multiplier, else 3 view distances. */
export function hlodLandmarkDistance(settings: LevelSettings | undefined, view: number, multiplier = 1): number {
  const authored = settings?.landmarkDistance ?? 0;
  return authored > 0 ? Math.max(view, authored * multiplier) : view * DEFAULT_LANDMARK_FACTOR;
}

/** Where layer 1 takes over (plan 5c R8): max(2 × load range, 6 cells), times the quality multiplier. */
export function hlodSwitchDistance(settings: LevelSettings | undefined, cellSize: number, multiplier = 1): number {
  return Math.max(2 * (settings?.loadRange ?? DEFAULT_LOAD_RANGE), 6 * cellSize) * multiplier;
}

interface Proxy {
  readonly key: string;
  readonly file: string;
  readonly x: number;
  readonly z: number;
  mesh: Mesh | null;
  loading: boolean;
  failed: boolean;
}

/** A cell under a cluster: drawn over (`covered`), awaiting its read (`pending`), or taking over (`handover`). */
type CellRole = "covered" | "pending" | "handover";

interface Cluster extends Proxy {
  readonly cells: Proxy[];
  shown: boolean;
}

export interface HlodProxies {
  /** Per frame; `multiplier` is the quality profile's view distance multiplier. */
  sync(camera: Camera | null, settings: LevelSettings | undefined, multiplier?: number): void;
  /** Proxies drawn now and held in memory, for `?debug` and the leak measurement; clusters counted apart. */
  stats(): {
    readonly visible: number; readonly loaded: number; readonly cells: number;
    readonly clusters: { readonly visible: number; readonly loaded: number; readonly total: number };
    readonly landmarks: boolean;
  };
  dispose(): void;
}

/** The first mesh geometry of a proxy GLB; null when there is none. */
async function parseProxy(bytes: ArrayBuffer): Promise<BufferGeometry | null> {
  const gltf = await new GLTFLoader().parseAsync(bytes, "");
  let geometry: BufferGeometry | null = null;
  gltf.scene.traverse((object) => {
    const mesh = object as Mesh;
    if (geometry === null && mesh.isMesh) {
      mesh.updateWorldMatrix(true, false);
      geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    }
  });
  gltf.scene.traverse((object) => (object as Mesh).geometry?.dispose());
  return geometry;
}

/** `track` counts a read toward readiness (the cache's `track`); `weather` wets and snows the proxies as the statics they stand for (plan phase W4, HV-12). */
export function createHlodProxies(
  source: HlodSource, parent: Group, track: <T>(work: Promise<T>) => Promise<T> = (work) => work, weather?: SurfaceWeather,
): HlodProxies {
  const material = new MeshStandardNodeMaterial({ roughness: 1, metalness: 0, flatShading: true });
  material.colorNode = attribute<"vec3">("color", "vec3");
  // Landmarks: shown between the view distance and the landmark distance, pulled inside the far plane.
  const landmarkMaterial = new MeshStandardNodeMaterial({ roughness: 1, metalness: 0, flatShading: true });
  landmarkMaterial.colorNode = attribute<"vec3">("color", "vec3");
  const landmarkFrom = uniform(0), landmarkTo = uniform(0), landmarkDepth = uniform(0);
  const fromCamera = attribute<"vec3">("_center", "vec3").sub(cameraPosition).length();
  const ray = positionLocal.sub(cameraPosition);
  const pulled = cameraPosition.add(ray.mul(landmarkDepth.div(max(ray.length(), 1e-3)).min(1)));
  landmarkMaterial.positionNode = select(fromCamera.greaterThan(landmarkFrom).and(fromCamera.lessThan(landmarkTo)), pulled, cameraPosition);
  const landmark: Proxy | null = source.index.landmarks
    ? { key: "landmarks", file: HLOD_LANDMARK_FILE, x: 0, z: 0, mesh: null, loading: false, failed: false }
    : null;
  const cellSize = source.index.cellSize;
  const grid = { cellSize };
  const clusterGrid = { cellSize: cellSize * HLOD_CLUSTER_CELLS };
  const cells: Proxy[] = source.index.cells.flatMap((entry) => {
    const coord = parseCellKey(entry.key);
    return coord ? [{ key: entry.key, file: hlodCellFileOf(entry.key), x: coord.x, z: coord.z, mesh: null, loading: false, failed: false }] : [];
  });
  const clusters: Cluster[] = source.index.clusters.flatMap((entry) => {
    const coord = parseCellKey(entry.key);
    if (!coord) return [];
    const members = cells.filter((cell) => hlodClusterOf(cell.x, cell.z) === entry.key);
    return [{ key: entry.key, file: hlodClusterFileOf(entry.key), x: coord.x, z: coord.z, mesh: null, loading: false, failed: false, cells: members, shown: false }];
  });
  const roles = new Map<Proxy, CellRole>();
  let inFlight = 0;
  let disposed = false;

  const release = (proxy: Proxy): void => {
    if (!proxy.mesh) return;
    parent.remove(proxy.mesh);
    proxy.mesh.geometry.dispose();
    // A plain Mesh has no dispose(): the renderer frees the object's render objects
    // and bindings only on its "dispose" event (InstancedMesh.dispose sends it).
    proxy.mesh.dispatchEvent({ type: "dispose" });
    proxy.mesh = null;
  };

  const start = (proxy: Proxy, drawWith = material): void => {
    if (proxy.mesh || proxy.loading || proxy.failed || inFlight >= MAX_IN_FLIGHT) return;
    proxy.loading = true;
    inFlight += 1;
    track(source.load(proxy.file).then((bytes) => (bytes ? parseProxy(bytes) : null)))
      .then((geometry) => {
        if (disposed) {
          geometry?.dispose();
          return;
        }
        if (!geometry || !geometry.getAttribute("color") || (drawWith === landmarkMaterial && !geometry.getAttribute("_center"))) {
          geometry?.dispose();
          proxy.failed = true;
          return;
        }
        const mesh = new Mesh(geometry, weather ? weather.material(drawWith) : drawWith);
        // The landmark mesh's bounds reach past the far plane; its vertices are pulled in.
        if (drawWith === landmarkMaterial) mesh.frustumCulled = false;
        mesh.name = `HLOD ${proxy.file}`;
        mesh.castShadow = false;
        mesh.receiveShadow = true;
        // Plan phase W3: a far cell's statics still block rain and snow.
        markCover(mesh);
        mesh.visible = false;
        mesh.matrixAutoUpdate = false;
        proxy.mesh = mesh;
        parent.add(mesh);
      })
      .catch((error: unknown) => {
        proxy.failed = true;
        console.warn(`forge render: HLOD proxy ${proxy.file} could not be read`, error);
      })
      .finally(() => {
        proxy.loading = false;
        inFlight -= 1;
      });
  };

  const settled = (proxy: Proxy): boolean => proxy.mesh !== null || proxy.failed;

  return {
    sync(camera, settings, multiplier = 1) {
      if (disposed || camera === null) return;
      const view = (camera as Camera & { far?: number }).far ?? effectiveViewDistance(settings?.viewDistance, 1) ?? 2000;
      const switchAt = hlodSwitchDistance(settings, cellSize, multiplier);
      if (landmark) {
        landmarkFrom.value = view;
        landmarkTo.value = hlodLandmarkDistance(settings, view, multiplier);
        landmarkDepth.value = view * LANDMARK_DEPTH;
        if (landmark.mesh) landmark.mesh.visible = true;
        else start(landmark, landmarkMaterial);
      }
      const { x, z } = camera.position;
      roles.clear();
      for (const cluster of clusters) {
        const distance = distanceToWorldCell(clusterGrid, cluster.x, cluster.z, x, z);
        if (distance > view * RELEASE_FACTOR) {
          release(cluster);
          cluster.shown = false;
          continue;
        }
        const anyActive = cluster.cells.some((cell) => source.isCellActive(cell.key));
        const far = distance > switchAt * (cluster.shown ? CLUSTER_HYSTERESIS : 1);
        // Handing over waits only for the cells that will show (within view); failed reads count as done.
        const ready = cluster.cells.every((cell) => settled(cell) || distanceToWorldCell(grid, cell.x, cell.z, x, z) > view);
        const wanted = !anyActive && distance <= view && (far || (cluster.shown && !ready));
        if (wanted && !cluster.mesh) start(cluster);
        cluster.shown = wanted && cluster.mesh !== null;
        if (cluster.mesh) cluster.mesh.visible = cluster.shown;
        // Far and wanted: the cluster stands in for its cells (they are not read; ones already
        // read show until it arrives). Shown but near: it hands over (cells read, not shown yet).
        const role: CellRole | null = wanted && far ? (cluster.shown ? "covered" : "pending") : cluster.shown ? "handover" : null;
        if (role) for (const cell of cluster.cells) roles.set(cell, role);
      }
      for (const cell of cells) {
        const distance = distanceToWorldCell(grid, cell.x, cell.z, x, z);
        if (distance > view * RELEASE_FACTOR) {
          release(cell);
          continue;
        }
        const role = roles.get(cell);
        const wanted = distance <= view && !source.isCellActive(cell.key);
        if (cell.mesh) cell.mesh.visible = wanted && (role === undefined || role === "pending");
        else if (wanted && (role === undefined || role === "handover")) start(cell);
      }
    },
    stats() {
      let visible = 0;
      let loaded = 0;
      for (const cell of cells) {
        if (!cell.mesh) continue;
        loaded += 1;
        if (cell.mesh.visible) visible += 1;
      }
      let clustersVisible = 0;
      let clustersLoaded = 0;
      for (const cluster of clusters) {
        if (!cluster.mesh) continue;
        clustersLoaded += 1;
        if (cluster.mesh.visible) clustersVisible += 1;
      }
      return { visible, loaded, cells: cells.length, clusters: { visible: clustersVisible, loaded: clustersLoaded, total: clusters.length }, landmarks: landmark?.mesh != null };
    },
    dispose() {
      disposed = true;
      for (const proxy of [...cells, ...clusters, ...(landmark ? [landmark] : [])]) release(proxy);
      material.dispose();
      landmarkMaterial.dispose();
    },
  };
}
