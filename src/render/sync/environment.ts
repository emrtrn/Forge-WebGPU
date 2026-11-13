// The World Environment override of one world (plan phase 3 step 5,
// architecture §4.9): Forge WebGL's AuthoredEnvironment.applyWorldEnvironment
// split along the render bindings. Once per frame, before the bindings sync,
// the live state (the `forge.worldEnvironment` service) and the authored
// singletons are resolved with Forge's three-free resolver
// (engine/environment/environmentResolve.ts) into `ctx.environment.override`;
// each binding draws its part of it (the sun light, sky, fog, clouds, Sky
// Light, night fill). The components are read, never written, so ending the
// override is drawing the components again: Forge's base / written value
// bookkeeping (NumberOverride, SunLightOverride) is not needed.
//
// The authored singletons are read by component name, like the default
// lighting reads lights: the render layer cannot import features.

import { resolveEnvironment, type ResolvedEnvironment } from "../../engine/environment/environmentResolve.ts";
import { WorldEnvironmentKey } from "../../engine/environment/worldEnvironmentRuntime.ts";
import type { ComponentEntry } from "../../core/index.ts";
import { DEFAULT_SUN, LIGHT_COMPONENTS } from "./defaultLighting.ts";
import type { RenderEnvironment, RenderLighting, RenderWorldView } from "./renderBinding.ts";

type Fields = Record<string, unknown>;

const first = (world: Pick<RenderWorldView, "componentsOf">, type: string): Fields | null =>
  (world.componentsOf(type)[0]?.component as unknown as Fields | undefined) ?? null;

/** The light the override drives: the first `atmosphereSun` directional light, or the default sun of a level without lights. */
function authoredSun(world: Pick<RenderWorldView, "componentsOf">): { color: string; intensity: number } | null {
  const marked = world.componentsOf("forge.directionalLight").find((entry: ComponentEntry) => (entry.component as unknown as Fields).atmosphereSun === true);
  if (marked) return { color: "#ffffff", intensity: Number((marked.component as unknown as Fields).intensity) };
  const authored = LIGHT_COMPONENTS.some((type) => world.componentsOf(type).length > 0);
  return authored ? null : { color: "#ffffff", intensity: DEFAULT_SUN.intensity };
}

export interface EnvironmentOverride {
  readonly environment: RenderEnvironment;
  /** Once per frame, before the bindings. */
  update(): void;
}

export function createEnvironmentOverride(world: RenderWorldView, lighting: RenderLighting): EnvironmentOverride {
  const environment: { override: ResolvedEnvironment | null } = { override: null };
  return {
    environment,
    update() {
      const runtime = world.services.get(WorldEnvironmentKey);
      const state = runtime?.controller.current() ?? null;
      const resolved = runtime?.environment ?? null;
      if (!state || !resolved) {
        environment.override = null;
        return;
      }
      const sky = first(world, "forge.skyAtmosphere");
      const fog = first(world, "forge.heightFog");
      const cloud = first(world, "forge.cloudLayer");
      environment.override = resolveEnvironment(
        {
          // The light's own colour multiplies the curve when applied (Forge).
          sun: authoredSun(world),
          sky: sky ? { turbidity: Number(sky.turbidity), hidden: false } : null,
          fog: fog ? ({ name: "", hidden: false, ...fog } as unknown as Parameters<typeof resolveEnvironment>[0]["fog"]) : null,
          cloud: cloud ? ({ name: "", hidden: false, ...cloud } as unknown as Parameters<typeof resolveEnvironment>[0]["cloud"]) : null,
        },
        resolved,
        state,
      );
      const [x, y, z] = environment.override.sunDirection;
      lighting.sunDirection.set(x, y, z).normalize();
    },
  };
}
