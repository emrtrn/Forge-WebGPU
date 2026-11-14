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
//   instance buffers are rewritten in place.
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

import { Color, InstancedMesh, Matrix4, type BufferGeometry, type Material, type Object3D } from "three/webgpu";
import type { ActorId, WorldActor, WorldActorChange } from "../../core/index.ts";
import { SCENE_SOURCE_KEY } from "../../engine/perf/sceneCost.ts";
import { tagInstanceActors } from "./pickTags.ts";

export interface InstancePart {
  readonly geometry: BufferGeometry;
  readonly material: Material | Material[];
  /** The part's matrix inside the template (its world matrix under the template root). */
  readonly local: Matrix4;
  readonly name: string;
}

export interface InstanceBatch {
  /** Adds or moves a placement of `actor`; `color` is `#rrggbb` or null. */
  set(id: string, matrix: Matrix4, color: string | null, actor: ActorId): void;
  delete(id: string): void;
  /** Moves a placement: only its matrix changes. False when there is no such placement. */
  move(id: string, matrix: Matrix4): boolean;
  readonly size: number;
  /** The parts to draw; until set, placements wait and nothing is drawn. */
  setParts(parts: readonly InstancePart[]): void;
  /** Rebuilds the instanced meshes if anything changed since the last flush. */
  flush(): void;
  readonly meshes: readonly InstancedMesh[];
  dispose(): void;
}

export interface InstanceBatchOptions {
  readonly name: string;
  /** The `?debug` scene-cost bucket its meshes count in (`SCENE_SOURCE_KEY`), e.g. `staticMesh`. */
  readonly source?: string;
  readonly parent: Object3D;
  readonly castShadow: boolean;
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
  let meshes: InstancedMesh[] = [];
  let capacity = 0;
  let colored = false;
  let dirty = false;
  /** Placements moved since the last flush (their matrices only). */
  const moved = new Set<string>();
  /** Placement -> its instance index, as the last full flush wrote it. */
  const indexOf = new Map<string, number>();
  const matrix = new Matrix4();
  const color = new Color();
  const shown = new Color();

  const removeMeshes = (): void => {
    for (const mesh of meshes) {
      mesh.removeFromParent();
      mesh.dispose();
    }
    meshes = [];
    capacity = 0;
  };

  return {
    set(id, placement, placementColor, actor) {
      placements.set(id, { matrix: placement.clone(), color: placementColor, actor });
      dirty = true;
    },
    delete(id) {
      if (placements.delete(id)) dirty = true;
    },
    move(id, placement) {
      const entry = placements.get(id);
      if (!entry) return false;
      entry.matrix.copy(placement);
      moved.add(id);
      return true;
    },
    get size() {
      return placements.size;
    },
    setParts(next) {
      parts = next;
      removeMeshes();
      dirty = true;
    },
    flush() {
      if (parts === null) return;
      if (!dirty) {
        if (moved.size === 0 || meshes.length === 0) return;
        meshes.forEach((mesh, partIndex) => {
          const local = parts![partIndex]!.local;
          for (const id of moved) {
            const index = indexOf.get(id);
            if (index !== undefined) mesh.setMatrixAt(index, matrix.multiplyMatrices(placements.get(id)!.matrix, local));
          }
          mesh.instanceMatrix.needsUpdate = true;
          mesh.computeBoundingSphere();
          mesh.computeBoundingBox();
        });
        moved.clear();
        return;
      }
      dirty = false;
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
      if (count > capacity || needsColor !== colored || meshes.length === 0) {
        removeMeshes();
        capacity = capacityFor(count);
        colored = needsColor;
        meshes = parts.map((part) => {
          const mesh = new InstancedMesh(part.geometry, part.material, capacity);
          mesh.name = `${options.name}/${part.name}`;
          mesh.castShadow = options.castShadow;
          mesh.receiveShadow = true;
          mesh.matrixAutoUpdate = false;
          if (options.source !== undefined) mesh.userData[SCENE_SOURCE_KEY] = options.source;
          options.parent.add(mesh);
          return mesh;
        });
      }
      const actors = [...placements.values()].map((entry) => entry.actor);
      meshes.forEach((mesh, partIndex) => {
        tagInstanceActors(mesh, actors);
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
    },
    get meshes() {
      return meshes;
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
