// Deletes the run's project copy (playwright.config.ts) once every test is done.

import { rmSync } from "node:fs";
import { basename, dirname } from "node:path";

export default function teardown(): void {
  const project = process.env.FORGE_EDITOR_SMOKE_PROJECT;
  if (!project) return;
  const folder = dirname(project);
  // Only the folder this run made (mkdtemp's prefix), never anything else.
  if (basename(folder).startsWith("forge-editor-smoke-")) rmSync(folder, { recursive: true, force: true });
}
