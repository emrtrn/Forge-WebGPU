// The schema registry Node tools work with: every component and binary asset
// type that the engine's feature schemas export (architecture §4.5: the dev
// server and tools load the same schemas). Tools may not import a feature's
// `feature.ts` (it can pull in runtime and render code), so the definitions
// are collected from `src/features/*/schema.ts` exports.

import { readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  createSchemaRegistry,
  isJsonObject,
  type BinaryAssetTypeDef,
  type ComponentDef,
  type SchemaRegistry,
} from "../../src/core/index.ts";

/** `src/features/<name>/schema.ts` files, sorted. */
export function findFeatureSchemaFiles(repoRoot: string): string[] {
  const featuresRoot = join(repoRoot, "src/features");
  let entries;
  try {
    entries = readdirSync(featuresRoot, { withFileTypes: true });
  } catch {
    return []; // no feature yet
  }
  const files: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (readdirSync(join(featuresRoot, entry.name)).includes("schema.ts")) {
      files.push(join(featuresRoot, entry.name, "schema.ts"));
    }
  }
  return files.sort();
}

/** Registers what the modules export: component definitions and binary asset types. */
export function registerExports(registry: SchemaRegistry, modules: readonly Record<string, unknown>[]): void {
  for (const module of modules) {
    for (const value of Object.values(module)) {
      if (!isJsonObject(value)) continue;
      if (value.kind === "component") {
        registry.registerComponent(value as unknown as ComponentDef);
      } else if (value.kind === "assetType" && value.storage === "binary") {
        registry.registerAssetType(value as unknown as BinaryAssetTypeDef);
      }
    }
  }
}

export async function loadEngineRegistry(repoRoot: string): Promise<SchemaRegistry> {
  const modules: Record<string, unknown>[] = [];
  for (const file of findFeatureSchemaFiles(repoRoot)) {
    modules.push((await import(pathToFileURL(file).href)) as Record<string, unknown>);
  }
  const registry = createSchemaRegistry();
  registerExports(registry, modules);
  return registry;
}
