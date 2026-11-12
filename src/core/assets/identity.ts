// Asset identity pass (architecture §4.6, decision A10).
//
// Input is the list of files under one or more content roots, with the parsed
// content of every `.json` file; reading the disk is the caller's business
// (`tools/assets` in Node). Output is GUID -> where the asset lives, plus what
// is wrong with the identity of the files:
//
// - `<file>.meta.json` gives a binary file its identity. A binary file without
//   one is `missing-meta`; a meta file without its binary is `orphan-meta` and
//   does not enter the index. The meta's type must claim the file's extension.
// - A `.json` file that is not a meta file is a document asset when its
//   `schema` tag names a registered document type; it carries its own `id`.
//   A level cell or cell index (A11) is not an asset but a part of the level
//   whose folder it is in; it is set aside for the level pass. Any other
//   `.json` file is `unrecognized-file`.
// - A data document (`dataDocument.ts`) must have its type's file suffix. A
//   binary file its type names as a part (a terrain tile) needs no meta file:
//   it belongs to the document and is set aside like a level cell.
// - The same GUID in two files is `duplicate-id`: the first file in path order
//   keeps it, the later one is left out.
//
// Missing data is a loss (error under `strict`, warning otherwise), like a
// dropped field (§4.5).

import { isId, type AssetId, type LevelId } from "../id.ts";
import { isJsonObject } from "../json.ts";
import {
  createContext,
  reportFatal,
  reportLoss,
  type Issue,
  type NormalizeContext,
  type NormalizeOptions,
} from "../schema/issues.ts";
import { LEVEL_CELL_INDEX_SCHEMA, LEVEL_CELL_SCHEMA } from "../level/model.ts";
import type { SchemaRegistry } from "../schema/registry.ts";
import { claimsFile } from "./assetType.ts";
import { dataDocumentPartMatchers, hasDataDocumentName } from "./dataDocument.ts";
import { assetPathOfMeta, metaPathOf, metaTypeOf, normalizeAssetMeta, type AssetMetaDoc } from "./meta.ts";

/** One file under a content root, as the caller found it. */
export interface ContentFile {
  /** Content root label, e.g. `content` or `engine:content/packs/starter`. */
  readonly root: string;
  /** Path inside the root, with forward slashes. */
  readonly path: string;
  /** Parsed content of a `.json` file; absent for a binary file. */
  readonly json?: unknown;
  /** Set when a `.json` file could not be parsed. */
  readonly parseError?: string;
  /**
   * Revision of the file's bytes (first 16 hex digits of SHA-256), when the
   * reader computed it. Opaque to core: compared, never computed.
   */
  readonly revision?: string;
}

export interface AssetEntry {
  readonly id: AssetId | LevelId;
  /** Asset type name, e.g. `forge.texture` or `forge.level`. */
  readonly type: string;
  readonly storage: "binary" | "document";
  readonly root: string;
  /** The asset file itself: the binary, or the JSON document. */
  readonly path: string;
  /** The meta file of a binary asset; null for a document. */
  readonly meta: string | null;
}

/** An issue in one file. `file` is `<root>/<path>`. */
export interface FileIssue extends Issue {
  readonly file: string;
}

export interface AssetIndexOptions extends NormalizeOptions {
  readonly registry: SchemaRegistry;
}

export interface IdentityResult {
  readonly entries: Map<string, AssetEntry>;
  /** Normalised meta files of the indexed binary assets, by GUID. */
  readonly metas: Map<string, AssetMetaDoc>;
  /** Raw content of the indexed document assets, in path order. */
  readonly documents: { readonly entry: AssetEntry; readonly json: unknown; readonly revision?: string }[];
  /** Level cells and cell indexes, in path order; they belong to a level folder. */
  readonly levelParts: ContentFile[];
  /** Binary parts of data documents (terrain tiles), in path order. */
  readonly documentParts: ContentFile[];
  readonly issues: FileIssue[];
}

export function fileLabel(root: string, path: string): string {
  return root === "" ? path : `${root}/${path}`;
}

function isJsonPath(path: string): boolean {
  return path.toLowerCase().endsWith(".json");
}

/** Collects one file's issues under its label. */
export function withFile(file: string, issues: readonly Issue[], into: FileIssue[]): void {
  for (const issue of issues) into.push({ ...issue, file });
}

export function identifyAssets(files: readonly ContentFile[], options: AssetIndexOptions): IdentityResult {
  const sorted = [...files].sort((a, b) => compare(fileLabel(a.root, a.path), fileLabel(b.root, b.path)));
  const present = new Set(sorted.map((file) => fileLabel(file.root, file.path)));
  const result: IdentityResult = {
    entries: new Map(),
    metas: new Map(),
    documents: [],
    levelParts: [],
    documentParts: [],
    issues: [],
  };
  const isPart = documentPartTest(sorted, options);

  const claim = (entry: AssetEntry, ctx: NormalizeContext, idPath: string): boolean => {
    const first = result.entries.get(entry.id);
    if (first) {
      reportLoss(
        ctx,
        "duplicate-id",
        idPath,
        `Asset id ${entry.id} is already used by ${fileLabel(first.root, first.meta ?? first.path)}; this file is left out.`,
      );
      return false;
    }
    result.entries.set(entry.id, entry);
    return true;
  };

  for (const file of sorted) {
    const label = fileLabel(file.root, file.path);
    const ctx = createContext(options);
    const assetPath = assetPathOfMeta(file.path);
    if (assetPath !== null) {
      identifyMeta(file, assetPath, present, ctx, options, result, claim);
    } else if (isJsonPath(file.path)) {
      identifyDocument(file, ctx, options, result, claim);
    } else if (present.has(fileLabel(file.root, metaPathOf(file.path)))) {
      // Identified through its meta file.
    } else if (isPart(file)) {
      result.documentParts.push(file);
    } else {
      reportLoss(
        ctx,
        "missing-meta",
        "",
        `A binary asset needs ${metaPathOf(file.path).split("/").pop()} next to it (type, licence, source).`,
      );
    }
    withFile(label, ctx.issues, result.issues);
  }
  return result;
}

function identifyMeta(
  file: ContentFile,
  assetPath: string,
  present: ReadonlySet<string>,
  ctx: NormalizeContext,
  options: AssetIndexOptions,
  result: IdentityResult,
  claim: (entry: AssetEntry, ctx: NormalizeContext, idPath: string) => boolean,
): void {
  if (file.parseError !== undefined) {
    reportFatal(ctx, "invalid-document", "", `Not valid JSON: ${file.parseError}`);
    return;
  }
  const normalized = normalizeAssetMeta(file.json, options);
  ctx.issues.push(...normalized.issues);
  const meta = normalized.value;
  if (!meta) return;
  if (!present.has(fileLabel(file.root, assetPath))) {
    reportLoss(ctx, "orphan-meta", "", `The asset file ${assetPath} is missing; the meta file is left out.`);
    return;
  }
  const def = metaTypeOf(options.registry, meta);
  if (def && !claimsFile(def, assetPath)) {
    reportLoss(
      ctx,
      "asset-type-mismatch",
      "type",
      `${def.name} takes ${def.extensions.map((extension) => `.${extension}`).join(", ")} files, not ${assetPath}.`,
    );
  }
  const entry: AssetEntry = {
    id: meta.id,
    type: def?.name ?? meta.type.split("@")[0] ?? "",
    storage: "binary",
    root: file.root,
    path: assetPath,
    meta: file.path,
  };
  if (claim(entry, ctx, "id")) result.metas.set(meta.id, meta);
}

function identifyDocument(
  file: ContentFile,
  ctx: NormalizeContext,
  options: AssetIndexOptions,
  result: IdentityResult,
  claim: (entry: AssetEntry, ctx: NormalizeContext, idPath: string) => boolean,
): void {
  if (file.parseError !== undefined) {
    reportFatal(ctx, "invalid-document", "", `Not valid JSON: ${file.parseError}`);
    return;
  }
  const json = file.json;
  if (isJsonObject(json) && (json.schema === LEVEL_CELL_SCHEMA || json.schema === LEVEL_CELL_INDEX_SCHEMA)) {
    result.levelParts.push(file);
    return;
  }
  const def = isJsonObject(json) ? options.registry.documentTypeForSchema(json.schema) : undefined;
  if (!isJsonObject(json) || !def) {
    reportLoss(ctx, "unrecognized-file", "schema", "Not an asset: no registered document type has this schema tag.");
    return;
  }
  if (!isId(json.id, def.idKind)) {
    reportFatal(ctx, "invalid-document", "id", `A ${def.label.toLowerCase()} needs a ${def.idKind} id.`);
    return;
  }
  if (!hasDataDocumentName(def, file.path)) {
    reportFatal(ctx, "invalid-document", "", `A ${def.label} file is named *${def.dataFile?.suffix ?? ""}.`);
    return;
  }
  const entry: AssetEntry = {
    id: json.id,
    type: def.name,
    storage: "document",
    root: file.root,
    path: file.path,
    meta: null,
  };
  if (claim(entry, ctx, "id")) {
    result.documents.push(file.revision === undefined ? { entry, json } : { entry, json, revision: file.revision });
  }
}

/** Whether a binary file is a part a data document of its root names. */
function documentPartTest(files: readonly ContentFile[], options: AssetIndexOptions): (file: ContentFile) => boolean {
  const matchers = new Map<string, RegExp[]>();
  for (const file of files) {
    if (!isJsonPath(file.path) || !isJsonObject(file.json)) continue;
    const def = options.registry.documentTypeForSchema(file.json.schema);
    if (def?.dataFile === undefined || def.dataFile.parts.length === 0) continue;
    const list = matchers.get(file.root) ?? [];
    list.push(...dataDocumentPartMatchers(def, file.path));
    matchers.set(file.root, list);
  }
  return (file) => (matchers.get(file.root) ?? []).some((matcher) => matcher.test(file.path));
}

/** Ordinal comparison: the same order on every machine and locale. */
function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
