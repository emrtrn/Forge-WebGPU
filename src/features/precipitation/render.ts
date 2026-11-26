// Precipitation: render binding (plan phase W1; under a roof it stops, W3). Draws the live weather's rain
// and snow (precipitationOf: both at once while one turns into the other) in
// the late layer. The drawings exist while the level has a World Environment,
// so the first drop compiles nothing: the pipeline prepares them when they
// appear (renderPipeline.ts). The settings are the World Environment's
// `precipitation` group, read by name (a binding imports no other feature).

import { Color, Vector3 } from "three/webgpu";
import {
  advanceOffset, leanVelocity, particleCount, precipitationVelocity, volumePhase, type PrecipitationSettings, type Vec3Tuple,
} from "../../engine/environment/precipitationMotion.ts";
import { WorldEnvironmentKey } from "../../engine/environment/worldEnvironmentRuntime.ts";
import { resolveWorldWind } from "../../engine/environment/worldWind.ts";
import { createPrecipitation, PRECIPITATION_VOLUMES, type PrecipitationDrawing } from "../../render/materials/precipitation.ts";
import { defineRenderBinding } from "../../render/sync/renderBinding.ts";

/** Metres over which a particle fades into a surface. */
const SOFTNESS = 0.2;
/** The shader's clock wraps here (seconds): far beyond a flake's swing, small enough for float32. */
const CLOCK_WRAP = 3600;
/** The air's colour where the level has no fog: an overcast day's, dimmed by the hour. */
const DAY_AIR: Vec3Tuple = [0.5, 0.55, 0.6];
/** Flakes scatter more light than drops let through. */
const BRIGHTNESS = { rain: 2, snow: 2.6 } as const;
/** Metres a flake sways at flutter 1. */
const FLUTTER = 0.22;

interface Volume { readonly drawing: PrecipitationDrawing; readonly offset: Vec3Tuple }

export default defineRenderBinding({
  feature: "forge.precipitation",
  create(ctx) {
    const late = ctx.late;
    let volumes: Volume[] = [];
    let seconds = 0;
    let previous: Vec3Tuple | null = null;
    const lean: Vec3Tuple = [0, 0, 0];
    const eye = new Vector3();
    const scratch = new Color();

    const remove = (): void => {
      for (const { drawing } of volumes) drawing.dispose();
      volumes = [];
      previous = null;
    };
    /** Linear colour of the air now: what a drop or a flake shows. */
    const air = (): Vec3Tuple => {
      const override = ctx.environment.override;
      if (override?.fog) {
        scratch.set(override.fog.color);
        return [scratch.r, scratch.g, scratch.b];
      }
      const day = override?.ambientMultiplier ?? 1;
      const night = override?.nightAmbient;
      return DAY_AIR.map((value, i) => value * day + (night ? night.color[i]! * night.intensity * 0.05 : 0)) as Vec3Tuple;
    };

    return {
      sync(frame) {
        const runtime = ctx.world.services.get(WorldEnvironmentKey);
        const state = runtime?.controller.current() ?? null;
        const settings = (ctx.world.componentsOf("forge.worldEnvironment")[0]?.component as { precipitation?: PrecipitationSettings } | undefined)?.precipitation;
        if (!late || !runtime || !state || !settings) {
          if (volumes.length > 0) remove();
          return;
        }
        if (volumes.length === 0) {
          const cover = ctx.precipitationCover;
          volumes = PRECIPITATION_VOLUMES.map((volume) => ({
            drawing: createPrecipitation(volume, late.visibility(SOFTNESS), cover ? (position) => cover.coverAt(position) : undefined),
            offset: [0, 0, 0],
          }));
          late.root.add(...volumes.map(({ drawing }) => drawing.mesh));
        }
        const dt = Number.isFinite(frame.dt) && frame.dt > 0 ? frame.dt : 0;
        seconds = (seconds + dt) % CLOCK_WRAP;
        const falling = runtime.controller.precipitation();
        if (!frame.camera || (falling.rain <= 0 && falling.snow <= 0)) {
          for (const { drawing } of volumes) drawing.hide();
          previous = null;
          return;
        }
        frame.camera.getWorldPosition(eye);
        const camera: Vec3Tuple = [eye.x, eye.y, eye.z];
        // A pause keeps the last lean: the streaks stand as they were.
        if (dt > 0 || previous === null) leanVelocity(previous, camera, dt, lean);
        previous = camera;
        const wind = resolveWorldWind(ctx.world);
        const density = ctx.quality().particleDensity;
        const base = air();
        for (const { drawing, offset } of volumes) {
          const { kind, size, count } = drawing.volume;
          const strength = falling[kind];
          if (strength <= 0) { drawing.hide(); continue; }
          const own = settings[kind];
          const velocity = precipitationVelocity(kind, own.speed, settings.windInfluence, wind, seconds);
          advanceOffset(offset, velocity, size, dt);
          drawing.update({
            camera: frame.camera,
            cameraPosition: camera,
            phase: volumePhase(offset, camera, size, [0, 0, 0]),
            velocity: [velocity[0] - lean[0], velocity[1] - lean[1], velocity[2] - lean[2]],
            count: particleCount(count, strength, own.amount, density),
            opacity: own.opacity,
            scale: kind === "rain" ? settings.rain.length : settings.snow.size,
            flutter: kind === "snow" ? settings.snow.flutter * FLUTTER : 0,
            seconds,
            color: base.map((value) => value * BRIGHTNESS[kind] * settings.brightness) as Vec3Tuple,
          });
        }
      },
      dispose: remove,
    };
  },
});
