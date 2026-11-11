// Ported from Forge WebGL engine/audio/audioSubsystem.ts (types and pure helpers) @ forge-webgl-final (04b5fb23); docs/PORT_LOG.md §2.
// The audio contract the engine layer needs without Web Audio: play options and
// requests, the playback handle, the bus interface and spatial attenuation.
// The Web Audio implementation is src/runtime/audio/audioSubsystem.ts.

import type { AudioBusId } from "./audioBus.ts";

export type AudioVec3 = readonly [number, number, number];

export interface AudioPlayOptions {
  volume?: number;
  loop?: boolean;
  spatial?: boolean;
  pitch?: number;
  /** Emitter world position; routes a spatial sound through a `PannerNode`. */
  position?: AudioVec3;
  /** Distance at which spatial attenuation begins. Default {@link DEFAULT_SPATIAL_ATTENUATION}. */
  refDistance?: number;
  /** Distance past which a spatial sound no longer attenuates. */
  maxDistance?: number;
  /** Spatial attenuation rolloff factor (higher = quieter sooner). */
  rolloff?: number;
  /** Mix bus this play routes through. Defaults to {@link DEFAULT_AUDIO_BUS}. */
  bus?: AudioBusId;
  /**
   * Stream this clip through a media element instead of decoding it into memory.
   *
   * For the handful of long sounds — music tracks, the ambience bed — where the
   * decoded-buffer path is the wrong shape. `decodeAudioData` expands a file to
   * raw float samples and the cache never evicts, so one two-minute stereo track
   * costs about 44 MiB of RAM for as long as the tab lives (120 s × 48 kHz × 2
   * channels × 4 bytes) whether or not it is still playing. Twenty of them is
   * most of a gigabyte. A media element holds a small rolling buffer instead,
   * and starts sounding before the whole file has arrived — which also removes
   * the fetch-and-decode wait that would otherwise land in the middle of a
   * crossfade, on the incoming track.
   *
   * The trade is precision: a media element starts when it is ready rather than
   * on a scheduled sample, so this is wrong for one-shots that must land on a
   * frame. Every short sound should stay on the buffer path.
   */
  stream?: boolean;
}

/** Resolved sphere-attenuation parameters for a spatial `PannerNode`. */
export interface SpatialPannerConfig {
  readonly refDistance: number;
  readonly maxDistance: number;
  readonly rolloff: number;
}

/** Default sphere attenuation: full volume within 4 units, silent past 60. */
export const DEFAULT_SPATIAL_ATTENUATION: SpatialPannerConfig = {
  refDistance: 4,
  maxDistance: 60,
  rolloff: 1,
};

function positiveOr(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * Resolves a spatial play's attenuation parameters, clamping to positive values
 * and guaranteeing `maxDistance > refDistance` (an inverted/equal pair would make
 * the PannerNode silent or NaN). Pure: unit-tested without a Web Audio context.
 */
export function resolveSpatialPannerConfig(options: AudioPlayOptions): SpatialPannerConfig {
  const refDistance = positiveOr(options.refDistance, DEFAULT_SPATIAL_ATTENUATION.refDistance);
  const maxCandidate = positiveOr(options.maxDistance, DEFAULT_SPATIAL_ATTENUATION.maxDistance);
  return {
    refDistance,
    maxDistance: Math.max(maxCandidate, refDistance + 1),
    rolloff: positiveOr(options.rolloff, DEFAULT_SPATIAL_ATTENUATION.rolloff),
  };
}

export interface AudioPlayRequest extends AudioPlayOptions {
  clipId: string;
}

export interface AudioPlaybackHandle {
  readonly clipId: string;
  readonly stopped: boolean;
  readonly volume: number;
  readonly pitch: number;
  stop(fadeSeconds?: number): void;
  setVolume(value: number, fadeSeconds?: number): void;
  setPitch(value: number): void;
  /**
   * Moves a spatial play's emitter (a sound riding on something that moves, like
   * a car's engine). A no-op for a play started without `spatial` + `position`:
   * it has no panner to move, and growing one mid-play would change its mix.
   */
  setPosition(position: AudioVec3): void;
  /**
   * Holds a streamed play where it stands, or lets it go on.
   *
   * Streams only, and the asymmetry is the point rather than an omission: a
   * media element has a position that can be held, a decoded source does not —
   * `AudioBufferSourceNode` can be started and stopped but never resumed, so
   * "pause" for a one-shot would have to mean "stop", which is a different
   * thing and not one any caller has asked for. A no-op there keeps a caller
   * that pauses everything from silently destroying the short sounds.
   */
  setPaused(paused: boolean): void;
}

export interface AudioBus {
  playOneShot(clipId: string, options?: AudioPlayOptions): void;
  play(clipId: string, options?: AudioPlayOptions): AudioPlaybackHandle;
}
