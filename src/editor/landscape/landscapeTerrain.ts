// World Terrains in the editor (plan 5d step 4, INV-B01 / B02 / B08; Forge
// WebGL SceneApp @ forge-webgl-final: the New Landscape flow,
// expandSelectedLandscapeToWorldTerrain, importSelectedLandscapeHeightmapFile,
// exportSelectedLandscapeHeightmapFile, syncWorldTerrainPlacement). User
// decisions 2026-11-19:
//
// - Create: the terrain is an asset written at once, like a Content Browser
//   asset (`content/terrain/<name>.terrain.json`, its tiles and far map; no
//   undo), then its actor joins the level (one undo step; undo takes the actor
//   away, the asset stays). Multi-tile tiles are u16, a single tile f32
//   (Forge's choice). The level's open world settings are World Settings'.
// - Expand (a single tile into a grid, Forge's): one undo step on the edit
//   session (`replaceTerrain`); Save writes the new tiles and deletes the ones
//   an undone Expand leaves behind. The actor stays where it is (on the
//   original tile): moving it is its own edit.
// - Move: only the terrain. When the level moves a drawn terrain's actor (the
//   gizmo, Details, undo / redo of either), its definition's origin and
//   world-frame splines follow by the same offset (`moveWorldTerrain`), the
//   definition becomes dirty, the terrain is drawn again. Tiles never change;
//   rotation and scale are ignored. Puddles, painted foliage and other actors
//   stay put.
// - Heightmap (editor only): Import replaces every tile's heights from a
//   16-bit PNG or RAW the size of the grid (one undo step, saved with Save);
//   Export downloads the whole grid as 16-bit PNG or little-endian RAW, with
//   the range to import it again in the status line.

import { createId, dataDocument, stringifyDocument, TerrainAssetType, type ActorId, type AssetId, type SaveClient, type Vec3 } from "../../core/index.ts";
import { createServiceKey } from "../../core/world/services.ts";
import { encodeHeightmapPng16 } from "../../engine/terrain/heightmapPng.ts";
import { createTerrainHeightmapPatches } from "../../engine/terrain/terrainEdit.ts";
import type { EditableTerrain, TerrainEditing } from "../../engine/terrain/terrainEditing.ts";
import { encodeTerrainGlobalMap } from "../../engine/terrain/terrainGlobalMapFile.ts";
import { exportRawHeightmap, importRawHeightmap, rawHeightmapToSamples } from "../../engine/terrain/terrainImport.ts";
import { buildTerrainGlobalAttributes, worldTerrainRenderSource } from "../../engine/terrain/terrainRenderSource.ts";
import { decodeTerrainTile, encodeTerrainTile, type TerrainHeightFormat } from "../../engine/terrain/terrainTileCodec.ts";
import type { TerrainTileData, WorldTerrainDef } from "../../engine/terrain/terrainTypes.ts";
import { worldTerrainActorPosition } from "../../engine/terrain/worldTerrainActor.ts";
import {
  createFlatWorldTerrain, createWorldTerrainFromHeightmap,
  type WorldTerrainCreateOptions, type WorldTerrainHeightmapSource,
} from "../../engine/terrain/worldTerrainCreate.ts";
import { expandSingleTileWorldTerrain, singleTileExpandProblems, type WorldTerrainExpandOptions } from "../../engine/terrain/worldTerrainExpand.ts";
import { captureWorldTerrainSave } from "../../engine/terrain/worldTerrainSave.ts";
import { isZeroMove, moveWorldTerrain } from "../../engine/terrain/worldTerrainMove.ts";
import { Terrain } from "../../features/terrain/schema.ts";
import type { EditorSession } from "../session/editorSession.ts";
import { openCreateTerrainDialog, openExpandDialog, openImportHeightmapDialog, readHeightmapFile, type HeightmapFile } from "./landscapeDialogs.ts";
import { holdWholeTerrain, pushTerrainPatchStep } from "./landscapeSteps.ts";

/** Where a new terrain asset goes. */
export const NEW_TERRAIN_FOLDER = "content/terrain";

export type HeightmapFormat = "png" | "raw";

/** A file name from a terrain's: path separators and the like become `_`. */
const safeName = (name: string): string => name.trim().replace(/[<>:"/\\|?*\u0000-\u001f\s]+/g, "_").replace(/^_+|_+$/g, "") || "Landscape";

export interface LandscapeTerrain {
  /** Writes a new terrain asset and adds its actor (selected); null when nothing was made. */
  create(options: WorldTerrainCreateOptions, heightmap: WorldTerrainHeightmapSource | null): Promise<ActorId | null>;
  /** Problems with expanding the actor's terrain this way; null when it is not a single drawn tile. */
  expandProblems(actor: ActorId, options: WorldTerrainExpandOptions): string[] | null;
  expand(actor: ActorId, options: WorldTerrainExpandOptions): boolean;
  /** The heightmap size the actor's terrain takes (vertices per side); null when none is drawn. */
  heightmapSize(actor: ActorId): { readonly width: number; readonly height: number } | null;
  /** Replaces every height from the file; heights 0 and 65535 stand for `heightMin` / `heightMax` above the datum. */
  importHeightmap(actor: ActorId, file: HeightmapFile, options: { readonly endianness: "little" | "big"; readonly heightMin: number; readonly heightMax: number }): Promise<boolean>;
  exportHeightmap(actor: ActorId, format: HeightmapFormat): Promise<boolean>;
  /** The dialogs: New World Terrain (Add Actor), Expand, Import Heightmap (Landscape Details). */
  openCreate(): Promise<ActorId | null>;
  openExpand(actor: ActorId): Promise<boolean>;
  openImport(actor: ActorId): Promise<boolean>;
  readonly busy: boolean;
  dispose(): void;
}

export const LandscapeTerrainKey = createServiceKey<LandscapeTerrain>("forge.editor.landscapeTerrain");

export interface LandscapeTerrainOptions {
  readonly editor: EditorSession;
  readonly editing: TerrainEditing;
  readonly client: SaveClient;
  readonly status: (message: string, tone?: "info" | "warning" | "error") => void;
  /** A project file exists (or is listed). */
  readonly exists: (path: string) => boolean;
  /** The project listing and the renderer's file table read the disk again (a new asset). */
  readonly refresh: () => Promise<void>;
  /** Hands the viewer a file. */
  readonly download: (name: string, bytes: Uint8Array) => void;
  /** The page and where its dialogs open. */
  readonly document: Document;
  readonly dialogHost: HTMLElement;
}

export function createLandscapeTerrain(options: LandscapeTerrainOptions): LandscapeTerrain {
  const { editor, editing, status } = options;
  let busy = false;

  const terrainOf = (actor: ActorId): EditableTerrain | null => {
    const doc = editor.level.actor(actor);
    if (!doc || doc.locked) return null;
    return editing.find(actor) ?? null;
  };

  // Move: each drawn terrain's actor position as last seen; a change moves its definition by the difference.
  const seen = new Map<ActorId, Vec3>();
  const follow = (): void => {
    for (const terrain of editing.list()) {
      const doc = editor.level.actor(terrain.actor);
      if (!doc) continue;
      const position = doc.transform.p;
      const before = seen.get(terrain.actor);
      seen.set(terrain.actor, [...position] as Vec3);
      if (!before) continue;
      const delta: Vec3 = [position[0] - before[0], position[1] - before[1], position[2] - before[2]];
      if (isZeroMove(delta)) continue;
      const { session } = terrain;
      const moved = moveWorldTerrain(session.world.def, delta);
      session.world.def = { ...session.world.def, origin: moved.origin, ...(moved.splines ? { splines: moved.splines } : {}) };
      session.markDefinitionDirty();
      void terrain.definitionChanged();
    }
  };
  const stopLevel = editor.onChange(follow);
  const stopEditing = editing.onChange(follow);

  /** Runs `work` with the actor's whole terrain loaded; false when it did not run or failed. */
  const whole = async (actor: ActorId, why: string, work: (terrain: EditableTerrain) => Promise<boolean> | boolean): Promise<boolean> => {
    if (busy) {
      status("Another terrain action is still running.", "warning");
      return false;
    }
    const terrain = terrainOf(actor);
    if (!terrain) return false;
    busy = true;
    let release = (): void => {};
    try {
      release = await holdWholeTerrain(terrain, why, status);
      if (terrainOf(actor) !== terrain) return false;
      return await work(terrain);
    } catch (error) {
      status(`Cannot ${why}: ${error instanceof Error ? error.message : String(error)}`, "error");
      return false;
    } finally {
      release();
      busy = false;
    }
  };

  const heightmapSize = (def: Pick<WorldTerrainDef, "tilesX" | "tilesZ" | "tileQuads">) => ({ width: def.tilesX * def.tileQuads + 1, height: def.tilesZ * def.tileQuads + 1 });

  /** The actor's terrain as one single resident tile, or null. */
  const single = (actor: ActorId): { terrain: EditableTerrain; tile: TerrainTileData } | null => {
    const terrain = terrainOf(actor);
    if (!terrain) return null;
    const { def, tiles } = terrain.session.world;
    const tile = def.tilesX === 1 && def.tilesZ === 1 && def.tiles.length === 1 ? tiles.get(def.tiles[0]!.key) : undefined;
    return tile && terrain.session.readable(def.tiles[0]!.key) ? { terrain, tile } : null;
  };

  const warn = (message: string): void => status(message, "warning");
  const service: LandscapeTerrain = {
    get busy() {
      return busy;
    },
    async openCreate() {
      const choice = await openCreateTerrainDialog(options.document, options.dialogHost, warn);
      return choice ? service.create(choice.options, choice.heightmap) : null;
    },
    async openExpand(actor) {
      if (!single(actor)) {
        status("Expand takes a terrain of one tile.", "warning");
        return false;
      }
      const choice = await openExpandDialog(options.document, options.dialogHost, warn, (expand) => service.expandProblems(actor, expand) ?? ["The terrain is no longer a single tile."]);
      return choice ? service.expand(actor, choice) : false;
    },
    async openImport(actor) {
      const terrain = terrainOf(actor);
      if (!terrain) return false;
      const { def } = terrain.session.world;
      const choice = await openImportHeightmapDialog(options.document, options.dialogHost, warn, heightmapSize(def), { heightMin: def.heightMin, heightMax: def.heightMax });
      return choice ? service.importHeightmap(actor, choice.file, choice) : false;
    },
    async create(createOptions, heightmap) {
      if (busy) return null;
      busy = true;
      try {
        const terrain = heightmap ? createWorldTerrainFromHeightmap(createOptions, heightmap) : createFlatWorldTerrain(createOptions);
        const { def } = terrain;
        const stem = safeName(createOptions.name);
        let path = `${NEW_TERRAIN_FOLDER}/${stem}.terrain.json`;
        for (let n = 2; options.exists(path) || options.exists(path.replace(/\.terrain\.json$/, ".tiles")); n += 1) path = `${NEW_TERRAIN_FOLDER}/${stem}-${n}.terrain.json`;
        const base = path.slice(0, -".terrain.json".length);
        const format: TerrainHeightFormat = def.tilesX * def.tilesZ > 1 ? "u16" : "f32";
        const guid = createId("asset") as AssetId;
        const writes: { path: string; base: null; text?: string; staged?: string }[] = [];
        for (const [key, tile] of terrain.tiles) {
          const bytes = encodeTerrainTile(tile, { heightMin: def.heightMin, heightMax: def.heightMax, heightFormat: format });
          writes.push({ path: `${base}.tiles/${key}.tile.bin`, base: null, staged: (await options.client.stageBinary(bytes)).id });
        }
        const global = encodeTerrainGlobalMap(def, buildTerrainGlobalAttributes(worldTerrainRenderSource(def, terrain.tiles)));
        writes.push({ path: `${base}.global.bin`, base: null, staged: (await options.client.stageBinary(global)).id });
        writes.push({ path, base: null, text: stringifyDocument(dataDocument(TerrainAssetType, guid, def as unknown as Record<string, unknown>)) });
        const response = await options.client.save({ writes, deletes: [] });
        if (response.status !== "saved") {
          const why = response.status === "conflict" ? `${path} already exists` : (response.message ?? response.reason);
          status(`New terrain not written: ${why}`, "error");
          return null;
        }
        await options.refresh();
        const id = createId("actor");
        editor.edit(`Add ${createOptions.name}`, (tx) => tx.setActor({
          id, name: createOptions.name, class: null, parent: null, spatiallyLoaded: false,
          transform: { p: worldTerrainActorPosition(def), r: [0, 0, 0, 1], s: [1, 1, 1] },
          components: { terrain: { type: `${Terrain.name}@${Terrain.version}`, data: guid } },
        }));
        editor.selection.set([id]);
        status(`Created ${path} (${def.tilesX} × ${def.tilesZ} tiles).`);
        return id;
      } catch (error) {
        status(`New terrain failed: ${error instanceof Error ? error.message : String(error)}`, "error");
        return null;
      } finally {
        busy = false;
      }
    },
    expandProblems(actor, expand) {
      const found = single(actor);
      return found ? singleTileExpandProblems(found.terrain.session.world.def, expand) : null;
    },
    expand(actor, expand) {
      const found = single(actor);
      if (!found || busy) return false;
      const { terrain, tile } = found;
      const { session } = terrain;
      const before = { def: structuredClone(session.world.def), tiles: new Map(session.world.tiles) };
      const expanded = expandSingleTileWorldTerrain({ def: structuredClone(session.world.def), tiles: new Map([[session.world.def.tiles[0]!.key, { ...tile, heights: tile.heights.slice(), weights: tile.weights.slice() }]]) }, expand);
      if (!expanded.ok) {
        status(expanded.reasons.join(" "), "error");
        return false;
      }
      // New tiles take the original's height format.
      const format = session.files.get(before.def.tiles[0]!.key)?.format ?? "f32";
      const after = { def: expanded.document.def, tiles: expanded.document.tiles };
      const apply = (state: { def: WorldTerrainDef; tiles: ReadonlyMap<string, TerrainTileData> }): void => {
        session.replaceTerrain(structuredClone(state.def), new Map(state.tiles), format);
        const drawn = editing.find(terrain.actor);
        if (drawn?.session === session) void drawn.definitionChanged();
      };
      apply(after);
      editor.pushStep({ label: "Expand Landscape", undo: () => apply(before), redo: () => apply(after) });
      status(`Expanded the terrain to ${expand.tilesX} × ${expand.tilesZ} tiles.`);
      return true;
    },
    heightmapSize(actor) {
      const terrain = terrainOf(actor) ?? editing.find(actor);
      return terrain ? heightmapSize(terrain.session.world.def) : null;
    },
    importHeightmap: (actor, file, read) => whole(actor, "import the heightmap", async (terrain) => {
      const { world } = terrain.session;
      const { def } = world;
      const size = heightmapSize(def);
      if (def.tiles.length !== def.tilesX * def.tilesZ) throw new Error("the terrain has empty tiles; a heightmap covers a full grid");
      const picked = await readHeightmapFile(file, size);
      if (picked.width !== size.width || picked.height !== size.height) {
        throw new Error(`the ${picked.png ? "PNG" : "RAW"} is ${picked.width} × ${picked.height}; this terrain needs exactly ${size.width} × ${size.height} samples (rows along +Z)`);
      }
      if (!picked.png && file.bytes.byteLength !== size.width * size.height * 2) {
        throw new Error(`RAW expected ${size.width * size.height * 2} bytes for ${size.width} × ${size.height} 16-bit samples, got ${file.bytes.byteLength}`);
      }
      const imported = importRawHeightmap({
        bytes: picked.bytes, width: size.width, height: size.height, endianness: picked.png ? "little" : read.endianness,
        heightMin: read.heightMin, heightMax: read.heightMax, tileQuads: def.tileQuads, spacing: def.spacing, origin: def.origin,
      });
      const heights = new Map([...imported.tiles].map(([key, bytes]) => [key, decodeTerrainTile(bytes).heights] as const));
      const patches = createTerrainHeightmapPatches(world, heights);
      if (patches.length === 0) {
        status("The heightmap matches the terrain already.");
        return true;
      }
      pushTerrainPatchStep(editor, editing, terrain, "Import Landscape Heightmap", patches, { apply: true });
      status(`Imported ${size.width} × ${size.height} ${picked.png ? "PNG" : "RAW"} heightmap (${patches.length} tiles).`);
      return true;
    }),
    exportHeightmap: (actor, format) => whole(actor, "export the heightmap", async (terrain) => {
      const { world } = terrain.session;
      const doc = editor.level.actor(actor);
      // The save's snapshot: unsaved relief outside the old encoding range widens it, as a Save would.
      const snapshot = captureWorldTerrainSave(world, world.def.tiles.map((tile) => tile.key), new Map(), terrain.session.global ?? undefined);
      const { def } = snapshot;
      const raw = exportRawHeightmap(def, new Map(snapshot.tiles.map((tile) => [tile.key, tile.bytes])));
      const size = heightmapSize(def);
      const bytes = format === "png" ? await encodeHeightmapPng16(size.width, size.height, rawHeightmapToSamples(raw)) : raw;
      options.download(`${safeName(doc?.name ?? def.name)}-heightmap.${format}`, bytes);
      status(`Exported ${format === "png" ? "16-bit PNG" : "RAW (little-endian)"} heightmap. Import range: ${Math.fround(def.heightMin)} to ${Math.fround(def.heightMax)} m above the terrain's origin Y.`);
      return true;
    }),
    dispose() {
      stopLevel();
      stopEditing();
    },
  };
  return service;
}
