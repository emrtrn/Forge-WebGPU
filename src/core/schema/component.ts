// Component definitions (architecture §4.4, §4.5).
//
// `defineComponent(name, version, fields)` is the single source for a
// component type. The definition is frozen data; its TypeScript type is
// `ComponentData<typeof Def>`.

import {
  checkFieldMap,
  deepFreeze,
  SchemaDefinitionError,
  type FieldMap,
  type FieldValues,
  type Transform,
} from "./fields.ts";
import { labelFromComponentName } from "./label.ts";
import { assertDefaultsAreNormal } from "./normalize.ts";

/** Namespaced, e.g. `forge.heightFog`; a game uses its own namespace. */
export const COMPONENT_NAME_PATTERN = /^[a-z][A-Za-z0-9]*(\.[a-z][A-Za-z0-9]*)+$/;

/**
 * Keys of the stored component envelope. `type` is on every component;
 * `parent` and `local` on spatial ones (A1). Fields cannot use these names.
 */
export const RESERVED_COMPONENT_KEYS = ["type", "parent", "local"] as const;

export interface ComponentOptions {
  /** English display name. Derived from the component name when absent. */
  readonly label?: string;
  /** Turkish description shown in the editor. */
  readonly hint?: string;
  /** Has a place in the actor: carries `parent` and `local` (A1). */
  readonly spatial?: boolean;
  /** At most one component of this type per level (architecture §4.4). */
  readonly singleton?: boolean;
}

export interface ComponentDef<M extends FieldMap = FieldMap> {
  readonly kind: "component";
  readonly name: string;
  readonly version: number;
  readonly label: string;
  readonly hint: string | null;
  readonly spatial: boolean;
  readonly singleton: boolean;
  readonly fields: M;
}

/** `forge.heightFog@1`: the `type` tag a stored component carries. */
export type ComponentTypeTag = `${string}@${number}`;

/** The field values of a component, without its stored envelope. */
export type ComponentData<C extends ComponentDef> = C extends ComponentDef<infer M>
  ? FieldValues<M>
  : never;

/** A component as it is stored in an actor: envelope + field values. */
export type StoredComponent<C extends ComponentDef = ComponentDef> = {
  type: ComponentTypeTag;
  parent?: string | null;
  local?: Transform;
} & ComponentData<C>;

export function defineComponent<M extends FieldMap>(
  name: string,
  version: number,
  fields: M,
  options: ComponentOptions = {},
): ComponentDef<M> {
  if (!COMPONENT_NAME_PATTERN.test(name)) {
    throw new SchemaDefinitionError(
      `defineComponent: "${name}" must be a namespaced name such as "forge.heightFog".`,
    );
  }
  if (!Number.isInteger(version) || version < 1) {
    throw new SchemaDefinitionError(`defineComponent ${name}: version must be an integer >= 1.`);
  }
  checkFieldMap(`defineComponent ${name}`, fields);
  for (const reserved of RESERVED_COMPONENT_KEYS) {
    if (Object.hasOwn(fields, reserved)) {
      throw new SchemaDefinitionError(
        `defineComponent ${name}: "${reserved}" is part of the stored envelope and cannot be a field.`,
      );
    }
  }
  assertDefaultsAreNormal(`defineComponent ${name}`, fields);

  return deepFreeze({
    kind: "component",
    name,
    version,
    label: options.label ?? labelFromComponentName(name),
    hint: options.hint ?? null,
    spatial: options.spatial ?? false,
    singleton: options.singleton ?? false,
    fields: { ...fields },
  }) as ComponentDef<M>;
}

export function componentTypeTag(def: ComponentDef): ComponentTypeTag {
  return `${def.name}@${def.version}`;
}

/** Splits `forge.heightFog@1`. Returns null when the tag is malformed. */
export function parseComponentTypeTag(tag: unknown): { name: string; version: number } | null {
  if (typeof tag !== "string") return null;
  const at = tag.lastIndexOf("@");
  if (at <= 0) return null;
  const name = tag.slice(0, at);
  const versionText = tag.slice(at + 1);
  if (!COMPONENT_NAME_PATTERN.test(name) || !/^[1-9][0-9]*$/.test(versionText)) return null;
  return { name, version: Number(versionText) };
}
