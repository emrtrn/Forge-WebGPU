// Schema validation of saved documents (architecture §4.5, §4.6; save service
// decision 1D).
//
// Every JSON file a save writes is recognised by its path and `schema` tag,
// normalised strictly with the same function loading uses (D4), and written in
// its canonical text: "a save always writes the latest schema" holds on the
// server. A loss refuses the save; an adjustment (a clamped number) is written
// and reported.
//
// - `*.meta.json`: `forge.assetMeta/1`; its type must claim the asset file.
// - `forge.level/1`: named `level.json` (a level is a folder).
// - `forge.levelCell/1`: at `cells/<key>.json` of a level folder, with that
//   key and the id of the folder's `level.json`.
// - `forge.actorClass/1`.
// - A data document (terrain, World Builder inputs): its envelope, with the
//   file suffix of its type; the content is the engine's (`dataDocument.ts`).
// - Anything else, the server-owned cell index included, is refused.
//
// Class actors are checked against their class: first a class written in the
// same save, then the class store (built from the asset index at start and
// refreshed after every save).

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  ACTOR_CLASS_SCHEMA,
  assetPathOfMeta,
  cellKeyOfFile,
  claimsFile,
  hasDataDocumentName,
  normalizeDataDocument,
  isJsonObject,
  LEVEL_CELL_INDEX_SCHEMA,
  LEVEL_CELL_SCHEMA,
  LEVEL_SCHEMA,
  levelFolderOf,
  metaTypeOf,
  normalizeActorClass,
  normalizeAssetMeta,
  normalizeLevel,
  normalizeLevelCell,
  partFolderOf,
  stringifyDocument,
  type ActorClassDoc,
  type AssetId,
  type AssetIndex,
  type ClassResolver,
  type Issue,
  type SchemaRegistry,
} from "../../src/core/index.ts";
import type { DocumentCheck, SaveContext, SaveIssue } from "./transaction.ts";

/** Actor classes by id, kept in step with the files on disk. */
export interface ClassStore {
  get(id: AssetId): ActorClassDoc | undefined;
  /** Every class, by id order. */
  all(): ActorClassDoc[];
  /** Re-reads the given project files: a class file is (re)loaded, a gone one dropped. */
  refresh(paths: readonly string[]): Promise<void>;
}

export function createClassStore(
  root: string,
  registry: SchemaRegistry,
  index: Pick<AssetIndex, "entries" | "resolveClass">,
): ClassStore {
  const byId = new Map<string, ActorClassDoc>();
  const idOfPath = new Map<string, string>();
  for (const entry of index.entries.values()) {
    if (entry.type !== "forge.actorClass") continue;
    const cls = index.resolveClass(entry.id as AssetId);
    if (!cls) continue;
    byId.set(cls.id, cls);
    idOfPath.set(entry.root === "" ? entry.path : `${entry.root}/${entry.path}`, cls.id);
  }
  return {
    get: (id) => byId.get(id),
    all: () => [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    async refresh(paths) {
      for (const path of paths) {
        const previous = idOfPath.get(path);
        if (previous !== undefined) {
          byId.delete(previous);
          idOfPath.delete(path);
        }
        let text: string;
        try {
          text = await readFile(join(root, path), "utf8");
        } catch {
          continue; // deleted
        }
        let json: unknown;
        try {
          json = JSON.parse(text);
        } catch {
          continue;
        }
        if (!isJsonObject(json) || json.schema !== ACTOR_CLASS_SCHEMA) continue;
        const cls = normalizeActorClass(json, { strict: false, registry }).value;
        if (cls) {
          byId.set(cls.id, cls);
          idOfPath.set(path, cls.id);
        }
      }
    },
  };
}

const toSaveIssues = (file: string, issues: readonly Issue[]): SaveIssue[] =>
  issues.map((found) => ({ file, path: found.path, code: found.code, severity: found.severity, message: found.message }));

const refuse = (file: string, code: string, message: string) => ({
  text: "",
  issues: [{ file, path: "", code, severity: "error" as const, message }],
});

function parseJson(text: string): { json: unknown } | { error: string } {
  try {
    return { json: JSON.parse(text) as unknown };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

/** Classes written in this save, normalised once per save. */
function pendingClasses(context: SaveContext, registry: SchemaRegistry): Map<string, ActorClassDoc> {
  const classes = new Map<string, ActorClassDoc>();
  for (const { text } of context.pending) {
    const parsed = parseJson(text);
    if (!("json" in parsed) || !isJsonObject(parsed.json) || parsed.json.schema !== ACTOR_CLASS_SCHEMA) continue;
    const cls = normalizeActorClass(parsed.json, { strict: false, registry }).value;
    if (cls) classes.set(cls.id, cls);
  }
  return classes;
}

export function createDocumentCheck(registry: SchemaRegistry, classes: ClassStore): DocumentCheck {
  const overlays = new WeakMap<SaveContext, Map<string, ActorClassDoc>>();
  const resolverFor = (context: SaveContext): ClassResolver => {
    let overlay = overlays.get(context);
    if (!overlay) {
      overlay = pendingClasses(context, registry);
      overlays.set(context, overlay);
    }
    const local = overlay;
    return (id) => local.get(id) ?? classes.get(id);
  };

  return async ({ path, text }, context) => {
    if (!path.endsWith(".json")) return { text, issues: [] }; // binaries come through the staged channel
    const parsed = parseJson(text);
    if (!("json" in parsed)) return refuse(path, "invalid-document", `Not valid JSON: ${parsed.error}`);
    const json = parsed.json;
    const schema = isJsonObject(json) ? json.schema : undefined;
    const options = { strict: true, registry, resolveClass: resolverFor(context) };

    const assetPath = assetPathOfMeta(path);
    if (assetPath !== null) {
      const result = normalizeAssetMeta(json, options);
      const issues = toSaveIssues(path, result.issues);
      const def = result.value ? metaTypeOf(registry, result.value) : undefined;
      if (def && !claimsFile(def, assetPath)) {
        issues.push({ file: path, path: "type", code: "asset-type-mismatch", severity: "error", message: `${def.name} does not take ${assetPath}.` });
      }
      return { text: result.value ? stringifyDocument(result.value) : "", issues };
    }

    if (schema === LEVEL_SCHEMA) {
      if (levelFolderOf(path) === null) return refuse(path, "invalid-document", "A level is a folder: its document is named level.json.");
      const result = normalizeLevel(json, options);
      return { text: result.value ? stringifyDocument(result.value) : "", issues: toSaveIssues(path, result.issues) };
    }

    if (schema === LEVEL_CELL_SCHEMA) {
      const folder = partFolderOf(path);
      const key = folder === null ? null : cellKeyOfFile(folder === "" ? path : path.slice(folder.length + 1));
      if (folder === null || key === null) return refuse(path, "orphan-part", "A cell is saved as cells/<x>_<z>.json in a level folder.");
      const result = normalizeLevelCell(json, options);
      const issues = toSaveIssues(path, result.issues);
      const cell = result.value;
      if (cell && cell.cell !== key) {
        issues.push({ file: path, path: "cell", code: "invalid-value", severity: "error", message: `The file name says cell ${key}, the file says ${cell.cell}.` });
      }
      const levelText = await context.textAfter(folder === "" ? "level.json" : `${folder}/level.json`);
      const level = levelText === null ? null : parseJson(levelText);
      const levelId = level && "json" in level && isJsonObject(level.json) ? level.json.id : undefined;
      if (cell && levelId !== undefined && cell.level !== levelId) {
        issues.push({ file: path, path: "level", code: "invalid-value", severity: "error", message: `The cell belongs to level ${cell.level}, the folder holds ${String(levelId)}.` });
      }
      return { text: cell ? stringifyDocument(cell) : "", issues };
    }

    if (schema === ACTOR_CLASS_SCHEMA) {
      const result = normalizeActorClass(json, options);
      return { text: result.value ? stringifyDocument(result.value) : "", issues: toSaveIssues(path, result.issues) };
    }

    if (schema === LEVEL_CELL_INDEX_SCHEMA) return refuse(path, "server-owned", "A level's cell index is written by the server only.");
    const dataType = registry.documentTypeForSchema(schema);
    if (dataType?.dataFile !== undefined) {
      if (!hasDataDocumentName(dataType, path)) {
        return refuse(path, "invalid-document", `A ${dataType.label} file is named *${dataType.dataFile.suffix}.`);
      }
      const result = normalizeDataDocument(json, dataType, options);
      return { text: result.value ? stringifyDocument(result.value) : "", issues: toSaveIssues(path, result.issues) };
    }
    return refuse(path, "unrecognized-file", "Not a document the editor saves: no known schema tag.");
  };
}
