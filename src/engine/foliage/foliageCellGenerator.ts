// Ported from Forge WebGL src/scene/foliageCellGenerator.ts @ forge-webgl-final (04b5fb23); same-thread generator only (the worker one is phase 5c F2, outside src/engine).
import type { TerrainQueryDef } from "../terrain/terrainHeightQuery.ts";
import type { TerrainTileData } from "../terrain/terrainTypes.ts";
import type { FoliageTypeParams } from "./foliageTypeParams.ts";
import {
  FoliageTerrainStore, type FoliageCellRequest, type FoliageRuleParams, type GeneratedFoliageCell,
} from "./proceduralFoliage.ts";

/** A terrain the generator knows by id. */
export type FoliageGeneratorTerrainDef = TerrainQueryDef & { readonly layers: readonly { readonly id: string }[] };

/** One cell generated from the terrain's resident tiles. */
export interface FoliageCellJob {
  terrainId: string;
  rule: FoliageRuleParams;
  type: FoliageTypeParams;
  request: FoliageCellRequest;
}

export interface FoliageCellGenerator {
  /** Registers or replaces a terrain's definition and clears its tiles. */
  setTerrain(id: string, def: FoliageGeneratorTerrainDef): void;
  /** Copies a tile and its arrays. */
  setTile(id: string, tile: TerrainTileData): void;
  removeTile(id: string, x: number, z: number): void;
  removeTerrain(id: string): void;
  /** Rejects when the terrain is unknown or the generator was disposed. */
  generate(job: FoliageCellJob): Promise<GeneratedFoliageCell>;
  dispose(): void;
}

export class LocalFoliageCellGenerator implements FoliageCellGenerator {
  private readonly store = new FoliageTerrainStore();
  private disposed = false;

  setTerrain(id: string, def: FoliageGeneratorTerrainDef): void {
    if (!this.disposed) this.store.setTerrain(id, def);
  }

  setTile(id: string, tile: TerrainTileData): void {
    if (!this.disposed) this.store.setTile(id, tile);
  }

  removeTile(id: string, x: number, z: number): void {
    if (!this.disposed) this.store.removeTile(id, x, z);
  }

  removeTerrain(id: string): void {
    if (!this.disposed) this.store.removeTerrain(id);
  }

  async generate(job: FoliageCellJob): Promise<GeneratedFoliageCell> {
    if (this.disposed) throw new Error("Foliage cell generator disposed");
    return this.store.generate(job.terrainId, job.rule, job.type, job.request);
  }

  dispose(): void {
    this.disposed = true;
    this.store.clear();
  }
}
