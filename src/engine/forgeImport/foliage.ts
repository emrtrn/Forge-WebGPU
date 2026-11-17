/**
 * Forge WebGL foliage in the new format (phase 5c step 4, decisions 2–4 and 8;
 * user 2026-11-17). Pure: the importer reads the files, this converts them.
 *
 * - A Foliage Type (`ForgeFoliageTypeDef`, engine/scene/foliage.ts @
 *   forge-webgl-final) becomes a `forge.foliageType` document: read with
 *   Forge's normaliser, `meshAssetId` the model's GUID, scale its X (Forge
 *   used only X), the optional height limits an `enabled` group whose absent
 *   side is ±10000, `sway` with the height source, `farDistance` / `farTint`
 *   the `far` group. `name` (the file name), `schema`, `type` and
 *   `receiveShadow` (always on) go; `lods` empty, `impostor` empty.
 * - `landscapeRules[]` become a `forge.landscapeFoliage` component on the
 *   terrain actor of their `landscapeId`, read with Forge's
 *   `normalizeLandscapeFoliageRule`; band fields become groups (an absent
 *   height side ±10000). A rule whose landscape or type the target lacks is
 *   reported, not written.
 * - Painted groups (the sidecar's and, for a partitioned level, its cell
 *   files', merged in cell order as Forge's `mergeFoliageCells`) become the
 *   level part `foliage.json` + `foliage/<x>_<z>.bin` (`buildLevelFoliage`):
 *   Euler XYZ degrees as a unit quaternion, scale X, a missing seed derived
 *   from the group id and index. Groups painted on a static mesh come too;
 *   the target is not part of the format (counted). A group whose type the
 *   target lacks is reported with its instances.
 *
 * Engine code cannot import a feature (layers): the schema tags are text here
 * and the importer normalises the documents against the registry.
 */
import {
  buildLevelFoliage,
  compareCellKeys,
  isJsonObject,
  type AssetId,
  type FoliageInstanceInput,
  type JsonObject,
  type LevelFoliageIndex,
  type LevelId,
} from "../../core/index.ts";
import { stableHex } from "./ids.ts";
import { eulerXyzQuaternion } from "./placements.ts";

export const FOLIAGE_TYPE_SCHEMA_TAG = "forge.foliageType/1";
export const LANDSCAPE_FOLIAGE_TAG = "forge.landscapeFoliage@1";
/** The open side of a height window: the schema's range (Forge: absent, ±Infinity). */
const OPEN_HEIGHT = 10000;
/** Forge's wind sway defaults and limits (engine/environment/wind.ts). */
const SWAY_DEFAULTS = { amplitude: 0.15, height: 1, frequency: 0.6 } as const;
const SWAY_LIMITS = { amplitude: [0, 5], height: [0.01, 100], frequency: [0, 10] } as const;

const finite = (value: unknown, fallback: number): number => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
const optional = (value: unknown): number | undefined => (typeof value === "number" && Number.isFinite(value) ? value : undefined);
const clamp = (value: number, min: number, max: number): number => (value < min ? min : value > max ? max : value);
const bool = (value: unknown, fallback: boolean): boolean => (typeof value === "boolean" ? value : fallback);
const text = (value: unknown): string => (typeof value === "string" ? value : "");
/** X of Forge's Vec3 (uniform scale), else the fallback. */
const vecX = (value: unknown, fallback: number): number =>
  Array.isArray(value) && value.length === 3 ? finite(value[0], fallback) : fallback;

function heightWindow(min: number | undefined, max: number | undefined): { enabled: boolean; min: number; max: number } {
  return {
    enabled: min !== undefined || max !== undefined,
    min: clamp(min ?? -OPEN_HEIGHT, -OPEN_HEIGHT, OPEN_HEIGHT),
    max: clamp(max ?? OPEN_HEIGHT, -OPEN_HEIGHT, OPEN_HEIGHT),
  };
}

export interface ForgeFoliageTypeConversion {
  /** The `forge.foliageType` document: schema tag, id and field values. */
  readonly document: JsonObject;
  /** `meshAssetId` when the target has no model for it (the slot stays empty). */
  readonly missingMesh: string | null;
}

/** A Forge `*.foliagetype.json` as a `forge.foliageType` document (Forge's `normalizeFoliageType` first). */
export function convertForgeFoliageType(
  raw: unknown,
  id: AssetId,
  meshAsset: (forgeId: string) => string | null,
): ForgeFoliageTypeConversion {
  const source = isJsonObject(raw) ? raw : {};
  const meshId = text(source.meshAssetId);
  const mesh = meshId === "" ? null : meshAsset(meshId);
  const scaleMin = Math.max(0.001, vecX(source.scaleMin, 1));
  const scaleMax = Math.max(scaleMin, Math.max(0.001, vecX(source.scaleMax, 1)));
  const zA = finite(source.zOffsetMin, 0);
  const zB = finite(source.zOffsetMax, 0);
  const slopeA = clamp(finite(source.slopeMin, 0), 0, 90);
  const slopeB = clamp(finite(source.slopeMax, 90), 0, 90);
  const sway = isJsonObject(source.sway) ? source.sway : null;
  const swayValue = (key: keyof typeof SWAY_DEFAULTS): number => {
    const [min, max] = SWAY_LIMITS[key];
    return Number(clamp(finite(sway?.[key], SWAY_DEFAULTS[key]), min, max).toFixed(3));
  };
  return {
    document: {
      schema: FOLIAGE_TYPE_SCHEMA_TAG,
      id,
      mesh,
      radius: Math.max(0.001, finite(source.radius, 0.5)),
      density: clamp(finite(source.density, 1), 0, 10),
      scaleMin,
      scaleMax,
      randomYaw: bool(source.randomYaw, true),
      alignToNormal: bool(source.alignToNormal, true),
      zOffsetMin: Math.min(zA, zB),
      zOffsetMax: Math.max(zA, zB),
      slopeMin: Math.min(slopeA, slopeB),
      slopeMax: Math.max(slopeA, slopeB),
      heightLimit: heightWindow(optional(source.heightMin), optional(source.heightMax)),
      castShadow: bool(source.castShadow, true),
      collision: bool(source.collision, false),
      cullStart: Math.max(0, finite(source.cullStart, 0)),
      cullEnd: Math.max(0, finite(source.cullEnd, 0)),
      sway: { enabled: sway !== null, source: "height", amplitude: swayValue("amplitude"), height: swayValue("height"), frequency: swayValue("frequency") },
      far: { distance: clamp(finite(source.farDistance, 0), 0, 20000), tint: clamp(finite(source.farTint, 0), 0, 1) },
      lods: [],
      impostor: { albedo: null, normal: null, views: 8 },
    },
    missingMesh: mesh === null && meshId !== "" ? meshId : null,
  };
}

/** Forge's `LANDSCAPE_FOLIAGE_RULE_RANGES` (TERRAIN_MASK_RANGES + edgeScale). */
const RULE_RANGES = {
  heightFalloff: [0, 500], slope: [0, 90], slopeFalloff: [0, 45], noiseAmount: [0, 1], noiseScale: [1, 500], edgeScale: [0, 1],
} as const;

/** One rule's `forge.landscapeFoliage` entry (Forge's `normalizeLandscapeFoliageRule` + bands). */
export function convertLandscapeFoliageRule(raw: JsonObject, foliageType: string): JsonObject {
  const band = (key: string, [min, max]: readonly [number, number], fallback: number): number => clamp(finite(raw[key], fallback), min, max);
  return {
    id: text(raw.id),
    layer: text(raw.layerId),
    foliageType,
    density: clamp(finite(raw.density, 0.25), 0, 10),
    minWeight: clamp(finite(raw.minWeight, 0.5), 0, 1),
    seed: Math.floor(clamp(finite(raw.seed, 1), 0, 0xffffffff)) >>> 0,
    height: { ...heightWindow(optional(raw.heightMin), optional(raw.heightMax)), falloff: band("heightFalloff", RULE_RANGES.heightFalloff, 0) },
    slope: {
      min: band("slopeMin", RULE_RANGES.slope, 0),
      max: band("slopeMax", RULE_RANGES.slope, 90),
      falloff: band("slopeFalloff", RULE_RANGES.slopeFalloff, 0),
    },
    noise: { amount: band("noiseAmount", RULE_RANGES.noiseAmount, 0), scale: band("noiseScale", RULE_RANGES.noiseScale, 20) },
    edgeScale: band("edgeScale", RULE_RANGES.edgeScale, 1),
  };
}

export interface ForgeFoliageInput {
  /** The parsed `<level>.foliage.json`. */
  readonly doc: unknown;
  /** Its cell files (`<level>.cells/foliage/<key>.foliage.json`), parsed. */
  readonly cells: ReadonlyArray<{ readonly key: string; readonly doc: unknown }>;
}

export interface ForgeFoliageReport {
  /** Rules written on a terrain. */
  readonly rules: number;
  /** Rules left out, with why. */
  readonly skippedRules: ReadonlyArray<{ readonly id: string; readonly reason: string }>;
  /** Rules Forge's normaliser drops (no landscape, layer or type id): never generated by Forge either. */
  readonly invalidRules: number;
  /** Painted instances written into the level part. */
  readonly instances: number;
  /** Of those, painted onto a static mesh (Forge's target kind). */
  readonly staticMeshInstances: number;
  /** Painted instances left out because the target has no such type, by Forge type id. */
  readonly missingTypes: ReadonlyArray<{ readonly typeId: string; readonly instances: number }>;
  /** Instances Forge's normaliser drops (no position): never drawn by Forge either. */
  readonly invalidInstances: number;
  /** Instances whose scale was not uniform: X kept, as Forge drew them. */
  readonly nonUniformScales: number;
  /** Instances carrying a paint-time surface normal (Forge kept it for reattach; not in the format). */
  readonly normals: number;
}

export interface ForgeFoliageConversion {
  /** Rule entries by Forge landscape id, in file order. */
  readonly rulesByLandscape: ReadonlyMap<string, readonly JsonObject[]>;
  /** The painted level part; null without painted instances. */
  readonly part: { readonly index: LevelFoliageIndex; readonly cells: ReadonlyMap<string, Uint8Array> } | null;
  readonly report: ForgeFoliageReport;
}

const arrayOf = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/** A u32 seed from text, for instances Forge saved without one. */
function derivedSeed(key: string): number {
  return Number.parseInt(stableHex(key).slice(0, 8), 16) >>> 0;
}

export function convertForgeFoliage(
  input: ForgeFoliageInput,
  options: {
    /** Public-relative path of the level: the key of derived seeds. */
    readonly levelPath: string;
    readonly levelId: LevelId;
    readonly cellSize: number;
    /** Forge ids of the level's landscapes (rules on another landscape are left out). */
    readonly landscapes: ReadonlySet<string>;
    readonly foliageTypeAsset: (forgeId: string) => string | null;
  },
): ForgeFoliageConversion {
  const doc = isJsonObject(input.doc) ? input.doc : {};
  const rulesByLandscape = new Map<string, JsonObject[]>();
  const skippedRules: Array<{ id: string; reason: string }> = [];
  const ruleIds = new Set<string>();
  let invalidRules = 0;
  for (const raw of arrayOf(doc.landscapeRules)) {
    const landscapeId = isJsonObject(raw) ? text(raw.landscapeId) : "";
    const typeId = isJsonObject(raw) ? text(raw.foliageTypeId) : "";
    // Forge's normaliser drops a rule without these (and gives a duplicate id a new one).
    if (!isJsonObject(raw) || landscapeId === "" || text(raw.layerId) === "" || typeId === "") {
      invalidRules += 1;
      continue;
    }
    let id = text(raw.id);
    for (let index = 1; id === "" || ruleIds.has(id); index += 1) id = `landscape-foliage-rule-${index}`;
    ruleIds.add(id);
    const type = options.foliageTypeAsset(typeId);
    if (!options.landscapes.has(landscapeId)) skippedRules.push({ id, reason: `no landscape ${landscapeId}` });
    else if (type === null) skippedRules.push({ id, reason: `no foliage type ${typeId} in the target` });
    else {
      const list = rulesByLandscape.get(landscapeId) ?? [];
      list.push(convertLandscapeFoliageRule({ ...raw, id }, type));
      rulesByLandscape.set(landscapeId, list);
    }
  }

  // Groups by id, their instances in Forge's merge order: the index's, then each cell's by key.
  const groups = new Map<string, { typeId: string; staticMesh: boolean; instances: unknown[] }>();
  for (const raw of arrayOf(doc.groups)) {
    if (!isJsonObject(raw) || text(raw.foliageTypeId) === "") continue;
    // Forge's normaliser gives a missing or repeated id the first free `foliage-group-<n>`.
    let id = text(raw.id);
    for (let index = 1; id === "" || groups.has(id); index += 1) id = `foliage-group-${index}`;
    const target = isJsonObject(raw.target) ? raw.target : {};
    groups.set(id, { typeId: text(raw.foliageTypeId), staticMesh: target.kind !== "landscape", instances: [...arrayOf(raw.instances)] });
  }
  const cells = [...input.cells].sort((a, b) => compareCellKeys(a.key, b.key));
  for (const cell of cells) {
    for (const raw of isJsonObject(cell.doc) ? arrayOf(cell.doc.groups) : []) {
      const group = isJsonObject(raw) ? groups.get(text(raw.id)) : undefined;
      if (group && isJsonObject(raw)) group.instances.push(...arrayOf(raw.instances));
    }
  }

  let instances = 0;
  let staticMeshInstances = 0;
  let invalidInstances = 0;
  let nonUniformScales = 0;
  let normals = 0;
  const missing = new Map<string, number>();
  const partGroups: Array<{ type: AssetId; instances: FoliageInstanceInput[] }> = [];
  for (const [groupId, group] of groups) {
    const valid = group.instances.filter((raw): raw is JsonObject => isJsonObject(raw) && Array.isArray(raw.position) && raw.position.length === 3);
    invalidInstances += group.instances.length - valid.length;
    const type = options.foliageTypeAsset(group.typeId);
    if (type === null) {
      if (valid.length) missing.set(group.typeId, (missing.get(group.typeId) ?? 0) + valid.length);
      continue;
    }
    const converted = valid.map((raw, index): FoliageInstanceInput => {
      const vec = (value: unknown, fallback: number): [number, number, number] => {
        const list = Array.isArray(value) && value.length === 3 ? value : [];
        return [finite(list[0], fallback), finite(list[1], fallback), finite(list[2], fallback)];
      };
      const scale = vec(raw.scale, 1);
      if (scale[1] !== scale[0] || scale[2] !== scale[0]) nonUniformScales += 1;
      if (Array.isArray(raw.normal) && raw.normal.length === 3) normals += 1;
      const seed = optional(raw.seed);
      return {
        position: vec(raw.position, 0),
        rotation: eulerXyzQuaternion(...vec(raw.rotation, 0)),
        scale: Math.max(0.001, scale[0]),
        seed: seed === undefined ? derivedSeed(`forge-webgl/${options.levelPath}/foliage/${groupId}/${index}`) : Math.floor(seed) >>> 0,
      };
    });
    instances += converted.length;
    if (group.staticMesh) staticMeshInstances += converted.length;
    partGroups.push({ type: type as AssetId, instances: converted });
  }
  const part = instances > 0 ? buildLevelFoliage({ level: options.levelId, cellSize: options.cellSize, groups: partGroups }) : null;
  return {
    rulesByLandscape,
    part,
    report: {
      rules: [...rulesByLandscape.values()].reduce((sum, list) => sum + list.length, 0),
      skippedRules,
      invalidRules,
      instances,
      staticMeshInstances,
      missingTypes: [...missing].map(([typeId, count]) => ({ typeId, instances: count })).sort((a, b) => a.typeId.localeCompare(b.typeId)),
      invalidInstances,
      nonUniformScales,
      normals,
    },
  };
}
