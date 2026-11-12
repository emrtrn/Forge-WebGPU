// Ported from Forge WebGL tools/engine-tests.ts @ forge-webgl-final (04b5fb23): each check is
// copied unchanged and runs as a Vitest test; docs/PORT_LOG.md §2.
import assert from "node:assert/strict";
import { terrainTileTrimesh } from "../testing/terrainTrimeshReference.ts";
import { PhysicsSubsystem } from "./physicsSubsystem.ts";
import { test } from "vitest";

const check = test;

check("landscape trimesh reference is centred and up-facing, and physics files its triangles as walkable surfaces", () => {
  const { primitive } = terrainTileTrimesh({ tileQuads: 2, spacing: 2, origin: [0, 0, 0] }, {
    x: 0, z: 0, size: 3, layerCount: 0, weights: new Uint8Array(0),
    heights: Float32Array.from([
      0, 0, 0,
      0, 1, 0,
      0, 0, 0,
    ]),
  });
  assert.equal(primitive.shape, "trimesh");
  assert.equal(primitive.vertices.length, 9);
  assert.equal(primitive.indices.length, 24);
  assert.deepEqual(primitive.vertices[0], [-2, 0, -2]);
  assert.deepEqual(primitive.vertices[4], [0, 1, 0]);
  assert.deepEqual(primitive.size, [4, 1, 4]);
  assert.deepEqual(primitive.center, [0, 0.5, 0]);
  assert.deepEqual(primitive.indices.slice(0, 6), [0, 3, 1, 1, 3, 4]);

  const physics = new PhysicsSubsystem();
  physics.setEntities([
    {
      id: "landscape:unit",
      components: {
        Transform: { position: [10, 2, -3], rotation: [0, 0, 0], scale: [1, 1, 1] },
        Collider: {
          shape: "box",
          size: primitive.size,
          center: primitive.center,
          isStatic: true,
          isSensor: false,
          navigationRole: "walkable",
          // @ts-expect-error Forge never type-checked its tests: a typed collider primitive is wider than the JSON component data (type-only).
          primitives: [primitive],
        },
      },
    },
  ]);
  assert.equal(physics.staticBlockerAabbs().length, 0, "walkable landscape triangles are not wall blockers");
  const surfaces = physics.staticSurfaceTriangles();
  assert.equal(surfaces.length, 8);
  assert.ok(surfaces.every((surface) => surface.normalY > 0.6), "landscape surfaces are up-facing");
  assert.equal(physics.staticNavigationSurfaceTriangles().length, 8);
});

check("physics subsystem spatially narrows static landscape surface candidates for ground probes", () => {
  const { primitive } = terrainTileTrimesh({ tileQuads: 8, spacing: 1, origin: [0, 0, 0] },
    { x: 0, z: 0, size: 9, layerCount: 0, weights: new Uint8Array(0), heights: new Float32Array(81) });
  const physics = new PhysicsSubsystem();
  physics.setEntities([
    {
      id: "landscape:spatial-index",
      components: {
        Transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        Collider: {
          shape: "box",
          size: primitive.size,
          // @ts-expect-error Forge never type-checked its tests: the reference primitive's optional centre is wider than the JSON component data (type-only).
          center: primitive.center,
          isStatic: true,
          isSensor: false,
          // @ts-expect-error Forge never type-checked its tests: a typed collider primitive is wider than the JSON component data (type-only).
          primitives: [primitive],
        },
      },
    },
  ]);
  const all = physics.staticSurfaceTriangles();
  const near = physics.staticSurfaceTrianglesNear(0, 0);
  assert.equal(all.length, 128);
  assert.ok(near.length > 0 && near.length < all.length, `near candidates=${near.length} all=${all.length}`);
  assert.equal(physics.staticSurfaceTrianglesNear(20, 20).length, 0, "outside the terrain has no candidates");
});
