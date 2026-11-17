import { expect, test } from "vitest";
import { Group, PerspectiveCamera } from "three/webgpu";
import { createHlodProxies, hlodSwitchDistance } from "./hlodProxies.ts";
import type { LevelSettings } from "../../core/index.ts";
import type { HlodSource } from "../../engine/world/hlod.ts";

const entry = (key: string) => ({ key, triangles: 1, sourceHash: "00000000" });

test("HLOD follows the camera's effective quality distance rather than the unscaled authored range", async () => {
  let reads = 0;
  const proxies = createHlodProxies({
    index: { schema: "forge.levelHlod/2", level: "lvl_test", cellSize: 128, cells: [entry("10_0")], clusters: [] },
    isCellActive: () => false, load: async () => { reads++; return null; },
  }, new Group());
  const camera = new PerspectiveCamera(44, 1, .1, 100);
  const settings = { viewDistance: 2000, cellSize: 128, loadRange: 384 } as LevelSettings;
  proxies.sync(camera, settings); expect(reads).toBe(0);
  camera.far = 2000; proxies.sync(camera, settings); expect(reads).toBe(1);
  await Promise.resolve(); proxies.dispose();
});

test("layer 1 switch distance: twice the load range, at least six cells, times the quality multiplier", () => {
  const settings = (loadRange: number) => ({ cellSize: 128, loadRange }) as LevelSettings;
  expect(hlodSwitchDistance(settings(400), 128)).toBe(800);
  expect(hlodSwitchDistance(settings(100), 128)).toBe(768);
  expect(hlodSwitchDistance(settings(400), 128, 0.5)).toBe(400);
});

// Layer 1 (plan 5c R8.3). Reads never resolve to a mesh here (no GLB), so they count as failed:
// what matters is which files are asked for, and that an active cell never keeps its cluster.
test("a far cluster is read instead of its cells; near, its cells are read; an active cell drops the cluster", async () => {
  const reads: string[] = [];
  let active = false;
  const source: HlodSource = {
    index: { schema: "forge.levelHlod/2", level: "lvl_test", cellSize: 128, cells: [entry("0_0"), entry("1_0")], clusters: [entry("0_0")] },
    isCellActive: (key) => active && key === "0_0",
    load: async (file) => { reads.push(file); return null; },
  };
  const proxies = createHlodProxies(source, new Group());
  const camera = new PerspectiveCamera(44, 1, .1, 5000);
  const settings = { viewDistance: 5000, cellSize: 128, loadRange: 400 } as LevelSettings;
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  camera.position.set(3000, 0, 0); // 2,488 m from the cluster: past the 800 m switch.
  proxies.sync(camera, settings); await flush();
  expect(reads).toEqual(["hlod/l1_0_0.glb"]);

  // Nearer than the switch: the cells take over (the cluster failed, so it never showed).
  reads.length = 0;
  camera.position.set(700, 0, 0);
  proxies.sync(camera, settings); await flush();
  expect(reads.sort()).toEqual(["hlod/0_0.glb", "hlod/1_0.glb"]);
  expect(proxies.stats().clusters).toEqual({ visible: 0, loaded: 0, total: 1 });

  proxies.dispose();

  // An active cell keeps its cluster away even far off; the other cell draws its own proxy.
  reads.length = 0; active = true;
  const fresh = createHlodProxies(source, new Group());
  camera.position.set(3000, 0, 0);
  fresh.sync(camera, settings); await flush();
  expect(reads).toEqual(["hlod/1_0.glb"]);
  fresh.dispose();
});
