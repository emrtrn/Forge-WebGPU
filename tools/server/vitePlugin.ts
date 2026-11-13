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

import { resolve } from "node:path";
import type { Plugin, ViteDevServer } from "vite";
import { defineFeature, installFeatures, isJsonObject, type FeatureDef } from "../../src/core/index.ts";
import { engineContentRoots, listContentPacks } from "../assets/engineContent.ts";
import { loadEngineRegistry } from "../assets/engineRegistry.ts";
import { writeProjectTsconfig } from "../project/check.ts";
import { resolveDevProject, identityOf, type DevProject } from "./devProject.ts";
import { createForgeServer } from "./forgeServer.ts";

export const GAME_MODULE_ID = "virtual:forge/game-module";
const RESOLVED_GAME_MODULE = `\0${GAME_MODULE_ID}`;

/** Source of the virtual game module. */
export function gameModuleSource(project: DevProject | null): string {
  const module = project?.manifest?.game.module ?? "";
  if (project === null || module === "" || project.problems.length > 0) return "export default null;\n";
  const path = resolve(project.root, module).split("\\").join("/");
  return `export { default } from ${JSON.stringify(path)};\n`;
}

/** The game module's features, loaded through Vite so `@forge/sdk` resolves. */
async function gameFeatures(server: ViteDevServer, project: DevProject): Promise<FeatureDef[]> {
  const module = project.manifest?.game.module ?? "";
  if (module === "") return [];
  const loaded = (await server.ssrLoadModule(resolve(project.root, module))) as { default?: unknown };
  const game = loaded.default;
  if (!isJsonObject(game) || game.kind !== "gameModule") {
    throw new Error(`${module} must export default defineGameModule(...).`);
  }
  return [...((game.features as readonly FeatureDef[] | undefined) ?? [])];
}

export interface ForgeServerPluginOptions {
  /** The project to serve; default FORGE_PROJECT_ROOT, then samples/starter. */
  readonly projectRoot?: string;
  /** Serve even under Vitest (tests that drive a real dev server). */
  readonly enable?: boolean;
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
      return id === GAME_MODULE_ID ? RESOLVED_GAME_MODULE : null;
    },
    load(id) {
      return id === RESOLVED_GAME_MODULE ? gameModuleSource(project) : null;
    },
    async configureServer(server) {
      if (!serving || project === null) return;
      const current = project;
      const registry = await loadEngineRegistry(server.config.root);
      const problems = [...current.problems];
      if (problems.length === 0) {
        try {
          // The project's tsconfig extends the generated one; Vite reads it to
          // transform the game's files. Generated, git-ignored, not content.
          await writeProjectTsconfig(current.root, server.config.root);
          const features = await gameFeatures(server, current);
          // Components and asset types only: the subsystems run in the browser.
          installFeatures(features.map((feature) => defineFeature({ id: feature.id, components: feature.components, assetTypes: feature.assetTypes })), registry);
        } catch (error) {
          problems.push(`game module: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      const roots = current.manifest?.contentRoots ?? ["content"];
      // Unknown packs are among the problems already; the known ones are read.
      const packs = await listContentPacks(server.config.root);
      const readOnlyRoots = engineContentRoots(
        server.config.root,
        (current.manifest?.contentPacks ?? []).filter((pack) => packs.includes(pack)),
      );
      const forge = await createForgeServer({
        root: current.root,
        registry,
        writableRoots: roots,
        contentRoots: roots,
        readOnlyRoots,
        readOnly: current.readOnly,
        identity: identityOf({ ...current, problems }),
      });
      server.middlewares.use(forge.middleware);
      const where = current.readOnly ? " (read-only)" : "";
      server.config.logger.info(`forge: project ${current.manifest?.name ?? "?"} at ${current.root}${where}`);
      for (const problem of problems) server.config.logger.warn(`forge: ${problem}`);
    },
  };
}
