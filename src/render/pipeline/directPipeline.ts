// The frame pipeline. Until the `RenderPipeline` step (plan phase 3, step 6:
// MRT scene pass -> GTAO / SSGI / SSR -> TRAA -> bloom / DoF -> tone mapping)
// a frame is the scene drawn straight to the canvas, sRGB output, with the
// world's output transform: no tone mapping (Forge WebGL's setting for a level
// without a sky), or ACES at the sky's exposure while a sky shows (Forge's
// `applySkyToneMapping`, phase 3 step 5, user decision 2026-11-13).

import { ACESFilmicToneMapping, NoToneMapping, SRGBColorSpace, type Camera, type Scene, type WebGPURenderer } from "three/webgpu";
import type { RenderOutput } from "../sync/renderBinding.ts";

export interface FramePipeline {
  render(scene: Scene, camera: Camera, output: RenderOutput): void;
  dispose(): void;
}

export function createDirectPipeline(renderer: WebGPURenderer): FramePipeline {
  renderer.toneMapping = NoToneMapping;
  renderer.outputColorSpace = SRGBColorSpace;
  return {
    render: (scene, camera, output) => {
      const toneMapping = output.toneMapping === "aces" ? ACESFilmicToneMapping : NoToneMapping;
      if (renderer.toneMapping !== toneMapping) renderer.toneMapping = toneMapping;
      renderer.toneMappingExposure = output.exposure;
      renderer.render(scene, camera);
    },
    dispose: () => undefined,
  };
}
