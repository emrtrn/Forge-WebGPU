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
  readonly prototypes: readonly { readonly lods: readonly { readonly mesh: string | null; readonly screenSize: number }[]; readonly height: number }[];
  readonly materials: { readonly wood: string | null; readonly leaf: string | null };
  readonly response: PlantResponseProfile;
  readonly sway: { readonly amplitude: number; readonly frequency: number };
}

export interface FamilyPrototypeDraw {
  /** LOD 0's model. */
  readonly mesh: string;
  readonly lods: readonly { readonly mesh: string; readonly screenSize: number }[];
  readonly plant: PlantFamilyDraw;
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
      height: entry.height,
      sway: { amplitude: family.sway.amplitude, height: Math.max(entry.height, 0.01), frequency: family.sway.frequency, source: "vertex" },
    };
  } catch (error) {
    console.warn(`forge render: plant family ${guid} not drawn: ${String(error)}`);
    return null;
  }
}
