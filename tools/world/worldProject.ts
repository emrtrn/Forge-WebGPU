// A game project as World Builder reads it (plan 2b `tools/world`): its
// manifest, the schema registry, and the asset index over its content roots,
// the engine's content and its packs (A9, A10). World Builder inputs refer to
// one another by asset index file label (`content/levels/a/a.worldbrief.json`,
// `engine:content/packs/worldbuilder/covers/forest.cover.json`).

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  buildAssetIndex,
  fileLabel,
  normalizeDataDocument,
  type AssetIndex,
  type ContentFile,
  type DocumentAssetTypeDef,
  type JsonObject,
  type ProjectManifest,
  type SchemaRegistry,
} from "../../src/core/index.ts";
import { ENGINE_LABEL_PREFIX, projectIndexRoots } from "../assets/engineContent.ts";
import { loadEngineRegistry } from "../assets/engineRegistry.ts";
import { scanRoots, type ContentRoot } from "../assets/scan.ts";
import { formatProblem, loadProject } from "../project/check.ts";

export interface WorldProject {
  readonly engineRoot: string;
  readonly root: string;
  readonly manifest: ProjectManifest;
  readonly registry: SchemaRegistry;
  readonly roots: readonly ContentRoot[];
  readonly index: AssetIndex;
  /** Scanned files by label. */
  readonly files: ReadonlyMap<string, ContentFile>;
  /** Asset id of the asset whose file has this label, or null. */
  assetIdOf(label: string): string | null;
  /** The content of a data document of this type, by label; throws with the reason when it cannot be read. */
  readData(label: string, type: DocumentAssetTypeDef, what: string): JsonObject;
}

export async function openWorldProject(engineRoot: string, projectRoot: string): Promise<WorldProject> {
  const loaded = await loadProject(projectRoot, { engineRoot });
  if (!loaded.manifest || loaded.problems.length > 0) {
    throw new Error(`project ${projectRoot}: ${loaded.problems.map(formatProblem).join("; ")}`);
  }
  const manifest = loaded.manifest;
  const registry = await loadEngineRegistry(engineRoot);
  const roots = projectIndexRoots(engineRoot, projectRoot, manifest);
  return indexWorldProject(engineRoot, projectRoot, manifest, registry, roots);
}

async function indexWorldProject(
  engineRoot: string,
  root: string,
  manifest: ProjectManifest,
  registry: SchemaRegistry,
  roots: readonly ContentRoot[],
): Promise<WorldProject> {
  const scan = await scanRoots(roots);
  const index = buildAssetIndex(scan.files, { strict: true, registry });
  const files = new Map(scan.files.map((file) => [fileLabel(file.root, file.path), file]));
  const idByLabel = new Map<string, string>();
  for (const entry of index.entries.values()) idByLabel.set(fileLabel(entry.root, entry.path), entry.id);
  const packOf = (label: string): string | null => {
    const match = /^engine:content\/packs\/([^/]+)\//.exec(label);
    return match ? match[1]! : null;
  };
  return {
    engineRoot,
    root,
    manifest,
    registry,
    roots,
    index,
    files,
    assetIdOf: (label) => idByLabel.get(label) ?? null,
    readData(label, type, what) {
      const file = files.get(label);
      if (!file) {
        const pack = packOf(label);
        const hint = pack !== null && !manifest.contentPacks.includes(pack)
          ? `; add "${pack}" to contentPacks in forge.project.json`
          : label.startsWith(ENGINE_LABEL_PREFIX) ? "" : " (a project path under one of its content roots)";
        throw new Error(`${what} not found: ${label}${hint}`);
      }
      if (file.parseError !== undefined) throw new Error(`${what} is not JSON (${label}): ${file.parseError}`);
      const result = normalizeDataDocument(file.json, type, { strict: true });
      if (!result.value || !result.ok) {
        throw new Error(`${what} ${label}: ${result.issues.map((issue) => `${issue.path} ${issue.message}`.trim()).join("; ")}`);
      }
      return result.value.data;
    },
  };
}

/** Bytes of a file by label, from the root it is in. */
export async function readLabelBytes(project: WorldProject, label: string): Promise<Buffer> {
  const root = project.roots.find((entry) => label.startsWith(`${entry.label}/`));
  if (!root) throw new Error(`no content root holds ${label}`);
  return readFile(join(root.dir, label.slice(root.label.length + 1)));
}
