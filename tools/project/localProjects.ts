// forge.projects.local.json (architecture §4.8, A8, A9): the game projects on
// this machine that `check:projects` checks before an engine push. Not in
// git: every machine has its own. `samples/*` are always checked as well.

import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

export const LOCAL_PROJECTS_FILE = "forge.projects.local.json";
const SCHEMA = "forge.projectsLocal/1";

interface LocalProjects {
  readonly schema: typeof SCHEMA;
  readonly projects: string[];
}

async function read(engineRoot: string): Promise<LocalProjects> {
  try {
    const raw = JSON.parse(await readFile(join(engineRoot, LOCAL_PROJECTS_FILE), "utf8")) as Partial<LocalProjects>;
    return { schema: SCHEMA, projects: Array.isArray(raw.projects) ? raw.projects.filter((path) => typeof path === "string") : [] };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { schema: SCHEMA, projects: [] };
    throw new Error(`${LOCAL_PROJECTS_FILE} cannot be read: ${(error as Error).message}`);
  }
}

export async function registerLocalProject(engineRoot: string, projectRoot: string): Promise<void> {
  const current = await read(engineRoot);
  const path = resolve(projectRoot);
  if (current.projects.includes(path)) return;
  await writeFile(join(engineRoot, LOCAL_PROJECTS_FILE), `${JSON.stringify({ ...current, projects: [...current.projects, path] }, null, 2)}\n`);
}

/** The projects to check: `samples/*` with a manifest, then the registered ones. */
export async function projectsToCheck(engineRoot: string): Promise<string[]> {
  const samples: string[] = [];
  try {
    for (const entry of await readdir(join(engineRoot, "samples"), { withFileTypes: true })) {
      if (entry.isDirectory() && !entry.name.startsWith(".")) samples.push(join(engineRoot, "samples", entry.name));
    }
  } catch {
    // no samples
  }
  const local = (await read(engineRoot)).projects;
  return [...samples.sort(), ...local.filter((path) => !samples.includes(path))];
}
