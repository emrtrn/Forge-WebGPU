// Ported from Forge WebGL engine/worldbuilder/groundCover.ts @ forge-webgl-final (04b5fb23); docs/PORT_LOG.md §2.
/**
 * Ground cover (RANDOM_WORLD_PLAN step 4): what grows on a world and how its
 * ground is painted — forest, meadow, farmland, steppe, desert, alpine — as a
 * data file (`*.cover.json`). A fork swaps the plants it collected into these
 * files; no code changes.
 *
 * A cover lists up to `TERRAIN_MAX_LAYERS` paint layers and names the role of
 * each (open ground, forest floor, rock, water bed, building pads, roads, and
 * optionally snow, waterside and fields). Paint at a ground point, in order:
 *
 * - water bed under rivers and lakes and on their shores;
 * - snow above the snow line (a height quantile of the world, never less than
 *   `minAbove` over its lowest ground), then rock on slopes past `rock.slope`;
 * - the rest is ground: fields round the settlements (a patchwork of plots on
 *   gentle ground, `fields`), else forest past `forest.from` beyond a
 *   settlement's reach (patchy when `share` < 1, below the tree line), else
 *   the waterside band (`waterside`), else open ground.
 *
 * Plants grow from the paint (foliage rules per layer); rocks are scattered
 * by count. Densities (`low|medium|high`) scale the forest's share, the rock
 * counts and the fields' reach.
 *
 * The `forest` cover Forge ships paints exactly what the pilot's temporary
 * paint did on a world with relief, so a random world keeps its look.
 * Plants name their foliage type by asset id (plan 5d step 8; Forge WebGL: a
 * file path), or a tree, shrub or grass recipe whose generated prototypes share
 * the rule (vegetation plan PG5); a missing one fails the asset gate like any
 * other reference. Plants of one `stand` share a grid (PG5b, foliageStand.ts):
 * their densities add up, each takes its part of the slots in the cover's
 * order, so a species listed beside its young trees grows with them.
 * Pure and deterministic.
 */
import { isId, type AssetId } from "../../core/index.ts";
import type { BriefTerrain } from "./briefTerrain.ts";
import { WATER_BED_MARGIN } from "./briefTerrain.ts";
import type { GeneratedSources } from "./generatedModels.ts";
import { oceanBeachWeight } from "./island.ts";
import { fbm } from "./noise.ts";
import {
  type Ctx,
  arrayOf,
  isOneOf,
  isRecord,
  issue,
  reject,
  requireId,
  requireNumber,
  requireRange,
} from "./normalize.ts";
import { briefToWorld, COVER_DENSITY_LEVELS, type WorldBrief } from "./worldBrief.ts";

export const GROUND_COVER_SCHEMA = 1;
export const GROUND_COVER_SUFFIX = ".cover.json";
/** Paint layers a World Terrain holds (`TERRAIN_MAX_LAYERS`). */
export const COVER_MAX_LAYERS = 8;
export const COVER_DENSITIES = COVER_DENSITY_LEVELS;
export type CoverDensity = (typeof COVER_DENSITIES)[number];
/** What a density does to the forest's share and the fields' reach. */
export const COVER_DENSITY_FACTOR: Readonly<Record<CoverDensity, number>> = { low: 0.5, medium: 1, high: 1.6 };
/** What a density does to the rock counts. */
export const ROCK_DENSITY_FACTOR: Readonly<Record<CoverDensity, number>> = { low: 0.4, medium: 1, high: 2.2 };

/** Reach of a settlement without a radius, metres (as the terrain step). */
const SETTLEMENT_REACH = 150;

export interface CoverLayer {
  id: string;
  name: string;
  color: string;
  material?: string;
  physicalMaterial?: string;
}

export interface CoverRoles {
  open: string;
  forest: string;
  rock: string;
  /** Under rivers and lakes and on their shores. */
  bed: string;
  /** Under building pads, so no plant grows there. */
  pad: string;
  /** The region profile's road surface layer. */
  road: string;
  snow?: string;
  waterside?: string;
  /** Plot kinds, chosen per plot; a plot can also lie fallow (open ground). */
  fields?: string[];
}

export interface CoverPlant {
  id: string;
  /** Layer id the plant grows on. */
  layer: string;
  /** `forge.foliageType` asset id; null while no asset grows here (the rule is kept, reported and not written) or a recipe is named. */
  foliageType: AssetId | null;
  /** Instead of a type: a tree, shrub or grass recipe whose prototypes share the rule's density (`generatedModels.ts`). */
  recipe?: AssetId;
  /** With a recipe: its mature prototypes (the default) or its young ones. */
  age?: "mature" | "young";
  /** At most this many of the recipe's prototypes (each is a batch of its own); all of them by default. */
  prototypes?: number;
  /** Instances per m² at full paint. */
  density: number;
  minWeight: number;
  /** The paint weight's ramps (`FoliageRuleParams`): full density this far over `minWeight`, thinning past `maxWeight`. */
  fadeIn?: number;
  maxWeight?: number;
  fadeOut?: number;
  /** Plants shrink to this toward the edge of the paint. */
  edgeScale?: number;
  /** The stand it belongs to; its seed is the stand's. */
  stand?: string;
  seed: number;
  /** Instead of the stand's. */
  reach?: number;
  far?: number;
}

/** Plants that share one grid, and how far they are drawn. */
export interface CoverStand {
  id: string;
  seed: number;
  /** Species patches, metres (0: none). */
  patch: number;
  /** Models to here, then billboards to `far`, metres (0: the foliage types' own distances, no billboards). */
  reach: number;
  far: number;
  /** Far ground tint, 0..1. */
  tint: number;
  /** LOD distances are multiplied by it. */
  detail: number;
}

export interface GroundCover {
  schema: typeof GROUND_COVER_SCHEMA;
  type: "groundCover";
  id: string;
  name: string;
  layers: CoverLayer[];
  roles: CoverRoles;
  /** Rock from the first slope to full at the second, degrees. */
  rock: { slope: [number, number] };
  forest: {
    /** Forest from this distance beyond a settlement's reach to full at the second, metres. */
    from: [number, number];
    /** 0..1: how much of the ground past `from` is forest; below 1 it comes in patches. */
    share: number;
    /** Patch size, metres. */
    patch: number;
  };
  /** A band beside rivers and lakes painted `roles.waterside`, with trees in it when `trees` > 0. */
  waterside?: { width: number; trees: number };
  /** Plots (`size`: width, length in metres) round each settlement, from inside its reach out to `reach` past it, on ground below `maxSlopeDeg`. */
  fields?: { reach: number; maxSlopeDeg: number; size: [number, number] };
  /** Snow above the `quantile` of the world's heights, at least `minAbove` over its lowest ground; `treeGap` below it the forest thins out. */
  snow?: { quantile: number; minAbove: number; fade: number; treeGap: number };
  stands: CoverStand[];
  plants: CoverPlant[];
  /** Rock counts: on high ground and slopes of a valley, by water, and on any steep ground. */
  rocks: { high: number; slopes: number; water: number; outcrops: number };
}

export interface CoverDensities {
  forest: CoverDensity;
  rocks: CoverDensity;
  fields: CoverDensity;
}

export const DEFAULT_COVER_DENSITIES: Readonly<CoverDensities> = { forest: "medium", rocks: "medium", fields: "medium" };

const COVER_KEYS = ["schema", "type", "id", "name", "layers", "roles", "rock", "forest", "waterside", "fields", "snow", "stands", "plants", "rocks"];

function known(ctx: Ctx, value: Record<string, unknown>, path: string, keys: readonly string[]): void {
  for (const key of Object.keys(value)) if (!keys.includes(key)) issue(ctx, `${path}${path ? "." : ""}${key}`, "is not a ground cover field");
}

function record(ctx: Ctx, path: string, value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : reject(ctx, path, "must be an object");
}

function text(ctx: Ctx, path: string, value: unknown): string | null {
  return typeof value === "string" && value.trim() && value.length <= 128 ? value : reject(ctx, path, "must be a non-empty string");
}

export function normalizeGroundCover(value: unknown): { cover: GroundCover | null; issues: string[] } {
  const ctx: Ctx = { issues: [] };
  if (!isRecord(value)) return { cover: null, issues: ["ground cover must be an object"] };
  if (value.schema !== GROUND_COVER_SCHEMA || value.type !== "groundCover") {
    return { cover: null, issues: [`ground cover needs schema ${GROUND_COVER_SCHEMA} and type "groundCover"`] };
  }
  known(ctx, value, "", COVER_KEYS);
  const id = requireId(ctx, "id", value.id);
  const name = text(ctx, "name", value.name);

  const layers = arrayOf(ctx, "layers", value.layers, (c, p, entry): CoverLayer | null => {
    const raw = record(c, p, entry);
    if (!raw) return null;
    known(c, raw, p, ["id", "name", "color", "material", "physicalMaterial"]);
    const layerId = requireId(c, `${p}.id`, raw.id);
    const layerName = text(c, `${p}.name`, raw.name);
    const color = typeof raw.color === "string" && /^#[0-9a-f]{6}$/i.test(raw.color) ? raw.color.toLowerCase() : reject(c, `${p}.color`, "must be #rrggbb");
    const material = raw.material === undefined ? undefined : text(c, `${p}.material`, raw.material) ?? undefined;
    const physicalMaterial = raw.physicalMaterial === undefined ? undefined : text(c, `${p}.physicalMaterial`, raw.physicalMaterial) ?? undefined;
    if (layerId === null || layerName === null || color === null) return null;
    return { id: layerId, name: layerName, color, ...(material ? { material } : {}), ...(physicalMaterial ? { physicalMaterial } : {}) };
  });
  if (layers.length === 0 || layers.length > COVER_MAX_LAYERS) issue(ctx, "layers", `must list 1..${COVER_MAX_LAYERS} layers`);
  const layerIds = new Set(layers.map((layer) => layer.id));
  if (layerIds.size !== layers.length) issue(ctx, "layers", "repeats a layer id");
  const layerRef = (path: string, ref: unknown): string | null =>
    typeof ref === "string" && layerIds.has(ref) ? ref : reject(ctx, path, "must name one of the cover's layers");

  const rolesRaw = record(ctx, "roles", value.roles) ?? {};
  known(ctx, rolesRaw, "roles", ["open", "forest", "rock", "bed", "pad", "road", "snow", "waterside", "fields"]);
  const role = (key: string): string | null => layerRef(`roles.${key}`, rolesRaw[key]);
  const [open, forestLayer, rockLayer, bed, pad, road] = ["open", "forest", "rock", "bed", "pad", "road"].map(role);
  const snowLayer = rolesRaw.snow === undefined ? undefined : role("snow") ?? undefined;
  const watersideLayer = rolesRaw.waterside === undefined ? undefined : role("waterside") ?? undefined;
  const fieldLayers = rolesRaw.fields === undefined ? undefined
    : arrayOf(ctx, "roles.fields", rolesRaw.fields, (_c, p, entry) => layerRef(p, entry));

  const rockRaw = record(ctx, "rock", value.rock) ?? {};
  known(ctx, rockRaw, "rock", ["slope"]);
  const rockSlope = requireRange(ctx, "rock.slope", rockRaw.slope, 0, 90);

  const forestRaw = record(ctx, "forest", value.forest) ?? {};
  known(ctx, forestRaw, "forest", ["from", "share", "patch"]);
  const forestFrom = requireRange(ctx, "forest.from", forestRaw.from, -1000, 5000);
  const share = requireNumber(ctx, "forest.share", forestRaw.share, 0, 1);
  const patch = requireNumber(ctx, "forest.patch", forestRaw.patch, 10, 5000);

  let waterside: GroundCover["waterside"];
  if (value.waterside !== undefined) {
    const raw = record(ctx, "waterside", value.waterside) ?? {};
    known(ctx, raw, "waterside", ["width", "trees"]);
    const width = requireNumber(ctx, "waterside.width", raw.width, 1, 1000);
    const trees = requireNumber(ctx, "waterside.trees", raw.trees, 0, 1);
    if (width !== null && trees !== null) waterside = { width, trees };
    if (!watersideLayer) issue(ctx, "roles.waterside", "is needed with waterside");
  }
  let fields: GroundCover["fields"];
  if (value.fields !== undefined) {
    const raw = record(ctx, "fields", value.fields) ?? {};
    known(ctx, raw, "fields", ["reach", "maxSlopeDeg", "size"]);
    const reach = requireNumber(ctx, "fields.reach", raw.reach, 0, 5000);
    const maxSlopeDeg = requireNumber(ctx, "fields.maxSlopeDeg", raw.maxSlopeDeg, 0, 60);
    const size = requireRange(ctx, "fields.size", raw.size, 5, 1000);
    if (reach !== null && maxSlopeDeg !== null && size) fields = { reach, maxSlopeDeg, size };
    if (!fieldLayers?.length) issue(ctx, "roles.fields", "must list at least one layer with fields");
  }
  let snow: GroundCover["snow"];
  if (value.snow !== undefined) {
    const raw = record(ctx, "snow", value.snow) ?? {};
    known(ctx, raw, "snow", ["quantile", "minAbove", "fade", "treeGap"]);
    const quantile = requireNumber(ctx, "snow.quantile", raw.quantile, 0, 1);
    const minAbove = requireNumber(ctx, "snow.minAbove", raw.minAbove, 0, 10000);
    const fade = requireNumber(ctx, "snow.fade", raw.fade, 0.1, 1000);
    const treeGap = requireNumber(ctx, "snow.treeGap", raw.treeGap, 0, 2000);
    if (quantile !== null && minAbove !== null && fade !== null && treeGap !== null) snow = { quantile, minAbove, fade, treeGap };
    if (!snowLayer) issue(ctx, "roles.snow", "is needed with snow");
  }

  const optionalNumber = (c: Ctx, p: string, raw: Record<string, unknown>, key: string, min: number, max: number): number | undefined =>
    raw[key] === undefined ? undefined : requireNumber(c, `${p}.${key}`, raw[key], min, max) ?? undefined;
  const wholeNumber = (c: Ctx, p: string, raw: unknown): number | null =>
    Number.isInteger(raw) && (raw as number) >= 0 ? raw as number : reject(c, p, "must be a whole number");
  const stands = value.stands === undefined ? [] : arrayOf(ctx, "stands", value.stands, (c, p, entry): CoverStand | null => {
    const raw = record(c, p, entry);
    if (!raw) return null;
    known(c, raw, p, ["id", "seed", "patch", "reach", "far", "tint", "detail"]);
    const standId = requireId(c, `${p}.id`, raw.id), seed = wholeNumber(c, `${p}.seed`, raw.seed);
    if (standId === null || seed === null) return null;
    return {
      id: standId, seed, patch: optionalNumber(c, p, raw, "patch", 0, 1000) ?? 0, reach: optionalNumber(c, p, raw, "reach", 0, 5000) ?? 0,
      far: optionalNumber(c, p, raw, "far", 0, 20000) ?? 0, tint: optionalNumber(c, p, raw, "tint", 0, 1) ?? 0,
      detail: optionalNumber(c, p, raw, "detail", 0.1, 4) ?? 1,
    };
  });
  const standIds = new Set(stands.map((stand) => stand.id));
  if (standIds.size !== stands.length) issue(ctx, "stands", "repeats a stand id");

  const plantIds = new Set<string>();
  const plants = arrayOf(ctx, "plants", value.plants, (c, p, entry): CoverPlant | null => {
    const raw = record(c, p, entry);
    if (!raw) return null;
    known(c, raw, p, ["id", "layer", "foliageType", "recipe", "age", "prototypes", "density", "minWeight", "fadeIn", "maxWeight", "fadeOut", "edgeScale", "stand", "seed", "reach", "far"]);
    const plantId = requireId(c, `${p}.id`, raw.id);
    const layer = layerRef(`${p}.layer`, raw.layer);
    const foliageType = raw.foliageType === undefined || raw.foliageType === null ? null
      : isId(raw.foliageType, "asset") ? raw.foliageType : reject(c, `${p}.foliageType`, "must be a foliage type asset id");
    const recipe = raw.recipe === undefined ? undefined : isId(raw.recipe, "asset") ? raw.recipe : reject(c, `${p}.recipe`, "must be a recipe asset id");
    if (recipe && foliageType) issue(c, p, "names a foliage type or a recipe, not both");
    // Instances per m² are small numbers: kept as written, not rounded to millimetres.
    const density = typeof raw.density === "number" && Number.isFinite(raw.density) && raw.density >= 0 && raw.density <= 10
      ? raw.density : reject(c, `${p}.density`, "must be a number 0..10");
    const minWeight = requireNumber(c, `${p}.minWeight`, raw.minWeight, 0, 1);
    const age = raw.age === undefined ? undefined : raw.age === "young" || raw.age === "mature" ? raw.age : reject(c, `${p}.age`, 'must be "mature" or "young"') ?? undefined;
    if (age === "young" && !recipe) issue(c, p, "young plants need a recipe");
    const stand = raw.stand === undefined ? undefined : stands.find((candidate) => candidate.id === raw.stand);
    if (raw.stand !== undefined && !stand) issue(c, `${p}.stand`, "must name one of the cover's stands");
    const seed = stand && raw.seed === undefined ? stand.seed : wholeNumber(c, `${p}.seed`, raw.seed);
    const [fadeIn, maxWeight, fadeOut, edgeScale] = ["fadeIn", "maxWeight", "fadeOut", "edgeScale"].map((key) => optionalNumber(c, p, raw, key, 0, 1));
    const prototypes = optionalNumber(c, p, raw, "prototypes", 1, 16), reach = optionalNumber(c, p, raw, "reach", 0, 5000), far = optionalNumber(c, p, raw, "far", 0, 20000);
    if (plantId !== null && plantIds.has(plantId)) return reject(c, p, `repeats id "${plantId}"`);
    if (plantId === null || layer === null || recipe === null || (foliageType === null && raw.foliageType) || density === null || minWeight === null || seed === null) return null;
    plantIds.add(plantId);
    return {
      id: plantId, layer, foliageType, ...(recipe ? { recipe } : {}), ...(age ? { age } : {}), ...(prototypes !== undefined ? { prototypes: Math.floor(prototypes) } : {}), density, minWeight, seed,
      ...(fadeIn !== undefined ? { fadeIn } : {}), ...(maxWeight !== undefined ? { maxWeight } : {}), ...(fadeOut !== undefined ? { fadeOut } : {}),
      ...(edgeScale !== undefined ? { edgeScale } : {}), ...(stand ? { stand: stand.id } : {}),
      ...(reach !== undefined ? { reach } : {}), ...(far !== undefined ? { far } : {}),
    };
  });

  const rocksRaw = record(ctx, "rocks", value.rocks) ?? {};
  known(ctx, rocksRaw, "rocks", ["high", "slopes", "water", "outcrops"]);
  const count = (key: string): number | null => {
    const raw = rocksRaw[key] ?? 0;
    return Number.isInteger(raw) && (raw as number) >= 0 && (raw as number) <= 5000 ? raw as number : reject(ctx, `rocks.${key}`, "must be a whole number 0..5000");
  };
  const [high, slopes, water, outcrops] = ["high", "slopes", "water", "outcrops"].map(count);

  if (ctx.issues.length || id === null || name === null || !open || !forestLayer || !rockLayer || !bed || !pad || !road
    || !rockSlope || !forestFrom || share === null || patch === null || high === null || slopes === null || water === null || outcrops === null) {
    return { cover: null, issues: ctx.issues.length ? ctx.issues : ["ground cover is incomplete"] };
  }
  return {
    cover: {
      schema: GROUND_COVER_SCHEMA, type: "groundCover", id, name, layers,
      roles: {
        open, forest: forestLayer, rock: rockLayer, bed, pad, road,
        ...(snowLayer ? { snow: snowLayer } : {}), ...(watersideLayer ? { waterside: watersideLayer } : {}),
        ...(fieldLayers?.length ? { fields: fieldLayers } : {}),
      },
      rock: { slope: rockSlope },
      forest: { from: forestFrom, share, patch },
      ...(waterside ? { waterside } : {}),
      ...(fields ? { fields } : {}),
      ...(snow ? { snow } : {}),
      stands,
      plants,
      rocks: { high: high!, slopes: slopes!, water: water!, outcrops: outcrops! },
    },
    issues: [],
  };
}

function smoothstep(value: number): number {
  const t = Math.min(1, Math.max(0, value));
  return t * t * (3 - 2 * t);
}

/** 32-bit hash of integers, 0..1. */
function hash(...values: number[]): number {
  let state = 0x9e3779b9;
  for (const value of values) {
    state = Math.imul(state ^ (value | 0), 0x85ebca6b);
    state ^= state >>> 13;
    state = Math.imul(state, 0xc2b2ae35);
    state ^= state >>> 16;
  }
  return (state >>> 0) / 4294967296;
}

/** Snow line in world height: the cover's quantile of `heights`, at least `minAbove` over the lowest. */
export function coverSnowLine(cover: GroundCover, heights: ArrayLike<number>): number | null {
  if (!cover.snow || heights.length === 0) return null;
  const sorted = Float64Array.from(heights).sort();
  const at = sorted[Math.min(sorted.length - 1, Math.floor(cover.snow.quantile * (sorted.length - 1)))]!;
  return Math.max(at, sorted[0]! + cover.snow.minAbove);
}

export interface CoverPaintContext {
  /** Points the ground stays open round (landmarks with level ground) and their radius. */
  clearings: ReadonlyArray<readonly [number, number, number]>;
  /** World height of the snow line (`coverSnowLine`), or null. */
  snowLine: number | null;
}

/**
 * Paint weights in `cover.layers` order at world XZ, with the ground's slope
 * (degrees) and height there.
 */
export function coverPaint(
  cover: GroundCover,
  brief: WorldBrief,
  terrain: BriefTerrain,
  densities: CoverDensities,
  context: CoverPaintContext,
): (x: number, z: number, slopeDeg: number, height: number) => number[] {
  const index = new Map(cover.layers.map((layer, i) => [layer.id, i]));
  const at = (id: string): number => index.get(id)!;
  const { roles } = cover;
  const settlements = brief.settlements.map((settlement, i) => {
    const [x, z] = briefToWorld(brief, settlement.center);
    // Each settlement's plots lie on a grid of their own.
    const angle = hash(brief.seed, i, 1) * Math.PI;
    // Plot width and length vary a little from village to village.
    const vary = 0.8 + 0.4 * hash(brief.seed, i, 2);
    const span: [number, number] = cover.fields ? [cover.fields.size[0] * vary, cover.fields.size[1] * vary] : [40, 40];
    return { x, z, radius: settlement.radius ?? SETTLEMENT_REACH, cos: Math.cos(angle), sin: Math.sin(angle), index: i, span };
  });
  const reach = [
    ...settlements.map(({ x, z, radius }) => [x, z, radius] as const),
    ...context.clearings,
  ];
  const forestFactor = COVER_DENSITY_FACTOR[densities.forest];
  const share = Math.min(1, cover.forest.share * forestFactor);
  const [from0, from1] = densities.forest === "high"
    ? [cover.forest.from[0] * 0.6, cover.forest.from[1] * 0.6]
    : cover.forest.from;
  const fieldReach = cover.fields ? cover.fields.reach * COVER_DENSITY_FACTOR[densities.fields] : 0;
  const [rock0, rock1] = cover.rock.slope;

  /** 0..1 how much this point is a field, and which plot kind (index into roles.fields, -1 fallow). */
  const field = (x: number, z: number, slopeDeg: number): { weight: number; kind: number } => {
    if (!cover.fields || !roles.fields) return { weight: 0, kind: -1 };
    let best: (typeof settlements)[number] | null = null;
    let gap = Infinity;
    for (const settlement of settlements) {
      const d = Math.hypot(x - settlement.x, z - settlement.z) - settlement.radius;
      if (d < gap) [gap, best] = [d, settlement];
    }
    if (!best) return { weight: 0, kind: -1 };
    // From well inside the reach (the village's own lots take the core) out past it.
    const zone = smoothstep((gap + 0.35 * best.radius) / 20) * (1 - smoothstep((gap - fieldReach) / 25));
    const flat = 1 - smoothstep((slopeDeg - cover.fields.maxSlopeDeg) / 3);
    const weight = zone * flat;
    if (weight <= 0) return { weight: 0, kind: -1 };
    const [dx, dz] = [x - best.x, z - best.z];
    const u = dx * best.cos + dz * best.sin;
    const v = -dx * best.sin + dz * best.cos;
    const [w, h] = [best.span[0], best.span[1]];
    const [i, j] = [Math.floor(u / w), Math.floor(v / h)];
    // A strip between plots stays grass.
    const edge = Math.min(u - i * w, (i + 1) * w - u, v - j * h, (j + 1) * h - v);
    if (edge < 1.2) return { weight: 0, kind: -1 };
    const roll = hash(brief.seed, best.index, i, j);
    const kinds = roles.fields.length;
    const kind = roll < 0.15 ? -1 : Math.floor(((roll - 0.15) / 0.85) * kinds);
    return { weight, kind: Math.min(kinds - 1, kind) };
  };

  return (x, z, slopeDeg, height) => {
    const weights = new Array<number>(cover.layers.length).fill(0);
    const hit = terrain.water(x, z);
    const river = hit ? 1 - smoothstep((hit.distance - (hit.course.width / 2 + WATER_BED_MARGIN)) / 3) : 0;
    const lake = terrain.lake(x, z);
    const shore = lake ? 1 - smoothstep((-lake.inside - 3) / 4) : 0;
    const coast = terrain.ocean ? oceanBeachWeight(terrain.ocean, x, z) : 0;
    const bed = Math.max(river, shore, coast);
    const snow = cover.snow && context.snowLine !== null && roles.snow
      ? smoothstep((height - context.snowLine + 12 * fbm(x / 70, z / 70, 3, brief.seed + 41)) / cover.snow.fade)
      : 0;
    const rock = smoothstep((slopeDeg - rock0) / (rock1 - rock0));
    weights[at(roles.bed)]! += bed;
    if (roles.snow) weights[at(roles.snow)]! += (1 - bed) * snow;
    weights[at(roles.rock)]! += rock * (1 - bed) * (1 - snow);
    const ground = (1 - rock) * (1 - bed) * (1 - snow);
    if (ground <= 0) return weights;

    // Forest: beyond the settlements' reach, in patches when its share is below 1, thinning below the snow line.
    const wild = reach.reduce((nearest, [cx, cz, radius]) => Math.min(nearest, Math.hypot(x - cx, z - cz) - radius), Infinity);
    let forest = smoothstep((wild + 40 * fbm(x / 90, z / 90, 3, brief.seed + 29) - from0) / (from1 - from0));
    if (share < 1) forest *= smoothstep((fbm(x / cover.forest.patch, z / cover.forest.patch, 3, brief.seed + 31) * 1.25 + 0.5 - (1 - share)) / 0.08);
    if (cover.snow && context.snowLine !== null) forest *= 1 - smoothstep((height - (context.snowLine - cover.snow.treeGap)) / cover.snow.fade);
    // The waterside band: its own paint, and its trees.
    let side = 0;
    if (cover.waterside && roles.waterside) {
      const near = Math.min(hit ? hit.distance - hit.course.width / 2 : Infinity, lake ? -lake.inside : Infinity);
      side = 1 - smoothstep((near - cover.waterside.width) / 15);
      forest = Math.max(forest, side * cover.waterside.trees * smoothstep((wild - 10) / 20));
    }
    const plot = field(x, z, slopeDeg);
    forest *= 1 - plot.weight;
    const fieldShare = plot.kind >= 0 ? plot.weight : 0;
    const rest = 1 - fieldShare;
    if (fieldShare > 0) weights[at(roles.fields![plot.kind]!)]! += ground * fieldShare;
    weights[at(roles.forest)]! += ground * rest * forest;
    const openGround = ground * rest * (1 - forest);
    if (side > 0) weights[at(roles.waterside!)]! += openGround * side;
    weights[at(roles.open)]! += openGround * (1 - side);
    return weights;
  };
}

/** One foliage rule of a built world: Forge's `LandscapeFoliageRule` fields on the cover's layer, and a stand's. */
export interface CoverPlantRule {
  id: string;
  layerId: string;
  foliageTypeId: AssetId;
  density: number;
  minWeight: number;
  seed: number;
  edgeScale?: number;
  edge?: { fadeIn: number; maxWeight: number; fadeOut: number };
  stand?: { from: number; to: number; patch: number; reach: number; far: number; tint: number; detail: number };
}

/** Rule seeds of a recipe's prototypes: far apart, so their cells do not repeat each other's rolls. */
const PROTOTYPE_SEED_STEP = 1009;

const precise = (value: number): number => Number(value.toPrecision(6));

/**
 * Foliage rules on the cover's layers, and the plants that grow none: without a type or with a recipe that has
 * no output (`missing`), or a recipe the user rejected (`rejected`). A recipe's published prototypes share its
 * density, one rule each; a stand's density is its plants' together, shared out in order.
 */
export function coverPlantRules(cover: GroundCover, densities: CoverDensities, generated: GeneratedSources = () => null): { rules: CoverPlantRule[]; missing: string[]; rejected: string[] } {
  const factor = COVER_DENSITY_FACTOR[densities.forest];
  const missing: string[] = [], rejected: string[] = [];
  const grown = cover.plants.flatMap((plant) => {
    const source = plant.recipe === undefined ? null : generated(plant.recipe);
    const types = source ? (plant.age === "young" ? source.youngFoliageTypes : source.foliageTypes).slice(0, plant.prototypes) : plant.foliageType === null ? [] : [plant.foliageType];
    if (types.length === 0) {
      (source?.state === "rejected" ? rejected : missing).push(plant.id);
      return [];
    }
    // The forest density thins or thickens the trees as well as the forest's area.
    const density = plant.layer === cover.roles.forest && densities.forest !== "medium" ? plant.density * Math.sqrt(factor) : plant.density;
    return [{ plant, types, density }];
  });
  const totals = new Map<string, number>(), placed = new Map<string, number>();
  for (const { plant, density } of grown) if (plant.stand) totals.set(plant.stand, (totals.get(plant.stand) ?? 0) + density);
  /** The next `density` of the stand's slots, as a share of the whole. */
  const shareOf = (stand: string, density: number): { from: number; to: number } => {
    const total = totals.get(stand)!, before = placed.get(stand) ?? 0, after = before + density;
    placed.set(stand, after);
    return { from: precise(before / total), to: after > total * (1 - 1e-9) ? 1 : precise(after / total) };
  };
  const rules = grown.flatMap(({ plant, types, density }) => types.map((foliageTypeId, index): CoverPlantRule => {
    const { fadeIn = 0, maxWeight = 1, fadeOut = 0, edgeScale = 1 } = plant, stand = cover.stands.find((entry) => entry.id === plant.stand);
    // The tint stands in for billboards: a plant without them leaves the ground as it is.
    const far = plant.far ?? stand?.far ?? 0;
    return {
      id: index === 0 ? plant.id : `${plant.id}-${index + 1}`, layerId: plant.layer, foliageTypeId,
      density: precise(stand ? totals.get(stand.id)! : density / types.length), minWeight: plant.minWeight,
      seed: stand ? stand.seed : (plant.seed + index * PROTOTYPE_SEED_STEP) >>> 0,
      ...(edgeScale < 1 ? { edgeScale } : {}),
      ...(fadeIn > 0 || maxWeight < 1 ? { edge: { fadeIn, maxWeight, fadeOut } } : {}),
      ...(stand ? { stand: { ...shareOf(stand.id, density / types.length), patch: stand.patch, reach: plant.reach ?? stand.reach, far, tint: far > 0 ? stand.tint : 0, detail: stand.detail } } : {}),
    };
  }));
  return { rules, missing, rejected };
}

/** Rock counts after the density. */
export function coverRockCounts(cover: GroundCover, densities: CoverDensities): GroundCover["rocks"] {
  const factor = ROCK_DENSITY_FACTOR[densities.rocks];
  const scale = (value: number): number => Math.round(value * factor);
  return { high: scale(cover.rocks.high), slopes: scale(cover.rocks.slopes), water: scale(cover.rocks.water), outcrops: scale(cover.rocks.outcrops) };
}

/** A density level from the brief, or medium. */
export function coverDensity(value: unknown): CoverDensity {
  return isOneOf(COVER_DENSITIES, value) ? value : "medium";
}

