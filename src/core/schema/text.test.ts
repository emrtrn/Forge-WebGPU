import { describe, expect, test } from "vitest";
import { defineComponent } from "./component.ts";
import { object, SchemaDefinitionError, text } from "./fields.ts";
import { formFields } from "./form.ts";
import { fieldJsonSchema, fieldMapJsonSchema } from "./jsonSchema.ts";
import { validateJsonSchema } from "./jsonSchemaTestValidator.ts";
import { normalizeFields } from "./normalize.ts";

const LICENSE = "^[A-Za-z0-9.+-]+$";

const Fields = {
  name: text({ default: "Untitled" }),
  license: text({ required: true, pattern: LICENSE }),
  url: text({ pattern: "^https?://" }),
  notes: text({ multiline: true }),
  source: object({ origin: text({ required: true }) }),
};

function codes(raw: unknown, strict = true): string[] {
  const result = normalizeFields(Fields, raw, { strict });
  return result.issues.map((issue) => `${issue.severity} ${issue.code} ${issue.path}`);
}

describe("text field: definition", () => {
  test("defaults to an empty string and is frozen data", () => {
    const field = text();
    expect(field).toEqual({ kind: "text", default: "" });
    expect(Object.isFrozen(field)).toBe(true);
  });

  test("rejects a pattern that does not compile and a default that does not match", () => {
    expect(() => text({ pattern: "(" })).toThrow(SchemaDefinitionError);
    expect(() => text({ pattern: "^a", default: "b" })).toThrow(/does not match/);
    expect(text({ pattern: "^a", default: "" }).default).toBe("");
  });

  test("a component cannot have a required text: its defaults would not save", () => {
    expect(() => defineComponent("test.named", 1, { label: text({ required: true }) })).toThrow(
      /default of "label" is not valid/,
    );
    expect(defineComponent("test.named", 1, { label: text({ default: "x" }) }).fields.label.kind).toBe("text");
  });
});

describe("text field: normalisation", () => {
  test("keeps valid text as is", () => {
    const raw = {
      name: "Car",
      license: "CC0-1.0",
      url: "https://kenney.nl",
      notes: "two\nlines",
      source: { origin: "Kenney" },
    };
    const result = normalizeFields(Fields, raw, { strict: true });
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.value).toEqual(raw);
  });

  test("a missing required text is a loss, also inside a missing group", () => {
    expect(codes({})).toEqual([
      "error missing-required license",
      "error missing-required source.origin",
    ]);
    expect(codes({}, false)).toEqual([
      "warning missing-required license",
      "warning missing-required source.origin",
    ]);
  });

  test("a blank required text is a loss and is kept as written", () => {
    const result = normalizeFields(Fields, { license: "  ", source: { origin: "" } }, { strict: true });
    expect(result.ok).toBe(false);
    expect(result.value.license).toBe("  ");
    expect(result.issues.map((issue) => issue.code)).toEqual(["missing-required", "missing-required"]);
  });

  test("wrong type and pattern mismatch fall back to the default", () => {
    const result = normalizeFields(
      Fields,
      { name: 3, license: "Not a token", url: "ftp://x", source: { origin: "x" } },
      { strict: true },
    );
    expect(result.value.name).toBe("Untitled");
    expect(result.value.license).toBe("");
    expect(result.value.url).toBe("");
    expect(result.issues.map((issue) => `${issue.code} ${issue.path}`)).toEqual([
      "invalid-value name",
      "invalid-value license",
      "invalid-value url",
    ]);
  });

  test("an empty optional text skips the pattern", () => {
    expect(codes({ url: "", license: "MIT", source: { origin: "x" } })).toEqual([]);
  });
});

describe("text field: form and JSON Schema", () => {
  test("form carries required, pattern and multiline", () => {
    const [name, license, , notes] = formFields(Fields);
    expect(name).toMatchObject({ kind: "text", default: "Untitled", required: false, pattern: null });
    expect(license).toMatchObject({ kind: "text", required: true, pattern: LICENSE, multiline: false });
    expect(notes).toMatchObject({ kind: "text", multiline: true });
  });

  test("field schemas", () => {
    expect(fieldJsonSchema(text())).toEqual({ type: "string", default: "" });
    expect(fieldJsonSchema(text({ pattern: "^a" }))).toEqual({ type: "string", pattern: "^$|^a", default: "" });
    expect(fieldJsonSchema(text({ required: true, pattern: "^a" }))).toEqual({
      type: "string",
      allOf: [{ pattern: "\\S" }, { pattern: "^a" }],
      default: "",
    });
  });

  test("the schema accepts what normalisation accepts and lists required keys", () => {
    const schema = fieldMapJsonSchema(Fields);
    expect(schema.required).toEqual(["license", "source"]);
    const good = { license: "CC-BY-4.0", url: "", source: { origin: "Kenney" } };
    expect(validateJsonSchema(schema, good)).toEqual([]);
    expect(codes(good)).toEqual([]);
    for (const bad of [
      {},
      { license: "", source: { origin: "x" } },
      { license: "two words", source: { origin: "x" } },
      { license: "MIT", source: { origin: " " } },
      { license: "MIT", source: { origin: "x" }, url: "nope" },
    ]) {
      expect(validateJsonSchema(schema, bad)).not.toEqual([]);
      expect(codes(bad)).not.toEqual([]);
    }
  });
});
