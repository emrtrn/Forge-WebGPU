// The frame pipeline. Until the `RenderPipeline` step (plan phase 3, step 6:
// MRT scene pass -> GTAO / SSGI / SSR -> TRAA -> bloom / DoF -> tone mapping)
// a frame is the scene drawn straight to the canvas, without tone mapping
// (Forge WebGL's setting for a level without a sky), sRGB output.

import { NoToneMapping, SRGBColorSpace, type Camera, type Scene, type WebGPURenderer } from "three/webgpu";

export interface FramePipeline {
  render(scene: Scene, camera: Camera): void;
  dispose(): void;
}

export function createDirectPipeline(renderer: WebGPURenderer): FramePipeline {
  renderer.toneMapping = NoToneMapping;
  renderer.outputColorSpace = SRGBColorSpace;
  return {
    render: (scene, camera) => renderer.render(scene, camera),
    dispose: () => undefined,
  };
}
