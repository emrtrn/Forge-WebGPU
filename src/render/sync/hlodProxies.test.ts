import { expect, test } from "vitest";
import { Group, PerspectiveCamera } from "three/webgpu";
import { createHlodProxies } from "./hlodProxies.ts";
import type { LevelSettings } from "../../core/index.ts";

test("HLOD follows the camera's effective quality distance rather than the unscaled authored range", async () => {
  let reads = 0;
  const proxies = createHlodProxies({
    index: { schema: "forge.levelHlod/1", level: "lvl_test", cellSize: 128, cells: [{ key: "10_0", triangles: 1, sourceHash: "00000000" }] },
    isCellActive: () => false, load: async () => { reads++; return null; },
  }, new Group());
  const camera = new PerspectiveCamera(44, 1, .1, 100);
  const settings = { viewDistance: 2000, cellSize: 128, loadRange: 384 } as LevelSettings;
  proxies.sync(camera, settings); expect(reads).toBe(0);
  camera.far = 2000; proxies.sync(camera, settings); expect(reads).toBe(1);
  await Promise.resolve(); proxies.dispose();
});
