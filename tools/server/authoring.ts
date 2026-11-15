// A project opened for authoring (architecture §4.6, §4.11; plan phase 4
// step 9b): what the dev server's endpoints and the agent's edit commands
// (`npm run forge -- edit`, A12) share, so both read, check and write a
// project the same way:
//
// - the write policy, the read-only roots (the engine's content and the
//   packs, A9) and how a labelled path resolves on disk;
// - the asset index over every content root (rescanned after a change);
// - the class store, the document check and the save service (journal,
//   revisions, the project's save lock), and in engine content mode the
//   engine repository's own save service;
// - `save`: the JSON save as `POST /__forge/save` answers it (one content
//   root per save, read-only projects refused), with its HTTP status.
//
// Opening one has no other effect: the dev server's staging folder and play
// sessions belong to the server (forgeServer.ts), not to every process that
// opens the project.

import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { buildAssetIndex, type AssetIndex, type SchemaRegistry } from "../../src/core/index.ts";
import { ENGINE_LABEL_PREFIX } from "../assets/engineContent.ts";
import { projectContentRoots, scanRoots, type ContentRoot, type ScanResult } from "../assets/scan.ts";
import { defaultContentRoots } from "../assets/verify.ts";
import { createClassStore, createDocumentCheck, type ClassStore } from "../save/documentCheck.ts";
import { createSaveService, type DocumentCheck, type SaveRequest, type SaveResult, type SaveService } from "../save/transaction.ts";
import { engineContentAccess, engineContentResult } from "./engineContentMode.ts";
import {
  createWritePolicy,
  normalizeProjectPath,
  ProjectPathError,
  resolveProjectPath,
  resolveWritablePath,
  type WritePolicy,
} from "./projectPaths.ts";

export interface AuthoringOptions {
  /** Project root. */
  readonly root: string;
  readonly registry: SchemaRegistry;
  readonly writableRoots?: readonly string[];
  /** Content roots scanned for the class store; default `content/` and `samples/*\/content/`. */
  readonly contentRoots?: readonly string[];
  /** Roots outside the project, indexed and readable, never written: the engine's content and packs. */
  readonly readOnlyRoots?: readonly ContentRoot[];
  /** Refuse every save and upload (samples and fixtures, A9). */
  readonly readOnly?: boolean;
  /** Engine content mode: the engine repository whose `content/engine` and `content/packs` the read-only roots are, written here. */
  readonly engineContent?: { readonly root: string };
}

export interface IndexedContent {
  readonly scan: ScanResult;
  readonly index: AssetIndex;
}

/** What a save answers, as `POST /__forge/save` sends it. */
export interface SaveAnswer {
  readonly status: number;
  readonly body: SaveResult | { readonly status: "rejected"; readonly reason: string; readonly message: string };
}

export interface Authoring {
  readonly policy: WritePolicy;
  readonly readOnly: boolean;
  readonly readOnlyRoots: readonly ContentRoot[];
  /** Every content root the index covers: the project's, then the read-only ones. */
  readonly contentRoots: readonly ContentRoot[];
  /** Engine content mode is on. */
  readonly engineMode: boolean;
  readonly engine: ReturnType<typeof engineContentAccess> | null;
  readonly classes: ClassStore;
  readonly check: DocumentCheck;
  readonly saves: SaveService;
  readonly engineSaves: SaveService | null;
  /** The label of the content root a path is under (`engine:content/packs/starter`), else `project`. */
  rootOfLabel(path: string): string;
  /** Where a listed file is on disk: a labelled content root, else the project. */
  absoluteOf(path: string): string;
  /** Where a readable path is on disk (a read-only root, else a writable project path); throws `ProjectPathError`. */
  resolveReadable(path: string): string;
  /** Whether files under this root label may be written here. */
  writableLabel(label: string): boolean;
  /** The content roots as last scanned. */
  current(): Promise<IndexedContent>;
  /** Scans the disk now (and keeps it as the current one). */
  rescan(): Promise<IndexedContent>;
  /**
   * Files changed on disk (another process saved, by label): the next `current()` rescans and the class store
   * re-reads them (a level's own files are never classes and are not read: a cell can be megabytes).
   */
  changed(paths: readonly string[]): Promise<void>;
  /** A file's bytes; null when it does not exist. Throws `ProjectPathError` for a path outside the readable roots. */
  read(path: string): Promise<Buffer | null>;
  /** One JSON save: the engine's side or the project's, never both; a read-only project is refused. */
  save(request: SaveRequest): Promise<SaveAnswer>;
}

/** A level folder's own files: `level.json`, `cells.json`, `cells/<x>_<z>.json`. */
function isLevelFile(path: string): boolean {
  return /(^|\/)(level|cells)\.json$/.test(path) || /(^|\/)cells\/[^/]+\.json$/.test(path);
}

export const READ_ONLY_MESSAGE =
  "This project is opened read-only (the engine's samples and fixtures are changed by review, not by the editor). Create your own with npm run create-project.";

export const STATUS_OF: Record<SaveResult["status"] | "path" | "request" | "document", number> = {
  saved: 200,
  conflict: 409,
  rejected: 400,
  path: 403,
  request: 400,
  document: 422,
};

/** A file under a read-only root: inside it, no links, no hidden names. */
export function resolveReadOnlyPath(root: ContentRoot, path: string): string {
  const normalized = normalizeProjectPath(path);
  if (normalized.split("/").some((part) => part.startsWith("."))) {
    throw new ProjectPathError("hidden", `Names starting with "." are not read: ${root.label}/${path}`);
  }
  return resolveProjectPath(root.dir, normalized);
}

export async function openAuthoring(options: AuthoringOptions): Promise<Authoring> {
  const policy = createWritePolicy(options.root, options.writableRoots);
  const readOnlyRoots = options.readOnlyRoots ?? [];
  const engine = options.engineContent ? engineContentAccess(options.engineContent.root, readOnlyRoots) : null;
  const engineMode = engine !== null;
  const readOnly = options.readOnly === true;
  const outsideOf = (path: string): ContentRoot | undefined => readOnlyRoots.find((root) => path.startsWith(`${root.label}/`));
  const rootOfLabel = (path: string): string => readOnlyRoots.find((root) => path === root.label || path.startsWith(`${root.label}/`))?.label ?? "project";
  const absoluteOf = (path: string): string => {
    const outside = outsideOf(path);
    return outside ? resolveReadOnlyPath(outside, path.slice(outside.label.length + 1)) : join(policy.root, ...path.split("/"));
  };
  const resolveReadable = (path: string): string => {
    const outside = outsideOf(path);
    return outside ? resolveReadOnlyPath(outside, path.slice(outside.label.length + 1)) : resolveWritablePath(policy, path).absolute;
  };
  const allRoots = [...projectContentRoots(policy.root, options.contentRoots ?? defaultContentRoots(policy.root)), ...readOnlyRoots];
  const indexRoots = async (): Promise<IndexedContent> => {
    const scan = await scanRoots(allRoots);
    return { scan, index: buildAssetIndex(scan.files, { strict: false, registry: options.registry }) };
  };
  const first = await indexRoots();
  const classes = createClassStore(policy.root, options.registry, first.index, absoluteOf);
  // A save can add, move or delete files: the next request rescans.
  let snapshot: Promise<IndexedContent> | null = Promise.resolve(first);
  const current = (): Promise<IndexedContent> => (snapshot ??= indexRoots());
  const classFiles = async () => (await indexRoots()).scan.files.filter((file) => file.json !== undefined).map((file) => ({ file: `${file.root}/${file.path}`, json: file.json }));
  const writableLabel = (label: string): boolean =>
    readOnlyRoots.some((root) => root.label === label) ? engine?.rootOf(label) !== undefined : !readOnly;
  const check = createDocumentCheck(options.registry, classes, { files: classFiles, label: (path) => path });
  const saves = createSaveService({
    policy,
    check,
    afterSave: (files) => {
      snapshot = null;
      return classes.refresh(files.map((file) => file.path));
    },
  });
  await saves.recover();
  // The engine repository's own save service (engine content mode).
  const engineSaves = engine
    ? createSaveService({
        policy: engine.policy,
        check: createDocumentCheck(options.registry, classes, { files: classFiles, label: (path) => `${ENGINE_LABEL_PREFIX}${path}` }),
        afterSave: async (files) => {
          snapshot = null;
          // Recovery can report no paths: include old and new class paths so
          // a recovered delete is removed as well as a recovered new class added.
          const paths = files.length > 0 ? files.map((file) => `${ENGINE_LABEL_PREFIX}${file.path}`) : [
            ...first.index.entries.values(), ...(await current()).index.entries.values(),
          ].filter((entry) => entry.type === "forge.actorClass").map((entry) => `${entry.root}/${entry.path}`);
          await classes.refresh(paths);
        },
      })
    : null;
  await engineSaves?.recover();

  return {
    policy,
    readOnly,
    readOnlyRoots,
    contentRoots: allRoots,
    engineMode,
    engine,
    classes,
    check,
    saves,
    engineSaves,
    rootOfLabel,
    absoluteOf,
    resolveReadable,
    writableLabel,
    current,
    rescan: () => (snapshot = indexRoots()),
    async changed(paths) {
      snapshot = null;
      await classes.refresh(paths.filter((path) => path.endsWith(".json") && !isLevelFile(path)));
    },
    async read(path) {
      const absolute = resolveReadable(path);
      try {
        return await readFile(absolute);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    },
    async save(request) {
      const paths = [...(request.writes ?? []).map((write) => write.path), ...(request.deletes ?? []).map((entry) => entry.path)];
      const engineSide = paths.length > 0 && paths.every((path) => path.startsWith(ENGINE_LABEL_PREFIX));
      if (engineMode && paths.some((path) => path.startsWith(ENGINE_LABEL_PREFIX)) && new Set(paths.map(rootOfLabel)).size > 1) {
        return { status: 403, body: { status: "rejected", reason: "path", message: "A save stays in one engine content root; project and engine files cannot be mixed." } };
      }
      if (!engineSide && readOnly) return { status: 403, body: { status: "rejected", reason: "read-only", message: READ_ONLY_MESSAGE } };
      for (const write of request.writes ?? []) {
        if (write.staged !== undefined && !(await stat(write.staged).then(() => true, () => false))) {
          return { status: 400, body: { status: "rejected", reason: "request", message: "A staged upload is gone; stage it again." } };
        }
      }
      let result: SaveResult;
      try {
        result = engineSide && engine && engineSaves ? engineContentResult(await engineSaves.commit(engine.request(request))) : await saves.commit(request);
      } catch (error) {
        if (!(error instanceof ProjectPathError)) throw error;
        return { status: 403, body: { status: "rejected", reason: "path", message: error.message } };
      }
      return { status: result.status === "rejected" ? STATUS_OF[result.reason] : STATUS_OF[result.status], body: result };
    },
  };
}
