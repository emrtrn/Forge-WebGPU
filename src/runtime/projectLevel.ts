// Opening the served project's start level in the browser (architecture
// §4.7, §4.8): the project's actor classes, then the level folder through the
// save endpoints. Only the persistent layer and the cell index are read here;
// the cells stream in around the camera (phase 5b step 4, A11) through the
// returned cell source — the same reads in development, a play session and a
// production build (ContentClient).

import {
  cellFileOf,
  HLOD_INDEX_FILE,
  normalizeHlodIndex,
  normalizeActorClass,
  normalizeLevelCell,
  readLevelFromServer,
  type ActorClassDoc,
  type AssetId,
  type ClassResolver,
  type Issue,
  type ContentClient,
  type SchemaRegistry,
} from "../core/index.ts";
import type { LoadedLevel } from "./boot.ts";
import type { CellSource } from "./streaming/cellStreaming.ts";
import { WorldError } from "./world.ts";

export async function loadProjectLevel(
  client: ContentClient,
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
  const options = { strict, registry, resolveClass };
  const read = await readLevelFromServer(client, folder, options, () => []);
  issues.push(...read.issues.map((found) => ({ ...found, path: `${found.file} ${found.path}`.trim() })));
  if (strict && issues.some((found) => found.severity === "error")) {
    throw new WorldError(`The level at ${folder} has errors.`, issues);
  }
  const hlod = await levelHlod(client, folder, issues);
  return { level: read.open.persistent, resolveClass, cells: levelCellSource(client, folder, read.cells, options), ...(hlod ? { hlod } : {}) };
}

/** The level's HLOD index and proxy reader (phase 5b decision 5); null without an index or a binary reader. */
async function levelHlod(client: ContentClient, folder: string, issues: Issue[]): Promise<LoadedLevel["hlod"] | null> {
  if (!client.readBinary) return null;
  const file = await client.read(`${folder}/${HLOD_INDEX_FILE}`);
  if (!file) return null;
  const index = normalizeHlodIndex(JSON.parse(file.text), { strict: false });
  issues.push(...index.issues.map((found) => ({ ...found, path: `${HLOD_INDEX_FILE} ${found.path}`.trim() })));
  if (!index.value) return null;
  const readBinary = client.readBinary.bind(client);
  return { index: index.value, load: (file) => readBinary(`${folder}/${file}`) };
}

/** The cells of a level folder read one by one through a content client. */
export function levelCellSource(
  client: ContentClient,
  folder: string,
  cells: readonly string[],
  options: { readonly strict: boolean; readonly registry: SchemaRegistry; readonly resolveClass: ClassResolver },
): CellSource {
  return {
    cells,
    async read(key) {
      const file = await client.read(`${folder}/${cellFileOf(key)}`);
      if (!file) {
        return { payload: { actors: [], bytes: 0 }, issues: [{ code: "orphan-part", severity: "error", path: cellFileOf(key), message: `The index lists cell ${key} but its file is missing.` }] };
      }
      const cell = normalizeLevelCell(JSON.parse(file.text), options);
      if (options.strict && cell.issues.some((found) => found.severity === "error")) {
        throw new WorldError(`Cell ${key} of ${folder} has errors.`, cell.issues);
      }
      return { payload: { actors: cell.value?.actors ?? [], bytes: file.text.length }, issues: cell.issues };
    },
  };
}
