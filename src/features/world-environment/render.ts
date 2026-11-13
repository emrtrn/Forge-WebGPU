// World Environment: render binding (plan phase 3 step 5). The night fill:
// Forge's independent ambient light in the moon colour that fades out by day
// (AuthoredEnvironment.applyNightAmbient). One light is kept while the World
// Environment is active, even at zero by day, so dawn and dusk change uniforms
// rather than shader variants; it goes when the override ends. The rest of the
// override (sun, sky, fog, clouds, Sky Light) is drawn by those bindings from
// `ctx.environment.override` (src/render/sync/environment.ts).

import { AmbientLight } from "three/webgpu";
import { defineRenderBinding } from "../../render/sync/renderBinding.ts";

export default defineRenderBinding({
  feature: "forge.worldEnvironment",
  create(ctx) {
    let fill: AmbientLight | null = null;
    const remove = (): void => {
      fill?.removeFromParent();
      fill?.dispose();
      fill = null;
    };
    return {
      sync() {
        const override = ctx.environment.override;
        if (!override) {
          remove();
          return;
        }
        if (!fill) {
          fill = new AmbientLight();
          fill.name = "World Environment Night Fill";
          ctx.scene.add(fill);
        }
        fill.color.setRGB(...override.nightAmbient.color);
        fill.intensity = override.nightAmbient.intensity;
      },
      dispose: remove,
    };
  },
});
