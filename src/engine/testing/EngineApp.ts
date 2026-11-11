// Ported from Forge WebGL engine/core/EngineApp.ts @ forge-webgl-final (04b5fb23); docs/PORT_LOG.md §2.
// TEST SCAFFOLD (plan 2b, user decision 2026-11-11): Forge WebGL's app loop, kept
// only so ported checks that tick subsystems through it stay word for word. The
// layer rule engine-testing-is-test-only keeps it out of product code. Deleted
// in Faz 6, when the subsystems bind to the world and their tests move to it.
import type { EngineUpdateContext, Subsystem } from "../subsystem.ts";
import { SubsystemRegistry } from "./SubsystemRegistry.ts";
import {
  SubsystemProfiler,
  type FrameProfileCapture,
  type SubsystemProfileSnapshot,
} from "../perf/subsystemProfiler.ts";
import type { FrameRegionDefinition } from "../perf/frameRegions.ts";

export class EngineApp {
  readonly subsystems = new SubsystemRegistry();

  private elapsedSeconds = 0;
  private frame = 0;
  private profiler: SubsystemProfiler | null = null;

  registerSubsystem(subsystem: Subsystem): Subsystem {
    return this.subsystems.register(subsystem);
  }

  /**
   * Turns on per-subsystem tick timing (idempotent). The `?debug` runtime enables
   * it for the overlay; the adaptive quality controller also enables it (with a
   * smaller window) so its bottleneck classifier has a passive CPU signal even
   * without `?debug` (plan §7.3) — the profiler is cheap (a few adds per record).
   * `now` is injectable for deterministic tests; it defaults to the registry
   * clock. `windowFrames` overrides the rolling-window size on first enable.
   */
  enableProfiling(now?: () => number, windowFrames?: number): SubsystemProfiler {
    if (!this.profiler) {
      this.profiler = windowFrames === undefined
        ? new SubsystemProfiler()
        : new SubsystemProfiler(windowFrames);
      this.subsystems.setProfiler(this.profiler, now);
    }
    return this.profiler;
  }

  /** Latest subsystem timing snapshot, or null when profiling is off. */
  getProfileSnapshot(): SubsystemProfileSnapshot | null {
    return this.profiler?.snapshot() ?? null;
  }

  /**
   * Whether anything is collecting timings — the single property read a shell
   * guards its own instrumentation with.
   *
   * The pattern this exists for: `const mark = app.profiling ? now() : 0;` …
   * `app.recordRegion(id, now() - mark)`. With profiling off that is one
   * property read and one no-op call per region — no clock, no closure, no
   * allocation — which is what lets the shell instrument its frame
   * unconditionally instead of behind a second debug branch of its own.
   */
  get profiling(): boolean {
    return this.profiler !== null;
  }

  /**
   * Declares where a shell-owned region sits in the frame. No-op while
   * profiling is off; safe to call again once it is on.
   */
  declareRegion(definition: FrameRegionDefinition): void {
    this.profiler?.declareRegion(definition);
  }

  /** Records one shell-owned region's cost for this frame (no-op when off). */
  recordRegion(id: string, ms: number): void {
    this.profiler?.record(id, ms);
  }

  /**
   * Records the whole frame — the denominator the regions are shares of, and
   * the number the `unmeasured` residual is computed against.
   */
  recordFrame(ms: number): void {
    this.profiler?.recordFrame(ms);
  }

  /**
   * Closes the profiler's frame. The owner of the frame loop calls this as the
   * loop's last act — {@link update} deliberately does not, because the
   * subsystem block is one region of the frame rather than the end of it.
   */
  endProfileFrame(): void {
    this.profiler?.endFrame();
  }

  /**
   * The frame in progress, region by region, or null when nothing is
   * profiling. Must be read before {@link endProfileFrame} clears the frame.
   */
  captureProfileFrame(): FrameProfileCapture | null {
    return this.profiler?.captureFrame() ?? null;
  }

  /** Scene seconds since the loop started — the clock a capture is placed on. */
  get sceneSeconds(): number {
    return this.elapsedSeconds;
  }

  async init(): Promise<void> {
    await this.subsystems.init();
  }

  async start(): Promise<void> {
    await this.subsystems.start();
  }

  update(deltaSeconds: number): EngineUpdateContext {
    this.elapsedSeconds += deltaSeconds;
    this.frame += 1;

    const context: EngineUpdateContext = {
      deltaSeconds,
      elapsedSeconds: this.elapsedSeconds,
      frame: this.frame,
    };
    this.subsystems.update(context);
    return context;
  }

  async dispose(): Promise<void> {
    await this.subsystems.dispose();
  }
}
