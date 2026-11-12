// Ported from Forge WebGL tools/engine-tests.ts @ forge-webgl-final (04b5fb23): each check is
// copied unchanged and runs as a Vitest test; docs/PORT_LOG.md §2.
import assert from "node:assert/strict";
import { advanceWaypoint } from "./navigationTypes.ts";
import { test } from "vitest";

const check = test;

check("advanceWaypoint keeps intermediate waypoints tight and honors the final acceptance", () => {
  const acceptance = { final: 1.5, intermediate: 0.175 };
  // Corner route: index 1 is a corner, index 2 the goal. A generous final
  // acceptance must NOT let the agent skip the corner while still far from it.
  const held = advanceWaypoint([[0, 0, 0], [0, 0, 2], [2, 0, 2]], 1, [0, 0, 1.2], acceptance);
  assert.equal(held.waypointIndex, 1);
  assert.equal(held.arrived, false);

  // Reaching the corner advances to the goal but does not "arrive" yet.
  const stepped = advanceWaypoint([[0, 0, 0], [0, 0, 2], [2, 0, 2]], 1, [0, 0, 2], acceptance);
  assert.equal(stepped.waypointIndex, 2);
  assert.equal(stepped.arrived, false);

  // The final goal honors the generous acceptance radius (1.0 <= 1.5).
  const arrived = advanceWaypoint([[0, 0, 0], [0, 0, 2], [2, 0, 2]], 2, [1, 0, 2], acceptance);
  assert.equal(arrived.waypointIndex, 2);
  assert.equal(arrived.arrived, true);
});

check("advanceWaypoint does not accept heightfield waypoints on X/Z proximity alone", () => {
  const acceptance = { final: 0.25, intermediate: 0.175 };

  const stillBelowIntermediate = advanceWaypoint(
    [[0, 0, 0], [1, 1, 0], [2, 1, 0]],
    1,
    [1, 0.2, 0],
    acceptance,
  );
  assert.equal(stillBelowIntermediate.waypointIndex, 1);
  assert.equal(stillBelowIntermediate.arrived, false);

  const stillBelowFinal = advanceWaypoint([[0, 0, 0], [1, 1, 0]], 1, [1, 0.6, 0], acceptance);
  assert.equal(stillBelowFinal.waypointIndex, 1);
  assert.equal(stillBelowFinal.arrived, false);

  const reachedFinalHeight = advanceWaypoint([[0, 0, 0], [1, 1, 0]], 1, [1, 0.9, 0], acceptance);
  assert.equal(reachedFinalHeight.waypointIndex, 1);
  assert.equal(reachedFinalHeight.arrived, true);
});
