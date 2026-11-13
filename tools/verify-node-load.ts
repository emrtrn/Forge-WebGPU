// Node load gate (architecture §4.5: "the dev server loads the same schemas").
//
// The core layer, the engine layer and every feature schema must load in plain
// Node with type stripping: no bundler, no loader hook. This script does exactly
// that. It fails on an extensionless relative import, on syntax Node cannot
// erase and on a module that touches a browser global while loading.
//
// The static import below also pulls src/core into the tools TypeScript
// project, so core is type-checked a second time without the DOM lib;
// tsconfig.tools.json includes src/engine for the same reason. The engine layer
// has no DOM and no Web Audio (decision 2026-11-11): code that needs a browser
// API lives in src/runtime.

import { readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
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
    // A feature schema defines components, binary or JSON asset types (what registerExports takes).
    const definitions = Object.values(module).filter(
      (value) => core.isJsonObject(value)
        && (value.kind === "component" || (value.kind === "assetType" && (value.storage === "binary" || core.isJsonObject(value.json)))),
    );
    if (definitions.length === 0) {
      failures.push(`${label} loaded but exports no component or asset type definition.`);
    }
  } catch (error) {
    failures.push(`${label} does not load in Node: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Every non-test TypeScript module under src/engine, sorted. */
function findEngineModules(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) out.push(path);
    }
  };
  try {
    walk(join(root, "src", "engine"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return out.sort();
}

const engineModules = findEngineModules(repoRoot);
for (const file of engineModules) {
  const label = file.slice(repoRoot.length + 1).replaceAll("\\", "/");
  try {
    await import(pathToFileURL(file).href);
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
  `verify:node-load: core (${Object.keys(core).length} exports), ${engineModules.length} engine module(s) and ${schemaFiles.length} feature schema(s) load in Node.`,
);
