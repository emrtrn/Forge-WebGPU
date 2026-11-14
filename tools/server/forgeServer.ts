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
//
// A project opened read-only (the engine's samples and fixtures, A9) refuses
// saves and uploads with 403; it can still be read. The engine's content and
// packs are never written from a project: an `engine:` path is not a project
// path, so a save naming one is refused like any path outside the project.
//
// Every /__forge/ request must come from this machine: the socket address is
// local (Forge's rule; forwarded headers are not trusted), the Host header
// names localhost (DNS rebinding), an Origin header if present names localhost
// too, and the request carries `X-Forge-Request: 1`. A web page elsewhere
// cannot send that header without a CORS preflight, which is never granted.

import { randomBytes } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { buildAssetIndex, DATA_DOCUMENT_TYPES, type AssetIndex, type JsonObject, type SchemaRegistry } from "../../src/core/index.ts";
import { buildContentListing } from "../assets/contentListing.ts";
import { planContentOp, type ContentOp, type ContentPlan } from "../assets/contentOps.ts";
import { glbOptimizeSettings } from "../assets/glbOptimizeSettings.ts";
import { fileRevision } from "../assets/revision.ts";
import { projectContentRoots, scanRoots, type ContentRoot, type ScanResult } from "../assets/scan.ts";
import { defaultContentRoots } from "../assets/verify.ts";
import { createClassStore, createDocumentCheck } from "../save/documentCheck.ts";
import { createSaveService, MANIFEST_FILE, type SaveRequest, type SaveResult, type SaveService } from "../save/transaction.ts";
import {
  createWritePolicy,
  normalizeProjectPath,
  ProjectPathError,
  resolveProjectPath,
  resolveWritablePath,
  type WritePolicy,
} from "./projectPaths.ts";

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

export const STATUS_OF: Record<SaveResult["status"] | "path" | "request" | "document", number> = {
  saved: 200,
  conflict: 409,
  rejected: 400,
  path: 403,
  request: 400,
  document: 422,
};

export interface ForgeServerOptions {
  /** Project root. */
  readonly root: string;
  readonly registry: SchemaRegistry;
  readonly writableRoots?: readonly string[];
  /** Content roots scanned for the class store; default `content/` and `samples/*\/content/`. */
  readonly contentRoots?: readonly string[];
  /** Roots outside the project, indexed and readable, never written: the engine's content and packs. */
  readonly readOnlyRoots?: readonly ContentRoot[];
  /** Body size limit; default MAX_BODY_BYTES. */
  readonly maxBodyBytes?: number;
  /** Refuse every save and upload (samples and fixtures, A9). */
  readonly readOnly?: boolean;
  /** What `/__forge/identity` answers. */
  readonly identity?: unknown;
}

/** A file under a read-only root: inside it, no links, no hidden names. */
function resolveReadOnlyPath(root: ContentRoot, path: string): string {
  const normalized = normalizeProjectPath(path);
  if (normalized.split("/").some((part) => part.startsWith("."))) {
    throw new ProjectPathError("hidden", `Names starting with "." are not read: ${root.label}/${path}`);
  }
  return resolveProjectPath(root.dir, normalized);
}

/** An asset's file as `GET /__forge/asset-files` lists it; `file` is what `/__forge/read?path=` takes. */
export interface AssetFileEntry {
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
export function rendererAssetFiles(index: AssetIndex): Record<string, AssetFileEntry> {
  const out: Record<string, AssetFileEntry> = {};
  for (const entry of index.entries.values()) {
    const file = `${entry.root}/${entry.path}`;
    if (entry.storage === "binary") {
      const meta = index.metas.get(entry.id);
      out[entry.id] = meta ? { type: entry.type, file, import: meta.import } : { type: entry.type, file };
    } else if (index.jsonAssets.has(entry.id) || isDataDocumentType(entry.type)) {
      out[entry.id] = { type: entry.type, file };
    }
  }
  return out;
}

export interface ForgeServer {
  readonly middleware: Middleware;
  readonly policy: WritePolicy;
  readonly saves: SaveService;
}

const STAGE_ID = /^[0-9a-f]{32}$/;

class ContentRequestError extends Error {}


export async function createForgeServer(options: ForgeServerOptions): Promise<ForgeServer> {
  const policy = createWritePolicy(options.root, options.writableRoots);
  const maxBody = options.maxBodyBytes ?? MAX_BODY_BYTES;
  const stagingDir = join(policy.root, STAGING_DIR);
  // Uploads do not outlive the server: a save names them within one session.
  await rm(stagingDir, { recursive: true, force: true });

  const readOnlyRoots = options.readOnlyRoots ?? [];
  const allRoots = [...projectContentRoots(policy.root, options.contentRoots ?? defaultContentRoots(policy.root)), ...readOnlyRoots];
  const indexRoots = async (): Promise<{ scan: ScanResult; index: AssetIndex }> => {
    const scan = await scanRoots(allRoots);
    return { scan, index: buildAssetIndex(scan.files, { strict: false, registry: options.registry }) };
  };
  const first = await indexRoots();
  const classes = createClassStore(policy.root, options.registry, first.index);
  // The content roots as last scanned: the renderer's GUID -> file table and the Content Browser's listing come
  // from it. A save can add, move or delete files, so it is rescanned on the next request.
  let snapshot: Promise<{ scan: ScanResult; index: AssetIndex }> | null = Promise.resolve(first);
  const current = (): Promise<{ scan: ScanResult; index: AssetIndex }> => (snapshot ??= indexRoots());
  const writableLabel = (label: string): boolean => !options.readOnly && !readOnlyRoots.some((root) => root.label === label);
  const saves = createSaveService({
    policy,
    check: createDocumentCheck(options.registry, classes),
    afterSave: (files) => {
      snapshot = null;
      return classes.refresh(files.map((file) => file.path));
    },
  });
  await saves.recover();

  const READ_ONLY_MESSAGE =
    "This project is opened read-only (the engine's samples and fixtures are changed by review, not by the editor). Create your own with npm run create-project.";

  const save = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (options.readOnly) {
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
    for (const write of request.writes ?? []) {
      if (write.staged !== undefined && !(await stat(write.staged).then(() => true, () => false))) {
        send(res, 400, { status: "rejected", reason: "request", message: "A staged upload is gone; stage it again." });
        return;
      }
    }
    const result = await saves.commit(request);
    send(res, result.status === "rejected" ? STATUS_OF[result.reason] : STATUS_OF[result.status], result);
  };

  const stage = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (options.readOnly) {
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

  const read = async (url: URL, res: ServerResponse): Promise<void> => {
    const path = url.searchParams.get("path") ?? "";
    let absolute: string;
    try {
      const outside = readOnlyRoots.find((root) => path.startsWith(`${root.label}/`));
      absolute = outside ? resolveReadOnlyPath(outside, path.slice(outside.label.length + 1)) : resolveWritablePath(policy, path).absolute;
    } catch (error) {
      if (!(error instanceof ProjectPathError)) throw error;
      send(res, 403, { status: "rejected", reason: "path", message: error.message });
      return;
    }
    let bytes: Buffer;
    try {
      bytes = await readFile(absolute);
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
    if (options.readOnly) {
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
    // Planned against the disk as it is now (a file may have come or gone since the last scan).
    snapshot = indexRoots();
    const { scan, index } = await snapshot;
    const manifest = await readManifest();
    const outcome = planContentOp(op, { scan, index, registry: options.registry, writable: writableLabel, startLevel: manifest?.startLevel ?? "" });
    if (!outcome.ok) {
      send(res, outcome.status, { status: "refused", reason: outcome.reason, message: outcome.message, ...(outcome.referrers ? { referrers: outcome.referrers } : {}) });
      return;
    }
    let request: SaveRequest;
    try {
      request = await saveRequestOf(outcome.plan, manifest);
    } catch (error) {
      if (!(error instanceof ContentRequestError)) throw error;
      send(res, 400, { status: "refused", reason: "request", message: error.message });
      return;
    }
    const result = await saves.commit(request);
    if (result.status === "saved") send(res, 200, { status: "done", result: outcome.plan.result });
    else if (result.status === "conflict") send(res, 409, { status: "refused", reason: "exists", message: `Changed on disk meanwhile: ${result.conflicts.map((conflict) => conflict.path).join(", ")}` });
    else send(res, STATUS_OF[result.reason], { status: "refused", reason: result.reason, message: result.issues.map((one) => `${one.file}: ${one.message}`).join("; ") });
  };
  const saveRequestOf = async (plan: ContentPlan, manifest: { bytes: Buffer; startLevel: string } | null): Promise<SaveRequest> => {
    const deletes = [];
    for (const path of plan.deletes) deletes.push({ path, base: fileRevision(await readFile(join(policy.root, ...path.split("/")))) });
    const startLevel = plan.startLevel;
    // A copy from the engine's content or a pack: its bytes go through the staging folder (the save writes project files only).
    const writes = [];
    for (const write of plan.writes) {
      const outside = write.copyOf === undefined ? undefined : readOnlyRoots.find((root) => write.copyOf!.startsWith(`${root.label}/`));
      if (write.staged !== undefined) {
        if (!STAGE_ID.test(write.staged)) throw new ContentRequestError(`Unknown staged upload: ${write.staged}`);
        const staged = join(stagingDir, write.staged);
        if (write.optimize !== undefined) {
          // The optimiser (sharp, gltf-transform) loads on the first import that needs it.
          const { optimizeGlb } = await import("../assets/optimizeGlb.ts");
          const result = await optimizeGlb(new Uint8Array(await readFile(staged)), glbOptimizeSettings(write.optimize));
          await writeFile(staged, result.bytes);
        }
        const base = write.replace ? fileRevision(await readFile(join(policy.root, ...write.path.split("/")))) : null;
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
      "POST /__forge/stage-binary": () => stage(req, res),
      "GET /__forge/read": () => read(url, res),
      "GET /__forge/identity": async () => send(res, 200, options.identity ?? {}),
      "GET /__forge/classes": async () => send(res, 200, { classes: classes.all() }),
      "GET /__forge/asset-files": () => current().then(({ index }) => send(res, 200, { assets: rendererAssetFiles(index) })),
      "GET /__forge/content": () =>
        (url.searchParams.get("refresh") === "1" ? (snapshot = indexRoots()) : current()).then(({ scan, index }) =>
          send(res, 200, buildContentListing(scan, index, writableLabel)),
        ),
      "POST /__forge/content": () => contentOp(req, res),
      "GET /__forge/thumbnail": () => thumbnail(req, url, res),
      "POST /__forge/thumbnail": () => thumbnail(req, url, res),
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

  return { middleware, policy, saves };
}
