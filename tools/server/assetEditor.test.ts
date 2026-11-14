import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { createSaveClient } from "../../src/core/index.ts";
import { createAssetTestRegistry } from "../../src/core/assets/testKit.ts";
import { engineContentRoots } from "../assets/engineContent.ts";
import { createForgeServer } from "./forgeServer.ts";

const folders: string[] = [], servers: Server[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) await new Promise<void>((done) => server.close(() => done()));
  for (const folder of folders.splice(0)) await rm(folder, { recursive: true, force: true });
});
test.each([false, true])("class saves protect visible instance overrides (engine mode %s)", async (mode) => {
  const folder = await mkdtemp(join(tmpdir(), "forge-asset-editor-")); folders.push(folder);
  const project = join(folder, "project"), engine = join(folder, "engine");
  const root = mode ? engine : project, relative = mode ? "content/engine" : "content", label = mode ? "engine:content/engine" : "content";
  await mkdir(join(project, "content"), { recursive: true }); await mkdir(join(engine, "content/engine"), { recursive: true });
  await mkdir(join(root, relative, "level/cells"), { recursive: true });
  const id = `ast_${"1".repeat(32)}`, cls = { schema: "forge.actorClass/1", id, name: "Class", components: { driver: { type: "test.driver@1", targetSpeed: 10 } } };
  await writeFile(join(root, relative, "class.actor.json"), JSON.stringify(cls));
  const actor = { id: `act_${"2".repeat(32)}`, name: "Consumer", class: id, overrides: { driver: { type: "test.driver@1", targetSpeed: 20 } } };
  const level = JSON.stringify({ schema: "forge.level/1", id: `lvl_${"3".repeat(32)}`, actors: [actor] });
  const cell = JSON.stringify({ schema: "forge.levelCell/1", level: `lvl_${"3".repeat(32)}`, cell: "0_0", actors: [{ ...actor, id: `act_${"4".repeat(32)}` }] });
  await writeFile(join(root, relative, "level/level.json"), level); await writeFile(join(root, relative, "level/cells/0_0.json"), cell);
  const forge = await createForgeServer({ root: project, registry: createAssetTestRegistry(), contentRoots: ["content"], readOnly: mode,
    readOnlyRoots: engineContentRoots(engine, []), ...(mode ? { engineContent: { root: engine } } : {}),
  });
  const server = createServer((req, res) => forge.middleware(req, res, () => res.end())); servers.push(server);
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const client = createSaveClient({ fetch, baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}` });
  const path = `${label}/class.actor.json`, read = (await client.read(path))!;
  const refused = await client.save({ writes: [{ path, base: read.revision, text: JSON.stringify({ ...cls, components: {} }) }], deletes: [] });
  expect(refused).toMatchObject({ status: "rejected", reason: "document", issues: expect.arrayContaining([expect.objectContaining({ code: "incompatible-class", file: path })]) });
  expect(JSON.stringify(refused)).toContain("Consumer"); expect(JSON.stringify(refused)).toContain("cells/0_0.json");
  expect((await client.read(path))!.revision).toBe(read.revision);
  const allowed = await client.save({ writes: [{ path, base: read.revision, text: JSON.stringify({ ...cls, components: { driver: { type: "test.driver@1", targetSpeed: 12 } } }) }], deletes: [] });
  expect(allowed).toMatchObject({ status: "saved", files: [expect.objectContaining({ path })] });
  expect(await readFile(join(root, relative, "level/level.json"), "utf8")).toBe(level);
  expect(await readFile(join(root, relative, "level/cells/0_0.json"), "utf8")).toBe(cell);
  expect(await client.classes()).toEqual([expect.objectContaining({ id, components: expect.objectContaining({ driver: expect.objectContaining({ targetSpeed: 12 }) }) })]);
});
