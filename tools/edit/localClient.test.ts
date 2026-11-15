// The agent's client and the editor's write the same files (plan phase 4
// step 9b; A12 acceptance at the save level): one session edit, saved once
// through the dev server's endpoints (HTTP) and once through the local client
// on a copy of the same project, leaves the same bytes.

import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, expect, test } from "vitest";
import { createSaveClient, openLevelFromServer, saveLevelSession, SaveClientError, type ActorDoc, type SaveClient } from "../../src/core/index.ts";
import { loadEngineRegistry } from "../assets/engineRegistry.ts";
import { resolveDevProject } from "../server/devProject.ts";
import { createForgeServer } from "../server/forgeServer.ts";
import { projectAuthoringOptions } from "../server/projectAuthoring.ts";
import { openEditProject } from "./editProject.ts";

const ENGINE_ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const LEVEL = "content/levels/main";
const FOG = "act_651958edcc8a5a19f805a02affafe0de";

let temp: string;
let server: Server;

beforeAll(async () => {
  temp = await mkdtemp(join(tmpdir(), "forge-local-client-"));
});

afterAll(async () => {
  await new Promise((done) => (server ? server.close(done) : done(undefined)));
  await rm(temp, { recursive: true, force: true });
});

async function files(root: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const walk = async (dir: string, rel: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const path = rel === "" ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory()) await walk(join(dir, entry.name), path);
      else out[path] = await readFile(join(dir, entry.name), "utf8");
    }
  };
  await walk(join(root, LEVEL), "");
  return out;
}

test("one edit saved through the dev server and through the local client writes the same files", async () => {
  const registry = await loadEngineRegistry(ENGINE_ROOT);
  const viaServer = join(temp, "server");
  const viaLocal = join(temp, "local");
  await cp(join(ENGINE_ROOT, "samples/starter"), viaServer, { recursive: true });
  await cp(join(ENGINE_ROOT, "samples/starter"), viaLocal, { recursive: true });

  const forge = await createForgeServer(await projectAuthoringOptions(ENGINE_ROOT, await resolveDevProject(ENGINE_ROOT, { FORGE_PROJECT_ROOT: viaServer }), registry));
  server = createServer((req, res) => forge.middleware(req, res, () => {
    res.statusCode = 404;
    res.end();
  }));
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const { port } = server.address() as AddressInfo;
  const http = createSaveClient({ fetch: (input, init) => fetch(`http://127.0.0.1:${port}${input}`, init) });
  // Opening a project for commands leaves the dev server's uploads and play sessions alone.
  await mkdir(join(viaLocal, ".forge-staging"), { recursive: true });
  await mkdir(join(viaLocal, ".forge-session/0123456789abcdef"), { recursive: true });
  await writeFile(join(viaLocal, ".forge-staging/upload"), "x");
  const local = await openEditProject(ENGINE_ROOT, viaLocal, registry);
  expect(await readdir(join(viaLocal, ".forge-staging"))).toEqual(["upload"]);
  expect(await readdir(join(viaLocal, ".forge-session"))).toEqual(["0123456789abcdef"]);

  const lamp = {
    id: "act_0123456789abcdef0123456789abcdef",
    name: "Lamp",
    class: null,
    parent: null,
    spatiallyLoaded: true,
    transform: { p: [140, 2, -3.5], r: [0, 0, 0, 1], s: [1, 1, 1] },
    components: { light: { type: "forge.pointLight@1", intensity: 1200 } },
  };
  const edit = async (client: SaveClient) => {
    const { session } = await openLevelFromServer(client, LEVEL, local.options);
    const fog = session.actor(FOG as ActorDoc["id"])!;
    const result = session.edit("Edit", (tx) => {
      tx.setActor({ ...fog, transform: { ...fog.transform, p: [1, 2, 3] }, overrides: { fog: { type: "forge.heightFog@1", density: 0.002 } } });
      tx.setActor(lamp);
    });
    expect(result.ok).toBe(true);
    const saved = await saveLevelSession(session, client);
    expect(saved).toMatchObject({ status: "sent", response: { status: "saved" } });
    return saved;
  };
  const a = await edit(http);
  const b = await edit(local.client);
  expect(a.status === "sent" && a.response.status === "saved" ? a.response.files : null).toEqual(b.status === "sent" && b.response.status === "saved" ? b.response.files : null);
  const written = await files(viaServer);
  expect(Object.keys(written).sort()).toEqual(["cells.json", "cells/0_0.json", "cells/1_-1.json", "level.json"]);
  expect(await files(viaLocal)).toEqual(written);
  // The clamped intensity is written as the server writes it.
  expect(written["cells/1_-1.json"]).toContain('"intensity": 1000');

  // The local client refuses what the server refuses.
  await expect(local.client.read("../outside.json")).rejects.toBeInstanceOf(SaveClientError);
  await expect(local.client.stageBinary(new Uint8Array(1))).rejects.toThrow(/editor's/);
  expect(await local.client.read(`${LEVEL}/nothing.json`)).toBeNull();
  expect(await local.client.read("engine:content/packs/starter/classes/exponential-height-fog.json")).toMatchObject({ revision: expect.stringMatching(/^[0-9a-f]{16}$/) });
});
