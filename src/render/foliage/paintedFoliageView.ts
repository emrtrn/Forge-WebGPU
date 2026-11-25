// A level's painted foliage on screen (plan 5c F4, step 7): the level part's
// cells (`foliage.json` + `foliage/<x>_<z>.bin`, core/level/foliage*.ts) stream
// around the camera through Forge's painted cell residency
// (engine/foliage/paintedFoliageStreaming.ts: fetched within 1.5x the load
// range, activated within it a couple per frame, unloaded past the
// hysteresis) and draw through the same per-type batches as the ring, a cell
// being one owner (`painted:<x>_<z>`). A cell that fails to read draws empty
// with a warning.
//
// The load range is the level's World Partition load range: painted foliage
// is visual, but the level has one grid (A11). Each instance's own fade and
// LODs are its type's, as for the ring.
//
// A cell the editor edited (5d step 6) is drawn from the edits from then on, at
// once on every change and wherever the camera is; the stream leaves it alone.

import { foliageCellFileOf } from "../../core/level/foliage.ts";
import { decodeFoliageCell, type FoliageInstances } from "../../core/level/foliageCells.ts";
import type { LevelFoliageSource } from "../../engine/foliage/levelFoliageSource.ts";
import { PaintedFoliageStreaming, type PaintedFoliageSnapshot } from "../../engine/foliage/paintedFoliageStreaming.ts";
import { MATRIX_FLOATS } from "../gpu/gpuInstances.ts";
import type { FoliageBatches, FoliageTypeDraw } from "./foliageBatches.ts";

export interface PaintedFoliageViewOptions {
  readonly source: LevelFoliageSource;
  readonly batches: FoliageBatches;
  /** The draw fields of each Foliage Type (null: not drawn). */
  loadTypes(guids: readonly string[]): Promise<ReadonlyMap<string, FoliageTypeDraw | null>>;
  /** The level's load range, metres. */
  readonly loadRange: number;
}

/** 16 column-major floats per instance: translation, unit quaternion, uniform scale (Matrix4.compose). */
export function paintedMatrices(instances: FoliageInstances): Float32Array {
  const count = instances.scales.length;
  const out = new Float32Array(count * MATRIX_FLOATS);
  const { positions: p, rotations: r, scales: s } = instances;
  for (let i = 0; i < count; i += 1) {
    const x = r[i * 4]!, y = r[i * 4 + 1]!, z = r[i * 4 + 2]!, w = r[i * 4 + 3]!, k = s[i]!;
    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2;
    const wx = w * x2, wy = w * y2, wz = w * z2;
    const o = i * MATRIX_FLOATS;
    out[o] = (1 - (yy + zz)) * k; out[o + 1] = (xy + wz) * k; out[o + 2] = (xz - wy) * k; out[o + 3] = 0;
    out[o + 4] = (xy - wz) * k; out[o + 5] = (1 - (xx + zz)) * k; out[o + 6] = (yz + wx) * k; out[o + 7] = 0;
    out[o + 8] = (xz + wy) * k; out[o + 9] = (yz - wx) * k; out[o + 10] = (1 - (xx + yy)) * k; out[o + 11] = 0;
    out[o + 12] = p[i * 3]!; out[o + 13] = p[i * 3 + 1]!; out[o + 14] = p[i * 3 + 2]!; out[o + 15] = 1;
  }
  return out;
}

export class PaintedFoliageView {
  private streaming: PaintedFoliageStreaming | null = null;
  private loading = true;
  private preparing: Promise<void> | null = null;
  private prepared = false;
  private disposed = false;
  private readonly options: PaintedFoliageViewOptions;
  private readonly stopEdits: (() => void) | null;
  private readonly types = new Map<string, FoliageTypeDraw | null>();
  /** Edited cells drawn: the types each contributes to. */
  private readonly edited = new Map<string, readonly FoliageTypeDraw[]>();

  constructor(options: PaintedFoliageViewOptions) {
    this.options = options;
    const { edits } = options.source;
    this.stopEdits = edits?.onChange((key) => void this.drawEdited(key)) ?? null;
    for (const key of edits?.keys() ?? []) void this.drawEdited(key);
    const index = options.source.index;
    if (!index || index.cells.length === 0) { this.loading = false; return; }
    void options.loadTypes(index.types).then((types) => {
      if (this.disposed) return;
      for (const [guid, draw] of types) this.types.set(guid, draw);
      const counts = new Map(index.cells.map((cell) => [cell.key, cell.counts]));
      this.streaming = new PaintedFoliageStreaming({
        index,
        grid: { cellSize: index.cellSize, loadRange: options.loadRange },
        sink: {
          addCell: (key, guids, perType) => {
            let drawn = 0;
            if (edits?.cell(key)) return drawn;
            perType.forEach((instances, at) => {
              const draw = types.get(guids[at]!);
              if (!draw || instances.scales.length === 0) return;
              options.batches.set(draw, `painted:${key}`, paintedMatrices(instances), instances.seeds);
              drawn += instances.scales.length;
            });
            return drawn;
          },
          removeCell: (key) => {
            if (!edits?.cell(key)) options.batches.remove(`painted:${key}`);
          },
        },
        fetchCell: async (key) => {
          const bytes = await options.source.load(foliageCellFileOf(key));
          if (!bytes) throw new Error(`painted foliage cell ${key}: ${foliageCellFileOf(key)} is missing`);
          return decodeFoliageCell(bytes, counts.get(key));
        },
        warn: (message) => console.warn(`forge render: foliage: ${message}`),
      });
      this.loading = false;
    });
  }

  /** Draws an edited cell as it is now; a type met for the first time loads first. */
  private async drawEdited(key: string): Promise<void> {
    const { source, batches, loadTypes } = this.options;
    const missing = [...new Set((source.edits?.cell(key) ?? []).map((entry) => entry.type).filter((type) => !this.types.has(type)))];
    if (missing.length > 0) {
      const loaded = await loadTypes(missing);
      for (const guid of missing) this.types.set(guid, loaded.get(guid) ?? null);
    }
    if (this.disposed) return;
    // As it is after the wait: a later change may have been drawn already, drawing it again is harmless.
    const cell = source.edits?.cell(key);
    if (!cell) return;
    // The first edit takes over what the stream drew.
    if (!this.edited.has(key)) batches.remove(`painted:${key}`);
    const drawn: FoliageTypeDraw[] = [];
    for (const { type, instances } of cell) {
      const draw = this.types.get(type);
      if (!draw || instances.scales.length === 0) continue;
      batches.set(draw, `painted:${key}`, paintedMatrices(instances), instances.seeds);
      drawn.push(draw);
    }
    for (const draw of this.edited.get(key) ?? []) if (!drawn.some((one) => one.id === draw.id)) batches.set(draw, `painted:${key}`, []);
    this.edited.set(key, drawn);
  }

  /** The first call fills the range at once (Forge's prepare, behind the loading overlay); later ones stream. */
  update(position: readonly [number, number]): void {
    const streaming = this.streaming;
    if (!streaming) return;
    if (this.preparing === null) {
      this.preparing = streaming.prepare(position).then(() => { this.prepared = true; });
      return;
    }
    if (this.prepared) streaming.update(position);
  }

  /** Types loading, the first fill or a cell being read: the binding holds readiness. */
  busy(): boolean {
    if (this.loading) return true;
    if (!this.streaming) return false;
    return !this.prepared || this.streaming.snapshot().fetching > 0;
  }

  snapshot(): PaintedFoliageSnapshot | null {
    return this.streaming?.snapshot() ?? null;
  }

  dispose(): void {
    this.disposed = true;
    this.stopEdits?.();
    for (const key of this.edited.keys()) this.options.batches.remove(`painted:${key}`);
    this.streaming?.dispose();
    this.streaming = null;
  }
}
