// Ported from Forge WebGL engine/environment/worldEnvironmentController.ts @ forge-webgl-final (04b5fb23); docs/PORT_LOG.md §2.
// Added here (plan phase 3 step 7): the timed hour transition (`transitionTo`,
// timeTransition.ts), which `advance` runs; Forge's methods are unchanged
// apart from `setHour` / `load` ending a running transition.
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
import {
  normalizeWorldEnvironment,
  resolveWorldEnvironment,
  SEASONS,
  WEATHER_PRESETS,
  type Season,
  type WeatherPreset,
} from "./worldEnvironment.ts";

/**
 * What gameplay may ask of the World Environment at runtime (WES v0.3 §5.6).
 * A game module (Layer 3) changes weather or time through this; the engine
 * never changes the weather on its own until K5.
 */
export interface WorldEnvironmentService {
  getState(): Readonly<WorldEnvironmentState>;
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
  setSeason(season: Season): void;
  /** K1: the change is immediate; timed transitions arrive with precipitation (K3). */
  setWeather(preset: WeatherPreset, intensity?: number): void;
  setSurface(partial: Partial<WorldEnvironmentState["surface"]>): void;
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
  private clock: WorldClock | null = null;
  private state: WorldEnvironmentState | null = null;
  private readonly listeners = new Set<(state: Readonly<WorldEnvironmentState>) => void>();
  private stateRevision = 0;
  private transition: TimeTransition | null = null;
  private settle: ((reached: boolean) => void) | null = null;

  /** Starts from a level's actor; null (no actor, or a hidden one) leaves no state. */
  load(actor: LayoutWorldEnvironment | null | undefined): void {
    this.endTransition(false);
    this.clock = null;
    this.state = null;
    this.stateRevision += 1;
    if (!actor) return;
    const env = resolveWorldEnvironment(normalizeWorldEnvironment(actor).environment);
    if (env.hidden) return;
    this.clock = new WorldClock(env.time.hour, env.time.dayLengthMinutes);
    this.state = stateFromDefaults(env);
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
    this.state = { ...this.state, season };
    this.emit();
  }

  setWeather(preset: WeatherPreset, intensity = 1): void {
    if (!this.state || !WEATHER_PRESETS.includes(preset) || !Number.isFinite(intensity)) return;
    this.state = { ...this.state, weather: { preset, intensity: Math.min(1, Math.max(0, intensity)) } };
    this.emit();
  }

  setSurface(partial: Partial<WorldEnvironmentState["surface"]>): void {
    if (!this.state) return;
    const surface = { ...this.state.surface };
    for (const key of ["snowCoverage", "wetness"] as const) {
      const value = partial[key];
      if (value !== undefined && Number.isFinite(value)) surface[key] = Math.min(1, Math.max(0, value));
    }
    this.state = { ...this.state, surface };
    this.emit();
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
