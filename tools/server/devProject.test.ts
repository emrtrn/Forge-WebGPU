import { cp, mkdtemp, rm } from "node:fs/promises";
import { createServer as createHttpServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer, type ViteDevServer } from "vite";
import { afterEach, describe, expect, test } from "vitest";
import { stringifyDocument } from "../../src/core/index.ts";
import { DEFAULT_PROJECT, identityOf, isReadOnlyProject, resolveDevProject } from "./devProject.ts";
import { forgeServerPlugin, gameModuleSource } from "./vitePlugin.ts";

const engineRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const step of cleanup.splice(0).reverse()) await step();
});

async function copyFixture(name: string): Promise<string> {
  const target = await mkdtemp(join(tmpdir(), `forge-dev-${name}-`));
  await cp(join(engineRoot, "tests/fixtures/projects", name), target, { recursive: true });
  cleanup.push(() => rm(target, { recursive: true, force: true }));
  return target;
}

describe("which project the dev server serves", () => {
  test("samples and fixtures inside the engine are read-only; other places are not", () => {
    expect(isReadOnlyProject(engineRoot, join(engineRoot, "samples/starter"))).toBe(true);
    expect(isReadOnlyProject(engineRoot, join(engineRoot, "tests/fixtures/projects/good"))).toBe(true);
    expect(isReadOnlyProject(engineRoot, join(engineRoot, "content"))).toBe(false);
    expect(isReadOnlyProject(engineRoot, join(tmpdir(), "mygame"))).toBe(false);
  });

  test("FORGE_PROJECT_ROOT names it; without it the starter sample is opened", async () => {
    const project = await copyFixture("good");
    const chosen = await resolveDevProject(engineRoot, { FORGE_PROJECT_ROOT: project });
    expect(chosen).toMatchObject({ root: project, readOnly: false, problems: [] });
    expect(identityOf(chosen).project).toMatchObject({ id: "good", name: "Good", sdkVersion: "0.1", startLevel: "", readOnly: false });
    const fallback = await resolveDevProject(engineRoot, {});
    expect(fallback.root).toBe(join(engineRoot, DEFAULT_PROJECT));
    expect(fallback.readOnly).toBe(true);
  });

  test("a project for another SDK reports why it cannot open; its game module is not loaded", async () => {
    const chosen = await resolveDevProject(engineRoot, { FORGE_PROJECT_ROOT: await copyFixture("old-sdk") });
    expect(chosen.problems).toEqual([expect.stringMatching(/sdk-version/)]);
    expect(gameModuleSource(chosen)).toBe("export default null;\n");
  });

  test("the virtual game module points at the project's module", async () => {
    const project = await copyFixture("good");
    const chosen = await resolveDevProject(engineRoot, { FORGE_PROJECT_ROOT: project });
    const path = join(project, "src/game.ts").split("\\").join("/");
    expect(gameModuleSource(chosen)).toBe(`export { default } from ${JSON.stringify(path)};\n`);
    expect(gameModuleSource(null)).toBe("export default null;\n");
  });
});

describe("a real dev server on a project", () => {
  async function serve(projectRoot: string): Promise<{ vite: ViteDevServer; base: string }> {
    const vite = await createServer({
      root: engineRoot,
      configFile: false,
      logLevel: "silent",
      plugins: [forgeServerPlugin({ projectRoot, enable: true })],
      resolve: {
        alias: {
          "@forge/sdk": join(engineRoot, "src/sdk/index.ts"),
          "@forge/editor-sdk": join(engineRoot, "src/editor-sdk/index.ts"),
        },
      },
      server: { middlewareMode: true },
    });
    const http: Server = createHttpServer((req, res) => vite.middlewares(req, res));
    await new Promise<void>((done) => http.listen(0, "127.0.0.1", done));
    cleanup.push(async () => {
      await new Promise<void>((done) => http.close(() => done()));
      await vite.close();
    });
    return { vite, base: `http://127.0.0.1:${(http.address() as AddressInfo).port}` };
  }

  const headers = { "X-Forge-Request": "1", "Content-Type": "application/json" };
  const LEVEL = "lvl_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const cell = (components: unknown): string =>
    stringifyDocument({ schema: "forge.levelCell/1", level: LEVEL, cell: "0_0", actors: [{ id: `act_${"1".repeat(32)}`, components }] });
  const save = (base: string, cellText: string) =>
    fetch(`${base}/__forge/save`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        writes: [
          { path: "content/levels/main/level.json", base: null, text: stringifyDocument({ schema: "forge.level/1", id: LEVEL }) },
          { path: "content/levels/main/cells/0_0.json", base: null, text: cellText },
        ],
      }),
    });

  test("identity, the game module, and saves checked against the game's own components", async () => {
    const project = await copyFixture("good");
    const { vite, base } = await serve(project);
    const identity: unknown = await (await fetch(`${base}/__forge/identity`, { headers })).json();
    expect(identity).toMatchObject({ engine: { sdkVersion: "0.1.0" }, project: { id: "good", root: project, problems: [] } });

    const loaded = (await vite.ssrLoadModule("virtual:forge/game-module")) as { default: { kind: string; id: string } };
    expect(loaded.default).toMatchObject({ kind: "gameModule", id: "good.main" });

    expect((await save(base, cell({ c: { type: "good.cargo@1", mass: 7 } }))).status).toBe(200);
    expect(await (await fetch(`${base}/__forge/classes`, { headers })).json()).toEqual({ classes: [] });
  }, 60_000);

  test("a component the game does not define is refused", async () => {
    const { base } = await serve(await copyFixture("good"));
    expect((await save(base, cell({ c: { type: "other.thing@1" } }))).status).toBe(422);
  }, 60_000);
});
