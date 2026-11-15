// The drawn terrain read back from the GPU (plan phase 5a step 5, G8; spike
// S2's measureG8): the view's patch, with the main camera's LOD selection and
// morph (unculled), drawn top-down through an orthographic camera into a float
// target with the material's height probe. Each covered pixel carries its own
// world X / Y / Z, so the readback needs no orientation convention; a pixel the
// terrain does not cover (a hole, past the extent) stays clear.
//
// A measurement, not a frame: it renders outside the frame loop and leaves the
// view to re-select with its cull on the next update.

import * as THREE from "three/webgpu";
import type { TerrainDrawnNode, TerrainVisualSurface } from "../../engine/terrain/terrainVisualHeight.ts";
import { TERRAIN_HEIGHT_PROBE_OFFSET } from "../materials/terrain.ts";
import type { TerrainView } from "./terrainView.ts";

export interface TerrainHeightReadback {
  /** World X, Y, Z of each covered pixel, packed. */
  readonly points: Float32Array;
  /** Pixels in the region (size x size). */
  readonly pixels: number;
  /** The selection that was drawn, as the CPU twin reads it. */
  readonly visual: { surface: TerrainVisualSurface; nodes: TerrainDrawnNode[] };
}

/**
 * Draws `view` over a `size` m square centred on world (`centre`), one pixel
 * per metre, with `camera`'s LOD and morph, and reads the heights back.
 * `size` is rounded to a multiple of 16 (the readback's row alignment).
 */
export async function readTerrainHeights(
  renderer: THREE.WebGPURenderer,
  view: TerrainView,
  camera: THREE.Camera,
  centre: readonly [number, number],
  size: number,
): Promise<TerrainHeightReadback> {
  const side = Math.max(16, Math.round(size / 16) * 16);
  camera.updateMatrixWorld();
  view.update(camera, [], false);
  const visual = view.visualSurface();

  const ortho = new THREE.OrthographicCamera(-side / 2, side / 2, side / 2, -side / 2, 1, 40000);
  ortho.position.set(centre[0], 20000, centre[1]);
  ortho.up.set(0, 0, -1);
  ortho.lookAt(centre[0], 0, centre[1]);
  ortho.updateMatrixWorld();
  const target = new THREE.RenderTarget(side, side, { type: THREE.FloatType, format: THREE.RGBAFormat, depthBuffer: true });
  const scene = new THREE.Scene();
  const mesh = new THREE.Mesh(view.mesh.geometry, view.heightProbe());
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  view.mesh.updateWorldMatrix(true, false);
  mesh.matrix.copy(view.mesh.matrixWorld);
  mesh.matrixWorld.copy(view.mesh.matrixWorld);
  scene.add(mesh);

  const toneMapping = renderer.toneMapping;
  const clearColor = renderer.getClearColor(new THREE.Color());
  const clearAlpha = renderer.getClearAlpha();
  const previousTarget = renderer.getRenderTarget();
  try {
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.setRenderTarget(target);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, ortho);
  } finally {
    renderer.setRenderTarget(previousTarget);
    renderer.setClearColor(clearColor, clearAlpha);
    renderer.toneMapping = toneMapping;
  }
  const pixels = (await renderer.readRenderTargetPixelsAsync(target, 0, 0, side, side)) as Float32Array;
  target.dispose();

  const points: number[] = [];
  const o = TERRAIN_HEIGHT_PROBE_OFFSET;
  for (let i = 0; i < side * side; i += 1) {
    if (pixels[i * 4 + 3]! < 0.5) continue;
    points.push(pixels[i * 4 + 1]! - o, pixels[i * 4]! - o, pixels[i * 4 + 2]! - o);
  }
  return { points: Float32Array.from(points), pixels: side * side, visual };
}
