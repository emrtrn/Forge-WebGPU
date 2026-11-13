/**
 * A Forge WebGL level as a level of the new format (plan 2b importer, user
 * decisions 2026-11-12; architecture §4.4, A11). Pure: the importer
 * (`tools/import-forge-webgl`) reads the level, its cell files and terrain
 * definitions, and normalises, splits and writes what this returns.
 *
 * Converted now: placements (`instances`, in the level and its cells) through
 * the converter World Builder shares (`placements.ts`), `landscapes` as
 * terrain actors with `forge.terrain` data documents (the definition is
 * copied as it is but for its paint layers' materials, Forge ids made GUIDs:
 * plan phase 3 step 8, user decision 2026-11-13; its tiles and global map
 * are copied by the importer),
 * `heightFog` as a `forge.heightFog` actor, `lights` (the level's and its
 * cells') as light actors (`lights.ts`, plan phase 3), the environment
 * singletons (sky, Sky Light with the background and ambient world settings,
 * clouds, World Environment; `environment.ts`, phase 3 step 5; Post Process,
 * step 6), the main
 * grid's cell size, the static shadow switch (resolved into each placement's
 * `castShadow`, phase 3 step 4) and a landscape's material. Cells
 * are not carried over as files: the new level assigns every actor to a cell
 * by its position (A11). Every other field is counted in the report with the
 * phase that converts it (`fields.ts`).
 *
 * Ids come from the source path: the level id from the level's path, an
 * actor's from its placement id (else its file, asset id and index), so a
 * second run writes the same GUIDs.
 */
import {
  LEVEL_SCHEMA,
  TerrainAssetType,
  dataDocument,
  isJsonObject,
  type ActorDoc,
  type ActorId,
  type AssetId,
  type ComponentMap,
  type DataDocument,
  type JsonObject,
  type LevelDoc,
  type LevelId,
} from "../../core/index.ts";
import type { LayoutPlacement } from "../legacy/layout.ts";
import { normalizeWorldTerrain } from "../terrain/terrainDefinition.ts";
import {
  CONVERTED_LANDSCAPE_FIELDS,
  CONVERTED_LEVEL_FIELDS,
  CONVERTED_PLACEMENT_FIELDS,
  CONVERTED_WORLD_SETTINGS_FIELDS,
  FORGE_STATIC_OBJECTS_CAST_SHADOW,
  HEIGHT_FOG_FIELD_PHASES,
  LANDSCAPE_FIELD_PHASES,
  LEVEL_FIELD_PHASES,
  PLACEMENT_FIELD_PHASES,
  WORLD_SETTINGS_FIELD_PHASES,
  fieldPhase,
} from "./fields.ts";
import { environmentActors } from "./environment.ts";
import { forgeLevelId, stableHex } from "./ids.ts";
import { forgeLightSources, LIGHT_FIELD_PHASES, lightActors } from "./lights.ts";
import {
  HEIGHT_FOG_TAG,
  emptyPlacementCounts,
  placementGroupActors,
  terrainActor,
  type PlacementCounts,
  type PlacementGroup,
} from "./placements.ts";

/** Default level grid (A11), used when the Forge level has no main grid. */
export const FORGE_IMPORT_CELL_SIZE = 128;
const MIN_CELL_SIZE = 16;
const MAX_CELL_SIZE = 4096;

const HEIGHT_FOG_FIELDS = [
  "mode", "color", "density", "heightFalloff", "baseHeight", "startDistance",
  "maxOpacity", "sunColor", "sunStrength", "start", "end",
] as const;
const HEIGHT_FOG_NAME = "Exponential Height Fog";

export interface ForgeLevelInput {
  /** Public-relative path of the level (`layouts/OpenWorldTest.level.json`): the key of every id. */
  readonly path: string;
  /** The parsed level file. */
  readonly layout: unknown;
  /** The parsed cell files the level lists (`<level>.cells/main/<key>.cell.json`). */
  readonly cells: ReadonlyArray<{ readonly key: string; readonly doc: unknown }>;
  /** Parsed terrain definitions by the landscapes' `dataRef`. */
  readonly terrains: ReadonlyMap<string, unknown>;
}

export interface ForgeLevelOptions {
  /** GUID of the model a Forge asset id shows; null when there is none (the placements are left out and reported). */
  readonly meshAsset: (forgeAssetId: string) => string | null;
  /** Defaults to the id derived from the path. */
  readonly levelId?: LevelId;
  /** The World Builder stage that placed a placement, from the level's recipe ledger. */
  readonly stageOf?: (placementId: string) => string | undefined;
  /** GUID of the `forge.material` a Forge material id names; null when the target has none (reported). */
  readonly materialAsset?: (forgeMaterialId: string) => string | null;
  /**
   * Material slots of the model a Forge asset id shows (its unique GLB
   * materials); a placement's single `materialSlot` override is written on
   * each. Null when unknown: the override is reported, not converted.
   */
  readonly materialSlotCount?: (forgeAssetId: string) => number | null;
}

export interface ImportedTerrain {
  /** File of the terrain document, relative to the level folder; its parts sit beside it. */
  readonly file: string;
  /** The Forge `dataRef` the definition, tiles and global map are copied from. */
  readonly source: string;
  readonly document: DataDocument;
  /** Tile keys of the definition: the `<x>_<z>.tile.bin` files to copy. */
  readonly tileKeys: readonly string[];
}

export interface NotConvertedField {
  /** `lights`, `instances[].materialSlot`, `landscapes[].material`, `heightFog.hidden`. */
  readonly field: string;
  /** Array entries, or 1 for an object; placements carrying the field for a placement field. */
  readonly count: number;
  /** Phase that converts it (`fields.ts`); `?` for a field no table knows. */
  readonly phase: string;
}

export interface ForgeLevelReport {
  readonly source: string;
  readonly name: string;
  readonly converted: PlacementCounts & {
    readonly actors: number;
    readonly terrains: number;
    readonly heightFog: number;
    readonly lights: number;
    /** Sky Atmosphere, Sky Light, Cloud Layer, World Environment and Post Process singletons. */
    readonly environment: number;
    readonly sourceCells: number;
    /** Forge's level-wide static shadow switch, as resolved into the placements that do not say. */
    readonly staticCastShadow: boolean;
  };
  readonly notConverted: readonly NotConvertedField[];
  /** Placements left out because their Forge asset has no model in the target, by asset id. */
  readonly missingAssets: ReadonlyArray<{ readonly assetId: string; readonly placements: number }>;
  /** Placements whose id another placement already had: their actor id was disambiguated. */
  readonly duplicateIds: number;
}

export interface ForgeLevelImport {
  readonly level: LevelDoc;
  readonly terrains: readonly ImportedTerrain[];
  readonly report: ForgeLevelReport;
}

/**
 * The Forge terrain definition with each paint layer's material as the
 * material asset's GUID; a material the target does not have leaves the
 * layer without one (it paints with its colour) and is counted in the report.
 */
function terrainWithLayerMaterialIds(
  raw: JsonObject,
  materialAsset: ((forgeMaterialId: string) => string | null) | undefined,
  note: (field: string, count: number, phase: string) => void,
): JsonObject {
  const def = structuredClone(raw);
  for (const layer of arrayOf(def.layers)) {
    if (!isJsonObject(layer) || typeof layer.material !== "string" || layer.material === "") continue;
    const guid = materialAsset?.(layer.material) ?? null;
    if (guid === null) {
      note(`terrain layers[].material=${layer.material}`, 1, "- (materyal hedefte yok)");
      delete layer.material;
    } else {
      layer.material = guid;
    }
  }
  return def;
}

function arrayOf(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || (Array.isArray(value) && value.length === 0);
}

/** Cell size of the Forge main grid, when it is a valid one. */
function mainGridCellSize(layout: JsonObject): number {
  const settings = layout.worldSettings;
  if (!isJsonObject(settings) || !isJsonObject(settings.partition) || !isJsonObject(settings.partition.grids)) {
    return FORGE_IMPORT_CELL_SIZE;
  }
  const main = settings.partition.grids.main;
  const size = isJsonObject(main) ? main.cellSize : undefined;
  return typeof size === "number" && Number.isInteger(size) && size >= MIN_CELL_SIZE && size <= MAX_CELL_SIZE
    ? size
    : FORGE_IMPORT_CELL_SIZE;
}

function placementGroups(value: unknown, where: string): PlacementGroup[] {
  return arrayOf(value).map((group, index) => {
    if (!isJsonObject(group) || typeof group.assetId !== "string" || !Array.isArray(group.placements)) {
      throw new Error(`${where}.instances[${index}]: not a placement group`);
    }
    return { assetId: group.assetId, placements: group.placements as unknown as LayoutPlacement[] };
  });
}

export function importForgeLevel(input: ForgeLevelInput, options: ForgeLevelOptions): ForgeLevelImport {
  if (!isJsonObject(input.layout) || input.layout.schema !== 1) throw new Error(`${input.path}: not a Forge level`);
  const layout = input.layout;
  const levelId = options.levelId ?? forgeLevelId(input.path);
  const usedKeys = new Set<string>();
  let duplicateIds = 0;
  const actorId = (key: string): ActorId => {
    let unique = key;
    for (let copy = 2; usedKeys.has(unique); copy += 1) unique = `${key}~${copy}`;
    if (unique !== key) duplicateIds += 1;
    usedKeys.add(unique);
    return `act_${stableHex(`forge-webgl/${input.path}/actor/${unique}`)}`;
  };

  const fields = new Map<string, { count: number; phase: string }>();
  const note = (field: string, count: number, phase: string): void => {
    const entry = fields.get(field);
    if (entry) entry.count += count;
    else fields.set(field, { count, phase });
  };
  const noteLevelFields = (doc: JsonObject): void => {
    for (const [field, value] of Object.entries(doc)) {
      if (CONVERTED_LEVEL_FIELDS.has(field) || isEmpty(value)) continue;
      if (field === "worldSettings" && isJsonObject(value)) {
        // Each setting has its own owner (phase 3 decision 7): reported one by one.
        for (const key of Object.keys(value)) {
          if (!CONVERTED_WORLD_SETTINGS_FIELDS.has(key)) note(`worldSettings.${key}`, 1, fieldPhase(WORLD_SETTINGS_FIELD_PHASES, key));
        }
        continue;
      }
      note(field, Array.isArray(value) ? value.length : 1, fieldPhase(LEVEL_FIELD_PHASES, field));
    }
  };
  const notePlacementFields = (groups: readonly PlacementGroup[]): void => {
    for (const group of groups) {
      for (const placement of group.placements) {
        for (const field of Object.keys(placement)) {
          if (CONVERTED_PLACEMENT_FIELDS.has(field)) continue;
          note(`instances[].${field}`, 1, fieldPhase(PLACEMENT_FIELD_PHASES, field));
        }
      }
    }
  };

  const actors: ActorDoc[] = [];
  const counts = emptyPlacementCounts();
  const missing = new Map<string, number>();
  const settings = isJsonObject(layout.worldSettings) ? layout.worldSettings : {};
  const staticCastShadow = typeof settings.staticObjectsCastShadow === "boolean"
    ? settings.staticObjectsCastShadow
    : FORGE_STATIC_OBJECTS_CAST_SHADOW;
  const materialSlots = (materialId: string, assetId: string): string[] | null => {
    const material = options.materialAsset?.(materialId) ?? null;
    const slots = options.materialSlotCount?.(assetId) ?? null;
    return material === null || slots === null ? null : Array.from({ length: Math.max(1, slots) }, () => material);
  };
  const place = (groups: readonly PlacementGroup[], keyPrefix: string): void => {
    notePlacementFields(groups);
    const placed = placementGroupActors(groups, {
      actorId, keyPrefix, meshAsset: options.meshAsset, castShadow: staticCastShadow, materials: materialSlots,
      ...(options.stageOf ? { stageOf: options.stageOf } : {}),
    });
    for (const [materialId, count] of placed.unresolvedMaterials) {
      note(`instances[].materialSlot=${materialId}`, count, "- (materyal ya da model slotları hedefte yok)");
    }
    actors.push(...placed.actors);
    counts.placements += placed.counts.placements;
    counts.placeholders += placed.counts.placeholders;
    counts.meshes += placed.counts.meshes;
    counts.playerStarts += placed.counts.playerStarts;
    for (const [assetId, count] of placed.skipped) {
      if (assetId.startsWith("marker:")) note(`instances[${assetId}]`, count, "6");
      else missing.set(assetId, (missing.get(assetId) ?? 0) + count);
    }
  };

  // Terrain first, as World Builder writes it: the persistent layer leads.
  const terrains: ImportedTerrain[] = [];
  const terrainFiles = new Set<string>();
  for (const [index, landscape] of arrayOf(layout.landscapes).entries()) {
    if (!isJsonObject(landscape) || typeof landscape.id !== "string" || typeof landscape.dataRef !== "string") {
      throw new Error(`${input.path}: landscapes[${index}] has no id or dataRef`);
    }
    const raw = input.terrains.get(landscape.dataRef);
    if (raw === undefined) throw new Error(`${input.path}: terrain ${landscape.dataRef} was not read`);
    const def = normalizeWorldTerrain(raw);
    const file = `terrain/${landscape.id}.terrain.json`;
    if (terrainFiles.has(file)) throw new Error(`${input.path}: two landscapes have the id ${landscape.id}`);
    terrainFiles.add(file);
    const data = `ast_${stableHex(`forge-webgl/terrain/${landscape.dataRef}`)}` as const;
    const name = typeof landscape.name === "string" ? landscape.name : def.name;
    let material: AssetId | null = null;
    if (typeof landscape.material === "string" && landscape.material !== "") {
      material = (options.materialAsset?.(landscape.material) ?? null) as AssetId | null;
      if (material === null) note(`landscapes[].material=${landscape.material}`, 1, "- (materyal hedefte yok)");
    }
    actors.push(terrainActor(actorId(`terrain/${landscape.id}`), name, def, data, material));
    terrains.push({
      file,
      source: landscape.dataRef,
      document: dataDocument(TerrainAssetType, data, terrainWithLayerMaterialIds(raw as JsonObject, options.materialAsset, note)),
      tileKeys: def.tiles.map((tile) => tile.key),
    });
    for (const field of Object.keys(landscape)) {
      if (!CONVERTED_LANDSCAPE_FIELDS.has(field)) note(`landscapes[].${field}`, 1, fieldPhase(LANDSCAPE_FIELD_PHASES, field));
    }
  }

  let heightFog = 0;
  if (isJsonObject(layout.heightFog)) {
    const fog = layout.heightFog;
    const component: JsonObject = { type: HEIGHT_FOG_TAG };
    for (const field of HEIGHT_FOG_FIELDS) if (fog[field] !== undefined) component[field] = structuredClone(fog[field]);
    actors.push({
      id: actorId("heightFog"),
      name: typeof fog.name === "string" ? fog.name : HEIGHT_FOG_NAME,
      class: null,
      parent: null,
      spatiallyLoaded: false,
      transform: { p: [0, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] },
      components: { fog: component as unknown as ComponentMap[string] },
    });
    heightFog = 1;
    for (const field of Object.keys(fog)) {
      if (field === "name" || (HEIGHT_FOG_FIELDS as readonly string[]).includes(field)) continue;
      if (field === "hidden" && fog.hidden === false) continue;
      note(`heightFog.${field}`, 1, fieldPhase(HEIGHT_FOG_FIELD_PHASES, field));
    }
  }

  const environment = environmentActors(layout, actorId);
  actors.push(...environment.actors);
  for (const entry of environment.notes) note(entry.field, entry.count, entry.phase);

  const lights = lightActors(forgeLightSources(layout, input.cells), actorId);
  actors.push(...lights.actors);
  for (const [type, count] of lights.unknownTypes) note(`lights[type=${type}]`, count, "?");
  for (const [field, count] of lights.unread) note(`lights[].${field}`, count, fieldPhase(LIGHT_FIELD_PHASES, field));

  noteLevelFields(layout);
  place(placementGroups(layout.instances, input.path), "");
  for (const cell of input.cells) {
    if (!isJsonObject(cell.doc) || cell.doc.type !== "worldCell") throw new Error(`${input.path}: cell ${cell.key} is not a world cell`);
    noteLevelFields(cell.doc);
    place(placementGroups(cell.doc.instances, `${input.path} cell ${cell.key}`), `cells/${cell.key}/`);
  }

  return {
    level: { schema: LEVEL_SCHEMA, id: levelId, settings: { cellSize: mainGridCellSize(layout) }, actors },
    terrains,
    report: {
      source: input.path,
      name: typeof layout.name === "string" ? layout.name : "",
      converted: {
        ...counts, actors: actors.length, terrains: terrains.length, heightFog, lights: lights.actors.length, environment: environment.actors.length, sourceCells: input.cells.length, staticCastShadow,
      },
      notConverted: [...fields].map(([field, { count, phase }]) => ({ field, count, phase }))
        .sort((a, b) => a.field.localeCompare(b.field)),
      missingAssets: [...missing].map(([assetId, placements]) => ({ assetId, placements }))
        .sort((a, b) => a.assetId.localeCompare(b.assetId)),
      duplicateIds,
    },
  };
}
