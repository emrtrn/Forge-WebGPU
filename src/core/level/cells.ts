// The level grid and cell assignment (architecture §4.4, decision A11).
//
// A level has one fixed 2D grid on the X/Z plane, origin at the world origin,
// with `settings.cellSize` edges. A cell is named by its integer coordinates,
// `"<x>_<z>"` (negatives allowed), the same key format as Forge's partition.
//
// Assignment, i.e. which file an actor is saved in:
// - A root actor (no parent) belongs to the cell its position falls in. A
//   point on a cell edge belongs to the cell whose min edge it is.
// - A child actor stays with its root, whatever its own flag says. So an
//   actor's `parent` is always in the same file as the actor.
// - A root with `spatiallyLoaded: false` stays in the persistent layer, with
//   all its children.
// - An actor tree that holds a singleton component anywhere stays in the
//   persistent layer: "at most one per level" is then checked in one file.
// - An actor whose parent is not in the level, or whose parent chain loops,
//   goes to the persistent layer and is reported.
//
// Whether an actor is larger than a cell needs its bounds, which core does not
// know; `exceedsCell` is the rule, and the editor proposes the move.

import type { ActorId } from "../id.ts";
import {
  childPath,
  createContext,
  finish,
  indexPath,
  reportLoss,
  type NormalizeOptions,
  type NormalizeResult,
} from "../schema/issues.ts";
import { componentDefOf, type SchemaRegistry } from "../schema/registry.ts";
import type { ClassResolver } from "./actorClass.ts";
import type { ActorDoc } from "./model.ts";
import type { LevelSettings } from "./settings.ts";

export interface CellCoord {
  readonly x: number;
  readonly z: number;
}

export interface CellBounds {
  readonly minX: number;
  readonly minZ: number;
  readonly maxX: number;
  readonly maxZ: number;
}

/** `-0` and leading zeros are not keys: one cell, one spelling. */
export const CELL_KEY_PATTERN = /^(0|-?[1-9][0-9]*)_(0|-?[1-9][0-9]*)$/;

export function cellKey(coord: CellCoord): string {
  // `+ 0` turns -0 into 0.
  return `${coord.x + 0}_${coord.z + 0}`;
}

export function parseCellKey(key: string): CellCoord | null {
  const match = CELL_KEY_PATTERN.exec(key);
  if (!match) return null;
  const x = Number(match[1]);
  const z = Number(match[2]);
  return Number.isSafeInteger(x) && Number.isSafeInteger(z) ? { x, z } : null;
}

export function isCellKey(value: unknown): value is string {
  return typeof value === "string" && parseCellKey(value) !== null;
}

/** Row by row: z first, then x. The order cells are listed and merged in. */
export function compareCellKeys(a: string, b: string): number {
  const first = parseCellKey(a);
  const second = parseCellKey(b);
  if (!first || !second) return a < b ? -1 : a > b ? 1 : 0;
  return first.z - second.z || first.x - second.x;
}

export function cellAt(cellSize: number, worldX: number, worldZ: number): CellCoord {
  return { x: Math.floor(worldX / cellSize), z: Math.floor(worldZ / cellSize) };
}

export function cellBounds(cellSize: number, coord: CellCoord): CellBounds {
  const minX = coord.x * cellSize;
  const minZ = coord.z * cellSize;
  return { minX, minZ, maxX: minX + cellSize, maxZ: minZ + cellSize };
}

/** An actor whose X/Z footprint is larger than a cell belongs in the persistent layer (A11). */
export function exceedsCell(cellSize: number, footprint: { readonly width: number; readonly depth: number }): boolean {
  return footprint.width > cellSize || footprint.depth > cellSize;
}

export interface CellAssignOptions extends NormalizeOptions {
  readonly registry: SchemaRegistry;
  readonly resolveClass: ClassResolver;
}

/** Actor id -> cell key, or null for the persistent layer. Every actor id of the input is in it. */
export type CellAssignment = Map<ActorId, string | null>;

/**
 * Assigns every actor of a whole level to a cell or to the persistent layer.
 * Issue paths are `actors[i]...` of the given list.
 */
export function assignCells(
  actors: readonly ActorDoc[],
  settings: LevelSettings,
  options: CellAssignOptions,
): NormalizeResult<CellAssignment> {
  const ctx = createContext(options);
  const byId = new Map<ActorId, { actor: ActorDoc; index: number }>();
  actors.forEach((actor, index) => {
    if (!byId.has(actor.id)) byId.set(actor.id, { actor, index });
  });

  // Root of each actor; null when the chain is broken (missing parent, loop).
  const rootOf = new Map<ActorId, ActorId | null>();
  const findRoot = (start: ActorId): ActorId | null => {
    const known = rootOf.get(start);
    if (known !== undefined) return known;
    const chain: ActorId[] = [];
    const onChain = new Set<ActorId>();
    let current: ActorId = start;
    let root: ActorId | null;
    for (;;) {
      const cached = rootOf.get(current);
      if (cached !== undefined) {
        root = cached;
        break;
      }
      if (onChain.has(current)) {
        root = null;
        break;
      }
      chain.push(current);
      onChain.add(current);
      const parent = byId.get(current)?.actor.parent ?? null;
      if (parent === null) {
        root = current;
        break;
      }
      if (!byId.has(parent)) {
        root = null;
        break;
      }
      current = parent;
    }
    for (const id of chain) rootOf.set(id, root);
    return root;
  };

  const persistentRoots = new Set<ActorId>();
  for (const { actor } of byId.values()) {
    const root = findRoot(actor.id);
    if (root !== null && holdsSingleton(actor, options)) persistentRoots.add(root);
  }

  const assignment: CellAssignment = new Map();
  for (const { actor, index } of byId.values()) {
    const root = findRoot(actor.id);
    if (root === null) {
      const parent = actor.parent;
      reportLoss(
        ctx,
        "invalid-parent",
        childPath(indexPath("actors", index), "parent"),
        parent !== null && !byId.has(parent)
          ? `Parent actor ${parent} is not in the level; the actor stays in the persistent layer.`
          : "The parent chain loops or reaches a missing actor; the actor stays in the persistent layer.",
      );
      assignment.set(actor.id, null);
      continue;
    }
    const rootActor = byId.get(root)!.actor;
    if (!rootActor.spatiallyLoaded || persistentRoots.has(root)) {
      assignment.set(actor.id, null);
      continue;
    }
    const [x, , z] = rootActor.transform.p;
    assignment.set(actor.id, cellKey(cellAt(settings.cellSize, x, z)));
  }
  return finish(ctx, assignment);
}

function holdsSingleton(actor: ActorDoc, options: CellAssignOptions): boolean {
  const components =
    actor.class === null ? actor.components : (options.resolveClass(actor.class)?.components ?? {});
  return Object.values(components).some((component) => componentDefOf(options.registry, component)?.singleton);
}
