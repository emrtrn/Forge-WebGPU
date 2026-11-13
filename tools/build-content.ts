// `npm run build`'s second half (plan phase 4 step 2b; architecture §4.8
// build, A9): after `vite build` put the project's game code in dist, this
// writes what the game reads at run time beside it, so a production build
// opens without the dev server:
//
//   dist/forge/files/project/<content root>/...  the project's content
//   dist/forge/files/engine/content/...          the engine's content and the
//                                                content packs the project picks
//   dist/forge/identity.json                     the project as /__forge/identity
//                                                answers, read-only, no machine path
//   dist/forge/classes.json                      the actor classes
//   dist/forge/asset-files.json                  the renderer's GUID -> file table
//
// The game reads them through core's static content client under the page's
// base URL (`import.meta.env.BASE_URL`), so a build served from a sub folder
// works (F06). Every readable file is copied, as the dev server would serve it:
// content packs are picked whole (A9). A project with problems does not build.
//
// Usage: node tools/build-content.ts [--out <dist>] [--project <root>]

import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import {
  buildAssetIndex,
  defineFeature,
  installFeatures,
  isJsonObject,
  STATIC_CONTENT_DIR,
  staticContentFile,
  type FeatureDef,
  type SchemaRegistry,
} from "../src/core/index.ts";
import { listContentPacks, projectIndexRoots } from "./assets/engineContent.ts";
import { loadEngineRegistry } from "./assets/engineRegistry.ts";
import { scanRoots } from "./assets/scan.ts";
import { createClassStore } from "./save/documentCheck.ts";
import { identityOf, resolveDevProject } from "./server/devProject.ts";
import { rendererAssetFiles } from "./server/forgeServer.ts";

const ENGINE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export interface BuildContentResult {
  readonly project: string;
  readonly files: number;
  readonly assets: number;
  readonly classes: number;
}

/** The game module's components and asset types, loaded through Vite so `@forge/sdk` resolves. */
async function installGameSchemas(engineRoot: string, projectRoot: string, module: string, registry: SchemaRegistry): Promise<void> {
  if (module === "") return;
  const vite = await createServer({
    root: engineRoot,
    configFile: false,
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
    const loaded = (await vite.ssrLoadModule(join(projectRoot, module))) as { default?: unknown };
    const game = loaded.default;
    if (!isJsonObject(game) || game.kind !== "gameModule") throw new Error(`${module} must export default defineGameModule(...).`);
    const features = (game.features as readonly FeatureDef[] | undefined) ?? [];
    // Components and asset types only: subsystems run in the browser.
    installFeatures(features.map((feature) => defineFeature({ id: feature.id, components: feature.components, assetTypes: feature.assetTypes })), registry);
  } finally {
    await vite.close();
  }
}

export async function buildContent(options: { readonly outDir: string; readonly projectRoot?: string; readonly engineRoot?: string }): Promise<BuildContentResult> {
  const engineRoot = options.engineRoot ?? ENGINE_ROOT;
  const project = await resolveDevProject(engineRoot, options.projectRoot === undefined ? process.env : { FORGE_PROJECT_ROOT: options.projectRoot });
  if (project.problems.length > 0 || project.manifest === null) {
    throw new Error(`The project at ${project.root} does not build:\n  ${project.problems.join("\n  ")}`);
  }
  const manifest = project.manifest;
  const registry = await loadEngineRegistry(engineRoot);
  await installGameSchemas(engineRoot, project.root, manifest.game.module, registry);

  const packs = await listContentPacks(engineRoot);
  const roots = projectIndexRoots(engineRoot, project.root, {
    contentRoots: manifest.contentRoots,
    contentPacks: manifest.contentPacks.filter((pack) => packs.includes(pack)),
  });
  const scan = await scanRoots(roots);
  const index = buildAssetIndex(scan.files, { strict: false, registry });
  const classes = createClassStore(project.root, registry, index).all();
  const assets = rendererAssetFiles(index);

  const out = join(resolve(options.outDir), STATIC_CONTENT_DIR);
  await rm(out, { recursive: true, force: true });
  const dirOf = new Map(roots.map((root) => [root.label, root.dir]));
  for (const file of scan.files) {
    const target = join(out, ...staticContentFile(`${file.root}/${file.path}`).split("/"));
    await mkdir(dirname(target), { recursive: true });
    await copyFile(join(dirOf.get(file.root)!, ...file.path.split("/")), target);
  }
  // The build may be published: the identity names no folder of the building machine.
  const identity = identityOf({ ...project, readOnly: true });
  await writeFile(join(out, "identity.json"), `${JSON.stringify({ ...identity, project: { ...identity.project, root: "" } }, null, 2)}\n`);
  await writeFile(join(out, "classes.json"), `${JSON.stringify({ classes })}\n`);
  await writeFile(join(out, "asset-files.json"), `${JSON.stringify({ assets })}\n`);
  return { project: manifest.name, files: scan.files.length, assets: Object.keys(assets).length, classes: classes.length };
}

async function main(argv: readonly string[]): Promise<number> {
  const value = (flag: string): string | undefined => {
    const at = argv.indexOf(flag);
    return at >= 0 ? argv[at + 1] : undefined;
  };
  const project = value("--project");
  try {
    const result = await buildContent({ outDir: value("--out") ?? join(ENGINE_ROOT, "dist"), ...(project === undefined ? {} : { projectRoot: project }) });
    console.log(`build-content: ${result.project}: ${result.files} files, ${result.assets} assets, ${result.classes} classes into ${STATIC_CONTENT_DIR}/.`);
    return 0;
  } catch (error) {
    console.error(`build-content: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
