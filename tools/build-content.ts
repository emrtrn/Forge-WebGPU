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
import { buildAssetIndex, STATIC_CONTENT_DIR, staticContentFile } from "../src/core/index.ts";
import { listContentPacks, projectIndexRoots } from "./assets/engineContent.ts";
import { loadEngineRegistry } from "./assets/engineRegistry.ts";
import { loadGameSchemas } from "./project/gameSchemas.ts";
import { scanRoots } from "./assets/scan.ts";
import { createClassStore } from "./save/documentCheck.ts";
import { identityOf, resolveDevProject } from "./server/devProject.ts";
import { rendererAssetFiles } from "./server/forgeServer.ts";
import { diskHlodInput } from "./world/hlodInput.ts";
import { hlodStaleness, hlodWarningLine } from "./world/hlodStale.ts";

const ENGINE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export interface BuildContentResult {
  readonly project: string;
  readonly files: number;
  readonly assets: number;
  readonly classes: number;
}

export async function buildContent(options: { readonly outDir: string; readonly projectRoot?: string; readonly engineRoot?: string }): Promise<BuildContentResult> {
  const engineRoot = options.engineRoot ?? ENGINE_ROOT;
  const project = await resolveDevProject(engineRoot, options.projectRoot === undefined ? process.env : { FORGE_PROJECT_ROOT: options.projectRoot });
  if (project.problems.length > 0 || project.manifest === null) {
    throw new Error(`The project at ${project.root} does not build:\n  ${project.problems.join("\n  ")}`);
  }
  const manifest = project.manifest;
  const registry = await loadEngineRegistry(engineRoot);
  await loadGameSchemas(engineRoot, project.root, manifest.game.module, registry);

  const packs = await listContentPacks(engineRoot);
  const roots = projectIndexRoots(engineRoot, project.root, {
    contentRoots: manifest.contentRoots,
    contentPacks: manifest.contentPacks.filter((pack) => packs.includes(pack)),
  });
  const scan = await scanRoots(roots);
  const index = buildAssetIndex(scan.files, { strict: false, registry });
  for (const warning of await hlodStaleness(diskHlodInput(scan.files, index, registry, roots))) console.warn(hlodWarningLine(warning));
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
