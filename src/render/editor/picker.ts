// The editor viewport's picking (plan phase 4 step 3; INV-A04, a rewrite of
// Forge WebGL's ScenePicker): on the CPU, from the tags render bindings put on
// what they draw (render/sync/pickTags.ts):
//
// - meshes and instanced batches by their triangles (three's Raycaster), an
//   instance's actor from its batch's table;
// - a pick surface (a terrain's height field) by its own ray test; its drawn
//   triangles are not tested.
//
// The nearest hit with an actor wins; the editor's helpers (icons, drawn over
// the scene) are tried first and win when hit. `raycast` casts any world ray
// at what the actors draw, some actors left out (the gizmo's snap to floor /
// wall, step 4). The same tags give the world
// bounds of an actor's drawn parts and helpers (focus, the orbit target) and
// the drawn parts themselves (the selection outline draws them).

import { Box3, InstancedMesh, Matrix4, Raycaster, Vector2, Vector3, type BufferGeometry, type Camera, type Intersection, type Mesh, type Object3D } from "three/webgpu";
import type { ActorId } from "../../core/index.ts";
import { actorOfHit, actorOfObject, instanceActorsOf, ownActorOf, pickSurfaceOf, type PickSurface } from "../sync/pickTags.ts";

export interface ViewportPick {
  readonly actor: ActorId;
  readonly distance: number;
  readonly point: Vector3;
}

/** One drawn part of an actor: its geometry at a world matrix. */
export interface DrawnPart {
  readonly geometry: BufferGeometry;
  readonly matrix: Matrix4;
}

export interface ScenePicker {
  /** The nearest actor under a point in normalised device coordinates (-1..1, y up). */
  pick(ndc: Vector2, camera: Camera): ViewportPick | null;
  /** The first hit of a world ray (unit direction) on what the actors draw within `far`; `exclude`'s actors and the helpers left out. */
  raycast(origin: Vector3, direction: Vector3, far: number, exclude: ReadonlySet<ActorId>): ViewportPick | null;
  /** World bounds of everything drawn for these actors; null when none of them draws anything. */
  bounds(actors: ReadonlySet<ActorId>): Box3 | null;
  /** The triangle parts drawn for these actors (a pick surface has none). */
  parts(actors: ReadonlySet<ActorId>, visit: (part: DrawnPart) => void): void;
}

const isMesh = (object: Object3D): object is Mesh => (object as Mesh).isMesh === true;
const NONE: ReadonlySet<ActorId> = new Set();

export function createScenePicker(root: () => Object3D | null, helpers: () => Object3D | null = () => null): ScenePicker {
  const raycaster = new Raycaster();
  const hits: Intersection[] = [];
  const instance = new Matrix4();
  const world = new Matrix4();

  const visitDrawn = (actors: ReadonlySet<ActorId>, onPart: (part: DrawnPart) => void, onSurface: (surface: PickSurface) => void): void => {
    const top = root();
    if (!top || actors.size === 0) return;
    top.updateMatrixWorld();
    top.traverseVisible((object) => {
      const surface = pickSurfaceOf(object);
      if (surface) {
        const actor = actorOfObject(object);
        if (actor !== null && actors.has(actor)) onSurface(surface);
        return;
      }
      if (!isMesh(object)) return;
      const table = instanceActorsOf(object);
      if (table && object instanceof InstancedMesh) {
        for (let index = 0; index < Math.min(object.count, table.length); index += 1) {
          if (!actors.has(table[index]!)) continue;
          object.getMatrixAt(index, instance);
          onPart({ geometry: object.geometry, matrix: world.multiplyMatrices(object.matrixWorld, instance).clone() });
        }
        return;
      }
      const actor = actorOfObject(object);
      if (actor !== null && actors.has(actor)) onPart({ geometry: object.geometry, matrix: object.matrixWorld.clone() });
    });
  };

  const pickHelpers = (): ViewportPick | null => {
    const top = helpers();
    if (!top) return null;
    top.updateMatrixWorld();
    hits.length = 0;
    raycaster.intersectObject(top, true, hits);
    for (const hit of hits) {
      if (!hit.object.visible) continue;
      const actor = actorOfHit(hit);
      if (actor !== null) return { actor, distance: hit.distance, point: hit.point.clone() };
    }
    return null;
  };

  /** The nearest actor the raycaster's ray hits in the scene (meshes, instances, pick surfaces), `exclude` left out. */
  const castScene = (exclude: ReadonlySet<ActorId>): ViewportPick | null => {
    const top = root();
    if (!top) return null;
    top.updateMatrixWorld();
    const meshes: Object3D[] = [];
    const surfaces: { object: Object3D; surface: PickSurface }[] = [];
    top.traverseVisible((object) => {
      const surface = pickSurfaceOf(object);
      if (surface) surfaces.push({ object, surface });
      else if (isMesh(object)) meshes.push(object);
    });
    hits.length = 0;
    raycaster.intersectObjects(meshes, false, hits);
    let best: ViewportPick | null = null;
    for (const hit of hits) {
      const actor = actorOfHit(hit);
      if (actor === null || exclude.has(actor)) continue;
      best = { actor, distance: hit.distance, point: hit.point.clone() };
      break;
    }
    for (const { object, surface } of surfaces) {
      const actor = actorOfObject(object);
      if (actor === null || exclude.has(actor)) continue;
      const distance = surface.raycast(raycaster.ray.origin, raycaster.ray.direction, best?.distance ?? raycaster.far);
      if (distance === null || (best && distance >= best.distance)) continue;
      best = { actor, distance, point: raycaster.ray.at(distance, new Vector3()) };
    }
    return best;
  };

  return {
    pick(ndc, camera) {
      raycaster.setFromCamera(ndc, camera);
      raycaster.near = 0;
      raycaster.far = Infinity;
      return pickHelpers() ?? castScene(NONE);
    },
    raycast(origin, direction, far, exclude) {
      raycaster.set(origin, direction);
      raycaster.near = 0;
      raycaster.far = far;
      return castScene(exclude);
    },
    bounds(actors) {
      const box = new Box3();
      const part = new Box3();
      visitDrawn(
        actors,
        ({ geometry, matrix }) => {
          if (!geometry.boundingBox) geometry.computeBoundingBox();
          box.union(part.copy(geometry.boundingBox!).applyMatrix4(matrix));
        },
        (surface) => void box.union(surface.bounds()),
      );
      const helperRoot = helpers();
      if (helperRoot) {
        helperRoot.updateMatrixWorld();
        helperRoot.traverseVisible((object) => {
          const actor = ownActorOf(object);
          if (actor !== null && actors.has(actor)) box.union(part.setFromObject(object));
        });
      }
      return box.isEmpty() ? null : box;
    },
    parts(actors, visit) {
      visitDrawn(actors, visit, () => {});
    },
  };
}
