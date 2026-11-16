/** Small-object distance culling of static placements (OPEN_WORLD_PLAN Faz 7e). */
// Ported from Forge WebGL tests/engine/detailCulling.test.ts @ forge-webgl-final (04b5fb23): checks unchanged, run by
// Vitest; 4 check(s) not yet portable left out. docs/PORT_LOG.md §2.
import assert from "node:assert/strict";
import { DETAIL_CULL_MAX_DISTANCE, detailBatchCulled, detailCullDistance, detailCullWindow } from "./detailCulling.ts";
import { test } from "vitest";


type Check = (label: string, fn: () => void) => void;

export function registerDetailCullingTests(check: Check): void {
  check("detail culling: cull distance is 200 × radius, and large assets never cull", () => {
    assert.equal(detailCullDistance(0.5), 100);
    assert.equal(detailCullDistance(5), DETAIL_CULL_MAX_DISTANCE);
    assert.equal(detailCullDistance(5.01), null);
    assert.equal(detailCullDistance(0), null);
    assert.equal(detailCullDistance(Number.NaN), null);
    assert.deepEqual(detailCullWindow(100, 0.5), [40, 50]);
    assert.deepEqual(detailCullWindow(100, 0), [80, 100]);
  });

  check("detail culling: a batch is skipped only when its nearest point is past its largest instance's distance", () => {
    // Sphere centre 160 m away, radius 10: nearest point 150 m.
    assert.equal(detailBatchCulled(160, 10, 100, 1, 1), true);
    assert.equal(detailBatchCulled(160, 10, 100, 1.5, 1), false);
    assert.equal(detailBatchCulled(160, 10, 100, 2, 0.5), true);
    assert.equal(detailBatchCulled(105, 10, 100, 1, 1), false);
  });
}

registerDetailCullingTests(test as unknown as Parameters<typeof registerDetailCullingTests>[0]);
