/**
 * `/__world-random` request allowlist (`tools/world/randomWorldRequest.ts`):
 * the World Builder window's choices pass as they are, anything else is refused.
 */
// Ported from Forge WebGL tests/engine/randomWorldRequest.test.ts @ forge-webgl-final (04b5fb23): checks unchanged, run by
// Vitest; the request and run checks of tools/world are rewritten in tools/world/world.test.ts. docs/PORT_LOG.md §2.
import assert from "node:assert/strict";
import { WORLD_BUILD_STEPS } from "./worldBrief.ts";
import { test } from "vitest";

type Check = (label: string, run: () => void) => void;

export function registerRandomWorldRequestTests(check: Check): void {
  check("random world request: build steps are reported in order", () => {
    assert.deepEqual([...WORLD_BUILD_STEPS], ["terrain", "paint", "settlements", "roads", "ground", "placements", "files"]);
  });
}

registerRandomWorldRequestTests(test as unknown as Parameters<typeof registerRandomWorldRequestTests>[0]);
