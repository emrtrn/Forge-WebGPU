// The edit state of one World Terrain in the editor (plan 5d step 2, decision
// 3). Adapted from Forge WebGL src/editor/terrainStore.ts
// (WorldTerrainEditSession) @ forge-webgl-final (04b5fb23): the bookkeeping,
// without the IO (the editor writes through the save service).
//
// - `world` holds the editable tiles. In the editor a terrain still streams
//   (5a step 2): the render binding's stream writes `world.tiles`; a tile
//   edited this session is pinned there (`touched`) and its edited data kept
//   in `edited`, so a rebuilt binding or a reload from disk never replaces it.
// - Each tile remembers the height format and the revision it was read with
//   (`files`), the document and the far map theirs: a save writes a tile in
//   its own format and names the revision it read (a 409 when another writer
//   changed it since).
// - Revisions per tile count edits (dabs, undo, redo): a save acknowledges
//   only the tiles not edited again while it was writing.
// - A tile the stream filled in after a failed read (a flat stand-in) is not
//   the one on disk: `readable` refuses it, so it is never sculpted or saved.
// - The grid may change (5d step 4, Expand and its undo): `replaceTerrain`
//   swaps the definition and every tile. A tile with no file yet is `created`
//   (a save writes it as new); a file the session read whose tile the
//   definition no longer lists is stale (a save deletes it).

import type { TerrainEditWorld } from "./terrainEdit.ts";
import type { TerrainGlobalAttributes } from "./terrainRenderSource.ts";
import type { TerrainHeightFormat } from "./terrainTileCodec.ts";
import type { TerrainTileData } from "./terrainTypes.ts";
import { captureWorldTerrainSave, type WorldTerrainSaveSnapshot } from "./worldTerrainSave.ts";

/** A tile as it was read from disk. */
export interface TerrainTileFile {
  readonly format: TerrainHeightFormat;
  /** The revision the file had when read; null when the reader could not tell (then a save is refused). */
  revision: string | null;
  /** The object read: a different one in the world is a stand-in, not this file. */
  tile: TerrainTileData;
  /** Made here, not on disk yet: a save writes it as a new file. */
  created?: boolean;
}

/** What one save writes, captured before any await. */
export interface TerrainSaveCapture {
  readonly snapshot: WorldTerrainSaveSnapshot;
  /** Tile key -> its edit revision at capture. */
  readonly tiles: ReadonlyMap<string, number>;
  readonly definition: number;
  /** Files on disk whose tiles the definition no longer lists (an undone Expand): key -> revision read. */
  readonly deletes: ReadonlyMap<string, string>;
}

export class TerrainEditSession {
  readonly world: TerrainEditWorld;
  /** Tiles as read from disk, by key. */
  readonly files = new Map<string, TerrainTileFile>();
  /** Tiles edited this session, by key: their live data (kept across binding rebuilds). */
  readonly edited = new Map<string, TerrainTileData>();
  /** Revision of the definition document when read; null when unknown. */
  documentRevision: string | null;
  /** Revision of the far map part when read; null when it did not exist or is unknown. */
  globalRevision: string | null;
  /** The far map the editor keeps current per dab; null until a view gives one. */
  global: TerrainGlobalAttributes | null = null;
  private readonly revisions = new Map<string, number>();
  private readonly saved = new Map<string, number>();
  private definitionRevision = 0;
  private savedDefinitionRevision = 0;

  constructor(world: TerrainEditWorld, revisions: { readonly document: string | null; readonly global: string | null }) {
    this.world = world;
    this.documentRevision = revisions.document;
    this.globalRevision = revisions.global;
  }

  /** A tile read from disk (by the stream or at once). */
  recordTile(key: string, tile: TerrainTileData, format: TerrainHeightFormat, revision: string | null): void {
    this.files.set(key, { format, revision, tile });
  }

  /**
   * Replaces the definition and every tile (Expand, its undo / redo): all of
   * them become edited, dirty and pinned; a tile with no file is recorded as
   * created in `format`. Files the session read keep their revisions.
   */
  replaceTerrain(def: TerrainEditWorld["def"], tiles: ReadonlyMap<string, TerrainTileData>, format: TerrainHeightFormat): void {
    this.world.def = def;
    this.world.tiles.clear();
    this.edited.clear();
    for (const [key, tile] of tiles) {
      this.world.tiles.set(key, tile);
      const file = this.files.get(key);
      if (!file) this.files.set(key, { format, revision: null, tile, created: true });
      else file.tile = tile;
    }
    this.markTiles(tiles.keys());
    this.markDefinitionDirty();
  }

  /** Files the definition no longer lists, on disk: key -> revision read. */
  staleFiles(): Map<string, string> {
    const listed = new Set(this.world.def.tiles.map((tile) => tile.key));
    const stale = new Map<string, string>();
    for (const [key, file] of this.files) if (!listed.has(key) && !file.created && file.revision !== null) stale.set(key, file.revision);
    return stale;
  }

  /** The tile in the world is the one read from disk, or one edited here: it may be sculpted and saved. */
  readable(key: string): boolean {
    const tile = this.world.tiles.get(key);
    if (!tile) return false;
    return this.edited.get(key) === tile || this.files.get(key)?.tile === tile;
  }

  /** Edited this session (saved or not): its data lives only here or in the undo history. */
  touched(key: string): boolean {
    return this.revisions.has(key);
  }

  /** Tiles changed (a dab, an undo): they become dirty and pinned. */
  markTiles(keys: Iterable<string>): void {
    for (const key of keys) {
      this.revisions.set(key, (this.revisions.get(key) ?? 0) + 1);
      const tile = this.world.tiles.get(key);
      if (tile) this.edited.set(key, tile);
    }
  }

  markDefinitionDirty(): void {
    this.definitionRevision += 1;
  }

  /** Edited tiles not saved since, among those the definition lists. */
  dirtyKeys(): string[] {
    const listed = new Set(this.world.def.tiles.map((tile) => tile.key));
    return [...this.revisions].filter(([key, revision]) => listed.has(key) && this.saved.get(key) !== revision).map(([key]) => key);
  }

  get dirty(): boolean {
    return this.definitionRevision !== this.savedDefinitionRevision || this.dirtyKeys().length > 0 || this.staleFiles().size > 0;
  }

  /** Height formats of the tiles read (a save keeps each tile's own). */
  formats(): Map<string, TerrainHeightFormat> {
    return new Map([...this.files].map(([key, file]) => [key, file.format]));
  }

  /** Snapshot now (before any await): the dirty tiles, the far map and the definition; null when clean. */
  capture(): TerrainSaveCapture | null {
    const keys = this.dirtyKeys();
    const deletes = this.staleFiles();
    if (keys.length === 0 && deletes.size === 0 && this.definitionRevision === this.savedDefinitionRevision) return null;
    const snapshot = captureWorldTerrainSave(this.world, keys, this.formats(), this.global ?? undefined);
    return { snapshot, tiles: new Map(keys.map((key) => [key, this.revisions.get(key)!] as const)), definition: this.definitionRevision, deletes };
  }

  /**
   * The capture's files are on disk with these revisions (tile key, `document`,
   * `global`; a missing one is unchanged). Later tile headers use the saved
   * height range; tiles edited again since the capture stay dirty.
   */
  acknowledge(capture: TerrainSaveCapture, revisions: { readonly document?: string | null; readonly global?: string | null; readonly tiles?: ReadonlyMap<string, string | null> }): void {
    this.world.def.heightMin = capture.snapshot.def.heightMin;
    this.world.def.heightMax = capture.snapshot.def.heightMax;
    if (revisions.document !== undefined) this.documentRevision = revisions.document;
    if (revisions.global !== undefined) this.globalRevision = revisions.global;
    for (const [key, revision] of revisions.tiles ?? []) {
      const file = this.files.get(key);
      if (file) {
        file.revision = revision;
        delete file.created;
      }
    }
    for (const key of capture.deletes.keys()) this.files.delete(key);
    if (this.definitionRevision === capture.definition) this.savedDefinitionRevision = capture.definition;
    for (const [key, revision] of capture.tiles) {
      if (this.revisions.get(key) === revision) this.saved.set(key, revision);
    }
  }
}
