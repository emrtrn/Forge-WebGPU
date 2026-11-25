// The engine's Vite plugin.
//
// - `virtual:forge/game-module`: the project's game module (its
//   `game.module`), or null. `npm run dev` serves the project; `vite build`
//   builds it (FORGE_PROJECT_ROOT, then samples/starter: the game's code goes
//   into the bundle, tools/build-content.ts writes its content beside it,
//   plan phase 4 step 2b); preview and Vitest get null.
// - In `npm run dev` only (not preview, not Vitest): picks the project
//   (devProject.ts), lets Vite serve files from it, loads its game module's
//   schemas into the registry, and registers the authoring endpoints.
// - `virtual:forge/game-editors` (plan phase 4 step 10, INV-A32): the
//   project's editor sides (`editor.ts`, `src/**/editor.ts`,
//   gameEditors.ts) for the editor; empty outside `npm run dev`.
// - Files changed on disk by anything but this server (an agent's `forge
//   edit`, another tool, a hand edit; plan phase 4 step 9e): the content
//   roots are watched; the server refreshes its caches and sends the editor
//   `forge:files` on the HMR channel (fileEvents.ts).
// - Engine content mode (`npm run dev -- --engine-content`, tools/dev.ts sets
//   FORGE_ENGINE_CONTENT=1; plan phase 4 step 6g, decision 6): every pack is a
//   root, and the engine's content and the packs are written.

import { join, relative, resolve } from "node:path";
import type { Plugin } from "vite";
import { loadEngineRegistry } from "../assets/engineRegistry.ts";
import { writeProjectTsconfig } from "../project/check.ts";
import { gameFeatures, installGameSchemas } from "../project/gameSchemas.ts";
import { resolveDevProject, identityOf, type DevProject } from "./devProject.ts";
import { createFileEvents, FILE_EVENT, watchContentRoots, type FileEventsBody } from "./fileEvents.ts";
import { createForgeServer } from "./forgeServer.ts";
import { findGameEditors, GAME_EDITORS_ID, gameEditorsSource, isGameEditorPath } from "./gameEditors.ts";
import { projectAuthoringOptions } from "./projectAuthoring.ts";
import { triangleMiddleware } from "../triangles/devTriangles.ts";

export const GAME_MODULE_ID = "virtual:forge/game-module";
const RESOLVED_GAME_MODULE = `\0${GAME_MODULE_ID}`;
const RESOLVED_GAME_EDITORS = `\0${GAME_EDITORS_ID}`;

/** Source of the virtual game module. */
export function gameModuleSource(project: DevProject | null): string {
  const module = project?.manifest?.game.module ?? "";
  if (project === null || module === "" || project.problems.length > 0) return "export default null;\n";
  const path = resolve(project.root, module).split("\\").join("/");
  return `export { default } from ${JSON.stringify(path)};\n`;
}

export interface ForgeServerPluginOptions {
  /** The project to serve; default FORGE_PROJECT_ROOT, then samples/starter. */
  readonly projectRoot?: string;
  /** Serve even under Vitest (tests that drive a real dev server). */
  readonly enable?: boolean;
  /** Engine content mode; tests use a temporary content repository. The CLI uses FORGE_ENGINE_CONTENT=1. */
  readonly engineContent?: { readonly root: string };
}

export function forgeServerPlugin(options: ForgeServerPluginOptions = {}): Plugin {
  let project: DevProject | null = null;
  let serving = false;
  return {
    name: "forge-server",
    async config(config, env) {
      serving =
        env.command === "serve" && env.isPreview !== true && (options.enable === true || process.env.VITEST === undefined);
      const building = env.command === "build" && process.env.VITEST === undefined;
      if (!serving && !building) return;
      const engineRoot = resolve(config.root ?? process.cwd());
      const env2 = options.projectRoot === undefined ? process.env : { FORGE_PROJECT_ROOT: options.projectRoot };
      project = await resolveDevProject(engineRoot, env2);
      if (building) return;
      return { server: { fs: { allow: [engineRoot, project.root] } } };
    },
    resolveId(id) {
      if (id === GAME_MODULE_ID) return RESOLVED_GAME_MODULE;
      return id === GAME_EDITORS_ID ? RESOLVED_GAME_EDITORS : null;
    },
    async load(id) {
      if (id === RESOLVED_GAME_MODULE) return gameModuleSource(project);
      if (id !== RESOLVED_GAME_EDITORS) return null;
      // Only the dev server's editor reads it; a build never carries the game's editor sides.
      const usable = serving && project !== null && project.problems.length === 0;
      return gameEditorsSource(usable ? project!.root : null, usable ? await findGameEditors(project!.root) : []);
    },
    async configureServer(server) {
      if (!serving || project === null) return;
      const current = project;
      // A game editor side added or removed while the server runs: the next
      // editor load lists it (no reload is forced: the open level may be dirty).
      server.watcher.add([join(current.root, "editor.ts"), join(current.root, "src")]);
      const editorsChanged = (file: string): void => {
        if (!isGameEditorPath(relative(current.root, file).split("\\").join("/"))) return;
        const module = server.moduleGraph.getModuleById(RESOLVED_GAME_EDITORS);
        if (module) server.moduleGraph.invalidateModule(module);
      };
      server.watcher.on("add", editorsChanged);
      server.watcher.on("unlink", editorsChanged);
      const registry = await loadEngineRegistry(server.config.root);
      const problems = [...current.problems];
      if (problems.length === 0) {
        try {
          // The project's tsconfig extends the generated one; Vite reads it to
          // transform the game's files. Generated, git-ignored, not content.
          await writeProjectTsconfig(current.root, server.config.root);
          // The game module through this server, so `@forge/sdk` resolves (gameSchemas.ts).
          const load = (path: string) => server.ssrLoadModule(path) as Promise<Record<string, unknown>>;
          installGameSchemas(registry, await gameFeatures(load, current.root, current.manifest?.game.module ?? ""));
        } catch (error) {
          problems.push(`game module: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      const engineContent = options.engineContent ?? (process.env.FORGE_ENGINE_CONTENT === "1" ? { root: server.config.root } : undefined);
      // The same options `npm run forge -- edit` opens the project with (projectAuthoring.ts).
      const forge = await createForgeServer({
        engineRoot: server.config.root,
        ...(await projectAuthoringOptions(server.config.root, current, registry, engineContent)),
        identity: identityOf({ ...current, problems }),
        // The manifest's content packs are read at start (plan 5d step 8: the World Builder window adds one).
        restart: () => void server.restart().catch((error: unknown) => server.config.logger.error(`forge: restart: ${String(error)}`)),
      });
      server.middlewares.use(triangleMiddleware(server.config.root, async () => (await forge.authoring.current()).index, forge.authoring.contentRoots));
      server.middlewares.use(forge.middleware);
      const events = createFileEvents({
        roots: forge.authoring.contentRoots,
        emit: async (files) => {
          await forge.authoring.changed(files.map((file) => file.path));
          const body: FileEventsBody = { files };
          server.ws.send({ type: "custom", event: FILE_EVENT, data: body });
        },
      });
      const unwatch = watchContentRoots(forge.authoring.contentRoots, events, (message) => server.config.logger.warn(`forge: ${message}`));
      server.httpServer?.once("close", () => {
        forge.dispose();
        unwatch();
        events.dispose();
      });
      const where = `${current.readOnly ? " (read-only)" : ""}${engineContent ? "; engine content and packs written (--engine-content)" : ""}`;
      server.config.logger.info(`forge: project ${current.manifest?.name ?? "?"} at ${current.root}${where}`);
      for (const problem of problems) server.config.logger.warn(`forge: ${problem}`);
    },
  };
}
