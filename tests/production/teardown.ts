// Deletes the run's build (playwright.config.ts) once the tests are done.

import { rmSync } from "node:fs";
import { basename, dirname } from "node:path";

export default function teardown(): void {
  const out = process.env.FORGE_DIST_SMOKE_OUT;
  if (!out) return;
  const folder = dirname(out);
  // Only the folder this run made (mkdtemp's prefix), never anything else.
  if (basename(folder).startsWith("forge-dist-smoke-")) rmSync(folder, { recursive: true, force: true });
}
