// Derekavak's procedural foliage at a camera position, generated in Node
// (phase 5c step 5.1): the smoke's GPU-driven batches draw it. The reference
// project's Derekavak has no foliage yet (its import predates the foliage
// converters, and it is not re-imported without the user), so the rules and
// types come from the Forge source it was imported from (Ridgebound's copy),
// through the importer's converters, and the terrain from the reference
// project. Forge's ring as the Phase 1 S4 count saw it: only the tiles Forge
// keeps resident (within 2 tile sizes of the camera), a ring cell built only
// when every tile under it is resident. At P2 that is 370 non-empty cells /
// 1,640 instances, S4's WebGL count.

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { forgeAssetId } from "../../src/engine/forgeImport/ids.ts";
import { convertForgeFoliageType, convertLandscapeFoliageRule } from "../../src/engine/forgeImport/foliage.ts";
import { foliageRuleParamsOf, foliageTypeParamsOf, type FoliageTypeAssetFields, type LandscapeFoliageRuleFields } from "../../src/engine/foliage/foliageAsset.ts";
import { FoliageTerrainStore } from "../../src/engine/foliage/proceduralFoliage.ts";
import { QUALITY_PROFILES } from "../../src/engine/perf/qualityProfiles.ts";
import { normalizeWorldTerrain } from "../../src/engine/terrain/terrainDefinition.ts";
import { decodeTerrainTile } from "../../src/engine/terrain/terrainTileCodec.ts";
import { foliageRingCellSize, foliageRingRadius, planFoliageRing } from "../../src/engine/world/foliageRing.ts";
import { REFERENCE_PROJECT, REFERENCE_ROOT, SMOKE_QUALITY } from "./renderScenes.ts";

const LEVEL = resolve(REFERENCE_PROJECT, "content/levels/Derekavak");
const FORGE_PUBLIC = resolve(REFERENCE_ROOT, "ridgebound-copy/public");
const FOLIAGE = "assets/Maps/Derekavak.foliage.json";

export interface FoliageSceneType {
  readonly name: string;
  readonly mesh: string;
  readonly cullStart: number;
  readonly cullEnd: number;
  readonly matrices: number[];
}

export interface FoliageScene {
  readonly types: FoliageSceneType[];
  readonly cells: number;
  readonly instances: number;
  readonly cullScale: number;
}

const json = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));

export function derekavakFoliage(camera: readonly [number, number]): FoliageScene {
  const quality = QUALITY_PROFILES[SMOKE_QUALITY];
  const doc = json(join(LEVEL, "terrain/derekavak.terrain.json")) as { data: unknown };
  const def = normalizeWorldTerrain(doc.data);
  const size = def.tileQuads * def.spacing;
  const resident = new Set<string>();
  const store = new FoliageTerrainStore();
  store.setTerrain("derekavak", def);
  for (const tile of def.tiles) {
    const [tx, tz] = tile.key.split("_").map(Number) as [number, number];
    const x0 = def.origin[0] + tx * size, z0 = def.origin[2] + tz * size;
    const dx = Math.max(x0 - camera[0], 0, camera[0] - (x0 + size));
    const dz = Math.max(z0 - camera[1], 0, camera[1] - (z0 + size));
    if (Math.hypot(dx, dz) > 2 * size) continue;
    resident.add(tile.key);
    store.setTile("derekavak", decodeTerrainTile(readFileSync(join(LEVEL, `terrain/derekavak.tiles/${tile.key}.tile.bin`))));
  }
  const bounds = { minX: def.origin[0], maxX: def.origin[0] + def.tilesX * size, minZ: def.origin[2], maxZ: def.origin[2] + def.tilesZ * size };
  const cellReady = (cellX: number, cellZ: number, cellSize: number): boolean => {
    const margin = 2 * def.spacing;
    const span = (min: number, max: number, origin: number, tiles: number): [number, number] =>
      [Math.max(0, Math.floor((min - margin - origin) / size)), Math.min(tiles - 1, Math.floor((max + margin - origin) / size))];
    const [x0, x1] = span(cellX * cellSize, (cellX + 1) * cellSize, def.origin[0], def.tilesX);
    const [z0, z1] = span(cellZ * cellSize, (cellZ + 1) * cellSize, def.origin[2], def.tilesZ);
    for (let z = z0; z <= z1; z += 1) for (let x = x0; x <= x1; x += 1) if (!resident.has(`${x}_${z}`)) return false;
    return true;
  };

  const manifest = json(join(FORGE_PUBLIC, "assets/manifest.json")) as { assets: Array<{ id: string; path: string }> };
  const rules = (json(join(FORGE_PUBLIC, FOLIAGE)) as { landscapeRules: Array<Record<string, unknown>> }).landscapeRules;
  const byType = new Map<string, FoliageSceneType>();
  let cells = 0, instances = 0;
  for (const raw of rules) {
    const typeId = String(raw.foliageTypeId);
    const asset = manifest.assets.find((entry) => entry.id === typeId);
    if (!asset) throw new Error(`${FOLIAGE}: no foliage type ${typeId} in the manifest`);
    const forgeType = json(join(FORGE_PUBLIC, asset.path)) as Record<string, unknown>;
    const document = convertForgeFoliageType(forgeType, forgeAssetId(typeId), (id) => forgeAssetId(id)).document as unknown as FoliageTypeAssetFields & { cullStart: number; cullEnd: number; mesh: string };
    const type = foliageTypeParamsOf(document);
    const rule = foliageRuleParamsOf(convertLandscapeFoliageRule(raw as never, forgeAssetId(typeId)) as unknown as LandscapeFoliageRuleFields);
    const cellSize = foliageRingCellSize(document.cullEnd, rule.density);
    const { radius } = foliageRingRadius(document.cullEnd, quality.foliageCullDistanceScale, bounds);
    const plan = planFoliageRing({ center: camera, radius, density: quality.grassDensity, bounds, built: new Map(), cellSize });
    let entry = byType.get(typeId);
    if (!entry) {
      entry = { name: typeId, mesh: document.mesh, cullStart: document.cullStart, cullEnd: document.cullEnd, matrices: [] };
      byType.set(typeId, entry);
    }
    for (const cell of plan.build) {
      if (!cellReady(cell.cellX, cell.cellZ, cellSize)) continue;
      const generated = store.generate("derekavak", rule, type, { cellX: cell.cellX, cellZ: cell.cellZ, cellSize, keepFraction: cell.keepFraction });
      if (generated.count === 0) continue;
      cells += 1;
      instances += generated.count;
      for (const value of generated.matrices) entry.matrices.push(value);
    }
  }
  return { types: [...byType.values()].filter((type) => type.matrices.length > 0), cells, instances, cullScale: quality.foliageCullDistanceScale };
}
