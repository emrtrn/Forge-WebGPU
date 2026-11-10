// Details form definition (architecture §4.5; plan "İskeletin kabul testi").
//
// `formOf(component)` turns a component definition (and `formFields` any
// field map, e.g. an asset meta file's) into a DOM-free list of
// form fields: key, kind, range, default, English label, Turkish hint. The
// editor UI kit (phase 4) renders this list; nothing here knows about the DOM.
//
// The editor parameter rules that are data live here, so every generated form
// follows them without a per-panel decision:
// - A bounded number is a slider plus a number box (`control: "slider"`); the
//   range is part of the field so the form can show it under the name.
// - The limits are the schema's limits. Input outside them is clamped by
//   normalisation (`clamped` issue), never rejected.
// - `label` is English (parameter names always are); `hint` is the Turkish
//   tooltip.
// Layout (30 / 70 row split, fixed number box width) belongs to the UI kit.

import type { ComponentDef } from "./component.ts";
import type { FieldDef, FieldMap, Transform, VectorSize } from "./fields.ts";
import { labelFromKey } from "./label.ts";
import { defaultValue } from "./normalize.ts";

/** Hard limits; null where a side is open. */
export interface FormRange {
  readonly min: number | null;
  readonly max: number | null;
}

interface FormFieldBase {
  /** Field key in the stored component. */
  readonly key: string;
  /** Path from the component root, e.g. `wheel.radius` or `waypoints[]`. */
  readonly path: string;
  /** English display name. */
  readonly label: string;
  /** Turkish tooltip, or null when the schema gives none. */
  readonly hint: string | null;
}

export interface NumberFormField extends FormFieldBase {
  readonly kind: "number";
  /** `slider`: slider + number box. `number`: number box only. */
  readonly control: "slider" | "number";
  readonly default: number;
  readonly range: FormRange;
  /** Slider travel; null when there is no slider. */
  readonly slider: { readonly min: number; readonly max: number } | null;
  readonly step: number | null;
}

export interface BoolFormField extends FormFieldBase {
  readonly kind: "bool";
  readonly default: boolean;
}

export interface EnumFormField extends FormFieldBase {
  readonly kind: "enum";
  readonly default: string;
  readonly options: readonly { readonly value: string; readonly label: string }[];
}

export interface ColorFormField extends FormFieldBase {
  readonly kind: "color";
  readonly default: string;
}

export interface TextFormField extends FormFieldBase {
  readonly kind: "text";
  readonly default: string;
  readonly required: boolean;
  /** RegExp source a non-empty value must match; null for any text. */
  readonly pattern: string | null;
  readonly multiline: boolean;
}

export interface VectorFormField extends FormFieldBase {
  readonly kind: "vector";
  readonly size: VectorSize;
  readonly default: readonly number[];
  readonly range: FormRange;
  readonly step: number | null;
}

export interface TransformFormField extends FormFieldBase {
  readonly kind: "transform";
  readonly default: Transform;
}

export interface AssetRefFormField extends FormFieldBase {
  readonly kind: "assetRef";
  readonly default: null;
  /** Asset type the picker offers; null for any. */
  readonly assetType: string | null;
}

export interface ActorRefFormField extends FormFieldBase {
  readonly kind: "actorRef";
  readonly default: null;
}

export interface ArrayFormField extends FormFieldBase {
  readonly kind: "array";
  readonly default: readonly unknown[];
  /** The form of one element. */
  readonly item: FormField;
}

export interface ObjectFormField extends FormFieldBase {
  readonly kind: "object";
  readonly default: Record<string, unknown>;
  readonly fields: readonly FormField[];
}

export type FormField =
  | NumberFormField
  | BoolFormField
  | EnumFormField
  | ColorFormField
  | TextFormField
  | VectorFormField
  | TransformFormField
  | AssetRefFormField
  | ActorRefFormField
  | ArrayFormField
  | ObjectFormField;

export interface FormDef {
  /** Component name, e.g. `forge.heightFog`. */
  readonly component: string;
  readonly version: number;
  readonly label: string;
  readonly hint: string | null;
  /** The component also has `parent` and `local`; the editor shows them itself. */
  readonly spatial: boolean;
  readonly fields: readonly FormField[];
}

export function formOf(def: ComponentDef): FormDef {
  return {
    component: def.name,
    version: def.version,
    label: def.label,
    hint: def.hint,
    spatial: def.spatial,
    fields: formFields(def.fields, ""),
  };
}

export function formFields(fields: FieldMap, parentPath = ""): FormField[] {
  return Object.entries(fields).map(([key, field]) =>
    formField(key, field, parentPath === "" ? key : `${parentPath}.${key}`, labelFromKey(key)),
  );
}

function rangeOf(field: { readonly min?: number; readonly max?: number }): FormRange {
  return { min: field.min ?? null, max: field.max ?? null };
}

function formField(key: string, field: FieldDef, path: string, derivedLabel: string): FormField {
  const base: FormFieldBase = {
    key,
    path,
    label: field.label ?? derivedLabel,
    hint: field.hint ?? null,
  };

  switch (field.kind) {
    case "number": {
      const bounded = field.min !== undefined && field.max !== undefined;
      let slider: NumberFormField["slider"] = null;
      if (field.slider) {
        slider = { min: field.slider[0], max: field.slider[1] };
      } else if (field.min !== undefined && field.max !== undefined) {
        slider = { min: field.min, max: field.max };
      }
      return {
        ...base,
        kind: "number",
        control: bounded || slider ? "slider" : "number",
        default: field.default,
        range: rangeOf(field),
        slider,
        step: field.step ?? null,
      };
    }
    case "bool":
      return { ...base, kind: "bool", default: field.default };
    case "enum":
      return {
        ...base,
        kind: "enum",
        default: field.default,
        options: field.values.map((value) => ({
          value,
          label: field.labels?.[value] ?? labelFromKey(value),
        })),
      };
    case "color":
      return { ...base, kind: "color", default: field.default };
    case "text":
      return {
        ...base,
        kind: "text",
        default: field.default,
        required: field.required ?? false,
        pattern: field.pattern ?? null,
        multiline: field.multiline ?? false,
      };
    case "vector":
      return {
        ...base,
        kind: "vector",
        size: field.size,
        default: [...field.default],
        range: rangeOf(field),
        step: field.step ?? null,
      };
    case "transform":
      return { ...base, kind: "transform", default: defaultValue(field) as Transform };
    case "assetRef":
      return { ...base, kind: "assetRef", default: null, assetType: field.assetType ?? null };
    case "actorRef":
      return { ...base, kind: "actorRef", default: null };
    case "array":
      return {
        ...base,
        kind: "array",
        default: defaultValue(field) as unknown[],
        item: formField(key, field.item, `${path}[]`, "Item"),
      };
    case "object":
      return {
        ...base,
        kind: "object",
        default: defaultValue(field) as Record<string, unknown>,
        fields: formFields(field.fields, path),
      };
  }
}
