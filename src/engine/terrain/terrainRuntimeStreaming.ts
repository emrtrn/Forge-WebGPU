// Ported from Forge WebGL engine/terrain/terrainRuntimeStreaming.ts @ forge-webgl-final (04b5fb23); docs/PORT_LOG.md §2.
import type { Vec3 } from "../../core/index.ts";
import type { ColliderPrimitive } from "../physics/colliderTypes.ts";
import { computeStreamingTargets, type GridStreamingSettings, type StreamingSource } from "../world/streamingPolicy.ts";
import { WorldStreamingSubsystem } from "../world/worldStreamingSubsystem.ts";
import type { WorldTerrainDocument } from "./terrainLoader.ts";
import { createFlatTerrainTile, parseTileKey, terrainTileWorldSize, tileKey, type TerrainTileData } from "./terrainTypes.ts";
import { terrainTileHeightfield, worldTerrainColliderEntityId } from "./worldTerrainActor.ts";

export interface TerrainColliderTile {
  readonly id: string;
  readonly translation: Vec3;
  readonly primitive: ColliderPrimitive;
}

export interface TerrainStreamingHooks {
  fetch(key: string, signal: AbortSignal): Promise<TerrainTileData>;
  changed(key: string): void;
  addColliders(tiles: readonly TerrainColliderTile[]): void;
  removeColliders(ids: string[]): void;
  clock(): number;
  warn(message: string): void;
}

/** A tile's streaming state for the `?debug` map. `undeclared` is a grid gap, never fetched. */
export type TerrainTileDebugState = "undeclared" | "unloaded" | "fetching" | "loaded" | "active" | "physics" | "failed";

export interface TerrainStreamingDebugGrid {
  tilesX: number;
  tilesZ: number;
  /** World X/Z of tile (0,0)'s corner, and one tile's world size. */
  origin: readonly [number, number];
  tileSize: number;
  /** Row-major, `z * tilesX + x`. */
  cells: TerrainTileDebugState[];
}

/** Terrain-only ownership adapter. The streaming core owns passive LRU payloads;
 * the document exposes only activated render data, and physics has a smaller ring. */
export class TerrainRuntimeStreaming {
  readonly world: WorldStreamingSubsystem<TerrainTileData | null>;
  readonly colliders = new Map<string, TerrainColliderTile>();
  readonly residentTiles = new Set<TerrainTileData>();
  lastFrameMs = 0;
  private readonly declared: Set<string>;
  private readonly settings: GridStreamingSettings;
  private readonly bounds;
  private sources: readonly StreamingSource[] = [];
  private activations = 0;
  readonly physicsRange: number;

  // Constructor parameter properties in Forge, spelled out here (this repo
  // allows only erasable TypeScript syntax: Node type stripping).
  readonly document: WorldTerrainDocument;
  private readonly actor: { id: string; name: string; collision: boolean };
  private readonly hooks: TerrainStreamingHooks;
  constructor(
    document: WorldTerrainDocument,
    actor: { id: string; name: string; collision: boolean },
    hooks: TerrainStreamingHooks,
    memoryBudgetBytes?: number,
  ) {
    this.document = document;
    this.actor = actor;
    this.hooks = hooks;
    const { def, tiles } = document;
    const size = terrainTileWorldSize(def);
    this.declared = new Set(def.tiles.map(({ key }) => key));
    this.physicsRange = Math.max(4, size * 0.75);
    const renderRange = Math.max(8, size * 2);
    this.settings = { cellSize: size, origin: [def.origin[0], def.origin[2]], loadRange: renderRange, activateRange: renderRange };
    this.bounds = { minX: def.origin[0], minZ: def.origin[2], maxX: def.origin[0] + def.tilesX * size, maxZ: def.origin[2] + def.tilesZ * size };
    const tileBytes = (def.tileQuads + 1) ** 2 * (4 + Math.ceil(def.layers.length / 4) * 4);
    this.world = new WorldStreamingSubsystem({
      settings: this.settings, bounds: this.bounds, clock: hooks.clock,
      memoryBudgetBytes: memoryBudgetBytes ?? tileBytes * 4,
      warn: hooks.warn,
      loader: {
        fetch: (key, signal) => this.declared.has(key) ? hooks.fetch(key, signal) : Promise.resolve(null),
        byteSize: (tile) => {
          if (tile) this.residentTiles.add(tile);
          return tile ? tile.heights.byteLength + tile.weights.byteLength : 0;
        },
        activate: (key, tile) => {
          if (!tile) return;
          this.activations += 1;
          tiles.set(key, tile);
          hooks.changed(key);
          // Collider creation shares the core's atomic activation time slice.
          if (this.physicsTargets().has(key)) this.addCollider(key, tile);
        },
        deactivate: (key, tile) => {
          if (!tile) return;
          this.removeCollider(key);
          tiles.delete(key);
          hooks.changed(key);
        },
        dispose: (_key, tile) => { if (tile) this.residentTiles.delete(tile); },
        fallback: (key) => {
          if (!this.declared.has(key)) return null;
          const { x, z } = parseTileKey(key)!;
          const tile = createFlatTerrainTile(def, x, z);
          const summary = def.tiles.find((entry) => entry.key === key)!;
          tile.heights.fill(summary.minHeight);
          return tile;
        },
      },
    });
  }

  update(sources: readonly StreamingSource[], viewDistanceMultiplier = 1, keptTiles: readonly string[] = [],
    physicsSources: readonly StreamingSource[] = sources): void {
    const started = this.hooks.clock();
    this.activations = 0;
    this.sources = physicsSources;
    // Physics is never scaled below its safety ring by a graphics preference.
    this.settings.viewDistanceMultiplier = Math.max(0.5, viewDistanceMultiplier);
    this.world.update(sources, 4, [
      ...keptTiles,
      ...(physicsSources !== sources && this.actor.collision ? this.targetKeys(physicsSources, this.physicsRange) : []),
    ]);
    const wanted = this.physicsTargets();
    const removed = [...this.colliders.keys()].filter((key) => !wanted.has(key));
    if (removed.length) {
      this.hooks.removeColliders(removed.map((key) => this.colliders.get(key)!.id));
      for (const key of removed) this.colliders.delete(key);
    }
    for (const key of wanted) {
      if (this.activations > 0 && this.hooks.clock() - started >= 4) break;
      const tile = this.document.tiles.get(key);
      if (tile && !this.colliders.has(key) && this.actor.collision) {
        // Even when policy work consumed the frame, one atomic activation must
        // make progress or a busy frame could hold the pawn indefinitely.
        this.addCollider(key, tile);
        this.activations += 1;
      }
    }
    this.lastFrameMs = Math.max(0, this.hooks.clock() - started);
  }

  /** Only declared terrain blocks motion: holes and positions outside it remain traversable. */
  canOccupy(position: readonly [number, number], radius = 1): boolean {
    if (!this.actor.collision) return true;
    return this.targetKeys([{ position }], radius).every((key) => this.colliders.has(key));
  }

  private targetKeys(sources: readonly StreamingSource[], radius: number): string[] {
    return computeStreamingTargets({ loaded: new Set(), active: new Set() }, sources, {
      ...this.settings, loadRange: radius, activateRange: radius, viewDistanceMultiplier: 1,
    }, this.bounds).toLoad.filter((key) => this.declared.has(key));
  }

  dispose(): void { this.world.dispose(); }

  debugGrid(): TerrainStreamingDebugGrid {
    const { def } = this.document;
    const cells: TerrainTileDebugState[] = [];
    for (let z = 0; z < def.tilesZ; z += 1) {
      for (let x = 0; x < def.tilesX; x += 1) cells.push(this.declared.has(tileKey(x, z)) ? "unloaded" : "undeclared");
    }
    this.world.forEachCell((key, state, failed) => {
      const tile = parseTileKey(key);
      if (!tile || !this.declared.has(key)) return;
      const index = tile.z * def.tilesX + tile.x;
      if (failed) cells[index] = "failed";
      else if (state === "Fetching") cells[index] = "fetching";
      else if (state === "Loaded") cells[index] = "loaded";
      else if (state === "Activated") cells[index] = this.colliders.has(key) ? "physics" : "active";
    });
    return { tilesX: def.tilesX, tilesZ: def.tilesZ, origin: [def.origin[0], def.origin[2]], tileSize: terrainTileWorldSize(def), cells };
  }

  private physicsTargets(): Set<string> {
    const targets = computeStreamingTargets({ loaded: new Set(this.document.tiles.keys()), active: new Set(this.colliders.keys()) }, this.sources, {
      ...this.settings, loadRange: this.physicsRange, activateRange: this.physicsRange, viewDistanceMultiplier: 1,
    }, this.bounds);
    const wanted = new Set(this.colliders.keys());
    for (const key of targets.toDeactivate) wanted.delete(key);
    for (const key of targets.toActivate) if (this.declared.has(key)) wanted.add(key);
    return wanted;
  }

  private addCollider(key: string, tile: TerrainTileData): void {
    if (this.colliders.has(key) || !this.actor.collision) return;
    const collider = { id: worldTerrainColliderEntityId(this.actor.id, key), ...terrainTileHeightfield(this.document.def, tile) };
    this.hooks.addColliders([collider]);
    this.colliders.set(key, collider);
  }

  private removeCollider(key: string): void {
    if (!this.colliders.delete(key)) return;
    this.hooks.removeColliders([worldTerrainColliderEntityId(this.actor.id, key)]);
  }
}
