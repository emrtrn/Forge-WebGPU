// Ported from Forge WebGL engine/scene/layout.ts (Vec3, LayoutPhysicsAxisLocks, LayoutLandscape, LayoutWorldEnvironment) @ forge-webgl-final (04b5fb23); docs/PORT_LOG.md §2.
// TRANSITION (plan 2b, user decision 2026-11-11): Forge WebGL's old entity and
// component model, only the part ported subsystems read. Faz 6 replaces it with
// schema components (each subsystem binds to the world with its feature) and
// deletes src/engine/legacy. Kept inside src/engine (engine-legacy-stays-in-engine).
import type { LayoutWind } from "../environment/wind.ts";

export type Vec3 = [number, number, number];

export type LayoutPhysicsAxisLocks = [boolean, boolean, boolean];

/**
 * Placed Landscape actor (à la Unreal's Landscape): a level-owned heightfield
 * terrain. Faz 1 models only the placed actor + a reference to its height/layer
 * sidecar data (`dataRef`); sculpt/paint tools are later phases. Unlike the other
 * placed actors there is no `scale` field — terrain size is fixed by the sidecar's
 * `size` (vertex grid + spacing), not a transform scale. Optional fields read
 * defaults from `engine/scene/landscape.ts`.
 */
export interface LayoutLandscape {
  id: string;
  name?: string;
  hidden?: boolean;
  locked?: boolean;
  scaleLocked?: boolean;
  groupId?: string;
  nodeId?: string;
  parentId?: string;
  position: Vec3;
  /** Full Euler rotation (XYZ order) in degrees. */
  rotation?: Vec3;
  /** Public-root-relative `*.terrain.json` World Terrain definition. */
  dataRef: string;
  /** Landscape material asset id, unused until Faz 3 (layer paint + landscape material). */
  material?: string;
  /** Runtime collision. Absent means true (statically collidable, rebuilt on Save/Play). */
  collision?: boolean;
}

/**
 * Singleton environment actor: World Environment (WES) — time of day, season,
 * weather and the (K2) visual snow/wetness cover. It stores **level defaults**
 * only: the editor preview and the Play clock are runtime state and never write
 * here, and WES never writes the Sun/Sky/Fog/Cloud actors either — it overrides
 * their render objects. All fields are optional; absent reads the defaults in
 * `engine/environment/worldEnvironment.ts`, which also holds the normalizer the
 * loader and the save validator share.
 */
export interface LayoutWorldEnvironment {
  /** Display name in the Outliner. Absent means "World Environment". */
  name?: string;
  /** true turns WES off: the authored sky/fog/sun render exactly as without the actor. */
  hidden?: boolean;
  time?: {
    /** Level default hour, 0 ≤ h < 24. */
    hour?: number;
    /** Play: real minutes per 24 game hours; 0 stops the clock. */
    dayLengthMinutes?: number;
  };
  sunPath?: {
    /** Compass direction of the noon sun in degrees (0 = +Z). */
    azimuthDeg?: number;
    /** Noon sun elevation, 5..90 degrees. */
    noonElevationDeg?: number;
    sunriseHour?: number;
    sunsetHour?: number;
  };
  night?: {
    /** Intensity multiplier of the directional light while it is the moon. */
    moonIntensity?: number;
    /** 0..1 multiplier of the authored shadow strength at night; 0 disables moon shadows. */
    moonShadowStrength?: number;
    moonColor?: string;
    /** Visible full-moon diameter in degrees (art-directed, not an astronomical calendar). */
    moonAngularDiameterDeg?: number;
    /** Visible disc brightness, independent of direct light intensity; 0 hides it. */
    moonBrightness?: number;
    /** Independent soft glow outside the lunar disc (0..5; 0 disables). */
    moonHaloIntensity?: number;
    /** Halo extent beyond the limb, in moon radii (0.5..12). */
    moonHaloSize?: number;
    /** Live sky star radiance, 0 disables stars (0..5). */
    starBrightness?: number;
    /** Fraction of the deterministic star population (0..1). */
    starDensity?: number;
    /** Angular size multiplier (0.5..3). */
    starSize?: number;
    /** Lower bound of the night ambient as a fraction of the authored ambient. */
    ambientFloor?: number;
    /** Independent night fill in moonColor (absolute AmbientLight intensity); 0 disables it. Fades out by day. */
    ambientIntensity?: number;
  };
  season?: "spring" | "summer" | "autumn" | "winter";
  weather?: {
    preset?: "clear" | "cloudy" | "rain" | "snow" | "fog";
    /** 0..1 blend from `clear` to the preset. */
    intensity?: number;
  };
  /** K2 visual cover; never physics. */
  surface?: {
    snowCoverage?: number;
    wetness?: number;
    winterSnowCoverage?: number;
    snowColor?: string;
    snowSlopeStartDeg?: number;
    snowSlopeEndDeg?: number;
    /** World Y; null = no altitude limit. */
    snowMinAltitude?: number | null;
    snowAltitudeBlend?: number;
  };
  /** Faz 6 sway wind; absent falls back to `worldSettings.wind`. Weather and season scale it. */
  wind?: LayoutWind;
}
