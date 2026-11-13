// The asset index (architecture §4.6, decision A10).
//
// Built from the files of the content roots, never from a committed manifest:
// identity lives next to each asset, and the index is a derived cache that can
// be thrown away and rebuilt. Building it:
//
// 1. identity: GUID -> file (`identifyAssets`);
// 2. actor classes are normalised; the index is their `ClassResolver`, so a
//    level finds its classes by GUID wherever the class file lives;
// 3. levels are normalised against that resolver, each with the cells and
//    index of its folder (A11, `levelFolders.ts`);
// 4. schema-defined JSON assets (`jsonAsset.ts`, e.g. materials) are
//    normalised against their type;
// 5. asset references are collected from levels, classes, JSON assets and
//    meta files by walking the schema, and a reverse index (target ->
//    referrers) is built;
// 6. every reference is checked: dangling, or of the wrong asset type.
//
// Like normalisation, building never throws on data: problems are issues,
// with the file they are in. `ok` is false when one is an error.

import type { AssetId } from "../id.ts";
import { normalizeActorClass, type ClassResolver } from "../level/actorClass.ts";
import type { ActorClassDoc } from "../level/model.ts";
import { ActorClassAssetType, LevelAssetType } from "./assetType.ts";
import { dataDocumentReferences, normalizeDataDocument } from "./dataDocument.ts";
import { isJsonAssetType, normalizeJsonAsset, type JsonAssetDoc } from "./jsonAsset.ts";
import type { AssetMetaDoc } from "./meta.ts";
import {
  fileLabel,
  identifyAssets,
  withFile,
  type AssetEntry,
  type AssetIndexOptions,
  type ContentFile,
  type FileIssue,
} from "./identity.ts";
import { checkReferences } from "./integrity.ts";
import {
  groupLevelParts,
  indexLevelFolder,
  levelFolderOf,
  levelGroupKey,
  reportOrphanParts,
  type LevelFolder,
} from "./levelFolders.ts";
import { actorClassReferences, collectFieldReferences, metaReferences, type FoundReference } from "./references.ts";

/** An asset reference with the asset it is in. */
export interface AssetReference extends FoundReference {
  /** GUID of the referring asset. */
  readonly from: string;
  /** `<root>/<path>` of the file the reference is written in. */
  readonly file: string;
}

export interface AssetIndex {
  /** GUID -> where the asset lives. */
  readonly entries: ReadonlyMap<string, AssetEntry>;
  /** Every asset reference, in file order. */
  readonly references: readonly AssetReference[];
  readonly issues: readonly FileIssue[];
  /** False when an issue is an error. */
  readonly ok: boolean;
  /** The references that point at `id`. */
  referrersOf(id: string): readonly AssetReference[];
  /** Normalised actor classes by GUID; what level normalisation resolves against. */
  readonly resolveClass: ClassResolver;
  /** Every readable level, by id: where its folder is and which cells it has. */
  readonly levels: ReadonlyMap<string, LevelFolder>;
  /** Normalised meta files of binary assets, by GUID: their import settings (the renderer reads them). */
  readonly metas: ReadonlyMap<string, AssetMetaDoc>;
  /** Normalised schema-defined JSON assets, by GUID. */
  readonly jsonAssets: ReadonlyMap<string, JsonAssetDoc>;
}

export function buildAssetIndex(files: readonly ContentFile[], options: AssetIndexOptions): AssetIndex {
  const { registry } = options;
  const identity = identifyAssets(files, options);
  const issues: FileIssue[] = [...identity.issues];
  const references: AssetReference[] = [];
  const add = (from: string, file: string, found: readonly FoundReference[]): void => {
    for (const reference of found) references.push({ ...reference, from, file });
  };

  const classes = new Map<string, ActorClassDoc>();
  for (const { entry, json } of identity.documents) {
    if (entry.type !== ActorClassAssetType.name) continue;
    const file = fileLabel(entry.root, entry.path);
    const result = normalizeActorClass(json, options);
    withFile(file, result.issues, issues);
    if (result.value) classes.set(result.value.id, result.value);
  }
  const resolveClass: ClassResolver = (id: AssetId) => classes.get(id);
  const partGroups = groupLevelParts(identity.levelParts);
  const levels = new Map<string, LevelFolder>();
  const jsonAssets = new Map<string, JsonAssetDoc>();

  for (const document of identity.documents) {
    const { entry } = document;
    const file = fileLabel(entry.root, entry.path);
    if (entry.type === ActorClassAssetType.name) {
      const cls = classes.get(entry.id);
      if (cls) add(entry.id, file, actorClassReferences(registry, cls));
    } else if (entry.type === LevelAssetType.name) {
      const folder = levelFolderOf(entry.path);
      const groupKey = folder === null ? null : levelGroupKey(entry.root, folder);
      const parts = (groupKey !== null ? partGroups.get(groupKey) : undefined) ?? [];
      if (groupKey !== null) partGroups.delete(groupKey);
      const result = indexLevelFolder(document, parts, { ...options, resolveClass });
      issues.push(...result.issues);
      references.push(...result.references);
      if (result.folder) levels.set(entry.id, result.folder);
    } else {
      const def = registry.getAssetType(entry.type);
      if (def && isJsonAssetType(def)) {
        // A schema-defined JSON asset: its fields, and the asset references among them.
        const result = normalizeJsonAsset(def, document.json, options);
        withFile(file, result.issues, issues);
        if (result.value) {
          jsonAssets.set(entry.id, result.value);
          const found: FoundReference[] = [];
          collectFieldReferences(def.json.fields, result.value, "", found);
          add(entry.id, file, found);
        }
      } else if (def?.storage === "document" && def.dataFile !== undefined) {
        // A data document: core checks the envelope; its content is the engine's, but for the references its type names.
        const result = normalizeDataDocument(document.json, def, options);
        withFile(file, result.issues, issues);
        if (result.value) add(entry.id, file, dataDocumentReferences(def, result.value.data));
      }
    }
  }
  issues.push(...reportOrphanParts([...partGroups.values()].flat(), options));
  for (const [id, meta] of identity.metas) {
    const entry = identity.entries.get(id);
    if (entry?.meta) add(id, fileLabel(entry.root, entry.meta), metaReferences(registry, meta));
  }

  issues.push(...checkReferences(identity.entries, references, options));

  const byTarget = new Map<string, AssetReference[]>();
  for (const reference of references) {
    const list = byTarget.get(reference.target);
    if (list) list.push(reference);
    else byTarget.set(reference.target, [reference]);
  }

  return {
    entries: identity.entries,
    references,
    issues,
    ok: issues.every((issue) => issue.severity !== "error"),
    referrersOf: (id) => byTarget.get(id) ?? [],
    resolveClass,
    levels,
    metas: identity.metas,
    jsonAssets,
  };
}
