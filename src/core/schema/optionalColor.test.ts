import { describe, expect, test } from "vitest";
import { defineComponent, type ComponentData } from "./component.ts";
import { color, SchemaDefinitionError } from "./fields.ts";
import { formOf } from "./form.ts";
import { fieldJsonSchema } from "./jsonSchema.ts";
import { normalizeComponent } from "./normalizeComponent.ts";

// An optional colour (`color({ default: null })`, phase 3 step 4): null is a
// value of its own ("none"), first used by a static mesh's tint.
const Tinted = defineComponent("test.tinted", 1, {
  tint: color({ default: null, hint: "Boş: materyalin rengi." }),
  base: color({ default: "#808080" }),
});

const STRICT = { strict: true } as const;

describe("optional colour", () => {
  test("null is kept, a colour is lower-cased, anything else falls back to null", () => {
    expect(normalizeComponent(Tinted, { type: "test.tinted@1" }, STRICT).value?.tint).toBeNull();
    expect(normalizeComponent(Tinted, { type: "test.tinted@1", tint: null }, STRICT).value?.tint).toBeNull();
    expect(normalizeComponent(Tinted, { type: "test.tinted@1", tint: "#A0B0C0" }, STRICT).value?.tint).toBe("#a0b0c0");
    const wrong = normalizeComponent(Tinted, { type: "test.tinted@1", tint: "red" }, STRICT);
    expect(wrong.value?.tint).toBeNull();
    expect(wrong.ok).toBe(false);
    expect(wrong.issues[0]?.message).toContain("or null");
  });

  test("a required colour still refuses null", () => {
    const result = normalizeComponent(Tinted, { type: "test.tinted@1", base: null }, STRICT);
    expect(result.value?.base).toBe("#808080");
    expect(result.ok).toBe(false);
  });

  test("the form marks it optional and the JSON Schema takes null", () => {
    const fields = formOf(Tinted).fields;
    expect(fields[0]).toMatchObject({ kind: "color", default: null, optional: true });
    expect(fields[1]).toMatchObject({ kind: "color", default: "#808080", optional: false });
    expect(fieldJsonSchema(Tinted.fields.tint)).toMatchObject({ type: ["string", "null"] });
  });

  test("its value type is string | null", () => {
    const data: ComponentData<typeof Tinted> = { tint: null, base: "#000000" };
    const base: string = data.base;
    expect(base).toBe("#000000");
  });

  test("a malformed default is refused at definition time", () => {
    expect(() => color({ default: "#FFF" })).toThrow(SchemaDefinitionError);
  });
});
