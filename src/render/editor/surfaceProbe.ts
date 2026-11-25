// What lies under many points of an area (plan 5d step 6, INV-B09): the
// Foliage brush's straight-down samples (Forge WebGL's
// raycastFoliageSurfaceDown, scenePicker.ts @ forge-webgl-final). Forge cast
// each sample at the whole scene; here the area's drawn parts (meshes and the
// instances of batches) are gathered once and put in a grid, so a dab tests
// only what it can hit. A pick surface (a terrain) answers by itself, with its
// normal; without one (its tile is not loaded) the point has no surface.

import { DoubleSide, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, Raycaster, Vector3, Box3, type Intersection, type Object3D } from "three/webgpu";
import type { ActorId, Vec3 } from "../../core/index.ts";
import { actorOfObject, instanceActorsOf, pickSurfaceOf, type PickSurface } from "../sync/pickTags.ts";

export interface ProbedSurface {
  readonly actor: ActorId;
  readonly point: Vec3;
  readonly normal: Vec3;
}

/** The topmost surface under a world X / Z; null for none. */
export type SurfaceProbe = (x: number, z: number) => ProbedSurface | null;

interface Part {
  readonly mesh: Mesh;
  readonly actor: ActorId;
  readonly box: Box3;
}

/** Cells per side of the grid over the area. */
const GRID = 32;
const DOWN = new Vector3(0, -1, 0);
const material = new MeshBasicMaterial({ side: DoubleSide });

export function createSurfaceProbe(root: Object3D | null, rect: { readonly minX: number; readonly minZ: number; readonly maxX: number; readonly maxZ: number }): SurfaceProbe {
  const parts: Part[] = [];
  const surfaces: { readonly surface: PickSurface; readonly actor: ActorId }[] = [];
  const box = new Box3();
  const instance = new Matrix4();
  const overlaps = (candidate: Box3): boolean => candidate.max.x >= rect.minX && candidate.min.x <= rect.maxX && candidate.max.z >= rect.minZ && candidate.min.z <= rect.maxZ;
  const add = (source: Mesh, world: Matrix4, actor: ActorId): void => {
    const { geometry } = source;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    box.copy(geometry.boundingBox!).applyMatrix4(world);
    if (!overlaps(box)) return;
    const mesh = new Mesh(geometry, material);
    mesh.matrixWorld.copy(world);
    parts.push({ mesh, actor, box: box.clone() });
  };
  root?.updateMatrixWorld();
  root?.traverseVisible((object) => {
    const surface = pickSurfaceOf(object);
    if (surface) {
      const actor = actorOfObject(object);
      if (actor !== null) surfaces.push({ surface, actor });
      return;
    }
    const mesh = object as Mesh;
    if (mesh.isMesh !== true) return;
    const table = instanceActorsOf(object);
    if (table && object instanceof InstancedMesh) {
      for (let i = 0; i < Math.min(object.count, table.length); i += 1) {
        object.getMatrixAt(i, instance);
        add(object, instance.premultiply(object.matrixWorld), table[i]!);
      }
      return;
    }
    const actor = actorOfObject(object);
    if (actor !== null) add(mesh, mesh.matrixWorld, actor);
  });

  const stepX = Math.max((rect.maxX - rect.minX) / GRID, 1e-3), stepZ = Math.max((rect.maxZ - rect.minZ) / GRID, 1e-3);
  const column = (x: number): number => Math.min(GRID - 1, Math.max(0, Math.floor((x - rect.minX) / stepX)));
  const row = (z: number): number => Math.min(GRID - 1, Math.max(0, Math.floor((z - rect.minZ) / stepZ)));
  const grid: Part[][] = Array.from({ length: GRID * GRID }, () => []);
  for (const part of parts) {
    for (let z = row(part.box.min.z); z <= row(part.box.max.z); z += 1) {
      for (let x = column(part.box.min.x); x <= column(part.box.max.x); x += 1) grid[z * GRID + x]!.push(part);
    }
  }

  const raycaster = new Raycaster();
  const origin = new Vector3(), normal = new Vector3();
  const hits: Intersection[] = [];
  return (x, z) => {
    let best: ProbedSurface | null = null;
    for (const { mesh, actor, box: bounds } of grid[row(z) * GRID + column(x)]!) {
      if (x < bounds.min.x || x > bounds.max.x || z < bounds.min.z || z > bounds.max.z || (best && bounds.max.y <= best.point[1])) continue;
      raycaster.set(origin.set(x, bounds.max.y + 1, z), DOWN);
      hits.length = 0;
      mesh.raycast(raycaster, hits);
      for (const hit of hits) {
        if (best && hit.point.y <= best.point[1]) continue;
        normal.copy(hit.face!.normal).transformDirection(mesh.matrixWorld);
        // A back face met from above (a mirrored instance, a plane from below).
        if (normal.y < 0) normal.negate();
        best = { actor, point: hit.point.toArray(), normal: normal.toArray() };
      }
    }
    for (const { surface, actor } of surfaces) {
      const top = surface.bounds().max.y + 1;
      if (best && top <= best.point[1]) continue;
      const distance = surface.raycast(origin.set(x, top, z), DOWN, 1e5);
      if (distance === null || (best && top - distance <= best.point[1])) continue;
      const up = surface.normal?.(x, z) ?? null;
      // The topmost surface is one whose tile is not loaded: nothing exact is known here.
      best = up ? { actor, point: [x, top - distance, z], normal: up } : null;
    }
    return best;
  };
}
