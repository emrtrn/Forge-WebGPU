// Feature definition (architecture §4.3).
//
// A feature is one folder: `src/features/<name>/{schema,runtime,render,editor,feature}.ts`.
// `feature.ts` default-exports `defineFeature(...)`, and the application shell
// installs a list of features; adding a feature changes no shell file.
//
// `defineFeature` carries only what core can type. Today that is `components`
// and `assetTypes` (binary asset types; document types are built in).
// `subsystems` joins with the application shell and `render` with phase 3.
// There is no `editor` slot and there never will be one here: `feature.ts`
// does not name `editor.ts`, not even through a dynamic import. The editor
// host collects `features/*/editor.ts` itself, so the editor stays out of the
// game's import graph and out of the production build.

import type { BinaryAssetTypeDef } from "./assets/assetType.ts";
import { COMPONENT_NAME_PATTERN, type ComponentDef } from "./schema/component.ts";
import { deepFreeze, SchemaDefinitionError } from "./schema/fields.ts";
import type { SchemaRegistry } from "./schema/registry.ts";

export interface FeatureDef {
  readonly kind: "feature";
  /** Namespaced like a component name, e.g. `forge.heightFog`. */
  readonly id: string;
  readonly components: readonly ComponentDef[];
  readonly assetTypes: readonly BinaryAssetTypeDef[];
}

export function defineFeature(feature: {
  readonly id: string;
  readonly components?: readonly ComponentDef[];
  readonly assetTypes?: readonly BinaryAssetTypeDef[];
}): FeatureDef {
  if (!COMPONENT_NAME_PATTERN.test(feature.id)) {
    throw new SchemaDefinitionError(
      `defineFeature: "${feature.id}" must be a namespaced id such as "forge.heightFog".`,
    );
  }
  const components = [...(feature.components ?? [])];
  const names = new Set(components.map((component) => component.name));
  if (names.size !== components.length) {
    throw new SchemaDefinitionError(`defineFeature ${feature.id}: a component is listed twice.`);
  }
  const assetTypes = [...(feature.assetTypes ?? [])];
  if (new Set(assetTypes.map((type) => type.name)).size !== assetTypes.length) {
    throw new SchemaDefinitionError(`defineFeature ${feature.id}: an asset type is listed twice.`);
  }
  return deepFreeze({ kind: "feature", id: feature.id, components, assetTypes });
}

/**
 * Installs the parts of each feature that core owns: component schemas and
 * asset types go to the registry through `registerComponent` and
 * `registerAssetType`. Layers above install their own
 * parts from the same list.
 */
export function installFeatures(features: readonly FeatureDef[], registry: SchemaRegistry): void {
  const seen = new Set<string>();
  for (const feature of features) {
    if (seen.has(feature.id)) {
      throw new SchemaDefinitionError(`installFeatures: feature "${feature.id}" is listed twice.`);
    }
    seen.add(feature.id);
    for (const component of feature.components) {
      registry.registerComponent(component);
    }
    for (const assetType of feature.assetTypes) {
      registry.registerAssetType(assetType);
    }
  }
}
