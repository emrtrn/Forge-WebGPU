// HLOD proxies (plan phase 5b decision 5; Forge WebL's src/scene/hlodProxies.ts
// @ forge-webgl-final, its rules unchanged):
//
// - Every cell of the level's HLOD index shows its baked proxy while it is
//   within the view distance of the camera and its actors are not active;
//   when the cell activates, the real meshes take over and the proxy hides.
// - Proxies are read on demand, at most MAX_IN_FLIGHT at once, and dropped
//   (geometry disposed) past RELEASE_FACTOR × the view distance. A failed read
//   is not retried for this world.
// - One shared material for every proxy: no textures, rough, no shadow
//   casting. The colour comes from the proxy's COLOR_0 through `colorNode`,
//   not the `vertexColors` flag: three's meshlet pipeline refuses materials
//   with that flag (decision 10 keeps that path open). Proxies carry no
//   normals (plan R8.0: they blocked simplification) and shade flat.
//
// The camera's far plane already includes the level's distance and the
// quality multiplier. Read it so proxies and real geometry share the range.

import { Mesh, MeshStandardNodeMaterial, type BufferGeometry, type Camera, type Group } from "three/webgpu";
import { attribute } from "three/tsl";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { distanceToWorldCell } from "../../core/grid/worldGrid.ts";
import { parseCellKey, type LevelSettings } from "../../core/index.ts";
import { effectiveViewDistance } from "../../engine/world/viewDistance.ts";
import type { HlodSource } from "../../engine/world/hlod.ts";

export const MAX_IN_FLIGHT = 4;
export const RELEASE_FACTOR = 1.25;

interface ProxyCell {
  readonly key: string;
  readonly x: number;
  readonly z: number;
  mesh: Mesh | null;
  loading: boolean;
  failed: boolean;
}

export interface HlodProxies {
  /** Per frame. */
  sync(camera: Camera | null, settings: LevelSettings | undefined): void;
  /** Proxies drawn now and held in memory, for `?debug` and the leak measurement. */
  stats(): { readonly visible: number; readonly loaded: number; readonly cells: number };
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

/** `track` counts a read toward readiness (the cache's `track`). */
export function createHlodProxies(source: HlodSource, parent: Group, track: <T>(work: Promise<T>) => Promise<T> = (work) => work): HlodProxies {
  const material = new MeshStandardNodeMaterial({ roughness: 1, metalness: 0, flatShading: true });
  material.colorNode = attribute<"vec3">("color", "vec3");
  const grid = { cellSize: source.index.cellSize };
  const cells: ProxyCell[] = source.index.cells.flatMap((entry) => {
    const coord = parseCellKey(entry.key);
    return coord ? [{ key: entry.key, x: coord.x, z: coord.z, mesh: null, loading: false, failed: false }] : [];
  });
  let inFlight = 0;
  let disposed = false;

  const release = (cell: ProxyCell): void => {
    if (!cell.mesh) return;
    parent.remove(cell.mesh);
    cell.mesh.geometry.dispose();
    // A plain Mesh has no dispose(): the renderer frees the object's render objects
    // and bindings only on its "dispose" event (InstancedMesh.dispose sends it).
    cell.mesh.dispatchEvent({ type: "dispose" });
    cell.mesh = null;
  };

  const start = (cell: ProxyCell): void => {
    cell.loading = true;
    inFlight += 1;
    track(source.load(cell.key).then((bytes) => (bytes ? parseProxy(bytes) : null)))
      .then((geometry) => {
        if (disposed) {
          geometry?.dispose();
          return;
        }
        if (!geometry || !geometry.getAttribute("color")) {
          geometry?.dispose();
          cell.failed = true;
          return;
        }
        const mesh = new Mesh(geometry, material);
        mesh.name = `HLOD ${cell.key}`;
        mesh.castShadow = false;
        mesh.receiveShadow = true;
        mesh.visible = false;
        mesh.matrixAutoUpdate = false;
        cell.mesh = mesh;
        parent.add(mesh);
      })
      .catch((error: unknown) => {
        cell.failed = true;
        console.warn(`forge render: HLOD proxy ${cell.key} could not be read`, error);
      })
      .finally(() => {
        cell.loading = false;
        inFlight -= 1;
      });
  };

  return {
    sync(camera, settings) {
      if (disposed || camera === null) return;
      const view = (camera as Camera & { far?: number }).far ?? effectiveViewDistance(settings?.viewDistance, 1) ?? 2000;
      const { x, z } = camera.position;
      for (const cell of cells) {
        const distance = distanceToWorldCell(grid, cell.x, cell.z, x, z);
        if (distance > view * RELEASE_FACTOR) {
          release(cell);
          continue;
        }
        const wanted = distance <= view && !source.isCellActive(cell.key);
        if (cell.mesh) cell.mesh.visible = wanted;
        else if (wanted && !cell.loading && !cell.failed && inFlight < MAX_IN_FLIGHT) start(cell);
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
      return { visible, loaded, cells: cells.length };
    },
    dispose() {
      disposed = true;
      for (const cell of cells) release(cell);
      material.dispose();
    },
  };
}
