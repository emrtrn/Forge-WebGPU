// Which project the dev server serves (architecture §4.8; project contract
// decision 1F). The launcher names it in FORGE_PROJECT_ROOT; without one,
// `npm run dev` opens samples/starter (A9: the engine repository has no
// default scene). A project inside the engine's samples/ or tests/fixtures/
// is opened read-only: those change by review, not from the editor.

import { relative, resolve, sep } from "node:path";
import { SDK_VERSION, type ForgeIdentity, type ProjectManifest } from "../../src/core/index.ts";
import { formatProblem, loadProject } from "../project/check.ts";

export const DEFAULT_PROJECT = "samples/starter";
const READ_ONLY_PROJECT_ROOTS = ["samples", "tests/fixtures"];

export interface DevProject {
  readonly root: string;
  readonly manifest: ProjectManifest | null;
  readonly readOnly: boolean;
  readonly problems: string[];
}

export function isReadOnlyProject(engineRoot: string, projectRoot: string): boolean {
  const rel = relative(resolve(engineRoot), resolve(projectRoot)).split(sep).join("/");
  return READ_ONLY_PROJECT_ROOTS.some((folder) => rel === folder || rel.startsWith(`${folder}/`));
}

export async function resolveDevProject(engineRoot: string, env: Readonly<Record<string, string | undefined>> = process.env): Promise<DevProject> {
  const given = env.FORGE_PROJECT_ROOT;
  const root = resolve(engineRoot, given === undefined || given === "" ? DEFAULT_PROJECT : given);
  const loaded = await loadProject(root);
  return {
    root,
    manifest: loaded.manifest,
    readOnly: isReadOnlyProject(engineRoot, root),
    problems: loaded.problems.map(formatProblem),
  };
}

export function identityOf(project: DevProject): ForgeIdentity {
  const manifest = project.manifest;
  return {
    engine: { sdkVersion: SDK_VERSION },
    project: {
      root: project.root,
      id: manifest?.id ?? null,
      name: manifest?.name ?? null,
      sdkVersion: manifest?.sdkVersion ?? null,
      startLevel: manifest?.startLevel ?? "",
      readOnly: project.readOnly,
      problems: project.problems,
    },
  };
}
