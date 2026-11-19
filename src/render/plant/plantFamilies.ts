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
    readonly impostor?: ImpostorSlot;
    readonly height: number;
  }[];
  readonly materials: { readonly wood: string | null; readonly leaf: string | null };
  readonly response: PlantResponseProfile;
  readonly sway: { readonly amplitude: number; readonly frequency: number };
}

/** The impostor slot as the schemas have it (features/plant, features/foliage). */
export interface ImpostorSlot {
  readonly albedo: string | null;
  readonly normal: string | null;
  readonly views: number;
  readonly screenSize: number;
  /** sRGB `#rrggbb` mean of the leaf layer, written by the bake; null when unknown. */
  readonly color?: string | null;
}

/** A baked impostor atlas (PG3): its two textures, frames per side and the screen size it starts at. */
export interface ImpostorRef {
  readonly albedo: string;
  readonly normal: string;
  readonly views: number;
  readonly screenSize: number;
  /**
   * The leaf layer's mean colour, linear RGB (the far tint's colour), from the slot's `color`: a compressed
   * (KTX2) atlas cannot be read back at run time. Null: read from the loaded atlas when it can be.
   */
  readonly color: readonly [number, number, number] | null;
}

const srgbChannel = (value: number): number => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);

/** `#rrggbb` (sRGB) as linear RGB; null for anything else. */
export function linearFromHex(hex: string | null | undefined): [number, number, number] | null {
  if (typeof hex !== "string" || !/^#[0-9a-f]{6}$/i.test(hex)) return null;
  const value = Number.parseInt(hex.slice(1), 16);
  return [srgbChannel(((value >> 16) & 255) / 255), srgbChannel(((value >> 8) & 255) / 255), srgbChannel((value & 255) / 255)];
}

/** The impostor of a family prototype or foliage type, when both textures are set. */
export function impostorRef(value: ImpostorSlot | undefined): ImpostorRef | null {
  return value && typeof value.albedo === "string" && value.albedo.length > 0 && typeof value.normal === "string" && value.normal.length > 0
    ? { albedo: value.albedo, normal: value.normal, views: value.views, screenSize: value.screenSize, color: linearFromHex(value.color) } : null;
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
      impostor: impostorRef(entry.impostor),
      height: entry.height,
      sway: { amplitude: family.sway.amplitude, height: Math.max(entry.height, 0.01), frequency: family.sway.frequency, source: "vertex" },
    };
  } catch (error) {
    console.warn(`forge render: plant family ${guid} not drawn: ${String(error)}`);
    return null;
  }
}
