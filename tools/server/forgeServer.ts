// The dev server's authoring endpoints (architecture §4.6; save service
// decisions 1A–1F). One family of generic endpoints, not one per file type:
//
//   POST /__forge/save          JSON: { writes: [{ path, base, text | staged }], deletes: [{ path, base }] }
//                               200 saved, 409 conflict, 403 path refused, 400 bad request, 422 document refused
//   POST /__forge/stage-binary  raw body -> { id, size, revision }; `staged: id` in a later save
//   GET  /__forge/read?path=    the file, with its revision in `X-Forge-Revision`; a path under
//                               a read-only root (`engine:content/packs/starter/...`) reads the
//                               engine's content and packs (A9)
//   GET  /__forge/identity      which engine and which project this server serves (D14)
//   GET  /__forge/classes       the project's actor classes, normalised
//   GET  /__forge/content       what the Content Browser lists: roots (writable or not), folders, files with
//                               their GUID, type and issues (contentListing.ts); `?refresh=1` rescans the disk
//   POST /__forge/content       a Content Browser operation (contentOps.ts): { op: move | rename | copy | delete |
//                               mkdir, ... } -> 200 { status: "done", result }, or 400 / 403 / 404 / 409 with
//                               { status: "refused", reason, message, referrers? }; one save transaction, the
//                               start level in forge.project.json following a move; `import` / `reimport`
//                               take staged uploads and optimise a GLB by its import settings first
//   GET  /__forge/thumbnail?id=&rev=   a Content Browser thumbnail from the cache (PNG), 404 when not drawn yet
//   POST /__forge/thumbnail?id=&rev=   stores one the editor drew (PNG body); older revisions of the asset go
//                               (`.forge-cache/thumbnails/<guid>-<revision>.png`, decision 9; a cache, so a
//                               read-only project takes it too)
//   GET  /__forge/asset-files   every binary asset (with its import settings), schema-defined JSON asset and data document:
//                               GUID -> { type, file, import? }, `file` for /__forge/read
//                               (the renderer resolves model and texture GUIDs with it)
//   GET  /__forge/world-builder, POST /__forge/world-builder/pack, POST /__forge/world-random
//                               the World Builder window (worldBuilder.ts, plan 5d step 8)
//   POST /__forge/play          a play session: the editor's unsaved level files, checked, in a layer over the
//                               project (playSessions.ts, plan phase 4 step 8); `GET /__forge/read?…&play=<id>`
//                               reads through it, `GET /__forge/play?id=` names its level and camera. A
//                               read-only project plays too: the layer is not the project's files
//
// A project opened read-only (the engine's samples and fixtures, A9) refuses
// saves and uploads with 403; it can still be read.
//
// Engine content mode (plan phase 4 step 6g; decision 6: `npm run dev --
// --engine-content` in the engine repository): the engine's content and the
// packs are written from the Content Browser, through a second save service
// rooted at the engine repository. One operation stays in one content root:
// a move or copy between the engine's content and a pack, or between packs,
// is refused (it could turn a reference against the dependency direction,
// which `verify:assets` checks in the gate). The project's own files keep its
// rules (the engine's samples stay read-only). The engine's content and
// packs are never written in normal project mode. In engine content mode,
// `/save` also routes engine-labelled level documents to the engine service.
//
// Every /__forge/ request must come from this machine: the socket address is
// local (Forge's rule; forwarded headers are not trusted), the Host header
// names localhost (DNS rebinding), an Origin header if present names localhost
// too, and the request carries `X-Forge-Request: 1`. A web page elsewhere
// cannot send that header without a CORS preflight, which is never granted.

import { randomBytes } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { Worker } from "node:worker_threads";
import type { GenerateOptions } from "../procgen/generate.ts";
import { DATA_DOCUMENT_TYPES, type AssetId, type AssetIndex, type JsonObject } from "../../src/core/index.ts";
import { buildContentListing } from "../assets/contentListing.ts";
import { planContentOp, type ContentOp, type ContentPlan } from "../assets/contentOps.ts";
import { glbOptimizeSettings } from "../assets/glbOptimizeSettings.ts";
import { fileRevision } from "../assets/revision.ts";
import { createModelBoundsIndex } from "../assets/modelBounds.ts";
import { recipeLinks } from "../../src/engine/procgen/recipeLinks.ts";
import { recipeGenerator } from "../../src/engine/procgen/recipeOutputs.ts";
import type { ZoneBox } from "../../src/engine/world/zones.ts";
import { ENGINE_LABEL_PREFIX } from "../assets/engineContent.ts";
import { engineContentResult } from "./engineContentMode.ts";
import { openAuthoring, READ_ONLY_MESSAGE, resolveReadOnlyPath, STATUS_OF, type Authoring, type AuthoringOptions } from "./authoring.ts";
import { createPlaySessions, PLAY_ID, PlaySessionMissing } from "./playSessions.ts";
import { MANIFEST_FILE, type SaveRequest, type SaveResult } from "../save/transaction.ts";
import { normalizeProjectPath, ProjectPathError, resolveWritablePath, type WritePolicy } from "./projectPaths.ts";
import { createHlodJobs, type HlodJobs } from "./hlodJobs.ts";
import { createWorldBuilderServer, type StartWorldBuild } from "./worldBuilder.ts";

export const STAGING_DIR = ".forge-staging";
export const THUMBNAIL_DIR = ".forge-cache/thumbnails";
/** A thumbnail is a small PNG (192 px). */
export const MAX_THUMBNAIL_BYTES = 2 * 1024 * 1024;
const THUMBNAIL_ID = /^(ast|lvl)_[0-9a-f]{32}$/;
const THUMBNAIL_REVISION = /^[0-9a-f]{16}$/;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** One staged binary, and one JSON save request (a full save of a 50.000-actor level is ~38 MB). */
export const MAX_BODY_BYTES = 64 * 1024 * 1024;
export const FORGE_REQUEST_HEADER = "x-forge-request";

type Next = (error?: unknown) => void;
export type Middleware = (req: IncomingMessage, res: ServerResponse, next: Next) => void;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** Trust only the real peer socket address, never forwarded headers. */
export function isLocalRequest(req: Pick<IncomingMessage, "socket">): boolean {
  const address = req.socket.remoteAddress ?? "";
  return address === "::1" || address === "::ffff:127.0.0.1" || address.startsWith("127.");
}

function hostName(value: string): string {
  if (value.startsWith("[")) return value.slice(0, value.indexOf("]") + 1).toLowerCase();
  return (value.split(":")[0] ?? "").toLowerCase();
}

/** Null when the request may use the authoring endpoints; otherwise why not. */
export function refuseReason(req: Pick<IncomingMessage, "socket" | "headers">): string | null {
  if (!isLocalRequest(req)) return "authoring endpoints are restricted to this machine";
  const host = req.headers.host;
  if (typeof host !== "string" || !LOCAL_HOSTS.has(hostName(host))) return "the Host header must name localhost";
  const origin = req.headers.origin;
  if (typeof origin === "string") {
    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      return "the Origin header is not a URL";
    }
    if (!LOCAL_HOSTS.has(hostName(originHost))) return "the request comes from another site";
  }
  if (req.headers[FORGE_REQUEST_HEADER] !== "1") return `the ${FORGE_REQUEST_HEADER} header is missing`;
  return null;
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

class BodyTooLarge extends Error {}

function limit(max: number): Transform {
  let size = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding, done) {
      size += chunk.length;
      if (size > max) done(new BodyTooLarge(`The body is larger than ${max} bytes.`));
      else done(null, chunk);
    },
  });
}

async function readBody(req: IncomingMessage, max: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > max) throw new BodyTooLarge(`The body is larger than ${max} bytes.`);
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

export { STATUS_OF };

export interface ForgeServerOptions extends AuthoringOptions {
  /** Repository root owning tools/world/hlodWorker.ts; Vite passes its config root. */
  readonly engineRoot?: string;
  /** Body size limit; default MAX_BODY_BYTES. */
  readonly maxBodyBytes?: number;
  /** What `/__forge/identity` answers. */
  readonly identity?: unknown;
  /** Tests may inject a worker adapter; production owns one queue per server/project. */
  readonly hlodJobs?: HlodJobs;
  /** Tests may inject a World Builder build. */
  readonly startWorldBuild?: StartWorldBuild;
  /** Restarts the dev server (a content pack was added to the manifest). */
  readonly restart?: () => void;
}

/** An asset's file as `GET /__forge/asset-files` lists it; `file` is what `/__forge/read?path=` takes. */
export interface AssetFileEntry {
  readonly bounds?: ZoneBox;
  readonly type: string;
  readonly file: string;
  /** A binary asset's normalised import settings (texture anisotropy, a model's material slots). */
  readonly import?: JsonObject;
}

const DATA_DOCUMENT_NAMES = new Set(DATA_DOCUMENT_TYPES.map((def) => def.name));
const isDataDocumentType = (type: string): boolean => DATA_DOCUMENT_NAMES.has(type);

/**
 * The assets the renderer loads by GUID: every binary asset, with the import
 * settings of its meta file, every schema-defined JSON asset (materials) and
 * every data document (a terrain; its parts are read beside it, plan phase 3
 * step 8). Levels and classes are read otherwise.
 */
export function rendererAssetFiles(index: AssetIndex, modelBounds?: ReadonlyMap<string, ZoneBox>): Record<string, AssetFileEntry> {
  const out: Record<string, AssetFileEntry> = {};
  for (const entry of index.entries.values()) {
    const file = `${entry.root}/${entry.path}`;
    if (entry.storage === "binary") {
      const meta = index.metas.get(entry.id);
      const bounds = modelBounds?.get(entry.id);
      out[entry.id] = { type: entry.type, file, ...(meta ? { import: meta.import } : {}), ...(bounds ? { bounds } : {}) };
    } else if (index.jsonAssets.has(entry.id) || isDataDocumentType(entry.type)) {
      out[entry.id] = { type: entry.type, file };
    }
  }
  return out;
}

export interface ForgeServer {
  readonly middleware: Middleware;
  readonly policy: WritePolicy;
  /** What the endpoints read and write through (authoring.ts): the save services, the index, the class store. */
  readonly authoring: Authoring;
  dispose(): void;
}

const STAGE_ID = /^[0-9a-f]{32}$/;

class ContentRequestError extends Error {}


export async function createForgeServer(options: ForgeServerOptions): Promise<ForgeServer> {
  const authoring = await openAuthoring(options);
  const modelBounds = createModelBoundsIndex(authoring.resolveReadable);
  const { policy, readOnlyRoots, engine, engineMode, classes, check, saves, engineSaves, rootOfLabel, absoluteOf, writableLabel, current } = authoring;
  const maxBody = options.maxBodyBytes ?? MAX_BODY_BYTES;
  const stagingDir = join(policy.root, STAGING_DIR);
  const hlodJobs = options.hlodJobs ?? createHlodJobs({
    engineRoot: options.engineRoot ?? resolve(dirname(fileURLToPath(import.meta.url)), "../.."), project: policy.root,
  });
  const worldBuilder = createWorldBuilderServer({
    engineRoot: options.engineRoot ?? resolve(dirname(fileURLToPath(import.meta.url)), "../.."), authoring, readOnly: options.readOnly === true,
    ...(options.startWorldBuild ? { start: options.startWorldBuild } : {}),
  });
  // Uploads do not outlive the server: a save names them within one session.
  await rm(stagingDir, { recursive: true, force: true });

  let bakingRecipe = false;
  const bakeRecipe = async (req: IncomingMessage, res: ServerResponse) => {
    let input;
    try { input = JSON.parse((await readBody(req, 256 * 1024)).toString("utf8")); }
    catch (error) { send(res, error instanceof BodyTooLarge ? 413 : 400, { message: "Invalid generation request." }); return; }
    const { document, base, path } = input ?? {};
    if (typeof path !== "string" || typeof base !== "string" || !THUMBNAIL_REVISION.test(base) || typeof document?.id !== "string") {
      send(res, 400, { message: "Expected a recipe, path and saved revision." }); return;
    }
    const entry = (await current()).index.entries.get(document.id);
    if (!entry || recipeGenerator(entry.type) === null || `${entry.root}/${entry.path}` !== path) {
      send(res, 404, { message: "The recipe no longer exists at this path." }); return;
    }
    if (!writableLabel(entry.root)) { send(res, 403, { message: "This recipe is read-only." }); return; }
    const codeRoot = options.engineRoot ?? resolve(dirname(fileURLToPath(import.meta.url)), "../..");
    let target: GenerateOptions;
    if (path.startsWith(ENGINE_LABEL_PREFIX)) {
      const pack = /^engine:content\/packs\/([a-z][a-z0-9-]*)$/.exec(entry.root)?.[1];
      if (!pack || !engine || !options.engineContent) { send(res, 403, { message: "Generate into a writable content pack or project." }); return; }
      const recipe = engine.request({ writes: [{ path, base, text: "" }] }).writes![0]!.path;
      target = { engineRoot: options.engineContent.root, pack, recipe };
    } else {
      target = { engineRoot: codeRoot, projectRoot: policy.root, recipe: resolveWritablePath(policy, path).relative };
    }
    if (bakingRecipe) { send(res, 409, { message: "Another recipe is being generated." }); return; }
    bakingRecipe = true;
    try {
      const result = await new Promise<SaveResult>((accept, reject) => {
        const worker = new Worker(join(codeRoot, "tools/procgen/editorBakeWorker.ts"), {
          execArgv: [], workerData: { ...target, force: true, editorDraft: { document, base } },
        });
        worker.once("message", accept);
        worker.once("error", reject);
        worker.once("exit", code => reject(new Error(`Generation ended before replying (${code}).`)));
      });
      if (result.status === "saved") await authoring.rescan();
      send(res, STATUS_OF[result.status], target.pack ? engineContentResult(result) : result);
    } finally { bakingRecipe = false; }
  };

  /** A model recipe's output, its digest and what it is connected to (the editor's Related list, the approval page). */
  const recipeLinksOf = async (url: URL, res: ServerResponse): Promise<void> => {
    const links = recipeLinks((await current()).index, (url.searchParams.get("id") ?? "") as AssetId);
    send(res, links ? 200 : 404, links ?? { message: "No model recipe has this id." });
  };

  const hlod = async (req: IncomingMessage, url: URL, res: ServerResponse): Promise<void> => {
    if (options.readOnly) {
      req.resume();
      send(res, 403, { message: "HLOD generation requires a writable project level" });
      return;
    }
    try {
      const raw = req.method === "POST" ? JSON.parse((await readBody(req, 4096)).toString("utf8")) as unknown : { level: url.searchParams.get("level") };
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Expected an HLOD request");
      const value = raw as { level?: unknown; build?: unknown; force?: unknown };
      if (typeof value.level !== "string" || value.level.length > 1024) throw new Error("Expected a project level folder");
      const level = normalizeProjectPath(value.level);
      resolveWritablePath(policy, `${level}/level.json`);
      if (req.method === "POST") {
        if (typeof value.build !== "boolean" || (value.force !== undefined && typeof value.force !== "boolean")) throw new Error("Expected build/force booleans");
        if (value.force === true && !value.build) throw new Error("Force requires build");
        send(res, 202, hlodJobs.request({ level, build: value.build, force: value.force === true }));
      } else send(res, 200, hlodJobs.status(level));
    } catch (error) {
      send(res, error instanceof ProjectPathError ? 403 : error instanceof BodyTooLarge ? 413 : 400, {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const worldRandom = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    let body: unknown;
    try {
      body = JSON.parse((await readBody(req, 64 * 1024)).toString("utf8"));
    } catch (error) {
      send(res, error instanceof BodyTooLarge ? 413 : 400, { message: "Invalid World Builder request." });
      return;
    }
    await worldBuilder.build(body, res);
  };
  const addWorldBuilderPacks = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    req.resume();
    const answer = await worldBuilder.addPacks();
    // Once the page has its answer: the restart drops the connections.
    if (answer.restart && options.restart) res.once("close", options.restart);
    send(res, answer.status, answer.body);
  };

  const save = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (options.readOnly && !engineMode) {
      req.resume();
      send(res, 403, { status: "rejected", reason: "read-only", message: READ_ONLY_MESSAGE });
      return;
    }
    let request: SaveRequest;
    try {
      const raw = JSON.parse((await readBody(req, maxBody)).toString("utf8")) as {
        writes?: { path: string; base: string | null; text?: string; staged?: string }[];
        deletes?: { path: string; base: string }[];
      };
      const writes = (raw.writes ?? []).map((write) => {
        if (write.staged === undefined) return write;
        if (!STAGE_ID.test(write.staged)) throw new Error(`Unknown staged upload: ${write.staged}`);
        return { ...write, staged: join(stagingDir, write.staged) };
      });
      request = { writes, deletes: raw.deletes ?? [] };
    } catch (error) {
      const status = error instanceof BodyTooLarge ? 413 : 400;
      send(res, status, { status: "rejected", reason: "request", message: error instanceof Error ? error.message : String(error) });
      return;
    }
    const answer = await authoring.save(request);
    send(res, answer.status, answer.body);
  };

  const stage = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (options.readOnly && !engineMode) {
      req.resume();
      send(res, 403, { status: "rejected", reason: "read-only", message: READ_ONLY_MESSAGE });
      return;
    }
    await mkdir(stagingDir, { recursive: true });
    const id = randomBytes(16).toString("hex");
    const path = join(stagingDir, id);
    try {
      await pipeline(req, limit(maxBody), createWriteStream(path));
    } catch (error) {
      await rm(path, { force: true });
      if (error instanceof BodyTooLarge) {
        send(res, 413, { status: "rejected", reason: "request", message: error.message });
        return;
      }
      throw error;
    }
    const bytes = await readFile(path);
    send(res, 200, { id, size: bytes.length, revision: fileRevision(bytes) });
  };

  const resolveReadable = authoring.resolveReadable;
  const plays = await createPlaySessions({ root: policy.root, resolve: resolveReadable, check });

  const read = async (url: URL, res: ServerResponse): Promise<void> => {
    const path = url.searchParams.get("path") ?? "";
    const play = url.searchParams.get("play");
    let absolute: string;
    try {
      absolute = resolveReadable(path);
    } catch (error) {
      if (!(error instanceof ProjectPathError)) throw error;
      send(res, 403, { status: "rejected", reason: "path", message: error.message });
      return;
    }
    let bytes: Buffer | null | undefined;
    if (play !== null) {
      try {
        bytes = await plays.overlay(play, path);
      } catch (error) {
        if (!(error instanceof PlaySessionMissing)) throw error;
        send(res, 410, { status: "missing-session", message: error.message });
        return;
      }
      if (bytes === null) {
        send(res, 404, { status: "missing", path });
        return;
      }
    }
    try {
      bytes ??= await readFile(absolute);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      send(res, 404, { status: "missing", path });
      return;
    }
    res.statusCode = 200;
    res.setHeader("Content-Type", path.endsWith(".json") ? "application/json; charset=utf-8" : "application/octet-stream");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Forge-Revision", fileRevision(bytes));
    res.end(bytes);
  };

  /** The manifest's start level, and the manifest text with another one (only that value changes: the file keeps its form). */
  const readManifest = async (): Promise<{ bytes: Buffer; startLevel: string } | null> => {
    try {
      const bytes = await readFile(join(policy.root, MANIFEST_FILE));
      const json = JSON.parse(bytes.toString("utf8")) as { startLevel?: unknown };
      return { bytes, startLevel: typeof json.startLevel === "string" ? json.startLevel : "" };
    } catch {
      return null;
    }
  };
  const contentOp = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (options.readOnly && !engineMode) {
      req.resume();
      send(res, 403, { status: "refused", reason: "read-only", message: READ_ONLY_MESSAGE });
      return;
    }
    let op: ContentOp;
    try {
      op = JSON.parse((await readBody(req, maxBody)).toString("utf8")) as ContentOp;
    } catch (error) {
      send(res, 400, { status: "refused", reason: "request", message: error instanceof Error ? error.message : String(error) });
      return;
    }
    if (op.op === "startLevel" && op.level.startsWith(ENGINE_LABEL_PREFIX)) {
      send(res, 403, { status: "refused", reason: "read-only", message: "A project's start level must be in the project's own content." });
      return;
    }
    // Planned against the disk as it is now (a file may have come or gone since the last scan).
    const { scan, index } = await authoring.rescan();
    const manifest = await readManifest();
    const outcome = planContentOp(op, { scan, index, registry: options.registry, writable: writableLabel, startLevel: manifest?.startLevel ?? "" });
    if (!outcome.ok) {
      send(res, outcome.status, { status: "refused", reason: outcome.reason, message: outcome.message, ...(outcome.referrers ? { referrers: outcome.referrers } : {}) });
      return;
    }
    const plan = outcome.plan;
    const touched = [
      ...plan.moves.flatMap((move) => [move.from, move.to]),
      ...plan.deletes,
      ...plan.writes.map((write) => write.path),
      ...plan.mkdirs,
      ...plan.removeDirs,
    ];
    const engineSide = touched.length > 0 && touched.every((path) => path.startsWith(ENGINE_LABEL_PREFIX));
    // JSON copies are already materialised in the plan, so copyOf alone is
    // insufficient: include the original selections even for JSON/empty folders.
    const sources = engineSide && op.op === "copy" ? op.items : [];
    const roots = new Set([...touched, ...sources].map(rootOfLabel));
    if (engineMode && roots.size > 1 && [...roots].some((label) => label.startsWith(ENGINE_LABEL_PREFIX))) {
      send(res, 409, {
        status: "refused",
        reason: "dependency",
        message: "Engine content mode moves and copies within one root: between the engine's content and a pack, or between packs, a reference could go against the dependency direction.",
      });
      return;
    }
    if (!engineSide && options.readOnly) {
      send(res, 403, { status: "refused", reason: "read-only", message: READ_ONLY_MESSAGE });
      return;
    }
    let request: SaveRequest;
    try {
      request = await saveRequestOf(plan, manifest);
    } catch (error) {
      if (!(error instanceof ContentRequestError)) throw error;
      send(res, 400, { status: "refused", reason: "request", message: error.message });
      return;
    }
    // The engine's side is saved in the engine repository, its paths relative to it.
    let result: SaveResult;
    try {
      result = engineSide && engine && engineSaves ? engineContentResult(await engineSaves.commit(engine.request(request))) : await saves.commit(request);
    } catch (error) {
      if (!(error instanceof ProjectPathError)) throw error;
      send(res, 403, { status: "refused", reason: "path", message: error.message });
      return;
    }
    if (result.status === "saved") send(res, 200, { status: "done", result: outcome.plan.result });
    else if (result.status === "conflict") send(res, 409, { status: "refused", reason: "exists", message: `Changed on disk meanwhile: ${result.conflicts.map((conflict) => conflict.path).join(", ")}` });
    else send(res, STATUS_OF[result.reason], { status: "refused", reason: result.reason, message: result.issues.map((one) => `${one.file}: ${one.message}`).join("; ") });
  };
  const saveRequestOf = async (plan: ContentPlan, manifest: { bytes: Buffer; startLevel: string } | null): Promise<SaveRequest> => {
    const deletes = [];
    for (const path of plan.deletes) deletes.push({ path, base: fileRevision(await readFile(absoluteOf(path))) });
    const startLevel = plan.startLevel;
    // A copy from the engine's content or a pack: its bytes go through the staging folder (the save writes project files only).
    const writes = [];
    for (const write of plan.writes) {
      // A copy out of the engine's content or a pack into the project goes through staging; in engine content mode a copy
      // within the engine's side is the engine save service's own (its source is one of its files).
      const outside =
        write.copyOf === undefined || (engineMode && write.path.startsWith(ENGINE_LABEL_PREFIX))
          ? undefined
          : readOnlyRoots.find((root) => write.copyOf!.startsWith(`${root.label}/`));
      if (write.staged !== undefined) {
        if (!STAGE_ID.test(write.staged)) throw new ContentRequestError(`Unknown staged upload: ${write.staged}`);
        const staged = join(stagingDir, write.staged);
        if (write.optimize !== undefined) {
          // The optimiser (sharp, gltf-transform) loads on the first import that needs it.
          const { optimizeGlb } = await import("../assets/optimizeGlb.ts");
          const result = await optimizeGlb(new Uint8Array(await readFile(staged)), glbOptimizeSettings(write.optimize));
          await writeFile(staged, result.bytes);
        }
        const base = write.replace ? fileRevision(await readFile(absoluteOf(write.path))) : null;
        writes.push({ path: write.path, base, staged });
      } else if (write.text !== undefined) writes.push({ path: write.path, base: null, text: write.text });
      else if (outside === undefined) writes.push({ path: write.path, base: null, copyOf: write.copyOf! });
      else {
        await mkdir(stagingDir, { recursive: true });
        const staged = join(stagingDir, randomBytes(16).toString("hex"));
        await writeFile(staged, await readFile(resolveReadOnlyPath(outside, write.copyOf!.slice(outside.label.length + 1))));
        writes.push({ path: write.path, base: null, staged });
      }
    }
    return {
      writes,
      deletes,
      moves: plan.moves,
      removeDirs: plan.removeDirs,
      mkdirs: plan.mkdirs,
      ...(startLevel !== undefined && manifest
        ? {
            manifest: {
              base: fileRevision(manifest.bytes),
              text: manifest.bytes.toString("utf8").replace(/("startLevel"\s*:\s*)"[^"]*"/, (_, key: string) => `${key}${JSON.stringify(startLevel)}`),
            },
          }
        : {}),
    };
  };

  const playCreate = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    let body: unknown;
    try {
      body = JSON.parse((await readBody(req, maxBody)).toString("utf8"));
    } catch (error) {
      send(res, error instanceof BodyTooLarge ? 413 : 400, { status: "rejected", reason: "request", message: error instanceof Error ? error.message : String(error) });
      return;
    }
    const result = await plays.create(body);
    send(res, result.status === "ready" ? 200 : STATUS_OF[result.reason], result);
  };
  const playInfo = (url: URL, res: ServerResponse): void => {
    const id = url.searchParams.get("id") ?? "";
    const info = PLAY_ID.test(id) ? plays.info(id) : null;
    if (info) send(res, 200, info);
    else send(res, 404, { status: "missing-session", message: `No play session ${id}; press Play in the editor again.` });
  };

  const thumbnailDir = join(policy.root, ...THUMBNAIL_DIR.split("/"));
  const thumbnail = async (req: IncomingMessage, url: URL, res: ServerResponse): Promise<void> => {
    const id = url.searchParams.get("id") ?? "";
    const revision = url.searchParams.get("rev") ?? "";
    if (!THUMBNAIL_ID.test(id) || !THUMBNAIL_REVISION.test(revision)) {
      req.resume();
      send(res, 400, { status: "rejected", reason: "request", message: "A thumbnail needs an asset id and a 16-digit revision." });
      return;
    }
    const file = join(thumbnailDir, `${id}-${revision}.png`);
    if (req.method === "GET") {
      try {
        const bytes = await readFile(file);
        res.statusCode = 200;
        res.setHeader("Content-Type", "image/png");
        res.setHeader("Cache-Control", "no-store");
        res.end(bytes);
      } catch {
        send(res, 404, { status: "missing" });
      }
      return;
    }
    let bytes: Buffer;
    try {
      bytes = await readBody(req, MAX_THUMBNAIL_BYTES);
    } catch (error) {
      send(res, 413, { status: "rejected", reason: "request", message: error instanceof Error ? error.message : String(error) });
      return;
    }
    if (bytes.length < PNG_SIGNATURE.length || !bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
      send(res, 400, { status: "rejected", reason: "request", message: "A thumbnail must be a PNG." });
      return;
    }
    await mkdir(thumbnailDir, { recursive: true });
    for (const old of await readdir(thumbnailDir)) {
      if (old.startsWith(`${id}-`) && old !== `${id}-${revision}.png`) await rm(join(thumbnailDir, old), { force: true });
    }
    await writeFile(file, bytes);
    send(res, 200, { status: "saved" });
  };

  const middleware: Middleware = (req, res, next) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (!url.pathname.startsWith("/__forge/")) {
      next();
      return;
    }
    const refused = refuseReason(req);
    if (refused !== null) {
      send(res, 403, { status: "rejected", reason: "origin", message: `Forbidden: ${refused}.` });
      return;
    }
    const route = `${req.method ?? "GET"} ${url.pathname}`;
    const routes: Readonly<Record<string, () => Promise<void>>> = {
      "POST /__forge/save": () => save(req, res),
      "POST /__forge/recipe-bake": () => bakeRecipe(req, res),
      "GET /__forge/recipe-links": () => recipeLinksOf(url, res),
      "POST /__forge/hlod": () => hlod(req, url, res),
      "GET /__forge/hlod": () => hlod(req, url, res),
      "GET /__forge/world-builder": async () => send(res, 200, await worldBuilder.state()),
      "POST /__forge/world-builder/pack": () => addWorldBuilderPacks(req, res),
      "POST /__forge/world-random": () => worldRandom(req, res),
      "POST /__forge/stage-binary": () => stage(req, res),
      "GET /__forge/read": () => read(url, res),
      "GET /__forge/identity": async () => send(res, 200, options.identity ?? {}),
      "GET /__forge/classes": async () => send(res, 200, { classes: classes.all() }),
      "GET /__forge/asset-files": () => current().then(async ({ index, scan }) =>
        send(res, 200, { assets: rendererAssetFiles(index, await modelBounds(index, scan.stamps)) })),
      "GET /__forge/content": () =>
        (url.searchParams.get("refresh") === "1" ? authoring.rescan() : current()).then(async ({ scan, index }) =>
          send(res, 200, buildContentListing(scan, index, writableLabel, (await readManifest())?.startLevel ?? "")),
        ),
      "POST /__forge/content": () => contentOp(req, res),
      "GET /__forge/thumbnail": () => thumbnail(req, url, res),
      "POST /__forge/thumbnail": () => thumbnail(req, url, res),
      "POST /__forge/play": () => playCreate(req, res),
      "GET /__forge/play": async () => playInfo(url, res),
    };
    const handle = Object.hasOwn(routes, route) ? routes[route]!() : null;
    if (handle === null) {
      send(res, 404, { status: "rejected", reason: "request", message: `No endpoint ${route}.` });
      return;
    }
    handle.catch((error: unknown) => {
      if (!res.headersSent) send(res, 500, { status: "error", message: error instanceof Error ? error.message : String(error) });
      else res.destroy();
    });
  };

  return { middleware, policy, authoring, dispose: () => { hlodJobs.dispose(); worldBuilder.dispose(); } };
}
