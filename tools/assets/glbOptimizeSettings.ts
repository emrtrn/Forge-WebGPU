// A model's GLB optimisation settings (`forge.model` `import.optimize`, plan
// phase 4 step 6e): the type, Forge's defaults (optimize-mesh-glb.mjs: 1024 px
// textures, meshopt; normal maps kept here, user decision 2026-11-14) and the
// reading of a settings object with the defaults under it. Light: the server
// loads the optimiser itself (sharp, gltf-transform) only when it runs.

export interface GlbOptimizeSettings {
  readonly enabled: boolean;
  /** Longer texture edge, pixels. */
  readonly maxTextureSize: number;
  readonly keepNormals: boolean;
  readonly meshopt: boolean;
  readonly stripTextures: boolean;
}

export const DEFAULT_GLB_OPTIMIZE: GlbOptimizeSettings = { enabled: true, maxTextureSize: 1024, keepNormals: true, meshopt: true, stripTextures: false };

export function glbOptimizeSettings(raw: Readonly<Record<string, unknown>>): GlbOptimizeSettings {
  const flag = (key: "enabled" | "keepNormals" | "meshopt" | "stripTextures"): boolean => (typeof raw[key] === "boolean" ? (raw[key] as boolean) : DEFAULT_GLB_OPTIMIZE[key]);
  const size = typeof raw.maxTextureSize === "number" && Number.isFinite(raw.maxTextureSize) ? Math.min(8192, Math.max(64, Math.round(raw.maxTextureSize))) : DEFAULT_GLB_OPTIMIZE.maxTextureSize;
  return { enabled: flag("enabled"), maxTextureSize: size, keepNormals: flag("keepNormals"), meshopt: flag("meshopt"), stripTextures: flag("stripTextures") };
}
