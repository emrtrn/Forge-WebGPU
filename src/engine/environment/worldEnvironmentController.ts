// Ported from Forge WebGL engine/environment/worldEnvironmentController.ts @ forge-webgl-final (04b5fb23); docs/PORT_LOG.md §2.
// Added here (plan phase 3 step 7): the timed hour transition (`transitionTo`,
// timeTransition.ts), which `advance` runs; Forge's methods are unchanged
// apart from `setHour` / `load` ending a running transition. The timed season
// (vegetation plan PG2) and weather (plan phase W2, weatherTransition.ts)
// changes follow the same rules. With `weatherDrivesSurface` (plan phase W5)
// the live precipitation drives the surface (surfaceCondition.ts); without it
// 5a's independent targets and rates run exactly as before.
import type { LayoutWorldEnvironment } from "../legacy/layout.ts";
import type { WorldEnvironmentState } from "./environmentResolve.ts";
import { stateFromDefaults } from "./environmentResolve.ts";
import {
  advanceTimeTransition,
  startTimeTransition,
  transitionDone,
  transitionHour,
  type TimeTransition,
  type TimeTransitionRequest,
} from "./timeTransition.ts";
import { WorldClock } from "./worldClock.ts";
import { livePrecipitation } from "./precipitation.ts";
import { advanceWeatherProgress, startWeatherTransition, WEATHER_SHARES, type WeatherMix, type WeatherTransitionRequest } from "./weatherTransition.ts";
import { advanceSurfaceCondition, SURFACE_CONDITION_RATES, type Precipitation, type SurfaceCondition, type SurfaceConditionRates } from "./surfaceCondition.ts";
import { advanceSurface, type SurfaceAmount } from "./surfaceAccumulation.ts";
import {
  normalizeWorldEnvironment,
  resolveWorldEnvironment,
  SEASONS,
  WEATHER_PRESETS,
  type Season,
  type WeatherPreset,
} from "./worldEnvironment.ts";

/** A saved mix as the live one holds it: its positive shares only (a save lists all four). */
function sharesOf(mix: WeatherMix): WeatherMix {
  const out: Partial<Record<(typeof WEATHER_SHARES)[number], number>> = {};
  for (const share of WEATHER_SHARES) {
    const value = mix[share];
    if (value !== undefined && Number.isFinite(value) && value > 0) out[share] = Math.min(1, value);
  }
  return out;
}

/** The deepest snow any level may have, metres (plan phase W, HK4). */
export const SNOW_DEPTH_LIMIT = 2;

/** A level's surface settings the controller reads (the World Environment's `surface` group). */
export type SurfaceSettings = Partial<SurfaceConditionRates> & { readonly weatherDrivesSurface?: boolean };

const RATE_KEYS = Object.keys(SURFACE_CONDITION_RATES) as (keyof SurfaceConditionRates)[];

/** The level's rates over the defaults (a missing or invalid one is the default; the deepest snow at most the limit). */
function surfaceRatesOf(settings: SurfaceSettings): SurfaceConditionRates {
  const rates = { ...SURFACE_CONDITION_RATES };
  for (const key of RATE_KEYS) {
    const value = settings[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) rates[key] = value;
  }
  rates.snowMaxDepth = Math.min(SNOW_DEPTH_LIMIT, rates.snowMaxDepth);
  return rates;
}

/**
 * What gameplay may ask of the World Environment at runtime (WES v0.3 §5.6).
 * A game module (Layer 3) changes weather or time through this; the engine
 * never changes the weather on its own until K5.
 */
export interface WorldEnvironmentService {
  /** The live state; null when the level has no (visible) World Environment. */
  current(): Readonly<WorldEnvironmentState> | null;
  /** The live state; throws where `current` is null. */
  getState(): Readonly<WorldEnvironmentState>;
  /** What falls now: rain and snow, 0..1 each (none without a World Environment). */
  precipitation(): Readonly<Precipitation>;
  /** Jumps to the hour at once; ends a running transition (its promise resolves false). */
  setHour(hour: number): void;
  /**
   * Runs the hour forward to `hour` over `seconds` of simulation time, eased
   * in and out, then the hour stands still again (the event-based time of
   * day, plan phase 3 decision 8). An earlier hour crosses midnight; no
   * seconds jumps at once. Resolves true when the transition reached its
   * hour, false when a new transition, `setHour` or the level ending cut it
   * short, or when the level has no World Environment.
   */
  transitionTo(request: TimeTransitionRequest): Promise<boolean>;
  /** A timed transition is running. */
  readonly transitioning: boolean;
  /** Jumps to the season at once; ends a running season change (its promise resolves false). */
  setSeason(season: Season): void;
  /**
   * Moves to `season` over `seconds` of simulation time (vegetation plan
   * §6.9: plants' leaves and colours follow the progress). Resolves true when
   * reached, false when cut short. No seconds, or the same season, sets it at once.
   */
  transitionSeason(request: { season: Season; seconds: number }): Promise<boolean>;
  /** Sets the weather at once; ends a running weather change (its promise resolves false). */
  setWeather(preset: WeatherPreset, intensity?: number): void;
  /**
   * Moves to the weather (`intensity` 0..1, default 1) over `seconds` of
   * simulation time (plan phase W2): fog, clouds, sun, wind and precipitation
   * blend from where they are, eased in and out; rain and snow both fall
   * while one turns into the other. Resolves true when reached, false when a
   * new weather change, `setWeather` or the level ending cut it short, or
   * when the level has no World Environment. No seconds, or the weather
   * already shown, sets it at once.
   */
  transitionWeather(request: WeatherTransitionRequest): Promise<boolean>;
  /** Sets amounts at once; snow coverage and wetness become their own targets. `snowDepth` is in metres. */
  setSurface(partial: Partial<SurfaceCondition>): void;
  /** Changes the target; accumulation/melt/wetting/drying use simulation seconds. Unused while the weather drives the surface. */
  setSurfaceTarget(partial: Partial<SurfaceAmount>): void;
  getSurfaceTarget(): Readonly<SurfaceAmount>;
  onChanged(listener: (state: Readonly<WorldEnvironmentState>) => void): () => void;
}

/**
 * The live World Environment of one level: the clock plus the season, weather
 * and surface state, started from the level defaults. Three-free and
 * shell-agnostic: the Play capability drives it with simulation time, and node
 * tests drive it directly. `revision` changes with every change of state, so a
 * renderer can skip unchanged frames.
 */
export class WorldEnvironmentController implements WorldEnvironmentService {
  private surfaceTarget: SurfaceAmount = { snowCoverage: 0, wetness: 0 };
  private surfaceRates: SurfaceConditionRates = { ...SURFACE_CONDITION_RATES };
  private snowSpread = 1;
  private drivenByWeather = false;
  private clock: WorldClock | null = null;
  private state: WorldEnvironmentState | null = null;
  private readonly listeners = new Set<(state: Readonly<WorldEnvironmentState>) => void>();
  private stateRevision = 0;
  private transition: TimeTransition | null = null;
  private settle: ((reached: boolean) => void) | null = null;
  private settleSeason: ((reached: boolean) => void) | null = null;
  private settleWeather: ((reached: boolean) => void) | null = null;

  /** Starts from a level's actor; null (no actor, or a hidden one) leaves no state. */
  load(actor: LayoutWorldEnvironment | null | undefined, surface: SurfaceSettings = SURFACE_CONDITION_RATES): void {
    this.endTransition(false);
    this.endSeason(false);
    this.endWeather(false);
    this.clock = null;
    this.state = null;
    this.stateRevision += 1;
    if (!actor) return;
    const env = resolveWorldEnvironment(normalizeWorldEnvironment(actor).environment);
    if (env.hidden) return;
    this.clock = new WorldClock(env.time.hour, env.time.dayLengthMinutes);
    this.state = stateFromDefaults(env);
    this.surfaceTarget = { snowCoverage: this.state.surface.snowCoverage, wetness: this.state.surface.wetness };
    this.surfaceRates = surfaceRatesOf(surface);
    this.snowSpread = env.surface.snowSpread ?? 1;
    this.drivenByWeather = surface.weatherDrivesSurface === true;
    this.emit();
  }

  clear(): void {
    this.load(null);
  }

  /** Whether the level has an active World Environment. */
  get active(): boolean {
    return this.state !== null;
  }

  /** The clock is running (an active World Environment with a day length). */
  get running(): boolean {
    return this.clock !== null && this.clock.dayLength > 0;
  }

  get transitioning(): boolean {
    return this.transition !== null;
  }

  /** The level lets the weather drive the surface (`surface.weatherDrivesSurface`, plan phase W5). */
  get weatherDrivesSurface(): boolean {
    return this.state !== null && this.drivenByWeather;
  }

  /** Turns the weather link on or off for this run (measurement, tests); the level's setting is read again on load. */
  setWeatherDrivesSurface(on: boolean): void {
    if (!this.state || this.drivenByWeather === on) return;
    this.drivenByWeather = on;
    this.emit();
  }

  get revision(): number {
    return this.stateRevision;
  }

  /** The live state, or null without an active World Environment. */
  current(): Readonly<WorldEnvironmentState> | null {
    return this.state;
  }

  /**
   * Advances by simulation seconds (already paused/scaled by `TimeControl`).
   * A running transition moves the hour; the clock's own day length waits
   * until it is done.
   */
  advance(simulationSeconds: number): void {
    if (!Number.isFinite(simulationSeconds) || simulationSeconds <= 0) return;
    // What fell at the start of the step: with the end's, the surface sees the step's mean (a weather change moves it).
    const fellBefore = this.drivenByWeather ? livePrecipitation(this.state) : null;
    if (this.state && this.state.seasonProgress !== undefined && this.state.seasonProgress < 1) {
      const seconds = this.state.seasonSeconds ?? 0;
      const progress = seconds > 0 ? Math.min(1, this.state.seasonProgress + simulationSeconds / seconds) : 1;
      this.state = progress >= 1 ? this.arrived(this.state) : { ...this.state, seasonProgress: progress };
      this.emit();
      if (progress >= 1) this.endSeason(true);
    }
    if (this.state && this.state.weatherProgress !== undefined && this.state.weatherProgress < 1) {
      const progress = advanceWeatherProgress(this.state.weatherProgress, this.state.weatherSeconds ?? 0, simulationSeconds);
      this.state = progress >= 1 ? this.weatherArrived(this.state) : { ...this.state, weatherProgress: progress };
      this.emit();
      if (progress >= 1) this.endWeather(true);
    }
    if (this.state && fellBefore) {
      const fellAfter = livePrecipitation(this.state);
      const fell = { rain: (fellBefore.rain + fellAfter.rain) / 2, snow: (fellBefore.snow + fellAfter.snow) / 2 };
      const surface = advanceSurfaceCondition(this.state.surface, fell, this.surfaceRates, simulationSeconds, this.snowSpread);
      if (surface !== this.state.surface) {
        this.state = { ...this.state, surface: { ...surface } };
        this.emit();
      }
    } else if (this.state) {
      const surface = advanceSurface(this.state.surface, this.surfaceTarget, this.surfaceRates, simulationSeconds);
      if (surface.snowCoverage !== this.state.surface.snowCoverage || surface.wetness !== this.state.surface.wetness) {
        this.state = { ...this.state, surface: { ...this.state.surface, ...surface } };
        this.emit();
      }
    }
    if (this.transition && this.clock && this.state) {
      this.transition = advanceTimeTransition(this.transition, simulationSeconds);
      const hour = transitionHour(this.transition);
      const done = transitionDone(this.transition);
      if (hour !== this.state.hour) {
        this.clock.setHour(hour);
        this.state = { ...this.state, hour: this.clock.hour };
        this.emit();
      }
      if (done) this.endTransition(true);
      return;
    }
    if (!this.clock || !this.state || !(this.clock.dayLength > 0)) return;
    const before = this.clock.hour;
    this.clock.advance(simulationSeconds);
    const hour = this.clock.hour;
    if (hour === before) return;
    this.state = { ...this.state, hour };
    this.emit();
  }

  getState(): Readonly<WorldEnvironmentState> {
    if (!this.state) throw new Error("world environment: the level has no active World Environment");
    return this.state;
  }

  precipitation(): Readonly<Precipitation> {
    return livePrecipitation(this.state);
  }

  setHour(hour: number): void {
    if (!this.clock || !this.state || !Number.isFinite(hour)) return;
    this.endTransition(false);
    this.clock.setHour(hour);
    this.state = { ...this.state, hour: this.clock.hour };
    this.emit();
  }

  transitionTo(request: TimeTransitionRequest): Promise<boolean> {
    if (!this.clock || !this.state || !Number.isFinite(request.hour)) return Promise.resolve(false);
    const next = startTimeTransition(this.state.hour, request);
    if (!next) {
      // No time or no distance: the hour is set at once, and that is reaching it.
      this.setHour(request.hour);
      return Promise.resolve(true);
    }
    this.endTransition(false);
    this.transition = next;
    return new Promise((resolve) => {
      this.settle = resolve;
    });
  }

  setSeason(season: Season): void {
    if (!this.state || !SEASONS.includes(season)) return;
    this.endSeason(false);
    this.state = this.arrived({ ...this.state, season });
    this.emit();
  }

  transitionSeason(request: { season: Season; seconds: number }): Promise<boolean> {
    if (!this.state || !SEASONS.includes(request.season)) return Promise.resolve(false);
    if (!(Number.isFinite(request.seconds) && request.seconds > 0) || (request.season === this.state.season && this.state.seasonProgress === undefined)) {
      this.setSeason(request.season);
      return Promise.resolve(true);
    }
    this.endSeason(false);
    this.state = { ...this.state, seasonFrom: this.state.season, season: request.season, seasonProgress: 0, seasonSeconds: request.seconds };
    this.emit();
    return new Promise((resolve) => {
      this.settleSeason = resolve;
    });
  }

  /** The state with its season reached (no change running). */
  private arrived(state: WorldEnvironmentState): WorldEnvironmentState {
    const { seasonFrom: _from, seasonProgress: _progress, seasonSeconds: _seconds, ...rest } = state;
    return rest;
  }

  private endSeason(reached: boolean): void {
    const settle = this.settleSeason;
    this.settleSeason = null;
    settle?.(reached);
  }

  setWeather(preset: WeatherPreset, intensity = 1): void {
    if (!this.state || !WEATHER_PRESETS.includes(preset) || !Number.isFinite(intensity)) return;
    this.endWeather(false);
    this.state = { ...this.weatherArrived(this.state), weather: { preset, intensity: Math.min(1, Math.max(0, intensity)) } };
    this.emit();
  }

  transitionWeather(request: WeatherTransitionRequest): Promise<boolean> {
    const intensity = request.intensity ?? 1;
    if (!this.state || !WEATHER_PRESETS.includes(request.preset) || !Number.isFinite(intensity)) return Promise.resolve(false);
    const weather = { preset: request.preset, intensity: Math.min(1, Math.max(0, intensity)) };
    const next = startWeatherTransition(this.state, weather, request.seconds);
    if (!next) {
      // No time, or already there: the weather is set at once, and that is reaching it.
      this.setWeather(weather.preset, weather.intensity);
      return Promise.resolve(true);
    }
    this.endWeather(false);
    this.state = { ...this.state, ...next, weather };
    this.emit();
    return new Promise((resolve) => {
      this.settleWeather = resolve;
    });
  }

  /** The state with its weather reached (no change running). */
  private weatherArrived(state: WorldEnvironmentState): WorldEnvironmentState {
    const { weatherFrom: _from, weatherProgress: _progress, weatherSeconds: _seconds, ...rest } = state;
    return rest;
  }

  private endWeather(reached: boolean): void {
    const settle = this.settleWeather;
    this.settleWeather = null;
    settle?.(reached);
  }

  setSurface(partial: Partial<SurfaceCondition>): void {
    if (!this.state) return;
    const surface = { ...this.state.surface };
    for (const key of ["snowCoverage", "wetness", "puddleFill", "snowDepth"] as const) {
      const value = partial[key];
      if (value !== undefined && Number.isFinite(value)) surface[key] = Math.min(key === "snowDepth" ? SNOW_DEPTH_LIMIT : 1, Math.max(0, value));
    }
    this.state = { ...this.state, surface };
    this.surfaceTarget = { snowCoverage: surface.snowCoverage, wetness: surface.wetness };
    this.emit();
  }

  setSurfaceTarget(partial: Partial<SurfaceAmount>): void {
    if (!this.state) return;
    for (const key of ["snowCoverage", "wetness"] as const) {
      const value = partial[key];
      if (value !== undefined && Number.isFinite(value)) this.surfaceTarget[key] = Math.min(1, Math.max(0, value));
    }
    this.emit();
  }

  getSurfaceTarget(): Readonly<SurfaceAmount> { return { ...this.surfaceTarget }; }

  /** A7: restore the common WES state; no elapsed time or historical effects. */
  restore(state: Omit<WorldEnvironmentState, "surface"> & { surface: Partial<SurfaceCondition>; surfaceTarget: SurfaceAmount }): void {
    this.setHour(state.hour);
    this.setSeason(state.season);
    // A season change saved mid-way goes on from where it was (no history replayed).
    if (this.state && state.seasonFrom !== undefined && (state.seasonProgress ?? 1) < 1 && (state.seasonSeconds ?? 0) > 0) {
      this.state = { ...this.state, seasonFrom: state.seasonFrom, seasonProgress: state.seasonProgress!, seasonSeconds: state.seasonSeconds! };
      this.emit();
    }
    this.setWeather(state.weather.preset, state.weather.intensity);
    // So does a weather change, from the mix it started at.
    if (this.state && state.weatherFrom !== undefined && (state.weatherProgress ?? 1) < 1 && (state.weatherSeconds ?? 0) > 0) {
      this.state = { ...this.state, weatherFrom: sharesOf(state.weatherFrom), weatherProgress: state.weatherProgress!, weatherSeconds: state.weatherSeconds! };
      this.emit();
    }
    this.setSurface(state.surface);
    this.setSurfaceTarget(state.surfaceTarget);
  }

  onChanged(listener: (state: Readonly<WorldEnvironmentState>) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private endTransition(reached: boolean): void {
    const settle = this.settle;
    this.transition = null;
    this.settle = null;
    settle?.(reached);
  }

  private emit(): void {
    this.stateRevision += 1;
    if (!this.state) return;
    for (const listener of this.listeners) listener(this.state);
  }
}
