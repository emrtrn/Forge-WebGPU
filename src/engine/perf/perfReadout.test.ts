// Ported from Forge WebGL tests/engine/perfReadout.test.ts @ forge-webgl-final (04b5fb23); docs/PORT_LOG.md §2.
// The readout and scene-cost checks (plan phase 3 step 8); the audio voice
// budget checks stay with the audio subsystem.
import assert from "node:assert/strict";
import { test } from "vitest";
import { compactCount, formatDrawingBuffer, formatFrameSpikes, formatSceneCost } from "./perfReadout.ts";
import { buildSceneCostSnapshot, SCENE_SOURCE_KEY, type SceneCostObject } from "./sceneCost.ts";

const check = test;

/** A visible mesh node for the traversal tests, with `triangles` worth of index. */
function mesh(options: {
  triangles: number;
  castShadow?: boolean;
  visible?: boolean;
  instances?: number;
  source?: string;
  name?: string;
}): SceneCostObject {
  return {
    type: "Mesh",
    name: options.name ?? "",
    isMesh: true,
    visible: options.visible ?? true,
    castShadow: options.castShadow ?? false,
    ...(options.instances !== undefined
      ? { isInstancedMesh: true, count: options.instances }
      : {}),
    ...(options.source !== undefined ? { userData: { [SCENE_SOURCE_KEY]: options.source } } : {}),
    geometry: { index: { count: options.triangles * 3 } },
  };
}

/** Links `children` back to their parent, as three does when you `add()` them. */
function group(
  name: string,
  children: SceneCostObject[],
  extra: Partial<SceneCostObject> = {},
): SceneCostObject {
  const node: SceneCostObject = { type: "Group", name, visible: true, children, ...extra };
  for (const child of children) (child as { parent?: SceneCostObject }).parent = node;
  return node;
}

function scene(children: SceneCostObject[]): SceneCostObject {
  const root: SceneCostObject = { type: "Scene", name: "", visible: true, children };
  for (const child of children) (child as { parent?: SceneCostObject }).parent = root;
  return root;
}

check("formatFrameSpikes keeps the three stall thresholds separate", () => {
  // Summed they would read as one number and hide the finding: a window with
  // four dropped frames and no stall is a different game from one with a
  // single 100 ms freeze, and the sum is 4 either way.
  assert.deepEqual(formatFrameSpikes({ over33ms: 4, over50ms: 1, over100ms: 0 }), [
    "stalls >33ms 4 >50ms 1 >100ms 0",
  ]);
  assert.deepEqual(formatFrameSpikes({ over33ms: 0, over50ms: 0, over100ms: 0 }), [
    "stalls >33ms 0 >50ms 0 >100ms 0",
  ]);
});

check("formatDrawingBuffer multiplies CSS size by the effective pixel ratio", () => {
  // 1280x720 at ratio 2 is a 2560x1440 buffer — four times the pixels of the
  // CSS size the window reports, which is the whole reason the line exists.
  assert.deepEqual(formatDrawingBuffer({ width: 1280, height: 720, pixelRatio: 2 }), [
    "buffer 2,560x1,440 ratio 2.00 3.69M px",
  ]);
  // A fractional ratio (a quality profile scaling the render target down)
  // rounds to whole pixels rather than printing a fraction of one.
  assert.deepEqual(formatDrawingBuffer({ width: 1920, height: 1080, pixelRatio: 0.75 }), [
    "buffer 1,440x810 ratio 0.75 1.17M px",
  ]);
});

check("compactCount stays readable across the count ranges it reports", () => {
  assert.equal(compactCount(812), "812");
  assert.equal(compactCount(9_999), "9,999");
  assert.equal(compactCount(540_000), "540K");
  assert.equal(compactCount(1_240_000), "1.24M");
  assert.equal(compactCount(Number.NaN), "NaN");
});

check("buildSceneCostSnapshot counts what a render pass walks, visible only", () => {
  const hidden = group("hidden-branch", [mesh({ triangles: 100 }), mesh({ triangles: 100 })], {
    visible: false,
  });
  const root = scene([
    group("props", [mesh({ triangles: 10 }), mesh({ triangles: 20 })]),
    hidden,
    mesh({ triangles: 5 }),
  ]);
  const snapshot = buildSceneCostSnapshot(root);
  // props group + its 2 meshes + the loose mesh; the invisible subtree costs
  // the renderer nothing below it and so is not counted at all.
  assert.deepEqual(snapshot.graph, { objects: 4, meshes: 3 });
  // Nothing casts a shadow, so there is no inventory rather than an empty one.
  assert.deepEqual(snapshot.shadows, []);
});

check("buildSceneCostSnapshot applies the InstancedMesh count to shadow casters", () => {
  const root = scene([
    mesh({ triangles: 500, castShadow: true, instances: 4_000, source: "foliage" }),
    mesh({ triangles: 1_200, castShadow: true, source: "landscape" }),
  ]);
  const snapshot = buildSceneCostSnapshot(root);
  // One graph node per InstancedMesh — that is what the traversal walks — but
  // 4,000 drawn copies of the geometry, which is what the shadow pass costs.
  assert.deepEqual(snapshot.graph, { objects: 2, meshes: 2 });
  assert.deepEqual(snapshot.shadows, [
    { source: "foliage", meshes: 4_000, triangles: 2_000_000 },
    { source: "landscape", meshes: 1, triangles: 1_200 },
  ]);
});

check("scene-cost buckets come from the scene, never from an engine table", () => {
  const tagged = group("whatever", [mesh({ triangles: 10, castShadow: true })], {
    userData: { [SCENE_SOURCE_KEY]: "landscape" },
  });
  const root = scene([
    tagged,
    // Untagged: the label falls back to the top-level scene child's name…
    group("splines", [mesh({ triangles: 40, castShadow: true })]),
    // …and to its type when even the name is empty.
    mesh({ triangles: 70, castShadow: true }),
  ]);
  const sources = buildSceneCostSnapshot(root).shadows.map((bucket) => bucket.source);
  assert.deepEqual(sources, ["Mesh", "splines", "landscape"]);
});

check("buildSceneCostSnapshot collapses the tail of the buckets into other", () => {
  const root = scene(
    [900, 800, 700, 600].map((triangles, index) =>
      mesh({ triangles, castShadow: true, source: `s${index}` }),
    ),
  );
  const snapshot = buildSceneCostSnapshot(root, { maxBuckets: 2 });
  assert.deepEqual(snapshot.shadows, [
    { source: "s0", meshes: 1, triangles: 900 },
    { source: "s1", meshes: 1, triangles: 800 },
    { source: "other", meshes: 2, triangles: 1_300 },
  ]);
  // maxBuckets 0 means "keep them all", not "keep none".
  assert.equal(buildSceneCostSnapshot(root, { maxBuckets: 0 }).shadows.length, 4);
});

check("formatSceneCost aligns the bucket column and omits an empty inventory", () => {
  assert.deepEqual(formatSceneCost({ graph: { objects: 4_210, meshes: 1_880 }, shadows: [] }), [
    "graph 4,210 nodes 1,880 meshes (walked per pass)",
  ]);
  assert.deepEqual(
    formatSceneCost({
      graph: { objects: 12, meshes: 3 },
      shadows: [
        { source: "foliage", meshes: 4_000, triangles: 2_000_000 },
        { source: "landscape", meshes: 1, triangles: 1_200 },
      ],
    }),
    [
      "graph 12 nodes 3 meshes (walked per pass)",
      "shadow casters",
      "  foliage   4,000 mesh 2.00M tris",
      "  landscape 1 mesh 1,200 tris",
    ],
  );
});
