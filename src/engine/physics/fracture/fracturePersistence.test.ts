// Ported from Forge WebGL tests/engine/fracturePersistence.test.ts @ forge-webgl-final (04b5fb23): checks unchanged, run by
// Vitest; 4 check(s) not yet portable left out. docs/PORT_LOG.md §2.
import assert from "node:assert/strict";
import { chunkMaskLength, decodeChunkMask, encodeChunkMask } from "./fractureMask.ts";
import { test } from "vitest";


/** DEFORMABLE_FRACTURABLE_WORK_PLAN Faz 5: chunk masks and the save's `destructibles` section. */
export function registerFracturePersistenceTests(check: (label: string, fn: () => void) => void): void {
  check("fracture persistence: chunk masks round-trip every count up to 64 chunks", () => {
    for (const count of [1, 3, 4, 5, 24, 63, 64]) {
      const flags = Array.from({ length: count }, (_, index) => (index * 7 + 3) % 5 < 2);
      const mask = encodeChunkMask(flags);
      assert.equal(mask.length, chunkMaskLength(count));
      assert.match(mask, /^[0-9a-f]+$/);
      assert.deepEqual(decodeChunkMask(mask, count), flags);
      assert.deepEqual(decodeChunkMask(mask.toUpperCase(), count), flags);
    }
    // Chunk 0 is the lowest bit of the last digit.
    assert.equal(encodeChunkMask([true, false, false, false, true]), "11");
    assert.equal(encodeChunkMask(Array(64).fill(true)), "f".repeat(16));
  });

  check("fracture persistence: malformed masks decode to null", () => {
    assert.equal(decodeChunkMask("1", 5), null, "too short");
    assert.equal(decodeChunkMask("011", 5), null, "too long");
    assert.equal(decodeChunkMask("21", 5), null, "a bit past the last chunk");
    assert.equal(decodeChunkMask("1g", 5), null);
    assert.equal(decodeChunkMask(17, 5), null);
    assert.equal(decodeChunkMask("f", 0), null);
    assert.equal(decodeChunkMask("f".repeat(17), 65), null);
    assert.equal(decodeChunkMask("f", 2.5), null);
  });
}

registerFracturePersistenceTests(test as unknown as Parameters<typeof registerFracturePersistenceTests>[0]);
