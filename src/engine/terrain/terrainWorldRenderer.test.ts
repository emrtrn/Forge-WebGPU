// Ported from Forge WebGL tests/engine/terrainWorldRenderer.test.ts @ forge-webgl-final (04b5fb23): checks unchanged, run by
// Vitest; 8 check(s) not yet portable left out. docs/PORT_LOG.md §2.
import assert from "node:assert/strict";
import {
  TerrainWorldHeightBounds,
  buildTerrainGlobalAttributes,
  computeTileNormals,
  updateTerrainGlobalAttributes,
  worldTerrainRenderSource,
  type TerrainRenderSource,
} from "./terrainRenderSource.ts";
import { tileKey, type TerrainTileData } from "./terrainTypes.ts";
import { test } from "vitest";

type Check = (label: string, fn: () => void) => void;

const Q = 64;
const SPACING = 1.5;
const TILES_X = 3;
const TILES_Z = 2;
const HOLE = tileKey(2, 1);

/** One function over global vertex coordinates, so duplicated seam vertices agree. */
function heightAt(gx: number, gz: number): number {
  return Math.fround(5 * Math.sin(gx * 0.09) * Math.cos(gz * 0.05) + 0.02 * gx - 0.01 * gz);
}

function worldTiles(): Map<string, TerrainTileData> {
  const tiles = new Map<string, TerrainTileData>();
  const size = Q + 1;
  for (let tz = 0; tz < TILES_Z; tz += 1) {
    for (let tx = 0; tx < TILES_X; tx += 1) {
      if (tileKey(tx, tz) === HOLE) continue;
      const heights = new Float32Array(size * size);
      const weights = new Uint8Array(size * size * 4);
      for (let z = 0; z < size; z += 1) {
        for (let x = 0; x < size; x += 1) {
          const gx = tx * Q + x;
          const gz = tz * Q + z;
          heights[z * size + x] = heightAt(gx, gz);
          weights.set([gx % 256, gz % 256, (gx + gz) % 256, 7], (z * size + x) * 4);
        }
      }
      tiles.set(tileKey(tx, tz), { x: tx, z: tz, size, heights, layerCount: 4, weights });
    }
  }
  return tiles;
}

function worldSource(): TerrainRenderSource {
  return worldTerrainRenderSource({ tileQuads: Q, spacing: SPACING, tilesX: TILES_X, tilesZ: TILES_Z }, worldTiles());
}

const inHole = (gx: number, gz: number) => gx > 2 * Q && gz > Q;

export function registerTerrainWorldRendererTests(check: Check): void {
  check("terrain world: seam normals equal a single-grid reference, holes clamp", () => {
    const source = worldSource();
    const out = new Float32Array((Q + 1) * (Q + 1) * 2);
    const width = TILES_X * Q;
    const depth = TILES_Z * Q;
    for (const key of source.keys()) {
      const [tx, tz] = key.split("_").map(Number) as [number, number];
      computeTileNormals(source, key, out);
      for (let z = 0; z <= Q; z += 4) {
        for (let x = 0; x <= Q; x += 1) {
          const gx = tx * Q + x;
          const gz = tz * Q + z;
          // Next to the hole the neighbour is missing on purpose; checked separately.
          if (inHole(gx + 1, gz) || inHole(gx - 1, gz) || inHole(gx, gz + 1) || inHole(gx, gz - 1)) continue;
          const h = (px: number, pz: number) => heightAt(Math.min(Math.max(px, 0), width), Math.min(Math.max(pz, 0), depth));
          const dx = h(gx - 1, gz) - h(gx + 1, gz);
          const dz = h(gx, gz - 1) - h(gx, gz + 1);
          const length = Math.sqrt(dx * dx + 4 * SPACING * SPACING + dz * dz);
          const index = (z * (Q + 1) + x) * 2;
          assert.ok(Math.abs(out[index]! - dx / length) < 1e-5, `tile ${key} vertex ${x},${z}`);
          assert.ok(Math.abs(out[index + 1]! - dz / length) < 1e-5, `tile ${key} vertex ${x},${z}`);
        }
      }
    }
    // Tile 1_1's +X edge borders the hole: its right neighbour clamps to the vertex itself.
    computeTileNormals(source, tileKey(1, 1), out);
    const x = Q;
    const z = 20;
    const gx = Q + x;
    const gz = Q + z;
    const dx = heightAt(gx - 1, gz) - heightAt(gx, gz);
    const dz = heightAt(gx, gz - 1) - heightAt(gx, gz + 1);
    assert.ok(Math.abs(out[(z * (Q + 1) + x) * 2]! - dx / Math.sqrt(dx * dx + 4 * SPACING * SPACING + dz * dz)) < 1e-5);
  });

  check("terrain world: node height bounds equal brute force across tiles, holes stay conservative", () => {
    const source = worldSource();
    const bounds = new TerrainWorldHeightBounds(source);
    assert.equal(bounds.tileLevel, 1);
    const brute = (level: number, ix: number, iz: number) => {
      const span = 32 * 2 ** level;
      let min = Infinity;
      let max = -Infinity;
      for (let gz = iz * span; gz <= Math.min((iz + 1) * span, TILES_Z * Q); gz += 1) {
        for (let gx = ix * span; gx <= Math.min((ix + 1) * span, TILES_X * Q); gx += 1) {
          // A seam vertex next to the hole still exists in its other tile.
          const owners = [[Math.floor(gx / Q), Math.floor(gz / Q)], [Math.ceil(gx / Q) - 1, Math.floor(gz / Q)],
            [Math.floor(gx / Q), Math.ceil(gz / Q) - 1], [Math.ceil(gx / Q) - 1, Math.ceil(gz / Q) - 1]];
          const inTileOfNode = owners.some(([tx, tz]) => tileKey(tx!, tz!) !== HOLE && tx! >= 0 && tz! >= 0 && tx! < TILES_X && tz! < TILES_Z
            && tx! * Q <= gx && gx <= (tx! + 1) * Q && tz! * Q <= gz && gz <= (tz! + 1) * Q
            && (level > 1 || (Math.floor(ix * span / Q) === tx && Math.floor(iz * span / Q) === tz)));
          if (!inTileOfNode) continue;
          min = Math.min(min, heightAt(gx, gz));
          max = Math.max(max, heightAt(gx, gz));
        }
      }
      return { min, max };
    };
    for (let level = 0; level <= 1; level += 1) {
      const span = 2 ** (1 - level);
      for (let iz = 0; iz < TILES_Z * span; iz += 1) {
        for (let ix = 0; ix < TILES_X * span; ix += 1) {
          const node = bounds.node(level, ix, iz);
          if (tileKey(Math.floor(ix / span), Math.floor(iz / span)) === HOLE) {
            assert.deepEqual(node, bounds.range());
            continue;
          }
          const expected = brute(level, ix, iz);
          assert.equal(node.min, expected.min, `level ${level} node ${ix},${iz}`);
          assert.equal(node.max, expected.max, `level ${level} node ${ix},${iz}`);
        }
      }
    }
    const rangeOf = (tiles: string[]) => {
      const out = { min: Infinity, max: -Infinity };
      for (const key of tiles) {
        const [tx, tz] = key.split("_").map(Number) as [number, number];
        for (let z = 0; z <= Q; z += 1) {
          for (let x = 0; x <= Q; x += 1) {
            out.min = Math.min(out.min, heightAt(tx * Q + x, tz * Q + z));
            out.max = Math.max(out.max, heightAt(tx * Q + x, tz * Q + z));
          }
        }
      }
      return out;
    };
    const all = rangeOf([...source.keys()]);
    assert.deepEqual(bounds.range(), all);
    // Level 2 spans 2×2 tiles; level 3 spans the whole 3×2 grid.
    assert.deepEqual(bounds.node(2, 0, 0), rangeOf(["0_0", "1_0", "0_1", "1_1"]));
    assert.deepEqual(bounds.node(2, 1, 0), rangeOf(["2_0"]));
    assert.deepEqual(bounds.node(3, 0, 0), all);
  });

  check("terrain world: global map samples vertex heights, normals and weights; holes are flagged", () => {
    const source = worldSource();
    const global = buildTerrainGlobalAttributes(source);
    const { map } = global;
    assert.equal(map.stride, 4);
    assert.equal(map.width, TILES_X * Q / 4 + 1);
    assert.equal(map.height, TILES_Z * Q / 4 + 1);
    const width = TILES_X * Q;
    const depth = TILES_Z * Q;
    const h = (px: number, pz: number) => heightAt(Math.min(Math.max(px, 0), width), Math.min(Math.max(pz, 0), depth));
    for (let sz = 0; sz < map.height; sz += 1) {
      for (let sx = 0; sx < map.width; sx += 1) {
        const sample = sz * map.width + sx;
        const gx = sx * 4;
        const gz = sz * 4;
        if (inHole(gx, gz)) {
          assert.ok(Number.isNaN(map.heights[sample]!));
          assert.equal(global.normals[sample * 3 + 2], 1);
          continue;
        }
        assert.equal(map.heights[sample], heightAt(gx, gz));
        assert.equal(global.normals[sample * 3 + 2], 0);
        if (!(inHole(gx + 1, gz) || inHole(gx, gz + 1))) {
          const dx = h(gx - 1, gz) - h(gx + 1, gz);
          const dz = h(gx, gz - 1) - h(gx, gz + 1);
          const length = Math.sqrt(dx * dx + 4 * SPACING * SPACING + dz * dz);
          assert.ok(Math.abs(global.normals[sample * 3]! - dx / length) < 1e-5, `sample ${sx},${sz}`);
          assert.ok(Math.abs(global.normals[sample * 3 + 1]! - dz / length) < 1e-5, `sample ${sx},${sz}`);
        }
        assert.deepEqual([...global.weights.subarray(sample * 4, sample * 4 + 4)], [gx % 256, gz % 256, (gx + gz) % 256, 7]);
        assert.deepEqual([...global.weights.subarray((map.width * map.height + sample) * 4, (map.width * map.height + sample) * 4 + 4)], [0, 0, 0, 0]);
      }
    }
    // An edit re-samples only the touched points.
    const tile = source.tile(0, 0)!;
    tile.heights[8 * (Q + 1) + 8] = 99;
    const rect = updateTerrainGlobalAttributes(global, source, tileKey(0, 0), { x0: 8, x1: 8, z0: 8, z1: 8 });
    assert.ok(rect && rect.x0 <= 2 && rect.x1 >= 2 && rect.z0 <= 2 && rect.z1 >= 2);
    assert.equal(map.heights[2 * map.width + 2], 99);
  });
}

registerTerrainWorldRendererTests(test as unknown as Parameters<typeof registerTerrainWorldRendererTests>[0]);
