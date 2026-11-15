// Ported from Forge WebGL tests/engine/terrainPuddle.test.ts @ forge-webgl-final (04b5fb23): checks unchanged, run by
// Vitest; 2 check(s) not yet portable left out. docs/PORT_LOG.md §2.
import assert from "node:assert/strict";
import { buildTerrainPuddle, type TerrainPuddleRegion } from "./terrainPuddle.ts";
import { test } from "vitest";


export function registerTerrainPuddleTests(check: (name: string, fn: () => void) => void): void {
  const region: TerrainPuddleRegion = { minX: -4, minZ: -4, size: 8, cellSize: .125, level: 0, seed: [0, 0] };
  check("puddle: horizontal, clipped water covers only the connected basin and leaves islands dry", () => {
    const bed = (x: number, z: number) => Math.min((x + 1.6) ** 2 + z * z - 1,
      (x - 1.6) ** 2 + z * z - 1) + (Math.hypot(x + 1.6, z) < .3 ? 2 : 0);
    const data = buildTerrainPuddle({ ...region, seed: [-1.1, 0] }, bed);
    assert.equal(data.status, "ready"); assert.ok(data.area > 2 && data.area < 3.5);
    for (let i = 0; i < data.positions.length; i += 3) {
      assert.equal(data.positions[i + 1], 0);
      assert.ok(data.positions[i]! < 0, "disconnected right basin isn't filled");
      assert.ok(Math.hypot(data.positions[i]! + 1.6, data.positions[i + 2]!) > .2, "island stays dry");
      assert.ok(data.depths[i / 3]! >= 0);
    }
  });
}

registerTerrainPuddleTests(test as unknown as Parameters<typeof registerTerrainPuddleTests>[0]);
