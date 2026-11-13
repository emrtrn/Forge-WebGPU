// Data documents (architecture §4.6, decision A10; plan 2b `tools/world`,
// user decision 2026-11-12).
//
// A data document is a JSON asset whose content another layer defines: a
// terrain definition, a World Builder brief, recipe, region profile or ground
// cover. Core owns only the envelope that makes it an asset:
//
//   { "schema": "forge.terrain/1", "id": "ast_…", "data": { …content… } }
//
// `data` is the content as its own normaliser (in `src/engine`) reads it, so
// those normalisers stay as they were ported. The file name ends with the
// type's suffix (`valley.terrain.json`).
//
// A data document may own binary parts next to it that are not assets of
// their own and have no meta file, like the cells of a level: a terrain's
// tiles and global map. A part pattern is relative to the document's folder;
// `{stem}` is the document's file name without the suffix and `*` matches
// within one path segment (`{stem}.tiles/*.tile.bin`).
//
// Core does not read the content, but a type may name where in `data` its
// asset references sit (plan phase 3 step 8, user decision 2026-11-13: the
// paint layers' materials are GUIDs): `layers[].material` is the `material`
// of every element of `layers`. The asset index collects them, so a dangling
// one fails the asset gate like any other reference.

import { isId, type AssetId } from "../id.ts";
import { isJsonObject, type JsonObject } from "../json.ts";
import { deepFreeze } from "../schema/fields.ts";
import {
  createContext,
  finish,
  reportFatal,
  reportLoss,
  type NormalizeOptions,
  type NormalizeResult,
} from "../schema/issues.ts";
import type { DocumentAssetTypeDef } from "./assetType.ts";
import type { FoundReference } from "./references.ts";

export interface DataDocumentShape {
  /** The file name ends with this, e.g. `.terrain.json`. */
  readonly suffix: string;
  /** Meta-less binary files that belong to the document; see the header. */
  readonly parts: readonly string[];
  /** Where in `data` asset references sit, and the type each accepts; see the header. */
  readonly references: readonly DataDocumentReference[];
}

export interface DataDocumentReference {
  /** Dotted path in `data`; `[]` after a key walks every element of that array. */
  readonly path: string;
  readonly assetType: string | null;
}

export interface DataDocument {
  schema: string;
  id: AssetId;
  data: JsonObject;
}

const ENVELOPE_KEYS = ["schema", "id", "data"];

function dataDocumentType(
  name: string,
  label: string,
  hint: string,
  suffix: string,
  parts: readonly string[] = [],
  references: readonly DataDocumentReference[] = [],
): DocumentAssetTypeDef {
  return deepFreeze({
    kind: "assetType",
    storage: "document",
    name,
    label,
    hint,
    schema: `${name}/1`,
    idKind: "asset",
    dataFile: { suffix, parts: [...parts], references: references.map((reference) => ({ ...reference })) },
  });
}

export const TerrainAssetType = dataDocumentType(
  "forge.terrain",
  "Terrain",
  "Arazi tanımı: tile ızgarası, yükseklik aralığı, boya katmanları ve yol spline'ları. Tile'lar ve global harita yanındaki parçalardır.",
  ".terrain.json",
  ["{stem}.global.bin", "{stem}.tiles/*.tile.bin"],
  [{ path: "layers[].material", assetType: "forge.material" }],
);

export const WorldBriefAssetType = dataDocumentType(
  "forge.worldBrief",
  "World Brief",
  "World Builder'ın dünyayı kurduğu tarif: alan, arazi, yerleşimler, yollar, su ve modeller.",
  ".worldbrief.json",
);

export const WorldRecipeAssetType = dataDocumentType(
  "forge.worldRecipe",
  "World Recipe",
  "World Builder'ın planı ve aşama ayarları; level'ın yanında durur.",
  ".worldrecipe.json",
);

export const RegionProfileAssetType = dataDocumentType(
  "forge.regionProfile",
  "Region Profile",
  "Bölgenin kültürel kuralları: yol sınıfları, bina türleri, sokak donatısı ve hangi rolün hangi modelle gösterileceği.",
  ".regionprofile.json",
);

export const GroundCoverAssetType = dataDocumentType(
  "forge.groundCover",
  "Ground Cover",
  "Zemin örtüsü ön ayarı: boya katmanları, eğim / yükseklik kuralları, kaya ve bitki yoğunlukları.",
  ".cover.json",
  [],
  [{ path: "layers[].material", assetType: "forge.material" }],
);

export const DATA_DOCUMENT_TYPES: readonly DocumentAssetTypeDef[] = [
  TerrainAssetType,
  WorldBriefAssetType,
  WorldRecipeAssetType,
  RegionProfileAssetType,
  GroundCoverAssetType,
];

/** Wraps content in a data document's envelope. */
export function dataDocument(def: DocumentAssetTypeDef, id: AssetId, data: JsonObject): DataDocument {
  return { schema: def.schema, id, data };
}

/**
 * Reads the envelope. Null when the file cannot be read as this type at all;
 * the content of `data` is the business of its own normaliser.
 */
export function normalizeDataDocument(
  raw: unknown,
  def: DocumentAssetTypeDef,
  options: NormalizeOptions,
): NormalizeResult<DataDocument | null> {
  const ctx = createContext(options);
  if (!isJsonObject(raw)) {
    reportFatal(ctx, "invalid-document", "", `A ${def.label} must be a JSON object.`);
    return finish(ctx, null);
  }
  if (raw.schema !== def.schema) {
    reportFatal(ctx, "invalid-document", "schema", `Expected "${def.schema}".`);
    return finish(ctx, null);
  }
  if (!isId(raw.id, "asset")) {
    reportFatal(ctx, "invalid-document", "id", `A ${def.label} needs an asset id.`);
    return finish(ctx, null);
  }
  if (!isJsonObject(raw.data)) {
    reportFatal(ctx, "invalid-document", "data", `A ${def.label} keeps its content in an object "data".`);
    return finish(ctx, null);
  }
  for (const key of Object.keys(raw)) {
    if (!ENVELOPE_KEYS.includes(key)) reportLoss(ctx, "unknown-field", key, "A data document has no such field; dropped.");
  }
  return finish(ctx, { schema: def.schema, id: raw.id, data: structuredClone(raw.data) });
}

/** The asset references at the type's reference paths in `data`; values that are not asset ids are not references. */
export function dataDocumentReferences(def: DocumentAssetTypeDef, data: JsonObject): FoundReference[] {
  const found: FoundReference[] = [];
  for (const reference of def.dataFile?.references ?? []) {
    const walk = (value: unknown, steps: readonly string[], at: string): void => {
      if (steps.length === 0) {
        if (isId(value, "asset")) found.push({ path: at, target: value, assetType: reference.assetType, via: "field" });
        return;
      }
      const [step, ...rest] = steps as [string, ...string[]];
      const each = step.endsWith("[]");
      const key = each ? step.slice(0, -2) : step;
      if (!isJsonObject(value) || !Object.hasOwn(value, key)) return;
      const next = value[key];
      const here = at === "" ? key : `${at}.${key}`;
      if (!each) {
        walk(next, rest, here);
        return;
      }
      if (Array.isArray(next)) next.forEach((element: unknown, index) => walk(element, rest, `${here}[${index}]`));
    };
    walk(data, reference.path.split("."), "data");
  }
  return found;
}

/**
 * True when `path` (a document path) has the file name the type asks for: a
 * data document's or a JSON asset's suffix (`documentSuffix`).
 */
export function hasDataDocumentName(def: DocumentAssetTypeDef, path: string): boolean {
  const suffix = def.dataFile?.suffix ?? def.json?.suffix;
  if (suffix === undefined) return true;
  const name = path.slice(path.lastIndexOf("/") + 1);
  return name.length > suffix.length && name.endsWith(suffix);
}

/**
 * The part paths a document at `documentPath` may own, as matchers: one per
 * pattern of its type. Paths are relative to the same root as the document.
 */
export function dataDocumentPartMatchers(def: DocumentAssetTypeDef, documentPath: string): RegExp[] {
  const shape = def.dataFile;
  if (shape === undefined || !hasDataDocumentName(def, documentPath)) return [];
  const slash = documentPath.lastIndexOf("/");
  const folder = slash < 0 ? "" : documentPath.slice(0, slash + 1);
  const stem = documentPath.slice(slash + 1, -shape.suffix.length);
  return shape.parts.map((pattern) => {
    const source = pattern
      .split("{stem}")
      .map((piece) => piece.split("*").map(escapeRegExp).join("[^/]+"))
      .join(escapeRegExp(stem));
    return new RegExp(`^${escapeRegExp(folder)}${source}$`);
  });
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
