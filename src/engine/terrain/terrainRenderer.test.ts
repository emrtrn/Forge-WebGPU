// Ported from Forge WebGL tests/engine/terrainRenderer.test.ts @ forge-webgl-final (04b5fb23): checks unchanged, run by
// Vitest; 5 check(s) not yet portable left out. docs/PORT_LOG.md §2.
import assert from "node:assert/strict";
import { TerrainNodeHeightBounds, computeTerrainNormals } from "./terrainRenderData.ts";
import { test } from "vitest";

type Check = (label: string, fn: () => void) => void;

function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/** World-space hills plus per-vertex noise, so normals and LOD bounds are not trivial. */
function hillHeight(x: number, z: number, next: () => number): number {
  return 6 * Math.sin(x * 0.11) * Math.cos(z * 0.07) + next() * 0.4;
}

export function registerTerrainRendererTests(check: Check): void {
  check("terrain renderer: normals match the clamped central-difference formula, edges included", () => {
    const size = 65, spacing = 1.25;
    const next = random(7);
    const heights = Float32Array.from({ length: size * size }, (_, index) => hillHeight(index % size, Math.floor(index / size), next));
    const normals = new Float32Array(size * size * 2);
    computeTerrainNormals(heights, size, spacing, normals, { x0: 0, x1: size - 1, z0: 0, z1: size - 1 });
    const at = (x: number, z: number) => heights[Math.min(Math.max(z, 0), size - 1) * size + Math.min(Math.max(x, 0), size - 1)]!;
    for (let z = 0; z < size; z += 6) {
      for (let x = 0; x < size; x += 7) {
        const dx = at(x - 1, z) - at(x + 1, z);
        const dz = at(x, z - 1) - at(x, z + 1);
        const length = Math.sqrt(dx * dx + 4 * spacing * spacing + dz * dz);
        const index = (z * size + x) * 2;
        assert.ok(Math.abs(normals[index]! - dx / length) < 1e-5);
        assert.ok(Math.abs(normals[index + 1]! - dz / length) < 1e-5);
      }
    }
  });

  check("terrain renderer: node height bounds equal brute force after partial updates", () => {
    const size = 129;
    const heights = new Float32Array(size * size);
    const next = random(11);
    for (let index = 0; index < heights.length; index += 1) heights[index] = next() * 10;
    const bounds = new TerrainNodeHeightBounds(heights, size, 32);
    const brute = (level: number, ix: number, iz: number) => {
      const span = 32 * 2 ** level;
      let min = Infinity;
      let max = -Infinity;
      for (let z = iz * span; z <= Math.min((iz + 1) * span, size - 1); z += 1) {
        for (let x = ix * span; x <= Math.min((ix + 1) * span, size - 1); x += 1) {
          min = Math.min(min, heights[z * size + x]!);
          max = Math.max(max, heights[z * size + x]!);
        }
      }
      return { min, max };
    };
    for (let round = 0; round < 20; round += 1) {
      const x0 = Math.floor(next() * size);
      const z0 = Math.floor(next() * size);
      const rect = { x0, z0, x1: Math.min(size - 1, x0 + Math.floor(next() * 40)), z1: Math.min(size - 1, z0 + Math.floor(next() * 40)) };
      for (let z = rect.z0; z <= rect.z1; z += 1) {
        for (let x = rect.x0; x <= rect.x1; x += 1) heights[z * size + x] = (next() - 0.5) * 50;
      }
      bounds.update(rect);
      for (let level = 0; level <= 2; level += 1) {
        const n = 4 >> level;
        for (let iz = 0; iz < n; iz += 1) {
          for (let ix = 0; ix < n; ix += 1) {
            const expected = brute(level, ix, iz);
            const actual = bounds.node(level, ix, iz);
            assert.equal(actual.min, Math.fround(expected.min));
            assert.equal(actual.max, Math.fround(expected.max));
          }
        }
      }
      assert.deepEqual(bounds.node(9, 0, 0), bounds.range());
    }
  });
}

registerTerrainRendererTests(test as unknown as Parameters<typeof registerTerrainRendererTests>[0]);
