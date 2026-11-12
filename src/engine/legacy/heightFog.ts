// Ported from Forge WebGL engine/scene/heightFog.ts (ResolvedHeightFog) @ forge-webgl-final (04b5fb23); docs/PORT_LOG.md §2.
// TRANSITION (plan 2b): resolved settings type of an old scene module, only what
// ported code reads; Faz 3 / 6 replace it with the feature's schema type.

/** Renderer-independent fog settings. Optional analytic height effects preserve legacy defaults. */
export type HeightFogMode = "exp" | "linear";

export interface ResolvedHeightFog {
  name: string;
  hidden: boolean;
  /** `exp` = FogExp2 (density), `linear` = Fog (start/end). */
  mode: HeightFogMode;
  /** Fog inscattering color (hex). */
  color: string;
  /** Exponential density (exp mode); tuned to the ~100u scene scale. */
  density: number;
  heightFalloff: number;
  baseHeight: number;
  startDistance: number;
  maxOpacity: number;
  sunColor: string;
  sunStrength: number;
  /** Linear fog near distance (linear mode). */
  start: number;
  /** Linear fog far distance (linear mode). */
  end: number;
}
