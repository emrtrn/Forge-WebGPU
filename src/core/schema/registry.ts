// Schema registry (architecture §4.5): the one place that knows every
// component type and asset type of a running editor, game, dev server or tool.
// A new registry already holds the built-in document asset types (level,
// actor class); binary asset types come from features and game projects.
//
// A registry is an instance, never a module-level singleton (A6: two worlds on
// one page must not share mutable state). Engine features and game projects
// register into the same instance through `registerComponent`.

import {
  BUILT_IN_ASSET_TYPES,
  claimsFile,
  type AssetTypeDef,
  type BinaryAssetTypeDef,
  type DocumentAssetTypeDef,
} from "../assets/assetType.ts";
import { isJsonObject, type JsonObject } from "../json.ts";
import { parseComponentTypeTag, type ComponentDef } from "./component.ts";
import { SchemaDefinitionError } from "./fields.ts";
import { childPath, reportLoss, type NormalizeContext } from "./issues.ts";
import { normalizeComponentInto } from "./normalizeComponent.ts";

export interface SchemaRegistry {
  /** Registration point. A name can be registered once. */
  registerComponent(def: ComponentDef): void;
  getComponent(name: string): ComponentDef | undefined;
  /** In registration order. */
  components(): readonly ComponentDef[];
  /** Registration point. A name can be registered once; so can a document schema tag. */
  registerAssetType(def: AssetTypeDef): void;
  getAssetType(name: string): AssetTypeDef | undefined;
  /** Built-in document types first, then in registration order. */
  assetTypes(): readonly AssetTypeDef[];
  /** The binary types whose extensions match the file name. */
  binaryTypesForFile(fileName: string): readonly BinaryAssetTypeDef[];
  /** The document type a JSON asset's `schema` tag names. */
  documentTypeForSchema(schema: unknown): DocumentAssetTypeDef | undefined;
}

export function createSchemaRegistry(): SchemaRegistry {
  const byName = new Map<string, ComponentDef>();
  const assetTypes = new Map<string, AssetTypeDef>();
  const documentsBySchema = new Map<string, DocumentAssetTypeDef>();

  const registerAssetType = (def: AssetTypeDef): void => {
    if (def.kind !== "assetType") {
      throw new SchemaDefinitionError("registerAssetType: not an asset type definition.");
    }
    if (assetTypes.has(def.name)) {
      throw new SchemaDefinitionError(`registerAssetType: "${def.name}" is already registered.`);
    }
    if (def.storage === "document") {
      if (documentsBySchema.has(def.schema)) {
        throw new SchemaDefinitionError(`registerAssetType: schema "${def.schema}" already has a type.`);
      }
      documentsBySchema.set(def.schema, def);
    }
    assetTypes.set(def.name, def);
  };
  for (const def of BUILT_IN_ASSET_TYPES) registerAssetType(def);

  return {
    registerComponent(def) {
      if (def.kind !== "component") {
        throw new SchemaDefinitionError("registerComponent: not a component definition.");
      }
      if (byName.has(def.name)) {
        throw new SchemaDefinitionError(`registerComponent: "${def.name}" is already registered.`);
      }
      byName.set(def.name, def);
    },
    getComponent(name) {
      return byName.get(name);
    },
    components() {
      return [...byName.values()];
    },
    registerAssetType,
    getAssetType(name) {
      return assetTypes.get(name);
    },
    assetTypes() {
      return [...assetTypes.values()];
    },
    binaryTypesForFile(fileName) {
      return [...assetTypes.values()].filter(
        (def): def is BinaryAssetTypeDef => def.storage === "binary" && claimsFile(def, fileName),
      );
    },
    documentTypeForSchema(schema) {
      return typeof schema === "string" ? documentsBySchema.get(schema) : undefined;
    },
  };
}

/** The definition a stored component's `type` tag names, if it is registered. */
export function componentDefOf(registry: SchemaRegistry, stored: unknown): ComponentDef | undefined {
  if (!isJsonObject(stored)) return undefined;
  const tag = parseComponentTypeTag(stored.type);
  return tag ? registry.getComponent(tag.name) : undefined;
}

/**
 * Normalises a stored component of whatever registered type its `type` tag
 * names. Returns null when it cannot be kept; an unregistered type is a loss
 * like an unknown field.
 */
export function normalizeRegisteredComponentInto(
  registry: SchemaRegistry,
  raw: unknown,
  path: string,
  ctx: NormalizeContext,
): JsonObject | null {
  if (!isJsonObject(raw)) {
    reportLoss(ctx, "invalid-value", path, "A component must be an object; dropped.");
    return null;
  }
  const tag = parseComponentTypeTag(raw.type);
  if (!tag) {
    reportLoss(
      ctx,
      "invalid-value",
      childPath(path, "type"),
      'Expected a "<name>@<version>" type tag; component dropped.',
    );
    return null;
  }
  const def = registry.getComponent(tag.name);
  if (!def) {
    reportLoss(
      ctx,
      "unknown-component-type",
      childPath(path, "type"),
      `No component type "${tag.name}" is registered; component dropped.`,
    );
    return null;
  }
  return normalizeComponentInto(def, raw, path, ctx);
}
