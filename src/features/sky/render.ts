// Sky: render binding (plan phase 3 step 5; Forge WebGL's AuthoredEnvironment
// sky, reflection and world settings parts, rewritten on three/webgpu).
//
// - Sky Atmosphere: the TSL sky dome (src/render/materials/sky.ts) around the
//   camera, its sun from `ctx.lighting.sunDirection` (the sun light, or the
//   World Environment's true sun, which darkens the sky at night). While a sky
//   shows the world is presented with ACES at its exposure x 0.2 (Forge's
//   applySkyToneMapping; user decision 2026-11-13, until the pipeline's tone
//   mapping in step 6). The World Environment adds its haze, moon, stars and
//   night exposure.
// - Sky Light: the sky captured into a PMREM as `scene.environment` (image
//   based reflections and ambient bounce, at `intensity`), only with a sky.
//   Captured when the scattering or the sun changes; under the World
//   Environment by Forge's recapture policy (by how far the sun moved), with
//   the brightness bridged between captures. Its flat ambient light and the
//   background colour (seen where no sky is drawn); a level without a Sky
//   Light draws Forge's defaults (#d7d7c7, no ambient).

import { AmbientLight, Color } from "three/webgpu";
import { angleBetweenDeg, shouldRecapture, skyLightCompensation, type CaptureRecord } from "../../engine/environment/recapturePolicy.ts";
import { createCaptureSky, createSkyDome, type CaptureSky, type SkyDome, type SkyScattering } from "../../render/materials/sky.ts";
import { defineRenderBinding, type CapturedEnvironment } from "../../render/sync/renderBinding.ts";
import { SKY_LIGHT_ABSENT, SkyAtmosphere, SkyLight, skyToneMappingExposure, type SkyAtmosphereData, type SkyLightData } from "./schema.ts";

/** Cube face size of the capture (Forge's default; three floors a PMREM at 256). */
export const SKY_LIGHT_CAPTURE_SIZE = 256;
/** Without a World Environment, a sun that turned at least this far is captured again. */
const STATIC_RECAPTURE_ANGLE_DEG = 0.01;

const scatteringKey = (s: SkyScattering): string => `${s.rayleigh}|${s.turbidity}|${s.mie}|${s.mieDirectionalG}`;

export default defineRenderBinding({
  feature: "forge.sky",
  create(ctx) {
    let dome: SkyDome | null = null;
    let captureSky: CaptureSky | null = null;
    let captured: CapturedEnvironment | null = null;
    let capturedScattering = "";
    let capturedSun: [number, number, number] = [0, 1, 0];
    let capturedOverride = false;
    let lastCapture: CaptureRecord | null = null;
    let ambient: AmbientLight | null = null;
    const background = new Color(SKY_LIGHT_ABSENT.backgroundColor);
    const ambientColor = new Color();

    const releaseEnvironment = (): void => {
      if (ctx.scene.environment === captured?.texture) ctx.scene.environment = null;
      captured?.dispose();
      captured = null;
      lastCapture = null;
    };
    const removeAmbient = (): void => {
      ambient?.removeFromParent();
      ambient?.dispose();
      ambient = null;
    };

    return {
      sync(frame) {
        const sky = (ctx.world.componentsOf(SkyAtmosphere.name)[0]?.component as unknown as SkyAtmosphereData | undefined) ?? null;
        const light = (ctx.world.componentsOf(SkyLight.name)[0]?.component as unknown as SkyLightData | undefined) ?? null;
        const override = ctx.environment.override;
        const sun = ctx.lighting.sunDirection;

        background.set(light?.backgroundColor ?? SKY_LIGHT_ABSENT.backgroundColor);
        if (ctx.scene.background !== background) ctx.scene.background = background;

        // Flat ambient light: Forge adds none at intensity 0; the World Environment keeps a night floor of it.
        if (light && light.ambientIntensity > 0) {
          if (!ambient) {
            ambient = new AmbientLight();
            ambient.name = "Sky Light Ambient";
            ctx.scene.add(ambient);
          }
          ambient.color.copy(ambientColor.set(light.ambientColor));
          ambient.intensity = light.ambientIntensity * (override?.ambientMultiplier ?? 1);
        } else {
          removeAmbient();
        }

        if (!sky) {
          dome?.dispose();
          dome = null;
          ctx.output.toneMapping = "none";
          ctx.output.exposure = 1;
          releaseEnvironment();
          return;
        }
        const scattering: SkyScattering = {
          rayleigh: sky.rayleigh,
          turbidity: override?.skyTurbidity ?? sky.turbidity,
          mie: sky.mie,
          mieDirectionalG: sky.mieDirectionalG,
        };
        if (!dome) {
          dome = createSkyDome();
          ctx.scene.add(dome.mesh);
        }
        dome.apply(scattering, sun);
        dome.applyNight(override);
        if (frame.camera) dome.follow(frame.camera.position);
        ctx.output.toneMapping = "aces";
        ctx.output.exposure = skyToneMappingExposure(sky.exposure) * (override?.exposureMultiplier ?? 1);

        if (!light || light.intensity <= 0 || !ctx.capture) {
          releaseEnvironment();
          return;
        }
        const key = scatteringKey(scattering);
        const sunNow: [number, number, number] = [sun.x, sun.y, sun.z];
        let recapture = captured === null || key !== capturedScattering || (override !== null) !== capturedOverride;
        if (!recapture && override) {
          recapture = shouldRecapture(lastCapture, { sunDirection: override.sunDirection, sunElevationDeg: override.sunElevationDeg, captureKey: override.captureKey });
        } else if (!recapture) {
          recapture = angleBetweenDeg(capturedSun, sunNow) >= STATIC_RECAPTURE_ANGLE_DEG;
        }
        if (recapture) {
          captureSky ??= createCaptureSky();
          captureSky.apply(scattering, sun);
          const next = ctx.capture.capture(captureSky.scene, SKY_LIGHT_CAPTURE_SIZE);
          releaseEnvironment();
          captured = next;
          capturedScattering = key;
          capturedSun = sunNow;
          capturedOverride = override !== null;
          lastCapture = override ? { sunDirection: override.sunDirection, sunElevationDeg: override.sunElevationDeg, captureKey: override.captureKey } : null;
        }
        ctx.scene.environment = captured!.texture;
        // Between captures the World Environment's sun brightens or darkens the captured sky (Forge's compensateSkyLight).
        ctx.scene.environmentIntensity = override && lastCapture
          ? light.intensity * skyLightCompensation(lastCapture.sunElevationDeg, override.sunElevationDeg)
          : light.intensity;
      },
      dispose() {
        dome?.dispose();
        dome = null;
        captureSky?.dispose();
        captureSky = null;
        releaseEnvironment();
        removeAmbient();
        ctx.output.toneMapping = "none";
        ctx.output.exposure = 1;
      },
    };
  },
});
