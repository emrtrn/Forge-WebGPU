// A project opened for authoring the way the dev server opens it (plan phase
// 4 step 9b): the project's content roots written, the packs it picks (in
// engine content mode every pack, written) read through `engine:` labels, the
// engine's samples and fixtures read-only. `npm run forge -- edit` opens a
// project with the same options as `npm run dev` serves it, so both check
// and write it alike.

import { engineContentRoots, listContentPacks } from "../assets/engineContent.ts";
import type { AuthoringOptions } from "./authoring.ts";
import type { DevProject } from "./devProject.ts";
import type { SchemaRegistry } from "../../src/core/index.ts";

export async function projectAuthoringOptions(
  engineRoot: string,
  project: DevProject,
  registry: SchemaRegistry,
  engineContent?: { readonly root: string },
): Promise<AuthoringOptions> {
  const roots = project.manifest?.contentRoots ?? ["content"];
  // Unknown packs are among the project's problems already; the known ones are read.
  const packs = await listContentPacks(engineRoot);
  const readOnlyRoots = engineContentRoots(
    engineContent?.root ?? engineRoot,
    engineContent ? await listContentPacks(engineContent.root) : (project.manifest?.contentPacks ?? []).filter((pack) => packs.includes(pack)),
  );
  return {
    root: project.root,
    registry,
    writableRoots: roots,
    contentRoots: roots,
    readOnlyRoots,
    readOnly: project.readOnly,
    ...(engineContent ? { engineContent } : {}),
  };
}
