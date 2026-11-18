// A `forge.plantFamily` prototype as the foliage path draws it (vegetation
// plan PG2): its LOD chain (one model per LOD, wood and leaves two slots) and
// the family's materials and response. Read as a document (`json:<guid>`);
// the binding hands in the normaliser (render cannot import a feature's
// schema). Shared by the foliage binding (a type with `family`) and the
// plant binding (a `forge.plant` actor), so both draw the same thing.

import type { PlantResponseProfile } from "../../engine/plant/plantResponse.ts";
import { resourceKey } from "../resources/resourceCache.ts";
import type { WorldResources } from "../resources/worldResources.ts";
import type { PlantFamilyDraw } from "./plantDrawing.ts";

/** The fields of a normalised `forge.plantFamily` the renderer reads (features/plant/schema.ts). */
export interface PlantFamilyFieldsRead {
  readonly prototypes: readonly {
    readonly lods: readonly { readonly mesh: string | null; readonly screenSize: number }[];
    readonly impostor?: ImpostorRef | { readonly albedo: string | null; readonly normal: string | null; readonly views: number; readonly screenSize: number };
    readonly height: number;
  }[];
  readonly materials: { readonly wood: string | null; readonly leaf: string | null };
  readonly response: PlantResponseProfile;
  readonly sway: { readonly amplitude: number; readonly frequency: number };
}

/** A baked impostor atlas (PG3): its two textures, frames per side and the screen size it starts at. */
export interface ImpostorRef {
  readonly albedo: string;
  readonly normal: string;
  readonly views: number;
  readonly screenSize: number;
}

/** The impostor of a family prototype or foliage type, when both textures are set. */
export function impostorRef(value: { readonly albedo: string | null; readonly normal: string | null; readonly views: number; readonly screenSize: number } | undefined): ImpostorRef | null {
  return value && typeof value.albedo === "string" && value.albedo.length > 0 && typeof value.normal === "string" && value.normal.length > 0
    ? { albedo: value.albedo, normal: value.normal, views: value.views, screenSize: value.screenSize } : null;
}

export interface FamilyPrototypeDraw {
  /** LOD 0's model. */
  readonly mesh: string;
  readonly lods: readonly { readonly mesh: string; readonly screenSize: number }[];
  readonly plant: PlantFamilyDraw;
  readonly impostor: ImpostorRef | null;
  readonly height: number;
  /** The family's sway (from the vertex weights; the single plant's, and its foliage type's). */
  readonly sway: { readonly amplitude: number; readonly height: number; readonly frequency: number; readonly source: "vertex" };
}

/** Null (with a warning) when the family cannot be read or has no such prototype with a model. */
export async function readFamilyPrototype(
  resources: WorldResources,
  guid: string,
  prototype: number,
  keys: string[],
  normalize: (raw: unknown) => PlantFamilyFieldsRead | null,
): Promise<FamilyPrototypeDraw | null> {
  keys.push(resourceKey.json(guid));
  try {
    const family = normalize(await resources.json(guid));
    if (!family) throw new Error("unreadable");
    const entry = family.prototypes[Math.max(0, Math.floor(prototype))];
    const chain = (entry?.lods ?? []).flatMap((lod) => (typeof lod.mesh === "string" && lod.mesh.length > 0 ? [{ mesh: lod.mesh, screenSize: lod.screenSize }] : []));
    if (!entry || chain.length === 0) throw new Error(`no prototype ${prototype} with a model`);
    return {
      mesh: chain[0]!.mesh,
      lods: chain.slice(1),
      plant: { id: guid, wood: family.materials.wood, leaf: family.materials.leaf, response: family.response },
      impostor: impostorRef(entry.impostor as Parameters<typeof impostorRef>[0]),
      height: entry.height,
      sway: { amplitude: family.sway.amplitude, height: Math.max(entry.height, 0.01), frequency: family.sway.frequency, source: "vertex" },
    };
  } catch (error) {
    console.warn(`forge render: plant family ${guid} not drawn: ${String(error)}`);
    return null;
  }
}
