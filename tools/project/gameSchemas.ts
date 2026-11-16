// A game project's schemas in Node (architecture §4.5, §4.8): the components
// and asset types its game module's features define, installed into a
// registry beside the engine's. The game module imports `@forge/sdk`, so it is
// loaded through Vite (`ssrLoadModule`); its subsystems run in the browser
// and stay out (only `components` and `assetTypes` are taken).
//
// The dev server loads it with its own Vite server; the production build's
// content step and the agent's edit commands (plan phase 4 step 9b) with a
// short-lived one (`withModuleLoader`).

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "vite";
import { defineFeature, installFeatures, isJsonObject, type FeatureDef, type SchemaRegistry } from "../../src/core/index.ts";
import { writeProjectTsconfig } from "./check.ts";

/** Loads a module by absolute path, as Vite's `ssrLoadModule`. */
export type ModuleLoader = (path: string) => Promise<Record<string, unknown>>;

/** The features of the game module at `module` (project-relative); none when the project has no module. */
export async function gameFeatures(load: ModuleLoader, projectRoot: string, module: string): Promise<FeatureDef[]> {
  if (module === "") return [];
  const game = (await load(resolve(projectRoot, module))).default;
  if (!isJsonObject(game) || game.kind !== "gameModule") throw new Error(`${module} must export default defineGameModule(...).`);
  return [...((game.features as readonly FeatureDef[] | undefined) ?? [])];
}

/** Components and asset types only: subsystems run in the browser. */
export function installGameSchemas(registry: SchemaRegistry, features: readonly FeatureDef[]): void {
  installFeatures(features.map((feature) => defineFeature({ id: feature.id, components: feature.components, assetTypes: feature.assetTypes })), registry);
}

/**
 * Runs `work` with a module loader of a Vite server that resolves the SDK names (A8), closed afterwards. It has
 * a cache folder of its own and discovers no dependencies: a dev server running beside it (`npm run dev` while
 * `forge edit` runs) keeps its optimised dependencies in `node_modules/.vite`, which a second server there
 * would replace under it.
 */
export async function withModuleLoader<T>(engineRoot: string, work: (load: ModuleLoader) => Promise<T>, options: { readonly readOnly?: boolean } = {}): Promise<T> {
  const cacheDir = await mkdtemp(join(tmpdir(), "forge-schemas-"));
  const vite = await createServer({
    root: engineRoot,
    configFile: false,
    // Offline readers must also work before forge check generated .forge/tsconfig.json.
    ...(options.readOnly ? { esbuild: { tsconfigRaw: JSON.stringify({ compilerOptions: {
      target: "ES2022", useDefineForClassFields: true, verbatimModuleSyntax: true,
    } }) } } : {}),
    cacheDir,
    optimizeDeps: { noDiscovery: true, include: [] },
    logLevel: "silent",
    appType: "custom",
    resolve: {
      alias: {
        "@forge/sdk": join(engineRoot, "src/sdk/index.ts"),
        "@forge/editor-sdk": join(engineRoot, "src/editor-sdk/index.ts"),
      },
    },
    server: { middlewareMode: true, hmr: false, watch: null },
  });
  try {
    return await work((path) => vite.ssrLoadModule(path) as Promise<Record<string, unknown>>);
  } finally {
    await vite.close();
    await rm(cacheDir, { recursive: true, force: true });
  }
}

/**
 * Installs the game module's schemas into `registry` (a short-lived Vite server when the project has a module).
 * The project's tsconfig extends the generated one (`.forge/tsconfig.json`, git-ignored): Vite reads it to
 * transform the game's files, so it is written first, as the dev server does.
 */
export async function loadGameSchemas(engineRoot: string, projectRoot: string, module: string, registry: SchemaRegistry, options: { readonly readOnly?: boolean } = {}): Promise<void> {
  if (module === "") return;
  if (!options.readOnly) await writeProjectTsconfig(projectRoot, engineRoot);
  await withModuleLoader(engineRoot, async (load) => installGameSchemas(registry, await gameFeatures(load, projectRoot, module)), options);
}
