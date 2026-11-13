// Cloud Layer: render binding (plan phase 3 step 5). The level's singleton as
// the procedural cloud dome (src/render/materials/clouds.ts), centred on the
// camera and scaled to its far plane every frame; the drift clock runs on the
// world's frame time. While a World Environment is active its reading of the
// clouds is drawn instead (weather coverage, night and dusk colour).

import type { PerspectiveCamera } from "three/webgpu";
import { createCloudDome, type CloudDome } from "../../render/materials/clouds.ts";
import { defineRenderBinding } from "../../render/sync/renderBinding.ts";
import { CloudLayer, type CloudLayerData } from "./schema.ts";

export default defineRenderBinding({
  feature: "forge.cloudLayer",
  create(ctx) {
    let dome: CloudDome | null = null;
    return {
      sync(frame) {
        const data = (ctx.world.componentsOf(CloudLayer.name)[0]?.component as unknown as CloudLayerData | undefined) ?? null;
        if (data === null) {
          dome?.dispose();
          dome = null;
          return;
        }
        if (!dome) {
          dome = createCloudDome();
          ctx.scene.add(dome.mesh);
        }
        dome.apply(ctx.environment.override?.cloud ?? data);
        dome.advance(frame.dt);
        if (frame.camera) dome.follow(frame.camera as PerspectiveCamera);
      },
      dispose() {
        dome?.dispose();
        dome = null;
      },
    };
  },
});
