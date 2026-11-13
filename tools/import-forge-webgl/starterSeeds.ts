// The Forge WebGL assets the starter pack brings (plan 2b importer, user
// decision 2026-11-12): the engine defaults only, that is the assets ported
// engine code names by id, with what they use (materials wait for Faz 3,
// their textures come now). Assets of unknown licence are included as
// `LicenseRef-forge-unverified` (user decision: the licence is the user's
// responsibility). The reference levels and everything else they use go to
// the out-of-repo reference project, not here.
//
// `npm run import:forge -- --forge <Forge public/> --pack starter` imports
// these; a second run writes the same bytes.

export const STARTER_SEEDS: Readonly<Record<string, string>> = {
  // World Builder's temporary steps and road profile (src/engine/worldbuilder/build/temporarySteps.ts, worldBrief.ts).
  "lt-earth": "World Builder terrain layer material",
  "lt-meadow": "World Builder terrain layer material",
  "lt-rock": "World Builder terrain layer material",
  "m-gravel-material": "World Builder road material",
  "starter-mat-grass": "World Builder terrain layer material",
  // Ground cover presets' other layers (content/packs/worldbuilder/covers: alpine snow, desert sand).
  "lt-snow": "World Builder ground cover layer material",
  "m-sand-dry": "World Builder ground cover layer material",
  "ground": "World Builder default ground material",
  // Particle presets (src/engine/vfx/particleEffectPresets.ts).
  "t-explosion-subuv": "explosion flipbook",
  "t-fire-subuv": "fire flipbook",
  "fire-01-2": "fire sprite",
  // Water and terrain surfaces (Forge's puddle / river water, wet mud brush, lake bed).
  "t-water-n": "water normal map",
  "lt-wet-mud": "wet mud terrain layer material",
  "m-shallow-water-bed": "shallow water bed material",
  // Render defaults (Forge's scene noise).
  "perlin-noise": "noise texture",
  // Audio defaults (Forge's engine checks and the vehicle engine sound).
  "starter-snd-ui-click": "UI click",
  "starter-snd-ui-confirm": "UI confirm",
  "starter-snd-footstep-stone": "footstep on stone",
  "starter-snd-impact-light": "light impact",
  "starter-snd-engine-loop": "vehicle engine loop",
  // Materials Forge's engine checks use.
  "starter-mat-brick-clay-old": "brick material",
  "white-material": "white material",
};
