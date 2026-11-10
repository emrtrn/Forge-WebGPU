// Opening the served project's start level in the browser (architecture
// §4.7, §4.8): the project's actor classes, then the level folder through the
// save endpoints (the persistent layer and every cell, with revisions).
// Streaming only the cells around the camera comes with phase 5b (A11).

import {
  normalizeActorClass,
  openLevelFromServer,
  type ActorClassDoc,
  type AssetId,
  type ClassResolver,
  type Issue,
  type SaveClient,
  type SchemaRegistry,
} from "../core/index.ts";
import type { LoadedLevel } from "./boot.ts";
import { WorldError } from "./world.ts";

export async function loadProjectLevel(
  client: SaveClient,
  folder: string,
  registry: SchemaRegistry,
  strict: boolean,
): Promise<LoadedLevel> {
  const classes = new Map<string, ActorClassDoc>();
  const issues: Issue[] = [];
  for (const raw of await client.classes()) {
    const result = normalizeActorClass(raw, { strict, registry });
    issues.push(...result.issues);
    if (result.value) classes.set(result.value.id, result.value);
  }
  const resolveClass: ClassResolver = (id: AssetId) => classes.get(id);
  const opened = await openLevelFromServer(client, folder, { strict, registry, resolveClass });
  issues.push(...opened.issues.map((found) => ({ ...found, path: `${found.file} ${found.path}`.trim() })));
  if (strict && issues.some((found) => found.severity === "error")) {
    throw new WorldError(`The level at ${folder} has errors.`, issues);
  }
  return { level: opened.session.level, resolveClass };
}
