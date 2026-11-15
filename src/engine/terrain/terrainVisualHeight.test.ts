// G8 "terrain = collider" in Node (plan phase 5a step 5, decision 4; Phase 1
// G8: at most 5 cm on a 1 m sample grid where the terrain is drawn at full
// resolution, level 0 before its morph). The drawn surface's CPU twin
// (terrainVisualHeight.ts) under a real LOD selection, against rays cast onto
// Rapier heightfields built by engine/physics/terrainCollider.ts. The render
// smoke checks the GPU's readback the same way (tests/smoke/terrainCollider.smoke.ts).
import assert from "node:assert/strict";
import { test } from "vitest";
import { terrainTileHeightfieldShape } from "../physics/terrainCollider.ts";
import { TerrainLodSelector } from "./terrainLod.ts";
import { TERRAIN_PATCH_QUADS } from "./terrainRenderData.ts";
import { TerrainWorldHeightBounds, buildTerrainGlobalAttributes, worldTerrainRenderSource } from "./terrainRenderSource.ts";
import { parseTileKey, tileKey, type TerrainTileData, type WorldTerrainDef } from "./terrainTypes.ts";
import { terrainShaderHeight, terrainVisualSample, type TerrainDrawnNode, type TerrainVisualSurface } from "./terrainVisualHeight.ts";

/** Hills with a short ripple, so a coarser LOD visibly leaves the authored surface. */
const relief = (gx: number, gz: number) => Math.fround(6 * Math.sin(gx * 0.07) * Math.cos(gz * 0.05) + 2.5 * Math.sin(gx * 0.41 + gz * 0.23) + 0.03 * gx);

function hills(tilesX: number, tilesZ: number, q: number, spacing: number) {
  const def: WorldTerrainDef = {
    schema: 1, type: "worldTerrain", name: "Hills", tileQuads: q, spacing, tilesX, tilesZ,
    origin: [-100, 12, 40], heightMin: -100, heightMax: 100, collision: true,
    layers: [{ id: "l0", name: "Layer 0", color: "#ffffff" }], tiles: [],
  };
  const tiles = new Map<string, TerrainTileData>();
  const size = q + 1;
  for (let tz = 0; tz < tilesZ; tz += 1) {
    for (let tx = 0; tx < tilesX; tx += 1) {
      const heights = new Float32Array(size * size);
      for (let z = 0; z < size; z += 1) for (let x = 0; x < size; x += 1) heights[z * size + x] = relief(tx * q + x, tz * q + z);
      const key = tileKey(tx, tz);
      tiles.set(key, { x: tx, z: tz, size, heights, layerCount: 1, weights: new Uint8Array(size * size * 4) });
      def.tiles.push({ key, minHeight: Math.min(...heights), maxHeight: Math.max(...heights) });
    }
  }
  return { def, tiles };
}

/** The drawn surface as TerrainView selects it (render/sync/terrainView.ts), every tile in its slot. */
function drawn(def: WorldTerrainDef, tiles: Map<string, TerrainTileData>, camera: readonly [number, number, number]) {
  const source = worldTerrainRenderSource(def, tiles);
  const global = buildTerrainGlobalAttributes(source).map;
  const bounds = new TerrainWorldHeightBounds(source, TERRAIN_PATCH_QUADS);
  const world = { tileQuads: def.tileQuads, spacing: def.spacing, tilesX: def.tilesX, tilesZ: def.tilesZ, origin: [0, 0, 0] as [number, number, number] };
  const selector = new TerrainLodSelector(world, (level, ix, iz) => bounds.node(level, ix, iz), { patchQuads: TERRAIN_PATCH_QUADS, extent: source.extent });
  const nodes: TerrainDrawnNode[] = selector
    .select(camera)
    .filter((node) => node.offsetX < source.extent[0] && node.offsetZ < source.extent[1])
    .map((node) => ({
      x0: node.offsetX, z0: node.offsetZ, size: node.size, morph: node.morphRange,
      tile: node.tileKey ? parseTileKey(node.tileKey) : null,
    }));
  const surface: TerrainVisualSurface = {
    tileQuads: def.tileQuads, spacing: def.spacing, extent: source.extent, patchQuads: TERRAIN_PATCH_QUADS, tiles: source,
    global: { width: global.width, height: global.height, spacing: global.stride * def.spacing, heights: global.heights },
    camera,
  };
  return { surface, nodes, leaf: selector.settings.leafSize };
}

test("terrain visual height: away from morphs the shader's sample is the tile's own triangle", () => {
  const { def, tiles } = hills(1, 1, 64, 1);
  const { surface } = drawn(def, tiles, [32, 20, 32]);
  // A leaf node: one patch quad per tile quad.
  const node: TerrainDrawnNode = { x0: 0, z0: 32, size: 32, tile: { x: 0, z: 0 }, morph: [1e9, 2e9] };
  const tile = tiles.get("0_0")!;
  // On a vertex the height is the sample; inside a cell, on the b-c diagonal, the mean of b and c.
  assert.equal(terrainShaderHeight(surface, node, 7, 9), tile.heights[9 * 65 + 7]);
  const b = tile.heights[9 * 65 + 8]!;
  const c = tile.heights[10 * 65 + 7]!;
  assert.ok(Math.abs(terrainShaderHeight(surface, node, 7.5, 9.5) - (b + c) / 2) < 1e-5);
  // The whole patch on its own grid (never morphing) draws the tile exactly.
  const sample = terrainVisualSample(surface, [node], 20.3, 41.8)!;
  assert.ok(Math.abs(sample.height - terrainShaderHeight(surface, node, 20.3, 41.8)) < 1e-5);
  assert.equal(sample.morph, 0);
});

test("G8: the drawn surface equals the Rapier heightfield within 5 cm at full resolution; coarser bands are reported", async () => {
  const RAPIER = await import("@dimforge/rapier3d-compat");
  await RAPIER.init();
  const { def, tiles } = hills(8, 8, 64, 1);
  const camera: [number, number, number] = [131, relief(131, 97) + 3, 97];
  const { surface, nodes, leaf } = drawn(def, tiles, camera);
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  try {
    for (const tile of tiles.values()) {
      const shape = terrainTileHeightfieldShape(def, tile);
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(shape.translation[0], shape.translation[1], shape.translation[2]));
      world.createCollider(RAPIER.ColliderDesc.heightfield(shape.nrows, shape.ncols, shape.heights, { x: shape.scale[0], y: shape.scale[1], z: shape.scale[2] }), body);
    }
    world.step();
    const bands = { full: { samples: 0, max: 0 }, morph: { samples: 0, max: 0 }, coarser: { samples: 0, max: 0 } };
    const [ox, oy, oz] = def.origin;
    // A 1 m grid over the whole terrain, sampled at cell centres.
    for (let z = 0.5; z < 512; z += 1) {
      for (let x = 0.5; x < 512; x += 1) {
        const sample = terrainVisualSample(surface, nodes, x, z);
        assert.ok(sample, `drawn at ${x}, ${z}`);
        const hit = world.castRay(new RAPIER.Ray({ x: ox + x, y: 500, z: oz + z }, { x: 0, y: -1, z: 0 }), 1000, true);
        assert.ok(hit, `collider under ${x}, ${z}`);
        const gap = Math.abs(oy + sample.height - (500 - hit.timeOfImpact));
        const band = sample.node.size === leaf && sample.node.tile ? (sample.morph === 0 ? bands.full : bands.morph) : bands.coarser;
        band.samples += 1;
        band.max = Math.max(band.max, gap);
      }
    }
    assert.ok(bands.full.samples > 10_000, `full-resolution samples: ${bands.full.samples}`);
    assert.ok(bands.full.max <= 0.05, `full resolution: ${bands.full.max} m`);
    // Forge's own CDLOD deviation past it (informational in G8), large enough here to show the check discriminates.
    assert.ok(bands.morph.samples > 0 && bands.coarser.samples > 0);
    assert.ok(bands.coarser.max > 0.05, `coarser bands leave the collider: ${bands.coarser.max} m`);
  } finally {
    world.free();
  }
});
