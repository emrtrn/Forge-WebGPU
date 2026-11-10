import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, request, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createAssetTestRegistry } from "../../src/core/assets/testKit.ts";
import { fileRevision } from "../assets/revision.ts";
import { createForgeServer, isLocalRequest, refuseReason, STAGING_DIR } from "./forgeServer.ts";

const LEVEL = "lvl_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const HEADERS = { "X-Forge-Request": "1" };

let project: string;
let server: Server;
let base: string;

beforeEach(async () => {
  project = await mkdtemp(join(tmpdir(), "forge-server-"));
  await mkdir(join(project, "content"), { recursive: true });
  const forge = await createForgeServer({ root: project, registry: createAssetTestRegistry(), maxBodyBytes: 1024 });
  server = createServer((req, res) =>
    forge.middleware(req, res, () => {
      res.statusCode = 418;
      res.end("next");
    }),
  );
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(project, { recursive: true, force: true });
});

const post = (path: string, body: unknown, headers: Record<string, string> = HEADERS) =>
  fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });

describe("authoring endpoints", () => {
  test("stage a binary, save it with its meta file and a level, read them back with their revisions", async () => {
    const png = Buffer.from([137, 80, 78, 71]);
    const staged = await fetch(`${base}/__forge/stage-binary`, { method: "POST", headers: HEADERS, body: png });
    expect(staged.status).toBe(200);
    const { id, size, revision } = (await staged.json()) as { id: string; size: number; revision: string };
    expect({ size, revision }).toEqual({ size: 4, revision: fileRevision(png) });

    const meta = { schema: "forge.assetMeta/1", id: `ast_${"e".repeat(32)}`, type: "test.texture@1", license: "CC0-1.0", source: { origin: "test" } };
    const saved = await post("/__forge/save", {
      writes: [
        { path: "content/textures/a.png", base: null, staged: id },
        { path: "content/textures/a.png.meta.json", base: null, text: JSON.stringify(meta) },
        { path: "content/levels/main/level.json", base: null, text: JSON.stringify({ schema: "forge.level/1", id: LEVEL }) },
      ],
    });
    expect(saved.status).toBe(200);
    const result = (await saved.json()) as { files: { path: string; revision: string }[] };
    expect(result.files.map((file) => file.path)).toEqual([
      "content/textures/a.png",
      "content/textures/a.png.meta.json",
      "content/levels/main/level.json",
      "content/levels/main/cells.json",
    ]);
    expect(await readdir(join(project, STAGING_DIR))).toEqual([]);

    const read = await fetch(`${base}/__forge/read?path=content/levels/main/level.json`, { headers: HEADERS });
    expect(read.status).toBe(200);
    const text = await read.text();
    expect(read.headers.get("x-forge-revision")).toBe(fileRevision(text));
    expect(read.headers.get("x-forge-revision")).toBe(result.files[2]!.revision);
    expect(JSON.parse(text)).toMatchObject({ settings: { cellSize: 128 } });
    const binary = await fetch(`${base}/__forge/read?path=content/textures/a.png`, { headers: HEADERS });
    expect(Buffer.from(await binary.arrayBuffer())).toEqual(png);
  });

  test("status codes: conflict 409, refused path 403, refused document 422, bad request 400, too large 413", async () => {
    await writeFile(join(project, "content/x.png.meta.json"), "{}");
    const conflict = await post("/__forge/save", { writes: [{ path: "content/x.png.meta.json", base: null, text: "{}" }] });
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({ status: "conflict", conflicts: [{ current: fileRevision("{}") }] });

    expect((await post("/__forge/save", { writes: [{ path: "tests/fixtures/a.json", base: null, text: "{}" }] })).status).toBe(403);
    expect((await post("/__forge/save", { writes: [{ path: "content/notes.json", base: null, text: "{}" }] })).status).toBe(422);
    expect((await post("/__forge/save", { writes: [{ path: "content/a.png", base: null, staged: "../../etc/passwd" }] })).status).toBe(400);
    expect((await post("/__forge/save", { writes: [{ path: "content/a.png", base: null, staged: "0".repeat(32) }] })).status).toBe(400);
    const notJson = await fetch(`${base}/__forge/save`, { method: "POST", headers: HEADERS, body: "{" });
    expect(notJson.status).toBe(400);
    const large = await fetch(`${base}/__forge/stage-binary`, { method: "POST", headers: HEADERS, body: Buffer.alloc(2048) });
    expect(large.status).toBe(413);
    expect(await readdir(join(project, STAGING_DIR))).toEqual([]);
  });

  test("reads are limited to the writable roots; a missing file is 404", async () => {
    expect((await fetch(`${base}/__forge/read?path=package.json`, { headers: HEADERS })).status).toBe(403);
    expect((await fetch(`${base}/__forge/read?path=content/none.json`, { headers: HEADERS })).status).toBe(404);
  });

  test("other paths pass through; an unknown endpoint is 404", async () => {
    expect((await fetch(`${base}/index.html`)).status).toBe(418);
    expect((await fetch(`${base}/__forge/delete-everything`, { method: "POST", headers: HEADERS })).status).toBe(404);
    expect((await fetch(`${base}/__forge/save`, { headers: HEADERS })).status).toBe(404);
  });
});

describe("only this machine may use them", () => {
  test("without the request header, or from another site, the request is refused", async () => {
    expect((await post("/__forge/save", {}, {})).status).toBe(403);
    expect((await post("/__forge/save", {}, { ...HEADERS, Origin: "https://evil.example" })).status).toBe(403);
    expect((await post("/__forge/save", { writes: [] }, { ...HEADERS, Origin: "http://localhost:5183" })).status).toBe(400);
  });

  test("a Host header that is not localhost is refused (DNS rebinding)", async () => {
    const status = await new Promise<number>((resolve, reject) => {
      const req = request(`${base}/__forge/read?path=content/a.json`, { headers: { ...HEADERS, Host: "evil.example:5183" } }, (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      });
      req.on("error", reject);
      req.end();
    });
    expect(status).toBe(403);
  });

  test("the socket address decides, not forwarded headers", () => {
    const socket = (remoteAddress: string) => ({ socket: { remoteAddress } }) as Parameters<typeof isLocalRequest>[0];
    expect(isLocalRequest(socket("127.0.0.1"))).toBe(true);
    expect(isLocalRequest(socket("::1"))).toBe(true);
    expect(isLocalRequest(socket("::ffff:127.0.0.1"))).toBe(true);
    expect(isLocalRequest(socket("192.168.1.20"))).toBe(false);
    const forwarded = { socket: { remoteAddress: "192.168.1.20" }, headers: { host: "localhost", "x-forwarded-for": "127.0.0.1", "x-forge-request": "1" } };
    expect(refuseReason(forwarded as unknown as Parameters<typeof refuseReason>[0])).toMatch(/this machine/);
  });
});

describe("start-up", () => {
  test("a staging folder from an earlier session is cleared", async () => {
    await mkdir(join(project, STAGING_DIR), { recursive: true });
    await writeFile(join(project, STAGING_DIR, "f".repeat(32)), "old");
    await createForgeServer({ root: project, registry: createAssetTestRegistry() });
    await expect(readFile(join(project, STAGING_DIR, "f".repeat(32)))).rejects.toThrow();
  });
});
