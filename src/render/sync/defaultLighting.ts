// A level without lights gets Forge WebGL's default sun (src/scene/
// SceneRuntimeCore.ts `ensureDefaultSceneLights`): one white directional light
// of intensity 2 at rotation [-55, 35, 0] that casts shadows. A level with any
// light component (forge.light) draws its own lights instead. The default sun
// casts its shadow through the camera-following map (sunShadow.ts), sized by
// the quality profile; a World Environment drives it like an authored sun
// (Forge inserted the default sun into the level, so the clock aimed it).
//
// Ambient light and the background belong to the Sky Light (`forge.skyLight`,
// phase 3 step 5); a world starts with Forge's default background until a
// binding sets one.

import { Color, DirectionalLight, Vector3, type Camera, type Scene } from "three/webgpu";
import type { ResolvedEnvironment } from "../../engine/environment/environmentResolve.ts";
import { sunDirectionFromRotation } from "../../engine/environment/sunPath.ts";
import type { QualitySettings } from "../../engine/perf/qualityProfiles.ts";
import type { RenderLighting, RenderWorldView } from "./renderBinding.ts";
import { configureShadow, FOLLOW_SHADOW_HALF_EXTENT, updateFollowShadow } from "./sunShadow.ts";
import { applySunOverride } from "./sunOverride.ts";

export const DEFAULT_SUN = { rotation: [-55, 35, 0] as [number, number, number], color: "#ffffff", intensity: 2, castShadow: true } as const;
/** Forge's world settings background (`DEFAULT_SCENE_BACKGROUND_COLOR`), drawn without a Sky Light. */
export const DEFAULT_BACKGROUND = "#d7d7c7";

/** The light components a level can carry (phase 3, step 3). */
export const LIGHT_COMPONENTS = ["forge.directionalLight", "forge.pointLight", "forge.spotLight"] as const;

/** Distance of the default sun from the point it aims at; direction is what matters. */
const SUN_DISTANCE = 100;

export interface DefaultLighting extends RenderLighting {
  /** Adds or removes the defaults after actors came or went. */
  refresh(): void;
  /** Once per frame: the World Environment's reading of the sun, then its shadow follows the camera. */
  sync(camera: Camera | null, quality: QualitySettings, override: ResolvedEnvironment | null): void;
  dispose(): void;
}

export function createDefaultLighting(scene: Scene, world: Pick<RenderWorldView, "componentsOf">): DefaultLighting {
  const defaultDirection = new Vector3(...sunDirectionFromRotation(DEFAULT_SUN.rotation)).normalize();
  const sunDirection = defaultDirection.clone();
  const forward = new Vector3();
  const sun = new DirectionalLight(DEFAULT_SUN.color, DEFAULT_SUN.intensity);
  sun.name = "Default Sun";
  scene.background = new Color(DEFAULT_BACKGROUND);

  let shown = false;
  const refresh = (): void => {
    const authored = LIGHT_COMPONENTS.some((type) => world.componentsOf(type).length > 0);
    if (authored === !shown) return;
    if (authored) {
      sun.removeFromParent();
      sun.target.removeFromParent();
    } else {
      sunDirection.copy(defaultDirection);
      scene.add(sun, sun.target);
    }
    shown = !authored;
  };
  refresh();
  return {
    sunDirection,
    refresh,
    sync(camera, quality, override) {
      if (!shown) return;
      // The authored state each frame; the override and the follow map move it from there.
      sun.position.copy(defaultDirection).multiplyScalar(SUN_DISTANCE);
      sun.target.position.set(0, 0, 0);
      sun.updateMatrixWorld();
      sun.target.updateMatrixWorld();
      if (override?.light) {
        applySunOverride(sun, DEFAULT_SUN.color, override.light);
      } else {
        sun.color.set(DEFAULT_SUN.color);
        sun.intensity = DEFAULT_SUN.intensity;
        sun.shadow.intensity = 1;
        if (!override) sunDirection.copy(defaultDirection);
      }
      sun.castShadow = DEFAULT_SUN.castShadow && quality.shadowsEnabled;
      if (!sun.castShadow || camera === null) return;
      configureShadow(sun, quality.shadowMapSize);
      camera.getWorldDirection(forward);
      updateFollowShadow(sun, camera.position, forward, FOLLOW_SHADOW_HALF_EXTENT * quality.shadowDistanceScale);
    },
    dispose() {
      sun.removeFromParent();
      sun.target.removeFromParent();
      sun.dispose();
    },
  };
}
