// A game project opened for the agent's edit commands (A12; plan phase 4
// step 9b): the dev server's way (devProject.ts, projectAuthoring.ts), in
// this process. The registry is the engine's schemas plus the game module's;
// the classes are the authoring module's, normalised strictly as the editor
// reads them.

import {
  normalizeActorClass,
  type ActorClassDoc,
  type AssetId,
  type CellAssignOptions,
  type SaveClient,
  type SchemaRegistry,
} from "../../src/core/index.ts";
import { loadEngineRegistry } from "../assets/engineRegistry.ts";
import { loadGameSchemas } from "../project/gameSchemas.ts";
import { openAuthoring, type Authoring } from "../server/authoring.ts";
import { identityOf, resolveDevProject, type DevProject } from "../server/devProject.ts";
import { projectAuthoringOptions } from "../server/projectAuthoring.ts";
import { createLocalSaveClient } from "./localClient.ts";

export interface EditProject {
  readonly project: DevProject;
  readonly registry: SchemaRegistry;
  readonly authoring: Authoring;
  readonly client: SaveClient;
  /** How levels are read and checked: strict, with the project's classes. */
  readonly options: CellAssignOptions;
  readonly classes: ReadonlyMap<AssetId, ActorClassDoc>;
}

export class EditProjectError extends Error {}

export async function openEditProject(engineRoot: string, projectRoot: string, registry?: SchemaRegistry): Promise<EditProject> {
  const project = await resolveDevProject(engineRoot, { FORGE_PROJECT_ROOT: projectRoot });
  if (project.manifest === null || project.problems.length > 0) {
    throw new EditProjectError(`The project at ${project.root} cannot be opened: ${project.problems.join("; ")}`);
  }
  let schemas = registry;
  if (schemas === undefined) {
    schemas = await loadEngineRegistry(engineRoot);
    await loadGameSchemas(engineRoot, project.root, project.manifest.game.module, schemas);
  }
  const authoring = await openAuthoring(await projectAuthoringOptions(engineRoot, project, schemas));
  const client = createLocalSaveClient(authoring, identityOf(project));
  // The classes as the editor reads them from `/__forge/classes`.
  const classRegistry = schemas;
  const classes = new Map<AssetId, ActorClassDoc>();
  for (const raw of await client.classes()) {
    const result = normalizeActorClass(raw, { strict: true, registry: classRegistry });
    if (result.value) classes.set(result.value.id, result.value);
  }
  return {
    project,
    registry: schemas,
    authoring,
    client,
    options: { strict: true, registry: schemas, resolveClass: (id) => classes.get(id) },
    classes,
  };
}
