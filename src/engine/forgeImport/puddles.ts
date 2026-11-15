/**
 * Forge WebGL's `puddleWaters` as puddle actors (plan phase 5a step 6,
 * decision 2; user decisions 2026-11-15):
 *
 * - each body is read by Forge's own validator (engine/terrain/puddleWater.ts);
 *   one it rejects is reported and left out;
 * - the actor stands at the seed and the water level (`seed` X / Z,
 *   `surfaceLevel` Y), spatially loaded, so it lands in its cell; the working
 *   area is the bounds' width (Forge kept the bounds square). The bed is the
 *   terrain under the seed, so `terrainRef` is not stored;
 * - the appearance is written out with Forge's defaults where a field is left
 *   out, so the puddle looks the same if a component default changes. Forge
 *   kept an old body without a reflection mode on the environment reflection
 *   (only new bodies reflected planar): that is written `environment`;
 * - the wind normal is Forge's `t-water-n` texture as its GUID, when the target
 *   has it (reported otherwise);
 * - `locked` becomes the actor's editor lock; `hidden` is reported (an editor
 *   view state, phase 4).
 */
import type { ActorDoc, ActorId, ComponentMap } from "../../core/index.ts";
import { PUDDLE_APPEARANCE, PUDDLE_WIND_NORMAL, validatePuddleWater } from "../terrain/puddleWater.ts";

export const PUDDLE_TAG = "forge.puddle@1";

/** Forge's appearance keys, each written as the component field of the same name. */
const APPEARANCE_FIELDS = [
  "color", "opacity", "roughness", "reflectionStrength", "reflectionQuality", "planarReflectionStrength", "mudDensity", "mudColor",
  "windRipplesEnabled", "windNormalStrength", "windWorldScale", "windSpeedResponse", "windInfluence",
  "wheelRipplesEnabled", "wheelRippleStrength", "wheelRippleSpeed", "wheelRippleWidth", "wheelRippleWavelength", "wheelRippleLifetime", "wheelRippleInterval",
] as const;

export interface PuddleImport {
  readonly actors: ActorDoc[];
  readonly notes: Array<{ field: string; count: number; phase: string }>;
}

export function puddleActors(
  bodies: readonly unknown[],
  actorId: (key: string) => ActorId,
  textureAsset: ((forgeTextureId: string) => string | null) | undefined,
): PuddleImport {
  const actors: ActorDoc[] = [];
  const notes: PuddleImport["notes"] = [];
  const windNormal = textureAsset?.(PUDDLE_WIND_NORMAL) ?? null;
  for (const raw of bodies) {
    let body;
    try {
      body = validatePuddleWater(raw);
    } catch (error) {
      notes.push({ field: `puddleWaters[] (${error instanceof Error ? error.message : String(error)})`, count: 1, phase: "- (Forge'un doğrulayıcısı reddetti)" });
      continue;
    }
    const appearance = { ...PUDDLE_APPEARANCE, ...body.appearance };
    const component: Record<string, unknown> = {
      type: PUDDLE_TAG,
      parent: null,
      local: { p: [0, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] },
      size: body.bounds.max[0] - body.bounds.min[0],
      reflectionMode: appearance.reflectionMode === "sharedPlanar" ? "planar" : "environment",
      windNormal,
    };
    for (const field of APPEARANCE_FIELDS) component[field] = appearance[field];
    const actor: ActorDoc = {
      id: actorId(`puddle/${body.id}`),
      name: body.name ?? body.id,
      class: null,
      parent: null,
      spatiallyLoaded: true,
      transform: { p: [body.seed[0], body.surfaceLevel, body.seed[1]], r: [0, 0, 0, 1], s: [1, 1, 1] },
      components: { puddle: component as unknown as ComponentMap[string] },
    };
    if (body.locked === true) actor.locked = true;
    actors.push(actor);
    if (body.hidden === true) notes.push({ field: "puddleWaters[].hidden", count: 1, phase: "- (gizleme editörde görünüm, kaydedilmez)" });
  }
  if (actors.length > 0 && windNormal === null) {
    notes.push({ field: `puddleWaters[].windNormal=${PUDDLE_WIND_NORMAL}`, count: actors.length, phase: "- (doku hedefte yok)" });
  }
  return { actors, notes };
}
