// The edit state of one level's painted foliage (plan 5d step 6, INV-B09): the
// level part (`foliage.json` + `foliage/<x>_<z>.bin`) as instances per cell and
// type, without IO (editor/foliage/foliageEdits.ts reads and saves).
//
// - Cells load one by one; a cell the disk does not list has nothing to load.
//   Lists and instances are immutable: an edit replaces a list, so a patch
//   holds the lists before and after and costs no copy.
// - A cell is dirty while its lists differ from what the disk holds, so
//   undoing everything leaves nothing to save.
// - Cell files keep one count per type of the index, in its order: when the
//   set of painted types changes, every cell file is rewritten (its bytes must
//   be loaded first: `missingForSave`).

import type { AssetId, LevelId } from "../../core/id.ts";
import { cellAt, cellKey, compareCellKeys } from "../../core/level/cells.ts";
import { LEVEL_FOLIAGE_SCHEMA, type LevelFoliageIndex } from "../../core/level/foliage.ts";
import { encodeFoliageCell, type FoliageInstances } from "../../core/level/foliageCells.ts";
import type { PaintedFoliageInstance } from "./foliagePaint.ts";

type InstanceList = readonly PaintedFoliageInstance[];
type CellLists = Map<AssetId, InstanceList>;

export interface FoliageRect {
  readonly minX: number;
  readonly minZ: number;
  readonly maxX: number;
  readonly maxZ: number;
}

/** One cell's list of one type, before and after an edit. */
export interface FoliagePatch {
  readonly cell: string;
  readonly type: AssetId;
  readonly before: InstanceList;
  readonly after: InstanceList;
}

/** What one save writes, captured before any await. */
export interface FoliageSaveCapture {
  /** Null: nothing is painted any more, the index file goes. */
  readonly index: LevelFoliageIndex | null;
  readonly cells: ReadonlyMap<string, Uint8Array>;
  /** Cell files that go. */
  readonly deletes: readonly string[];
  /** The lists of every loaded cell as captured. */
  readonly lists: ReadonlyMap<string, ReadonlyMap<AssetId, InstanceList>>;
}

const EMPTY: InstanceList = [];
const NONE: ReadonlyMap<AssetId, InstanceList> = new Map();

const sameInstance = (a: PaintedFoliageInstance, b: PaintedFoliageInstance): boolean =>
  a === b || (a.scale === b.scale && a.seed === b.seed && a.position.every((value, i) => value === b.position[i]) && a.rotation.every((value, i) => value === b.rotation[i]));
const sameList = (a: InstanceList, b: InstanceList): boolean => a === b || (a.length === b.length && a.every((instance, i) => sameInstance(instance, b[i]!)));
const sameLists = (a: ReadonlyMap<AssetId, InstanceList>, b: ReadonlyMap<AssetId, InstanceList>): boolean => {
  for (const type of new Set([...a.keys(), ...b.keys()])) if (!sameList(a.get(type) ?? EMPTY, b.get(type) ?? EMPTY)) return false;
  return true;
};

/** Instances as the file's arrays. */
export function packFoliage(list: InstanceList): FoliageInstances {
  const positions = new Float32Array(list.length * 3), rotations = new Float32Array(list.length * 4);
  const scales = new Float32Array(list.length), seeds = new Uint32Array(list.length);
  list.forEach((instance, i) => {
    positions.set(instance.position, i * 3);
    rotations.set(instance.rotation, i * 4);
    scales[i] = instance.scale;
    seeds[i] = instance.seed;
  });
  return { positions, rotations, scales, seeds };
}

export function unpackFoliage(packed: FoliageInstances): PaintedFoliageInstance[] {
  const { positions: p, rotations: r, scales, seeds } = packed;
  return Array.from(scales, (scale, i): PaintedFoliageInstance => ({
    position: [p[i * 3]!, p[i * 3 + 1]!, p[i * 3 + 2]!],
    rotation: [r[i * 4]!, r[i * 4 + 1]!, r[i * 4 + 2]!, r[i * 4 + 3]!],
    scale, seed: seeds[i]!,
  }));
}

export class FoliagePaintSession {
  readonly cellSize: number;
  private readonly level: LevelId;
  /** The index on disk. */
  private index: LevelFoliageIndex | null;
  /** Counts of listed cells by key. */
  private listedCells = new Map<string, readonly number[]>();
  private readonly cells = new Map<string, CellLists>();
  /** Each loaded cell's lists on disk. */
  private readonly disk = new Map<string, ReadonlyMap<AssetId, InstanceList>>();
  private readonly touched = new Set<string>();

  constructor(options: { readonly level: LevelId; readonly cellSize: number; readonly index: LevelFoliageIndex | null }) {
    this.level = options.level;
    this.index = options.index;
    this.cellSize = options.index?.cellSize ?? options.cellSize;
    this.list();
  }

  private list(): void {
    this.listedCells = new Map((this.index?.cells ?? []).map((cell) => [cell.key, cell.counts]));
  }

  /** Cells the index on disk lists. */
  listed(): string[] {
    return [...this.listedCells.keys()];
  }

  private keysOver(rect: FoliageRect): string[] {
    const from = cellAt(this.cellSize, rect.minX, rect.minZ), to = cellAt(this.cellSize, rect.maxX, rect.maxZ);
    const keys: string[] = [];
    for (let z = from.z; z <= to.z; z += 1) for (let x = from.x; x <= to.x; x += 1) keys.push(cellKey({ x, z }));
    return keys;
  }

  /** The cell can be edited: it is in memory, or the disk has none. */
  loaded(key: string): boolean {
    return this.cells.has(key) || !this.listedCells.has(key);
  }

  /** Listed cells under a rectangle that are not in memory. */
  missing(rect: FoliageRect): string[] {
    return this.keysOver(rect).filter((key) => !this.loaded(key));
  }

  /** A listed cell as read (per type, in the index's order); one already in memory stays. */
  load(key: string, perType: readonly FoliageInstances[]): void {
    if (this.cells.has(key)) return;
    const lists: CellLists = new Map();
    perType.forEach((packed, i) => {
      const type = this.index?.types[i];
      if (type && packed.scales.length > 0) lists.set(type, unpackFoliage(packed));
    });
    this.cells.set(key, lists);
    this.disk.set(key, new Map(lists));
  }

  instances(key: string): ReadonlyMap<AssetId, InstanceList> {
    return this.cells.get(key) ?? NONE;
  }

  /** Cells in memory under a rectangle. */
  cellsIn(rect: FoliageRect): string[] {
    return this.keysOver(rect).filter((key) => this.cells.has(key));
  }

  /** Every cell in memory. */
  loadedCells(): string[] {
    return [...this.cells.keys()];
  }

  /** Edited this session (saved or not): what it holds is drawn instead of the file. */
  edited(): string[] {
    return [...this.touched];
  }

  /** Painted instances of a type in the level. */
  count(type: AssetId): number {
    const slot = this.index?.types.indexOf(type) ?? -1;
    let count = 0;
    for (const [key, counts] of this.listedCells) if (!this.cells.has(key) && slot >= 0) count += counts[slot] ?? 0;
    for (const lists of this.cells.values()) count += lists.get(type)?.length ?? 0;
    return count;
  }

  /** Types with an instance anywhere, ascending. */
  types(): AssetId[] {
    const types = new Set<AssetId>();
    for (const [key, counts] of this.listedCells) if (!this.cells.has(key)) counts.forEach((count, i) => count > 0 && types.add(this.index!.types[i]!));
    for (const lists of this.cells.values()) for (const [type, list] of lists) if (list.length > 0) types.add(type);
    return [...types].sort();
  }

  private editable(key: string): void {
    if (!this.loaded(key)) throw new Error(`foliage cell ${key} is not loaded`);
  }

  private keyOf(instance: PaintedFoliageInstance): string {
    return cellKey(cellAt(this.cellSize, instance.position[0], instance.position[2]));
  }

  private patch(cell: string, type: AssetId, after: InstanceList): FoliagePatch {
    return { cell, type, before: this.cells.get(cell)?.get(type) ?? EMPTY, after };
  }

  adding(type: AssetId, instances: readonly PaintedFoliageInstance[]): FoliagePatch[] {
    const byCell = new Map<string, PaintedFoliageInstance[]>();
    for (const instance of instances) {
      const key = this.keyOf(instance);
      this.editable(key);
      const list = byCell.get(key);
      if (list) list.push(instance);
      else byCell.set(key, [instance]);
    }
    return [...byCell].map(([key, added]) => this.patch(key, type, [...(this.cells.get(key)?.get(type) ?? EMPTY), ...added]));
  }

  removing(type: AssetId, instances: ReadonlySet<PaintedFoliageInstance>): FoliagePatch[] {
    const patches: FoliagePatch[] = [];
    for (const [key, lists] of this.cells) {
      const before = lists.get(type) ?? EMPTY;
      const after = before.filter((instance) => !instances.has(instance));
      if (after.length !== before.length) patches.push(this.patch(key, type, after));
    }
    return patches;
  }

  /** In place while the replacement stays in its cell; else it goes to the end of its new cell's list. */
  replacing(type: AssetId, replacements: ReadonlyMap<PaintedFoliageInstance, PaintedFoliageInstance>): FoliagePatch[] {
    const next = new Map<string, PaintedFoliageInstance[]>();
    const moved: PaintedFoliageInstance[] = [];
    for (const [key, lists] of this.cells) {
      const before = lists.get(type) ?? EMPTY;
      if (!before.some((instance) => replacements.has(instance))) continue;
      const kept: PaintedFoliageInstance[] = [];
      for (const instance of before) {
        const replacement = replacements.get(instance) ?? instance;
        if (replacement === instance || this.keyOf(replacement) === key) kept.push(replacement);
        else moved.push(replacement);
      }
      next.set(key, kept);
    }
    for (const instance of moved) {
      const key = this.keyOf(instance);
      this.editable(key);
      const list = next.get(key) ?? [...(this.cells.get(key)?.get(type) ?? EMPTY)];
      list.push(instance);
      next.set(key, list);
    }
    return [...next].map(([key, after]) => this.patch(key, type, after));
  }

  /** Writes one side of the patches; the changed cells. Throws, changing nothing, when the session does not hold the other side. */
  apply(patches: readonly FoliagePatch[], side: "before" | "after"): string[] {
    const other = side === "after" ? "before" : "after";
    for (const patch of patches) {
      this.editable(patch.cell);
      if (!sameList(this.cells.get(patch.cell)?.get(patch.type) ?? EMPTY, patch[other])) throw new Error(`foliage cell ${patch.cell} is not as the edit left it`);
    }
    const changed = new Set<string>();
    for (const patch of patches) {
      const lists: CellLists = this.cells.get(patch.cell) ?? new Map();
      if (patch[side].length > 0) lists.set(patch.type, patch[side]);
      else lists.delete(patch.type);
      this.cells.set(patch.cell, lists);
      if (!this.disk.has(patch.cell)) this.disk.set(patch.cell, NONE);
      this.touched.add(patch.cell);
      changed.add(patch.cell);
    }
    return [...changed];
  }

  dirtyCells(): string[] {
    return [...this.touched].filter((key) => !sameLists(this.cells.get(key) ?? NONE, this.disk.get(key) ?? NONE)).sort(compareCellKeys);
  }

  get dirty(): boolean {
    return this.dirtyCells().length > 0;
  }

  private typesChanged(): boolean {
    const types = this.types();
    const before = this.index?.types ?? [];
    return types.length !== before.length || types.some((type, i) => type !== before[i]);
  }

  /** Listed cells a save rewrites for a changed type list that are not in memory. */
  missingForSave(): string[] {
    return this.dirty && this.typesChanged() ? this.listed().filter((key) => !this.cells.has(key)) : [];
  }

  /** What to write now; null when clean. */
  capture(): FoliageSaveCapture | null {
    const dirty = this.dirtyCells();
    if (dirty.length === 0) return null;
    const missing = this.missingForSave();
    if (missing.length > 0) throw new Error(`foliage cells ${missing.join(", ")} are not loaded`);
    const types = this.types();
    const rewrite = this.typesChanged();
    const occupied = (key: string): boolean => [...this.instances(key).values()].some((list) => list.length > 0);
    const entries = new Map<string, readonly number[]>();
    for (const [key, counts] of this.listedCells) if (!this.cells.has(key)) entries.set(key, counts);
    for (const key of this.cells.keys()) if (occupied(key)) entries.set(key, types.map((type) => this.instances(key).get(type)?.length ?? 0));
    const cells = new Map<string, Uint8Array>();
    for (const key of rewrite ? [...entries.keys()] : dirty) {
      if (entries.has(key)) cells.set(key, encodeFoliageCell(types.map((type) => packFoliage(this.instances(key).get(type) ?? EMPTY))));
    }
    return {
      index: entries.size === 0 ? null : {
        schema: LEVEL_FOLIAGE_SCHEMA, level: this.level, cellSize: this.cellSize, types,
        cells: [...entries].sort(([a], [b]) => compareCellKeys(a, b)).map(([key, counts]) => ({ key, counts })),
      },
      cells: new Map([...cells].sort(([a], [b]) => compareCellKeys(a, b))),
      deletes: this.listed().filter((key) => !entries.has(key)).sort(compareCellKeys),
      lists: new Map([...this.cells].map(([key, lists]) => [key, new Map(lists)])),
    };
  }

  /** The capture is on disk; a cell edited again since stays dirty. */
  acknowledge(capture: FoliageSaveCapture): void {
    this.index = capture.index;
    this.list();
    for (const [key, lists] of capture.lists) this.disk.set(key, lists);
  }
}

/** One stroke's patches as one per cell and type; what ends as it began is left out. */
export function mergeFoliagePatches(patches: readonly FoliagePatch[]): FoliagePatch[] {
  const merged = new Map<string, FoliagePatch>();
  for (const patch of patches) {
    const key = `${patch.cell}|${patch.type}`;
    const first = merged.get(key);
    merged.set(key, first ? { ...patch, before: first.before } : patch);
  }
  return [...merged.values()].filter((patch) => !sameList(patch.before, patch.after));
}
