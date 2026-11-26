// Ported from Forge WebGL engine/terrain/terrainDefinition.ts @ forge-webgl-final (04b5fb23); docs/PORT_LOG.md §2.
import { normalizeTerrainPhysicalOverrides, TERRAIN_PHYSICS_FIELDS } from "./terrainPhysicalMaterial.ts";
import { PHYSICAL_MATERIALS, PHYSICAL_MATERIAL_IDS } from "../physics/collision.ts";
import { normalizeTerrainSplines } from "./terrainSplineData.ts";
import {
  isValidTileQuads, parseTileKey, tileKey, TERRAIN_MAX_LAYERS, TERRAIN_MAX_TILES_PER_AXIS,
  type TerrainLayerWeather, type WorldTerrainDef,
} from "./terrainTypes.ts";

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function finite(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${label} must be finite`);
  return value;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > 512) throw new Error(`invalid ${label}`);
  return value;
}

/**
 * A layer's weather response (plan phase W5): numbers 0..1, a known physical
 * material to turn toward when wet; only written fields are kept, an empty
 * group is dropped.
 */
export function normalizeTerrainLayerWeather(value: unknown): TerrainLayerWeather | undefined {
  const input = record(value, "terrain layer weather");
  const out: TerrainLayerWeather = {};
  for (const key of ["wetting", "porosity", "snowAccept"] as const) {
    if (input[key] === undefined) continue;
    const n = finite(input[key], `terrain layer weather.${key}`);
    if (n < 0 || n > 1) throw new Error(`terrain layer weather.${key} must be within 0..1`);
    out[key] = n;
  }
  const wet = input.wetPhysicalMaterial;
  if (wet !== undefined && wet !== null && wet !== "") {
    if (typeof wet !== "string" || !PHYSICAL_MATERIAL_IDS.includes(wet)) throw new Error("invalid terrain layer weather.wetPhysicalMaterial");
    out.wetPhysicalMaterial = wet;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Strict shared runtime/save allowlist. Invalid authored data never becomes a flat terrain. */
export function normalizeWorldTerrain(value: unknown): WorldTerrainDef {
  const input = record(value, "terrain");
  if (input.schema !== 1 || input.type !== "worldTerrain") throw new Error("unsupported terrain schema/type");
  const tileQuads = finite(input.tileQuads, "terrain.tileQuads");
  if (!isValidTileQuads(tileQuads)) throw new Error("invalid terrain.tileQuads");
  const spacing = finite(input.spacing, "terrain.spacing");
  if (spacing < 0.01 || spacing > 100) throw new Error("invalid terrain.spacing");
  const axes = [input.tilesX, input.tilesZ].map((v) => {
    const n = finite(v, "terrain grid size");
    if (!Number.isInteger(n) || n < 1 || n > TERRAIN_MAX_TILES_PER_AXIS) throw new Error("invalid terrain grid size");
    return n;
  });
  const [tilesX, tilesZ] = axes as [number, number];
  if (!Array.isArray(input.origin) || input.origin.length !== 3) throw new Error("invalid terrain.origin");
  const origin = input.origin.map((v) => finite(v, "terrain.origin")) as [number, number, number];
  const heightMin = finite(input.heightMin, "terrain.heightMin");
  const heightMax = finite(input.heightMax, "terrain.heightMax");
  if (!(Math.fround(heightMax) > Math.fround(heightMin)) || !Number.isFinite(Math.fround(heightMax) - Math.fround(heightMin))) {
    throw new Error("invalid terrain height range");
  }
  if (!Array.isArray(input.layers) || input.layers.length > TERRAIN_MAX_LAYERS) throw new Error("invalid terrain.layers");
  const ids = new Set<string>();
  const layers = input.layers.map((v) => {
    const layer = record(v, "terrain layer");
    const id = text(layer.id, "layer id");
    if (ids.has(id)) throw new Error("duplicate terrain layer id");
    ids.add(id);
    const color = text(layer.color, "layer color");
    if (!/^#[\da-f]{6}$/i.test(color)) throw new Error("invalid terrain layer color");
    const physicalMaterial = layer.physicalMaterial;
    if (physicalMaterial !== undefined && physicalMaterial !== null
      && (typeof physicalMaterial !== "string" || !PHYSICAL_MATERIAL_IDS.includes(physicalMaterial))) {
      throw new Error("invalid terrain layer physicalMaterial");
    }
    const overrides = layer.physicalMaterialOverrides === undefined ? undefined : normalizeTerrainPhysicalOverrides(layer.physicalMaterialOverrides);
    if (overrides && Object.keys(overrides).length) {
      const preset = typeof physicalMaterial === "string" ? PHYSICAL_MATERIALS[physicalMaterial] : undefined;
      for (const field of TERRAIN_PHYSICS_FIELDS) {
        if (overrides[field.key] !== undefined && !preset?.[field.group]) throw new Error("terrain physical parameter requires a supported material block");
      }
    }
    const weather = layer.weather === undefined ? undefined : normalizeTerrainLayerWeather(layer.weather);
    const patchSeed = layer.forestFloorPatchSeed === undefined ? undefined : finite(layer.forestFloorPatchSeed, "layer forestFloorPatchSeed");
    if (patchSeed !== undefined && (!Number.isInteger(patchSeed) || patchSeed < 0 || patchSeed > 0xffffffff)) {
      throw new Error("invalid terrain layer forestFloorPatchSeed");
    }
    return { ...(overrides && Object.keys(overrides).length ? { physicalMaterialOverrides: overrides } : {}), id, name: text(layer.name, "layer name"), color,
      ...(layer.material === null ? { material: null } : layer.material === undefined ? {} : { material: text(layer.material, "layer material") }),
      ...(physicalMaterial === undefined ? {} : { physicalMaterial }),
      ...(weather ? { weather } : {}),
      ...(patchSeed === undefined ? {} : { forestFloorPatchSeed: patchSeed }) };
  });
  if (!Array.isArray(input.tiles) || input.tiles.length > tilesX * tilesZ) throw new Error("invalid terrain.tiles");
  const keys = new Set<string>();
  const tiles = input.tiles.map((v) => {
    const entry = record(v, "terrain tile summary");
    const key = text(entry.key, "tile key");
    const coord = parseTileKey(key);
    if (!coord || key !== tileKey(coord.x, coord.z) || coord.x < 0 || coord.z < 0 || coord.x >= tilesX || coord.z >= tilesZ || keys.has(key)) {
      throw new Error("invalid or duplicate terrain tile key");
    }
    keys.add(key);
    const minHeight = finite(entry.minHeight, "tile minHeight");
    const maxHeight = finite(entry.maxHeight, "tile maxHeight");
    if (maxHeight < minHeight || minHeight < heightMin || maxHeight > heightMax) throw new Error("invalid tile height bounds");
    return { key, minHeight, maxHeight };
  });
  if (typeof input.collision !== "boolean") throw new Error("terrain.collision must be boolean");
  return {
    schema: 1, type: "worldTerrain", name: text(input.name, "terrain.name"), tileQuads, spacing,
    tilesX, tilesZ, origin, heightMin, heightMax, layers, tiles, collision: input.collision,
    ...(input.splines === undefined ? {} : { splines: normalizeTerrainSplines(input.splines) }),
  };
}
