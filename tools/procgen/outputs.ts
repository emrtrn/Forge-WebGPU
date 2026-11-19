// Shared pieces of `forge generate`'s generators (tools/procgen/generate.ts):
// output records, derived GUIDs and the meta of a generated binary.

import { createHash } from "node:crypto";
import { ASSET_META_SCHEMA, stringifyDocument, type JsonObject } from "../../src/core/index.ts";
import { stableHex } from "../../src/engine/forgeImport/ids.ts";
import { PROJECT_LICENSE } from "../import-forge-webgl/provenance.ts";

/** Bumped with every change to a generator that alters its output (written to the recipe's outputs). */
export const GENERATOR_VERSIONS = { rock: 1, surfaceTexture: 1, tree: 3 } as const;
export type GeneratorName = keyof typeof GENERATOR_VERSIONS;

export interface Output {
  readonly path: string;
  readonly id: string;
  readonly bytes?: Uint8Array;
  readonly text?: string;
}

export interface GeneratedRecord { readonly recipe: string; readonly generator: string; readonly generatorVersion: number }

/** Model import settings of a generated GLB: no editor optimisation (the generator wrote it as it should be). */
export const GENERATED_MODEL_OPTIMIZE = { enabled: false, maxTextureSize: 1024, keepNormals: true, meshopt: false, stripTextures: false } as const;

export const sha256 = (bytes: Uint8Array | string): string => createHash("sha256").update(bytes).digest("hex");
/** An output's GUID: the recipe's GUID and the output's role, never its path. */
export const outputId = (recipe: string, role: string): string => `ast_${stableHex(`procgen/${recipe}/${role}`)}`;
export const round = (value: number): number => Math.round(value * 1e5) / 1e5;

export function srgbTriple(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

export function binaryWithMeta(
  outputs: Output[], path: string, id: string, type: string, bytes: Uint8Array,
  importSettings: JsonObject, generated: GeneratedRecord,
): void {
  outputs.push({ path, id, bytes });
  const meta = {
    schema: ASSET_META_SCHEMA,
    id,
    type,
    license: PROJECT_LICENSE,
    source: { origin: "generated", author: "", url: "" },
    import: importSettings,
    generated: { ...generated, contentHash: sha256(bytes) },
  };
  outputs.push({ path: `${path}.meta.json`, id, text: stringifyDocument(meta) });
}

/** A JSON output (no meta). */
export function documentOutput(outputs: Output[], path: string, document: JsonObject & { id: string }): void {
  outputs.push({ path, id: document.id, text: stringifyDocument(document) });
}
