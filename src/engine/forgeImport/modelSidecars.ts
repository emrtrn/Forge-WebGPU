/**
 * Forge WebGL model sidecars as `forge.model` import settings, version 2
 * (architecture §4.6, plan phase 3 step 4). Pure.
 *
 * - `<model>.materials.json` -> `materials`: slot i keeps its Forge material
 *   id as a GUID through `materialAsset`; an empty slot or an id that does
 *   not resolve is null (the GLB's own material), the latter reported.
 * - `<model>.uvw.json` -> `uvw`: Forge's `normalizeAssetUvw` rule (unknown map
 *   type is none, vectors at 4 decimals, |scale| at least 0.001).
 * - `<model>.vertexcolors.json` -> `vertexColors`: Forge's
 *   `normalizeAssetVertexColors` (`forgeVertexColors.ts`); a file without
 *   meshes gives no entries.
 *
 * The readers are Forge's (`src/scene/assetMaterialSlotsLoader.ts`,
 * `src/scene/assetUvwLoader.ts`: their three-free normalisers, copied below
 * as they were).
 */
import { isJsonObject, type AssetId, type JsonObject } from "../../core/index.ts";
import { COLLISION_CHANNELS, isCollisionComplexity, isCollisionEnabled, isCollisionObjectChannel, isCollisionPresetId, isCollisionPrimitiveShape, isCollisionResponse } from "../physics/collision.ts";
import { normalizeAssetVertexColors } from "./forgeVertexColors.ts";

type Vec3 = [number, number, number];

const UVW_MAP_TYPES = ["planar", "box", "sphere", "cylinder"] as const;
type UvwMapType = (typeof UVW_MAP_TYPES)[number];

// From Forge src/scene/assetMaterialSlotsLoader.ts.
function normalizeAssetMaterialSlots(value: unknown): { schema: 1; slots: string[] } {
  if (!value || typeof value !== "object") return { schema: 1, slots: [] };
  const input = value as Record<string, unknown>;
  const rawSlots = Array.isArray(input.slots) ? input.slots : [];
  return {
    schema: 1,
    slots: rawSlots.map((slot) => (typeof slot === "string" ? slot : "")),
  };
}

// From Forge src/scene/assetUvwLoader.ts (`normalizeAssetUvw`, `normalizeVec3`).
function normalizeAssetUvw(value: unknown): { mapType: UvwMapType | null; position: Vec3; rotation: Vec3; scale: Vec3 } {
  if (!value || typeof value !== "object") return { mapType: null, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] };
  const input = value as Record<string, unknown>;
  const mapType = UVW_MAP_TYPES.includes(input.mapType as UvwMapType)
    ? (input.mapType as UvwMapType)
    : null;
  return {
    mapType,
    position: normalizeVec3(input.position, [0, 0, 0]),
    rotation: normalizeVec3(input.rotation, [0, 0, 0]),
    scale: normalizeVec3(input.scale, [1, 1, 1]).map((axis) =>
      Math.max(Math.abs(axis), 0.001),
    ) as Vec3,
  };
}

function normalizeVec3(value: unknown, fallback: Vec3): Vec3 {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    !value.every((axis) => Number.isFinite(axis))
  ) {
    return [...fallback] as Vec3;
  }
  return value.map((axis) => Number(Number(axis).toFixed(4))) as Vec3;
}

export interface ModelSidecars {
  /** Parsed `*.materials.json`, if there is one. */
  readonly materials?: unknown;
  readonly uvw?: unknown;
  readonly vertexColors?: unknown;
  readonly collision?: unknown;
}

export interface ModelImportConversion {
  /** `forge.model@2` import settings: only the keys a sidecar gave (the rest take defaults). */
  readonly settings: JsonObject;
  /** Slot material ids that have no GUID in the target. */
  readonly missingMaterials: readonly string[];
}

export function convertModelSidecars(
  sidecars: ModelSidecars,
  materialAsset: (forgeMaterialId: string) => AssetId | null,
): ModelImportConversion {
  const settings: JsonObject = {};
  const missingMaterials: string[] = [];
  if (sidecars.materials !== undefined) {
    const slots = normalizeAssetMaterialSlots(sidecars.materials).slots;
    if (slots.some((slot) => slot !== "")) {
      settings.materials = slots.map((slot) => {
        if (slot === "") return null;
        const guid = materialAsset(slot);
        if (guid === null) missingMaterials.push(slot);
        return guid;
      });
    }
  }
  if (sidecars.uvw !== undefined) {
    const uvw = normalizeAssetUvw(sidecars.uvw);
    if (uvw.mapType !== null) settings.uvw = { ...uvw, mapType: uvw.mapType };
  }
  if (sidecars.vertexColors !== undefined) {
    const meshes = normalizeAssetVertexColors(sidecars.vertexColors).meshes;
    if (meshes.length > 0) settings.vertexColors = meshes.map((mesh) => ({ ...mesh }));
  }
  if (isJsonObject(sidecars.collision)) {
    const { primitives, preset, complexity, physicalMaterialId, collisionEnabled, objectType, responses } = sidecars.collision;
    const collision: JsonObject = {};
    if (isCollisionComplexity(complexity)) collision.complexity = complexity;
    if (typeof physicalMaterialId === "string") collision.physicalMaterial = physicalMaterialId;
    if (isCollisionPresetId(preset)) {
      const profile: JsonObject = { preset };
      if (preset === "custom") {
        if (isCollisionEnabled(collisionEnabled)) profile.collisionEnabled = collisionEnabled;
        if (isCollisionObjectChannel(objectType)) profile.objectType = objectType;
        if (isJsonObject(responses)) profile.responses = Object.fromEntries(COLLISION_CHANNELS.flatMap((channel) => {
          const response = responses[channel];
          return isCollisionResponse(response) ? [[channel, response]] : [];
        }));
      }
      collision.profile = profile;
    }
    const simple: JsonObject[] = [];
    const convex: JsonObject[] = [];
    for (const part of Array.isArray(primitives) ? primitives : []) {
      if (!isJsonObject(part) || !isCollisionPrimitiveShape(part.shape)) continue;
      if (part.shape === "convex") {
        if (Array.isArray(part.points) && part.points.length >= 4) {
          convex.push({ points: part.points.flatMap((point) => normalizeVec3(point, [0, 0, 0])) });
        }
      } else {
        simple.push({
          shape: part.shape, size: normalizeVec3(part.size, [1, 1, 1]),
          center: normalizeVec3(part.center, [0, 0, 0]), rotation: normalizeVec3(part.rotation, [0, 0, 0]),
        });
      }
    }
    if (simple.length > 0) collision.primitives = simple;
    if (convex.length > 0) collision.convex = convex;
    if (Object.keys(collision).length > 0) settings.collision = collision;
  }
  return { settings, missingMaterials };
}
