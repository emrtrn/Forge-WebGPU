// Which actor a drawn object belongs to (plan phase 4 step 3; architecture
// §4.9: picking is on the CPU, meshes and instances through an instance ->
// actor table, a terrain through its height field). A render binding tags
// what it adds under the world's root; a picker (the editor's, later a
// game's) reads the tags and never knows a binding:
//
// - `tagActorObject`: an object drawn for one actor (its descendants count);
// - `tagInstanceActors`: an instanced batch's actor per instance index
//   (instancing is the render layer's batching, architecture §4.4);
// - `tagPickSurface`: an object whose triangles are not its surface (the
//   terrain's shared CDLOD patch, displaced on the GPU) answers a ray itself,
//   in world space, and gives its bounds; its triangles are not picked.
// - `tagPartSlots`: the model material slot each of an object's materials
//   draws (plan phase 4 step 6f: a material dropped on a mesh goes to the
//   slot under the pointer, user decision 2026-11-14).

import type { Box3, InstancedMesh, Object3D, Vector3 } from "three/webgpu";
import type { ActorId } from "../../core/index.ts";

const ACTOR = "forgePickActor";
const INSTANCES = "forgePickInstances";
const SURFACE = "forgePickSurface";
const SLOTS = "forgePickSlots";

/** A surface that answers a world-space ray itself. */
export interface PickSurface {
  /** Distance along the unit `direction` to the first hit within `far`; null for none. */
  raycast(origin: Vector3, direction: Vector3, far: number): number | null;
  /** World-space bounds (focus, the orbit target). */
  bounds(): Box3;
}

export function tagActorObject(object: Object3D, actor: ActorId): void {
  object.userData[ACTOR] = actor;
}

/** `actors[i]` is the actor instance i draws; the array is replaced, not changed in place, when the batch is rebuilt. */
export function tagInstanceActors(mesh: InstancedMesh, actors: readonly ActorId[]): void {
  mesh.userData[INSTANCES] = actors;
}

/** `slots[i]` is the model slot material i of the object draws (one entry for a single material). */
export function tagPartSlots(object: Object3D, slots: readonly number[]): void {
  object.userData[SLOTS] = slots;
}

/** The model slot under a hit (its face's material); null when the object is not tagged. */
export function slotOfHit(hit: { readonly object: Object3D; readonly face?: { readonly materialIndex: number } | null | undefined }): number | null {
  const slots = hit.object.userData[SLOTS] as readonly number[] | undefined;
  if (!slots) return null;
  return slots[hit.face?.materialIndex ?? 0] ?? null;
}

export function tagPickSurface(object: Object3D, surface: PickSurface): void {
  object.userData[SURFACE] = surface;
}

/** The actor an object itself is tagged with (not an ancestor's); null for none. */
export function ownActorOf(object: Object3D): ActorId | null {
  return (object.userData[ACTOR] as ActorId | undefined) ?? null;
}

/** The actor an object is drawn for (itself or the nearest tagged ancestor); null for none. */
export function actorOfObject(object: Object3D | null): ActorId | null {
  for (let current = object; current; current = current.parent) {
    const actor = current.userData[ACTOR] as ActorId | undefined;
    if (actor !== undefined) return actor;
  }
  return null;
}

/** An instanced mesh's actor table; null when the mesh is not tagged. */
export function instanceActorsOf(object: Object3D): readonly ActorId[] | null {
  return (object.userData[INSTANCES] as readonly ActorId[] | undefined) ?? null;
}

export function pickSurfaceOf(object: Object3D): PickSurface | null {
  return (object.userData[SURFACE] as PickSurface | undefined) ?? null;
}

/** The actor a ray hit belongs to: its instance's, else its object's. */
export function actorOfHit(hit: { readonly object: Object3D; readonly instanceId?: number | undefined }): ActorId | null {
  const instances = instanceActorsOf(hit.object);
  if (instances && hit.instanceId !== undefined) return instances[hit.instanceId] ?? null;
  return actorOfObject(hit.object);
}
