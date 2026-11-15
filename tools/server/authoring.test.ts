// Files another process writes reach the dev server's caches (plan phase 4
// step 9e): after `changed`, the asset index is rescanned and the class store
// holds the class written on disk, so the server's document check and
// `/__forge/classes` see it.

import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, expect, test } from "vitest";
import { loadEngineRegistry } from "../assets/engineRegistry.ts";
import { openAuthoring } from "./authoring.ts";
import { resolveDevProject } from "./devProject.ts";
import { projectAuthoringOptions } from "./projectAuthoring.ts";

const ENGINE_ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const CLASS = "ast_fedcba9876543210fedcba9876543210";
let temp: string;

beforeAll(async () => {
  temp = await mkdtemp(join(tmpdir(), "forge-authoring-"));
});

afterAll(async () => {
  await rm(temp, { recursive: true, force: true });
});

test("a class written on disk by another process is known after `changed`; level files are not read as classes", async () => {
  const project = join(temp, "p");
  await cp(join(ENGINE_ROOT, "samples/starter"), project, { recursive: true });
  const registry = await loadEngineRegistry(ENGINE_ROOT);
  const authoring = await openAuthoring(await projectAuthoringOptions(ENGINE_ROOT, await resolveDevProject(ENGINE_ROOT, { FORGE_PROJECT_ROOT: project }), registry));
  const labels = authoring.contentRoots.map((root) => root.label);
  expect(labels[0]).toBe("content");
  expect(labels).toContain("engine:content/packs/starter");
  const before = (await authoring.current()).index;
  expect(authoring.classes.get(CLASS as never)).toBeUndefined();

  await mkdir(join(project, "content/classes"), { recursive: true });
  await writeFile(join(project, "content/classes/crate.json"), `${JSON.stringify({ schema: "forge.actorClass/1", id: CLASS, name: "Crate", components: {} })}\n`);
  expect(await authoring.current()).toMatchObject({ index: before });
  await authoring.changed(["content/classes/crate.json", "content/levels/main/level.json", "content/levels/main/cells/0_0.json"]);
  expect(authoring.classes.get(CLASS as never)?.name).toBe("Crate");
  expect((await authoring.current()).index.entries.has(CLASS as never)).toBe(true);

  await rm(join(project, "content/classes/crate.json"));
  await authoring.changed(["content/classes/crate.json"]);
  expect(authoring.classes.get(CLASS as never)).toBeUndefined();
});
