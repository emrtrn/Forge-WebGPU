// The sun light under the World Environment override (plan phase 3 step 5):
// Forge WebGL's SunLightOverride.apply (engine/render-three/
// authoredEnvironment.ts) for the light binding's sun and the default sun.

import { Color, Vector3, type DirectionalLight } from "three/webgpu";
import type { ResolvedEnvironment } from "../../engine/environment/environmentResolve.ts";

const lightWorld = new Vector3();
const aim = new Vector3();
const curve = new Color();

/**
 * By day the authored colour times the sun curve, at night the moon colour;
 * the intensity and the shadow strength (the moon's) as resolved; aimed along
 * the override's ground -> light direction by moving the target (the light
 * keeps its place, so the follow map and the cascades read the new
 * direction). The caller puts the authored values back when the override
 * ends: they live in the component.
 */
export function applySunOverride(light: DirectionalLight, authoredColor: string, override: NonNullable<ResolvedEnvironment["light"]>): void {
  const [r, g, b] = override.color;
  if (override.isMoon) light.color.setRGB(r, g, b);
  else light.color.set(authoredColor).multiply(curve.setRGB(r, g, b));
  light.intensity = override.intensity;
  light.shadow.intensity = override.shadowStrength;
  light.updateWorldMatrix(true, false);
  light.getWorldPosition(lightWorld);
  const [x, y, z] = override.direction;
  aim.set(-x, -y, -z).normalize().add(lightWorld);
  const target = light.target;
  if (target.parent) {
    target.parent.updateWorldMatrix(true, false);
    target.parent.worldToLocal(aim);
  }
  target.position.copy(aim);
  target.updateMatrixWorld();
}
