// Node load gate (architecture §4.5: "the dev server loads the same schemas").
//
// The core layer and every feature schema must load in plain Node with type
// stripping: no bundler, no loader hook. This script does exactly that. It
// fails on an extensionless relative import, on syntax Node cannot erase and
// on a module that touches a browser global while loading.
//
// The static import below also pulls src/core into the tools TypeScript
// project, so core is type-checked a second time without the DOM lib.

import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as core from "../src/core/index.ts";
import { findFeatureSchemaFiles } from "./assets/engineRegistry.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const failures: string[] = [];

if (Object.keys(core).length === 0) {
  failures.push("src/core/index.ts loaded but exports nothing.");
}

const schemaFiles = findFeatureSchemaFiles(repoRoot);
for (const file of schemaFiles) {
  const label = file.slice(repoRoot.length + 1).replaceAll("\\", "/");
  try {
    const module: Record<string, unknown> = await import(pathToFileURL(file).href);
    const definitions = Object.values(module).filter(
      (value) => core.isJsonObject(value) && value.kind === "component",
    );
    if (definitions.length === 0) {
      failures.push(`${label} loaded but exports no component definition.`);
    }
  } catch (error) {
    failures.push(`${label} does not load in Node: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`verify:node-load: ${failure}`);
  }
  process.exit(1);
}
console.log(
  `verify:node-load: core (${Object.keys(core).length} exports) and ${schemaFiles.length} feature schema(s) load in Node.`,
);
