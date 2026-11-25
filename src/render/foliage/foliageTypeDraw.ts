// A `forge.foliageType` as the batches draw it: with a family its prototype's
// LOD chain, impostor, sway and response (the same as a single `forge.plant`,
// PV-WES-02), otherwise its own models. Shared by the foliage binding and the
// editor's family preview; render cannot import the feature's schema, so the
// caller hands in the normalised fields.

import { impostorRef, type FamilyPrototypeDraw, type ImpostorSlot } from "../plant/plantFamilies.ts";
import type { FoliageTypeDraw } from "./foliageBatches.ts";

export interface FoliageTypeFieldsRead {
  readonly mesh: string | null;
  readonly family: string | null;
  readonly prototype: number;
  readonly lods: readonly { readonly mesh: string | null; readonly screenSize: number }[];
  readonly castShadow: boolean;
  readonly cullStart: number;
  readonly cullEnd: number;
  readonly fadeSpread: number;
  readonly sway: { readonly enabled: boolean; readonly amplitude: number; readonly height: number; readonly frequency: number; readonly source: "height" | "vertex" };
  readonly impostor: ImpostorSlot;
}

/** Null for a type without a model. */
export function foliageTypeDraw(guid: string, data: FoliageTypeFieldsRead, family: FamilyPrototypeDraw | null): FoliageTypeDraw | null {
  const mesh = family?.mesh ?? data.mesh;
  if (typeof mesh !== "string" || mesh.length === 0) return null;
  const lods = family ? [...family.lods] : data.lods.flatMap((lod) => (typeof lod.mesh === "string" && lod.mesh.length > 0 ? [{ mesh: lod.mesh, screenSize: lod.screenSize }] : []));
  // A family's instances sway as its single plants do.
  const sway = family ? family.sway : data.sway.enabled
    ? { amplitude: data.sway.amplitude, height: data.sway.height, frequency: data.sway.frequency, source: data.sway.source }
    : null;
  return {
    id: guid, mesh, lods, castShadow: data.castShadow, cullStart: data.cullStart, cullEnd: data.cullEnd, fadeSpread: data.fadeSpread,
    sway, plant: family?.plant ?? null, impostor: family ? family.impostor : impostorRef(data.impostor),
  };
}
