// Ported from Forge WebGL engine/scene/cloudLayer.ts (ResolvedCloudLayer) @ forge-webgl-final (04b5fb23); docs/PORT_LOG.md §2.
// TRANSITION (plan 2b): resolved settings type of an old scene module, only what
// ported code reads; Faz 3 / 6 replace it with the feature's schema type.

/**
 * Render-agnostic Static Cloud Layer model: resolved settings + defaults, shared
 * by the editor view-models and the three.js render binding
 * (`engine/render-three/cloudLayer.ts`). Kept free of three.js so editor core and
 * the save validator can read it without pulling in the renderer.
 *
 * Unlike Unreal's Volumetric Clouds this is **static, not volumetric**: a single
 * camera-following dome backdrop whose cloud cover is painted by a procedural fBm
 * noise shader (no raymarching, no textures). It pairs with the Sky Atmosphere
 * backdrop. `speed` drives an optional gentle UV drift; the default `0` keeps the
 * clouds completely frozen.
 */
export interface ResolvedCloudLayer {
  name: string;
  hidden: boolean;
  /** Cloud tint (hex `#rrggbb`). */
  color: string;
  /** Fraction of the sky covered by cloud (0 = clear, 1 = overcast). */
  coverage: number;
  /** Overall cloud opacity (0 = invisible, 1 = solid). */
  density: number;
  /** Edge feathering of the cloud shapes (0 = hard edges, 1 = very soft). */
  softness: number;
  /** Feature size of the noise — larger = bigger, broader cloud masses. */
  scale: number;
  /** Drift speed (wind). 0 keeps the clouds static; higher gently scrolls them. */
  speed: number;
}
