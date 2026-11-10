// Schema DSL: field definitions (architecture §4.5, decision A2).
//
// A field definition is plain, frozen, JSON-serialisable data. Nothing here is
// a closure: the editor, the Node dev server, tools and game projects walk the
// same objects. Everything else (TypeScript type, normalisation, Details form,
// JSON Schema) is derived from these definitions.
//
// UI metadata follows the editor parameter rules: `label` is the English
// display name, `hint` the Turkish tooltip, and a number's `min` / `max` are
// both the clamp range and the range the form shows.

import type { ActorId, AssetId } from "../id.ts";

export type Vec2 = [number, number];
export type Vec3 = [number, number, number];
export type Vec4 = [number, number, number, number];

/** Position, rotation (quaternion x, y, z, w) and scale. */
export interface Transform {
  p: Vec3;
  r: Vec4;
  s: Vec3;
}

export type VectorSize = 2 | 3 | 4;
export type VectorOf<N extends VectorSize> = N extends 2 ? Vec2 : N extends 3 ? Vec3 : Vec4;

export interface FieldUi {
  /** English display name. Derived from the field key when absent. */
  readonly label?: string;
  /** Turkish tooltip. */
  readonly hint?: string;
}

export interface NumberField extends FieldUi {
  readonly kind: "number";
  readonly default: number;
  /** Hard limits: a value outside is clamped to the limit. */
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  /** Slider travel when it should be narrower than `min`..`max`, or when a limit is open. */
  readonly slider?: readonly [number, number];
}

export interface BoolField extends FieldUi {
  readonly kind: "bool";
  readonly default: boolean;
}

export interface EnumField<V extends string = string> extends FieldUi {
  readonly kind: "enum";
  readonly values: readonly V[];
  readonly default: V;
  /** English display name per value. */
  readonly labels?: { readonly [K in V]?: string };
}

export interface ColorField extends FieldUi {
  readonly kind: "color";
  /** `#rrggbb`, lower case. */
  readonly default: string;
}

export interface VectorField<N extends VectorSize = VectorSize> extends FieldUi {
  readonly kind: "vector";
  readonly size: N;
  readonly default: Readonly<VectorOf<N>>;
  /** Hard limits applied to every element. */
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
}

export interface TransformField extends FieldUi {
  readonly kind: "transform";
  readonly default: Readonly<Transform>;
}

export interface AssetRefField extends FieldUi {
  readonly kind: "assetRef";
  /** Asset type the reference accepts. Checked by the asset index (A10), not here. */
  readonly assetType?: string;
  readonly default: null;
}

export interface ActorRefField extends FieldUi {
  readonly kind: "actorRef";
  readonly default: null;
}

export interface ArrayField<I extends FieldDef = FieldDef> extends FieldUi {
  readonly kind: "array";
  readonly item: I;
  readonly default: readonly unknown[];
}

export interface ObjectField<M extends FieldMap = FieldMap> extends FieldUi {
  readonly kind: "object";
  readonly fields: M;
}

export type FieldDef =
  | NumberField
  | BoolField
  | EnumField
  | ColorField
  | VectorField
  | TransformField
  | AssetRefField
  | ActorRefField
  | ArrayField
  | ObjectField;

export type FieldKind = FieldDef["kind"];

export interface FieldMap {
  readonly [key: string]: FieldDef;
}

/** The value type a field definition describes. */
export type FieldValue<F> = F extends NumberField
  ? number
  : F extends BoolField
    ? boolean
    : F extends EnumField<infer V>
      ? V
      : F extends ColorField
        ? string
        : F extends VectorField<infer N>
          ? VectorOf<N>
          : F extends TransformField
            ? Transform
            : F extends AssetRefField
              ? AssetId | null
              : F extends ActorRefField
                ? ActorId | null
                : F extends ArrayField<infer I>
                  ? FieldValue<I>[]
                  : F extends ObjectField<infer M>
                    ? FieldValues<M>
                    : never;

export type FieldValues<M extends FieldMap> = { -readonly [K in keyof M]: FieldValue<M[K]> };

export class SchemaDefinitionError extends Error {
  override name = "SchemaDefinitionError";
}

export const FIELD_KEY_PATTERN = /^[a-z][A-Za-z0-9]*$/;
export const COLOR_PATTERN = /^#[0-9a-f]{6}$/;

export const IDENTITY_TRANSFORM: Readonly<Transform> = deepFreeze({
  p: [0, 0, 0],
  r: [0, 0, 0, 1],
  s: [1, 1, 1],
});

export function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
}

function fail(message: string): never {
  throw new SchemaDefinitionError(message);
}

function checkLimits(what: string, min: number | undefined, max: number | undefined): void {
  if (min !== undefined && !Number.isFinite(min)) fail(`${what}: min must be a finite number.`);
  if (max !== undefined && !Number.isFinite(max)) fail(`${what}: max must be a finite number.`);
  if (min !== undefined && max !== undefined && min > max) {
    fail(`${what}: min ${min} is above max ${max}.`);
  }
}

function checkWithin(what: string, value: number, min: number | undefined, max: number | undefined): void {
  if (!Number.isFinite(value)) fail(`${what} must be a finite number.`);
  if ((min !== undefined && value < min) || (max !== undefined && value > max)) {
    fail(`${what} ${value} is outside ${min ?? "-inf"}..${max ?? "+inf"}.`);
  }
}

function checkStep(what: string, step: number | undefined): void {
  if (step !== undefined && !(Number.isFinite(step) && step > 0)) {
    fail(`${what}: step must be a positive number.`);
  }
}

export function checkFieldMap(what: string, fields: FieldMap): void {
  for (const key of Object.keys(fields)) {
    if (!FIELD_KEY_PATTERN.test(key)) {
      fail(`${what}: field key "${key}" must be camelCase letters and digits.`);
    }
  }
}

export function num(options: Omit<NumberField, "kind">): NumberField {
  const { min, max, slider } = options;
  checkLimits("num", min, max);
  checkWithin("num: default", options.default, min, max);
  checkStep("num", options.step);
  if (slider !== undefined) {
    const [low, high] = slider;
    if (!(Number.isFinite(low) && Number.isFinite(high) && low < high)) {
      fail("num: slider must be [low, high] with low < high.");
    }
    checkWithin("num: slider low", low, min, max);
    checkWithin("num: slider high", high, min, max);
  }
  return deepFreeze({ kind: "number", ...options });
}

export function bool(options: Omit<BoolField, "kind">): BoolField {
  return deepFreeze({ kind: "bool", ...options });
}

export function enumOf<const V extends string>(
  values: readonly V[],
  options: FieldUi & {
    readonly default: NoInfer<V>;
    readonly labels?: { readonly [K in NoInfer<V>]?: string };
  },
): EnumField<V> {
  if (values.length === 0) fail("enumOf: at least one value is required.");
  if (new Set(values).size !== values.length) fail("enumOf: values must be unique.");
  if (!values.includes(options.default)) {
    fail(`enumOf: default "${options.default}" is not one of the values.`);
  }
  for (const key of Object.keys(options.labels ?? {})) {
    if (!(values as readonly string[]).includes(key)) {
      fail(`enumOf: label given for unknown value "${key}".`);
    }
  }
  return deepFreeze({ kind: "enum", values: [...values], ...options });
}

export function color(options: Omit<ColorField, "kind">): ColorField {
  if (!COLOR_PATTERN.test(options.default)) {
    fail(`color: default "${options.default}" must be lower-case #rrggbb.`);
  }
  return deepFreeze({ kind: "color", ...options });
}

type VectorOptions<N extends VectorSize> = Omit<VectorField<N>, "kind" | "size">;

function vector<N extends VectorSize>(size: N, options: VectorOptions<N>): VectorField<N> {
  const what = `vec${size}`;
  const elements: readonly number[] = options.default;
  if (elements.length !== size) fail(`${what}: default must have ${size} elements.`);
  checkLimits(what, options.min, options.max);
  checkStep(what, options.step);
  for (const element of elements) {
    checkWithin(`${what}: default element`, element, options.min, options.max);
  }
  const field: unknown = { kind: "vector", size, ...options, default: [...elements] };
  return deepFreeze(field) as VectorField<N>;
}

export function vec2(options: VectorOptions<2>): VectorField<2> {
  return vector(2, options);
}

export function vec3(options: VectorOptions<3>): VectorField<3> {
  return vector(3, options);
}

export function vec4(options: VectorOptions<4>): VectorField<4> {
  return vector(4, options);
}

export function transform(
  options: FieldUi & { readonly default?: Partial<Readonly<Transform>> } = {},
): TransformField {
  const { default: given, ...ui } = options;
  const value: Transform = {
    p: [...(given?.p ?? IDENTITY_TRANSFORM.p)],
    r: [...(given?.r ?? IDENTITY_TRANSFORM.r)],
    s: [...(given?.s ?? IDENTITY_TRANSFORM.s)],
  };
  const lengths: [keyof Transform, number][] = [["p", 3], ["r", 4], ["s", 3]];
  for (const [part, length] of lengths) {
    const elements: readonly number[] = value[part];
    if (elements.length !== length) fail(`transform: default ${part} must have ${length} elements.`);
    for (const element of elements) {
      checkWithin(`transform: default ${part} element`, element, undefined, undefined);
    }
  }
  return deepFreeze({ kind: "transform", ...ui, default: value });
}

export function assetRef(options: Omit<AssetRefField, "kind" | "default"> = {}): AssetRefField {
  return deepFreeze({ kind: "assetRef", ...options, default: null });
}

export function actorRef(options: Omit<ActorRefField, "kind" | "default"> = {}): ActorRefField {
  return deepFreeze({ kind: "actorRef", ...options, default: null });
}

/**
 * A list of `item` values. `default` is checked against `item` when the field
 * joins a component (`defineComponent`).
 */
export function array<I extends FieldDef>(
  item: I,
  options: FieldUi & { readonly default?: readonly FieldValue<I>[] } = {},
): ArrayField<I> {
  const { default: given, ...ui } = options;
  return deepFreeze({
    kind: "array",
    ...ui,
    item,
    default: structuredClone(given ?? []) as readonly unknown[],
  });
}

/** A nested group of fields. Its default is the defaults of its fields. */
export function object<M extends FieldMap>(fields: M, options: FieldUi = {}): ObjectField<M> {
  checkFieldMap("object", fields);
  return deepFreeze({ kind: "object", ...options, fields: { ...fields } }) as ObjectField<M>;
}
