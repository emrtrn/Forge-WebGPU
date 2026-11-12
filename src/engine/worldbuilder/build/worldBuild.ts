// Ported from Forge WebGL tools/world/worldBriefBuild.ts (buildWorldFromBrief: terrain, paint, pads, stages, bake, placements) @ forge-webgl-final (04b5fb23); docs/PORT_LOG.md §2.
/**
 * Builds a world from a brief, in memory (docs/world-builder/WORLD_BRIEF.md in
 * Forge WebGL). The order and every number are Forge's:
 *
 * brief → recipe plan → valley ground and water beds (`briefTerrain.ts`) →
 * paint (a ground cover, or the pilot's temporary paint) → level ground under
 * the landmarks → World Builder stages (roads, then the settlement chain:
 * sites, streets, parcels, land use, buildings) → road and street splines,
 * then building pads, baked into the terrain → stages that follow the finished
 * ground (street furniture, fences) → placements.
 *
 * Boundary (plan 2b, user decisions 2026-11-12): the stages run through
 * `stageRun.ts` (Forge's Stage Runner is not ported); the level and its files
 * are written by `worldLevel.ts` and `tools/world`, not by Forge's save
 * validators. Not built here, reported in `deferred`: Lake / River / Ocean
 * actors (Faz 7; the beds are carved), foliage rules (5c), the greybox light
 * and sky (Faz 3; the look is the user's). A model row whose file is not an
 * asset of the project becomes a role-coloured placeholder (Forge refused the
 * build): placeholders first.
 *
 * Pure and deterministic.
 */
import type { LayoutPlacement } from "../../legacy/layout.ts";
import { shapeAssetId } from "../../legacy/shapes.ts";
import { normalizeWorldTerrain } from "../../terrain/terrainDefinition.ts";
import { applyTerrainUndoPatches, createTerrainEditWorld, quantizeTerrainWeights } from "../../terrain/terrainEdit.ts";
import { encodeTerrainGlobalMap } from "../../terrain/terrainGlobalMapFile.ts";
import { terrainHeightAt } from "../../terrain/terrainHeightQuery.ts";
import { createTerrainPadPatches, padWeight, type TerrainPad } from "../../terrain/terrainPads.ts";
import { buildTerrainGlobalAttributes, worldTerrainRenderSource } from "../../terrain/terrainRenderSource.ts";
import { createTerrainSplinePatches } from "../../terrain/terrainSplines.ts";
import { encodeTerrainTile } from "../../terrain/terrainTileCodec.ts";
import {
  createFlatTerrainTile,
  terrainTileHeightRange,
  type TerrainTileData,
  type WorldTerrainDef,
  type WorldTerrainSpline,
} from "../../terrain/terrainTypes.ts";
import { createFlatWorldTerrain } from "../../terrain/worldTerrainCreate.ts";
import { OCEAN_LIMITS } from "../../water/oceanBudget.ts";
import { createBriefTerrain, type BriefTerrain } from "../briefTerrain.ts";
import { PAD_FALLOFF } from "../buildings.ts";
import {
  coverDensity,
  coverPaint,
  coverRockCounts,
  coverSnowLine,
  type CoverDensities,
  type GroundCover,
} from "../groundCover.ts";
import type { WorldPoint } from "../normalize.ts";
import type { WorldRecipe } from "../recipe.ts";
import type { RegionProfile } from "../regionProfile.ts";
import type { StageLayout, StageTerrain, WorldStage } from "../stage.ts";
import { buildingsStage } from "../stages/buildings.ts";
import { fencesStage } from "../stages/fences.ts";
import { furnitureColor, furnitureStage } from "../stages/furniture.ts";
import { landUseStage } from "../stages/landUse.ts";
import { parcelsStage } from "../stages/parcels.ts";
import { roadsStage } from "../stages/roads.ts";
import { settlementSitesStage } from "../stages/settlementSites.ts";
import { streetsStage } from "../stages/streets.ts";
import {
  briefElevationToWorld,
  briefToWorld,
  briefWorldBounds,
  worldBriefRecipe,
  type BriefModel,
  type WorldBrief,
  type WorldBuildStep,
} from "../worldBrief.ts";
import { applyStageRun, runStage, type StageRun } from "./stageRun.ts";
import {
  briefClearings,
  paintWeights,
  PILOT_TUNING,
  scatterOutcrops,
  scatterRocks,
  waterSpline,
  yardFences,
  type ScatterPlacement,
} from "./temporarySteps.ts";

/**
 * World Builder stages the build applies before the ground is finished, in
 * order. Terrain and water are built before them (`briefTerrain.ts`); their
 * road and street splines and building pads are baked after them.
 */
export const WORLD_BRIEF_STAGES: readonly WorldStage[] = [
  roadsStage, settlementSitesStage, streetsStage, parcelsStage, landUseStage, buildingsStage,
];
/** Role of the parcels stage's ground plates (`stages/parcels.ts`). */
const PARCEL_MARKER_ROLE = "marker.parcel";

/** Stages that stand their objects on the finished ground, run after the bake. */
export const WORLD_BRIEF_GROUND_STAGES: readonly WorldStage[] = [furnitureStage, fencesStage];

/** The placeholder a model row without a project asset becomes. */
export const PLACEHOLDER_ASSET_ID = shapeAssetId("cube");

export interface WorldBuildInput {
  brief: WorldBrief;
  /** The brief's region profile, loaded; null when it names none. */
  profile: RegionProfile | null;
  /** Asset id of a model file (an asset index file label), or null when it is not an asset of the project. */
  assetIdForFile: (file: string) => string | null;
  /** The brief's ground cover, loaded; null (or absent) when it names none: the pilot's paint. */
  cover?: GroundCover | null;
  /** Told as each build step starts (`WORLD_BUILD_STEPS`); it only reports, the build does not wait. */
  onProgress?: ((step: WorldBuildStep) => void) | undefined;
}

/** One placement group: a model asset id, or a `shape:<type>` placeholder. */
export interface WorldPlacementGroup {
  assetId: string;
  placements: LayoutPlacement[];
}

export interface WorldBuild {
  /** The terrain definition, normalised as it is saved. */
  def: WorldTerrainDef;
  tiles: ReadonlyMap<string, TerrainTileData>;
  /** Encoded tiles by key, and the global map. */
  tileBytes: Map<string, Uint8Array>;
  globalBytes: Uint8Array;
  /** Every placement of the level, by asset; placeholders under `shape:<type>`. */
  groups: WorldPlacementGroup[];
  /** World position of the Player Start, or null. */
  playerStart: [number, number, number] | null;
  /** The recipe after the stages, `generatedBy` included (the level writer moves it onto the objects). */
  recipe: WorldRecipe;
  stages: StageRun[];
  /** Valley ground and water courses (`briefTerrain.ts`). */
  ground: BriefTerrain;
  /** Height of each landmark's level ground, by id. */
  padHeights: Record<string, number>;
  sampleHeight: (x: number, z: number) => number | null;
  warnings: string[];
  /** Brief fields read but not built yet. */
  deferred: string[];
}

/** Millimetres, as the editor saves positions. */
function savedCoordinate(value: number): number {
  return Number(value.toFixed(3));
}

function title(id: string): string {
  return id.charAt(0).toUpperCase() + id.slice(1);
}

/**
 * Model rows by role and variant; the first row of a role without a variant is
 * its default. A row whose file is not an asset gives the placeholder.
 */
function modelResolver(models: readonly BriefModel[], assetIdForFile: (file: string) => string | null) {
  const resolved = new Map<BriefModel, string>();
  const missing: string[] = [];
  for (const model of models) {
    const assetId = assetIdForFile(model.file);
    if (assetId) resolved.set(model, assetId);
    else missing.push(`${model.role}${model.variant ? ` (${model.variant})` : ""}: ${model.file}`);
  }
  const rows = (role: string, variant: string | null): BriefModel[] =>
    models.filter((model) => model.role === role && (variant === null || model.variant === variant));
  return {
    missing,
    /** Asset id for a role; `pick` 0..1 chooses among several rows. Null when the role has no row. */
    assetId(role: string, variant: string | null, pick = 0): string | null {
      const candidates = rows(role, variant);
      if (candidates.length === 0) return null;
      const model = variant === null
        ? candidates.find((row) => row.variant === undefined) ?? candidates[0]!
        : candidates[Math.floor(pick * candidates.length)]!;
      return resolved.get(model) ?? PLACEHOLDER_ASSET_ID;
    },
  };
}

function writeWeights(tile: TerrainTileData, index: number, weights: number[]): void {
  const bytes = quantizeTerrainWeights(weights);
  bytes.forEach((weight, layer) => {
    tile.weights[Math.floor(layer / 4) * tile.size * tile.size * 4 + index * 4 + layer % 4] = weight;
  });
}

/**
 * Paints the settlement ground under every pad with `PILOT_TUNING.padPaint`
 * (inside the pad, easing out beyond it), blended over the paint already there.
 * Plants grow from the paint, so none stands in a building or its yard.
 */
function paintPads(def: WorldTerrainDef, tiles: ReadonlyMap<string, TerrainTileData>, pads: readonly TerrainPad[], layerId: string): void {
  const { fade } = PILOT_TUNING.padPaint;
  const layer = def.layers.findIndex((entry) => entry.id === layerId);
  if (layer < 0) return;
  const quads = def.tileQuads;
  for (const pad of pads) {
    const shape: TerrainPad = { polygon: pad.polygon, height: pad.height, falloff: fade };
    const xs = pad.polygon.map(([x]) => x);
    const zs = pad.polygon.map(([, z]) => z);
    const [minI, maxI] = [Math.floor((Math.min(...xs) - fade - def.origin[0]) / def.spacing), Math.ceil((Math.max(...xs) + fade - def.origin[0]) / def.spacing)];
    const [minJ, maxJ] = [Math.floor((Math.min(...zs) - fade - def.origin[2]) / def.spacing), Math.ceil((Math.max(...zs) + fade - def.origin[2]) / def.spacing)];
    for (const tile of tiles.values()) {
      const [baseI, baseJ] = [tile.x * quads, tile.z * quads];
      for (let j = Math.max(minJ, baseJ); j <= Math.min(maxJ, baseJ + quads); j += 1) {
        for (let i = Math.max(minI, baseI); i <= Math.min(maxI, baseI + quads); i += 1) {
          const weight = padWeight(shape, def.origin[0] + i * def.spacing, def.origin[2] + j * def.spacing);
          if (weight <= 0) continue;
          const index = (j - baseJ) * tile.size + (i - baseI);
          const current = Array.from({ length: tile.layerCount }, (_, k) =>
            tile.weights[Math.floor(k / 4) * tile.size * tile.size * 4 + index * 4 + k % 4]! / 255);
          writeWeights(tile, index, current.map((value, k) => value * (1 - weight) + (k === layer ? weight : 0)));
        }
      }
    }
  }
}

export function buildWorldFromBrief(input: WorldBuildInput): WorldBuild {
  const { brief, profile } = input;
  const progress = input.onProgress ?? (() => undefined);
  progress("terrain");
  const warnings: string[] = [];
  const deferred: string[] = [];
  const models = modelResolver(brief.models, input.assetIdForFile);
  const bounds = briefWorldBounds(brief);
  const ground = createBriefTerrain(brief);
  const cover = input.cover ?? null;
  if (brief.cover && !cover) throw new Error(`the brief names ground cover ${brief.cover.file}; load it into the build input`);
  const densities: CoverDensities = {
    forest: coverDensity(brief.cover?.forest), rocks: coverDensity(brief.cover?.rocks), fields: coverDensity(brief.cover?.fields),
  };
  const waterIds = new Set(ground.courses.map((course) => course.id));

  // Terrain: tiles cover the area, centred on it.
  const { terrain } = brief;
  const tileSpan = terrain.tileQuads * terrain.spacing;
  const tilesX = Math.ceil((bounds.max[0] - bounds.min[0]) / tileSpan - 1e-9);
  const tilesZ = Math.ceil((bounds.max[1] - bounds.min[1]) / tileSpan - 1e-9);
  if (brief.ocean && (tilesX * tilesZ * terrain.tileQuads ** 2 > OCEAN_LIMITS.cells
    || Math.max(tilesX, tilesZ) * terrain.tileQuads > OCEAN_LIMITS.axisCells)) throw new Error("Ocean terrain exceeds the preparation grid limit");
  const created = createFlatWorldTerrain({
    name: terrain.name, tilesX, tilesZ, tileQuads: terrain.tileQuads, spacing: terrain.spacing, baseHeight: 0,
    heightMin: briefElevationToWorld(brief, terrain.heightRange[0]), heightMax: briefElevationToWorld(brief, terrain.heightRange[1]),
  });
  const def = created.def;
  def.origin = [
    def.origin[0] + (bounds.min[0] + bounds.max[0]) / 2,
    def.origin[1],
    def.origin[2] + (bounds.min[1] + bounds.max[1]) / 2,
  ];
  def.layers = cover ? structuredClone(cover.layers) : structuredClone(PILOT_TUNING.layers);
  const size = terrain.tileQuads + 1;
  const tiles = def.tiles.map(({ key }) => {
    const { x, z } = created.tiles.get(key)!;
    const tile = createFlatTerrainTile(def, x, z);
    for (let j = 0; j < size; j += 1) {
      for (let i = 0; i < size; i += 1) {
        const worldX = def.origin[0] + (tile.x * terrain.tileQuads + i) * terrain.spacing;
        const worldZ = def.origin[2] + (tile.z * terrain.tileQuads + j) * terrain.spacing;
        tile.heights[j * size + i] = ground.height(worldX, worldZ);
      }
    }
    return tile;
  });
  // Paint once every height is known: the slope reads the neighbours, across tile edges too.
  progress("paint");
  const weights = cover
    ? coverPaint(cover, brief, ground, densities, {
      clearings: briefClearings(brief).map(([x, z]) => [x, z, PILOT_TUNING.clearingRadius] as const),
      snowLine: coverSnowLine(cover, tiles.flatMap((tile) => Array.from(tile.heights.filter((_, k) => k % 7 === 0)))),
    })
    : paintWeights(brief, ground);
  const byKey = new Map(tiles.map((tile) => [`${tile.x}_${tile.z}`, tile]));
  const [lastI, lastJ] = [tilesX * terrain.tileQuads, tilesZ * terrain.tileQuads];
  const gridHeight = (gi: number, gj: number): number => {
    const [ci, cj] = [Math.min(lastI, Math.max(0, gi)), Math.min(lastJ, Math.max(0, gj))];
    const [tx, tz] = [Math.min(tilesX - 1, Math.floor(ci / terrain.tileQuads)), Math.min(tilesZ - 1, Math.floor(cj / terrain.tileQuads))];
    const tile = byKey.get(`${tx}_${tz}`)!;
    return tile.heights[(cj - tz * terrain.tileQuads) * size + (ci - tx * terrain.tileQuads)]!;
  };
  for (const tile of tiles) {
    for (let j = 0; j < size; j += 1) {
      for (let i = 0; i < size; i += 1) {
        const [gi, gj] = [tile.x * terrain.tileQuads + i, tile.z * terrain.tileQuads + j];
        const slope = Math.atan(Math.hypot(gridHeight(gi + 1, gj) - gridHeight(gi - 1, gj), gridHeight(gi, gj + 1) - gridHeight(gi, gj - 1))
          / (2 * terrain.spacing)) * 180 / Math.PI;
        writeWeights(tile, j * size + i, weights(def.origin[0] + gi * terrain.spacing, def.origin[2] + gj * terrain.spacing, slope, tile.heights[j * size + i]!));
      }
    }
  }
  const world = createTerrainEditWorld(def, tiles);
  const sampleHeight = (x: number, z: number): number | null => terrainHeightAt(def, world, x, z);

  // Level ground first, so a road ends on what it will meet.
  const padHeights: Record<string, number> = {};
  const pads: TerrainPad[] = [];
  for (const landmark of brief.landmarks) {
    if (!landmark.pad) continue;
    const [cx, cz] = briefToWorld(brief, landmark.at);
    const height = Number(ground.height(cx, cz).toFixed(2));
    const [halfX, halfZ] = [landmark.pad.size[0] / 2, landmark.pad.size[1] / 2];
    padHeights[landmark.id] = height;
    pads.push({
      polygon: [[cx - halfX, cz - halfZ], [cx + halfX, cz - halfZ], [cx + halfX, cz + halfZ], [cx - halfX, cz + halfZ]],
      height,
      falloff: landmark.pad.falloff,
    });
  }
  // Bakes over a large world can be more than one editor transaction allows: `split` prepares them in pieces, with the same result.
  if (pads.length) applyTerrainUndoPatches(world, createTerrainPadPatches(world, pads, { split: true }));

  // Stages: each sees the recipe, the placements and the splines the previous one left.
  def.splines = ground.courses.map(waterSpline);
  let recipe = worldBriefRecipe(brief);
  const layoutForStages: StageLayout = { instances: [] };
  const stages: StageRun[] = [];
  const runStages = (list: readonly WorldStage[]): void => {
    for (const stage of list) {
      const stageTerrain: StageTerrain = {
        id: terrain.id,
        min: [def.origin[0], def.origin[2]],
        max: [def.origin[0] + tilesX * tileSpan, def.origin[2] + tilesZ * tileSpan],
        layers: def.layers.map(({ id, name }) => ({ id, name })),
        splines: def.splines ?? [],
        locked: false,
      };
      const run = runStage(stage, { recipe, layout: layoutForStages, profile, sampleHeight, terrains: [stageTerrain], ...(ground.ocean ? { ocean: ground.ocean } : {}) });
      if (run.errors.length > 0) throw new Error(`stage ${stage.id}: ${run.errors.join("; ")}`);
      // The build bakes the pads itself, before the stages that follow the ground.
      warnings.push(...run.warnings.filter((warning) => !warning.includes("run this stage after Apply Pads")).map((warning) => `${stage.id}: ${warning}`));
      if (run.blocked.length) warnings.push(`${stage.id}: already in the level, not written: ${run.blocked.join(", ")}`);
      applyStageRun(layoutForStages, run);
      for (const { landscapeId, spline } of run.splines) if (landscapeId === terrain.id) def.splines = [...def.splines ?? [], structuredClone(spline)];
      recipe = run.recipeAfter;
      stages.push(run);
    }
  };
  progress("settlements");
  runStages(WORLD_BRIEF_STAGES);
  progress("roads");
  // Roads and streets, then the building pads over them (a road ends at its pad's edge).
  for (const spline of def.splines) {
    if (waterIds.has(spline.id) || spline.coordinateSpace !== "world") continue;
    applyTerrainUndoPatches(world, createTerrainSplinePatches(world, spline as WorldTerrainSpline, "both", { split: true }));
  }
  const buildingPads: TerrainPad[] = recipe.generated.pads.map((pad) => ({
    polygon: pad.polygon, height: pad.height, falloff: pad.falloff ?? PAD_FALLOFF,
  }));
  if (buildingPads.length) {
    applyTerrainUndoPatches(world, createTerrainPadPatches(world, buildingPads, { split: true }));
    paintPads(def, world.tiles, buildingPads, cover ? cover.roles.pad : PILOT_TUNING.padPaint.layerId);
  }
  progress("ground");
  runStages(WORLD_BRIEF_GROUND_STAGES);

  const tileBytes = new Map<string, Uint8Array>();
  for (const summary of def.tiles) {
    const tile = world.tiles.get(summary.key)!;
    const range = terrainTileHeightRange(tile);
    summary.minHeight = range.min;
    summary.maxHeight = range.max;
    tileBytes.set(summary.key, encodeTerrainTile(tile, { ...def, heightFormat: "f32" }));
  }
  const globalBytes = encodeTerrainGlobalMap(def, buildTerrainGlobalAttributes(worldTerrainRenderSource(def, world.tiles)));

  // Placements: landmarks and props by their model rows, then the temporary scatter.
  progress("placements");
  const groups = new Map<string, LayoutPlacement[]>();
  const place = (assetId: string, entry: { id: string; role: string; name: string; at: WorldPoint; rotationYDeg: number; scale: number; collision: boolean }): void => {
    const height = sampleHeight(entry.at[0], entry.at[1]);
    if (height === null) throw new Error(`placement ${entry.id} is off the terrain`);
    const placement = {
      id: entry.id, role: entry.role, name: entry.name, rotationYDeg: entry.rotationYDeg, scale: entry.scale,
      position: [savedCoordinate(entry.at[0]), savedCoordinate(height), savedCoordinate(entry.at[1])],
      // The editor's save drops the default `true`.
      ...(entry.collision ? {} : { collision: false }),
      // A placeholder shows its role's colour.
      ...(assetId === PLACEHOLDER_ASSET_ID ? { color: furnitureColor(entry.role) } : {}),
    } as LayoutPlacement;
    groups.set(assetId, [...(groups.get(assetId) ?? []), placement]);
  };
  for (const landmark of brief.landmarks) {
    const assetId = models.assetId(landmark.role, null);
    if (!assetId) {
      warnings.push(`landmark ${landmark.id}: no model row for ${landmark.role}; nothing placed`);
      continue;
    }
    place(assetId, { id: landmark.id, role: landmark.role, name: title(landmark.id), at: briefToWorld(brief, landmark.at), rotationYDeg: 0, scale: 1, collision: true });
  }
  for (const prop of brief.props) {
    const assetId = models.assetId(prop.role, null);
    if (!assetId) throw new Error(`prop ${prop.id}: no model row for ${prop.role}`);
    place(assetId, {
      id: prop.id, role: prop.role, name: title(prop.id), at: briefToWorld(brief, prop.at),
      rotationYDeg: prop.rotationDeg, scale: prop.scale, collision: prop.collision,
    });
  }
  // Stage placements carry their own height (pads, walls and steps are not on the bare ground).
  // Parcel plates are an editor aid drawn on the unlevelled ground; a built scene leaves them out.
  for (const group of layoutForStages.instances) {
    const kept = group.placements.filter((placement) => placement.role !== PARCEL_MARKER_ROLE);
    if (kept.length) groups.set(group.assetId, [...(groups.get(group.assetId) ?? []), ...structuredClone(kept)]);
  }
  const rockCounts = cover ? coverRockCounts(cover, densities) : null;
  const scatter: ScatterPlacement[] = [
    ...yardFences(brief),
    ...scatterRocks(brief, ground, bounds, rockCounts ?? undefined),
    ...(cover && rockCounts && rockCounts.outcrops > 0 ? scatterOutcrops(brief, ground, bounds, rockCounts.outcrops, cover.rock.slope[0]) : []),
  ];
  for (const entry of scatter) {
    const assetId = models.assetId(entry.role, entry.variant, entry.pick);
    if (!assetId) throw new Error(`temporary scatter: no model row for ${entry.role}${entry.variant ? ` (${entry.variant})` : ""}`);
    place(assetId, entry);
  }

  const start = brief.playerStart ? briefToWorld(brief, brief.playerStart) : null;
  const startHeight = start ? sampleHeight(start[0], start[1]) : null;
  if (start && startHeight === null) throw new Error("playerStart is off the terrain");

  if (models.missing.length) warnings.push(`model rows with no project asset, placed as placeholders: ${models.missing.join("; ")}`);
  if (ground.courses.length) deferred.push(`rivers: ${ground.courses.length} bed(s) carved and their splines kept on the terrain; River actors wait for Faz 7`);
  if (ground.lakes.length) deferred.push(`lakes: ${ground.lakes.length} bed(s) carved; Lake actors wait for Faz 7`);
  if (brief.ocean) deferred.push("ocean: the coast is shaped; the Ocean actor waits for Faz 7");
  deferred.push(cover ? "foliage: the ground cover's plant rules wait for foliage (5c)" : "foliage: the pilot's plant rules wait for foliage (5c)");
  deferred.push("light and sky: none written; the look is set in the editor (Faz 3)");
  if (brief.environment) deferred.push("environment: season/weather/hour are read, not written to the level yet (WES link, plan §12)");
  if (brief.regions.length) deferred.push("regions: in the recipe plan only");
  deferred.push(...ground.deferred);
  for (const valley of brief.valleys) if (valley.ridgeElevation) deferred.push(`valleys.${valley.id}.ridgeElevation: not used by the terrain step yet`);

  return {
    def: normalizeWorldTerrain(structuredClone(def)),
    tiles: world.tiles,
    tileBytes,
    globalBytes,
    groups: [...groups].map(([assetId, placements]) => ({ assetId, placements })),
    playerStart: start ? [start[0], savedCoordinate(startHeight! + 2), start[1]] : null,
    recipe,
    stages,
    ground,
    padHeights,
    sampleHeight,
    warnings,
    deferred,
  };
}
