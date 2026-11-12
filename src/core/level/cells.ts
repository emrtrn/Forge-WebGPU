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
//
// The grid math (cell of a point, cell bounds, the wider-than-a-cell rule) is
// the shared world grid (`core/grid/worldGrid`, Forge's, also the terrain tile
// grid and the streaming policy's); a level grid is one with a zero origin.

import { worldCellAt, worldCellBounds, worldCellForActor } from "../grid/worldGrid.ts";
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
import type { ActorDoc, ComponentMap } from "./model.ts";
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

/** The level grid is the shared world grid with its origin at the world origin. */
export function cellAt(cellSize: number, worldX: number, worldZ: number): CellCoord {
  return worldCellAt({ cellSize }, worldX, worldZ);
}

export function cellBounds(cellSize: number, coord: CellCoord): CellBounds {
  return worldCellBounds({ cellSize }, coord.x, coord.z);
}

/** An actor whose X/Z footprint is larger than a cell belongs in the persistent layer (A11). */
export function exceedsCell(cellSize: number, footprint: { readonly width: number; readonly depth: number }): boolean {
  return worldCellForActor({ cellSize }, [0, 0], { width: footprint.width, depth: footprint.depth }) === null;
}

export interface CellAssignOptions extends NormalizeOptions {
  readonly registry: SchemaRegistry;
  readonly resolveClass: ClassResolver;
}

/** Actor id -> cell key, or null for the persistent layer. Every actor id of the input is in it. */
export type CellAssignment = Map<ActorId, string | null>;

/**
 * Assigns every actor of a whole level to a cell or to the persistent layer.
 * Issue paths are `actors[i]...` of the given list. Linear in the number of
 * actors, with per-index arrays instead of per-actor objects: it runs on every
 * save of a level with tens of thousands of actors.
 */
export function assignCells(
  actors: readonly ActorDoc[],
  settings: LevelSettings,
  options: CellAssignOptions,
): NormalizeResult<CellAssignment> {
  const ctx = createContext(options);
  const count = actors.length;
  const indexOf = new Map<ActorId, number>();
  // A repeated id: only its first actor is assigned (normalisation drops the rest).
  const repeated = new Uint8Array(count);
  for (let i = 0; i < count; i += 1) {
    const id = actors[i]!.id;
    if (indexOf.has(id)) repeated[i] = 1;
    else indexOf.set(id, i);
  }

  // Index of each actor's root; BROKEN when the chain does not reach one.
  const UNKNOWN = -2;
  const BROKEN = -1;
  const rootOf = new Int32Array(count).fill(UNKNOWN);
  const findRoot = (start: number): number => {
    if (rootOf[start] !== UNKNOWN) return rootOf[start]!;
    if (actors[start]!.parent === null) return (rootOf[start] = start);
    const chain: number[] = [];
    let current = start;
    let root: number;
    for (;;) {
      if (rootOf[current] !== UNKNOWN) {
        root = rootOf[current]!;
        break;
      }
      if (chain.includes(current)) {
        root = BROKEN;
        break;
      }
      chain.push(current);
      const parent = actors[current]!.parent;
      if (parent === null) {
        root = current;
        break;
      }
      const next = indexOf.get(parent);
      if (next === undefined) {
        root = BROKEN;
        break;
      }
      current = next;
    }
    for (const index of chain) rootOf[index] = root;
    return root;
  };

  // A root is persistent when it is not spatially loaded or its tree holds a singleton.
  const holdsSingleton = singletonTest(options);
  const persistent = new Uint8Array(count);
  for (let index = 0; index < count; index += 1) {
    if (repeated[index] === 1) continue;
    const root = findRoot(index);
    if (root === BROKEN) continue;
    if (!actors[root]!.spatiallyLoaded || holdsSingleton(actors[index]!)) persistent[root] = 1;
  }

  const keyOfRoot: (string | undefined)[] = [];
  const assignment: CellAssignment = new Map();
  for (let index = 0; index < count; index += 1) {
    if (repeated[index] === 1) continue;
    const actor = actors[index]!;
    const root = rootOf[index]!;
    if (root === BROKEN) {
      const parent = actor.parent;
      reportLoss(
        ctx,
        "invalid-parent",
        childPath(indexPath("actors", index), "parent"),
        parent !== null && !indexOf.has(parent)
          ? `Parent actor ${parent} is not in the level; the actor stays in the persistent layer.`
          : "The parent chain loops or reaches a missing actor; the actor stays in the persistent layer.",
      );
      assignment.set(actor.id, null);
    } else if (persistent[root] === 1) {
      assignment.set(actor.id, null);
    } else {
      let key = keyOfRoot[root];
      if (key === undefined) {
        const [x, , z] = actors[root]!.transform.p;
        key = cellKey(cellAt(settings.cellSize, x, z));
        keyOfRoot[root] = key;
      }
      assignment.set(actor.id, key);
    }
  }
  return finish(ctx, assignment);
}

/**
 * Whether an actor holds a singleton component. Answers are remembered per
 * type tag and per class: a level has few of either and many actors.
 */
function singletonTest(options: CellAssignOptions): (actor: ActorDoc) => boolean {
  const byTag = new Map<unknown, boolean>();
  const byClass = new Map<string, boolean>();
  const anySingleton = (components: ComponentMap): boolean => {
    for (const component of Object.values(components)) {
      let singleton = byTag.get(component.type);
      if (singleton === undefined) {
        singleton = componentDefOf(options.registry, component)?.singleton === true;
        byTag.set(component.type, singleton);
      }
      if (singleton) return true;
    }
    return false;
  };
  return (actor) => {
    if (actor.class === null) return anySingleton(actor.components);
    let singleton = byClass.get(actor.class);
    if (singleton === undefined) {
      singleton = anySingleton(options.resolveClass(actor.class)?.components ?? {});
      byClass.set(actor.class, singleton);
    }
    return singleton;
  };
}
