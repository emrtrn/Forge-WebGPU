// A level without lights gets Forge WebGL's default sun (src/scene/
// SceneRuntimeCore.ts `ensureDefaultSceneLights`): one white directional light
// of intensity 2 at rotation [-55, 35, 0] that casts shadows. Ambient light
// and the background come from Forge's world settings defaults (white ambient
// at intensity 0, which Forge leaves out; background #d7d7c7) until those
// fields move to their owning singletons (plan phase 3, step 5; decision 7).
// Light components replace the default in step 3; shadows are set up there too.

import { AmbientLight, Color, DirectionalLight, Vector3, type Scene } from "three/webgpu";
import { sunDirectionFromRotation } from "../../engine/environment/sunPath.ts";
import type { RenderLighting, RenderWorldView } from "./renderBinding.ts";

export const DEFAULT_SUN = { rotation: [-55, 35, 0] as [number, number, number], color: "#ffffff", intensity: 2, castShadow: true } as const;
export const DEFAULT_AMBIENT = { color: "#ffffff", intensity: 0 } as const;
export const DEFAULT_BACKGROUND = "#d7d7c7";

/** The light components a level can carry (phase 3, step 3). */
export const LIGHT_COMPONENTS = ["forge.directionalLight", "forge.pointLight", "forge.spotLight"] as const;

/** Distance of the default sun from the point it aims at; direction is what matters. */
const SUN_DISTANCE = 100;

export interface DefaultLighting extends RenderLighting {
  /** Adds or removes the defaults after actors came or went. */
  refresh(): void;
  dispose(): void;
}

export function createDefaultLighting(scene: Scene, world: Pick<RenderWorldView, "componentsOf">): DefaultLighting {
  const sunDirection = new Vector3(...sunDirectionFromRotation(DEFAULT_SUN.rotation)).normalize();
  const sun = new DirectionalLight(DEFAULT_SUN.color, DEFAULT_SUN.intensity);
  sun.name = "Default Sun";
  sun.position.copy(sunDirection).multiplyScalar(SUN_DISTANCE);
  sun.target.position.set(0, 0, 0);
  const ambient = new AmbientLight(DEFAULT_AMBIENT.color, DEFAULT_AMBIENT.intensity);
  ambient.name = "Default Ambient";
  scene.background = new Color(DEFAULT_BACKGROUND);

  let shown = false;
  const refresh = (): void => {
    const authored = LIGHT_COMPONENTS.some((type) => world.componentsOf(type).length > 0);
    if (authored === !shown) return;
    if (authored) {
      sun.removeFromParent();
      sun.target.removeFromParent();
      ambient.removeFromParent();
    } else {
      scene.add(sun, sun.target);
      // Forge adds no ambient light at intensity 0.
      if (ambient.intensity > 0) scene.add(ambient);
    }
    shown = !authored;
  };
  refresh();
  return {
    sunDirection,
    refresh,
    dispose() {
      sun.removeFromParent();
      sun.target.removeFromParent();
      ambient.removeFromParent();
      sun.dispose();
      ambient.dispose();
    },
  };
}
