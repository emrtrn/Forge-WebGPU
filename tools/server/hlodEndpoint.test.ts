import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { createSchemaRegistry } from "../../src/core/index.ts";
import type { HlodBuildRequest, HlodBuildStatus } from "../../src/core/level/hlodBuild.ts";
import { createForgeServer } from "./forgeServer.ts";

test("HLOD jobs use existing authoring guards, served project paths and explicit build mode", async () => {
  const root = await mkdtemp(join(tmpdir(), "forge-hlod-http-")); await mkdir(join(root, "content"));
  const calls: HlodBuildRequest[] = [];
  const status = (level: string): HlodBuildStatus => ({ level, state: "current", queued: false, publication: "test" });
  const forge = await createForgeServer({ root, registry: createSchemaRegistry(), hlodJobs: {
    request: (request) => { calls.push(request); return status(request.level); }, status, dispose() {},
  } });
  const server = createServer((req, res) => forge.middleware(req, res, () => res.end()));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (body: unknown, headers: Record<string, string> = { "X-Forge-Request": "1" }) => fetch(`${base}/__forge/hlod`, { method: "POST", headers, body: JSON.stringify(body) });
  try {
    expect((await post({ level: "content/levels/a", build: true }, {})).status).toBe(403);
    expect((await post({ level: "../escape", build: true })).status).toBe(403);
    expect((await post({ level: "engine:content/levels/a", build: true })).status).toBe(403);
    expect((await post({ level: "content/levels/a", build: "yes" })).status).toBe(400);
    expect((await post({ level: "content/levels/a", build: false, force: true })).status).toBe(400);
    expect(calls).toHaveLength(0);
    expect((await post({ level: "content/levels/a", build: true })).status).toBe(202);
    const read = await fetch(`${base}/__forge/hlod?level=content%2Flevels%2Fa`, { headers: { "X-Forge-Request": "1" } });
    expect(await read.json()).toMatchObject({ state: "current", publication: "test" }); expect(calls).toHaveLength(1);
  } finally { forge.dispose(); await new Promise<void>((resolve) => server.close(() => resolve())); await rm(root, { recursive: true, force: true }); }
});

test("a read-only project cannot start a build", async () => {
  const root = await mkdtemp(join(tmpdir(), "forge-hlod-readonly-")); await mkdir(join(root, "content"));
  let called = false;
  const forge = await createForgeServer({ root, registry: createSchemaRegistry(), readOnly: true, hlodJobs: {
    request: () => { called = true; throw new Error("unreachable"); }, status: () => { throw new Error("unreachable"); }, dispose() {},
  } });
  const server = createServer((req, res) => forge.middleware(req, res, () => res.end()));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/__forge/hlod`, {
      method: "POST", headers: { "X-Forge-Request": "1" }, body: JSON.stringify({ level: "content/levels/a", build: true }),
    });
    expect(response.status).toBe(403); expect(called).toBe(false);
  } finally { forge.dispose(); await new Promise<void>((resolve) => server.close(() => resolve())); await rm(root, { recursive: true, force: true }); }
});
