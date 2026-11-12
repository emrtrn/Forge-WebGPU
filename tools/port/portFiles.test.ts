import { describe, expect, test } from "vitest";
import { portNote, referencedNames, rewriteImports, spellOutParameterProperties, subsetDeclarations } from "./portFiles.ts";
import ts from "typescript";

describe("rewriteImports", () => {
  test("a mapped specifier wins; other relative ones gain .ts; packages stay", () => {
    const out = rewriteImports(
      [
        'import { a } from "../scene/layout";',
        'import type { B } from "./b";',
        'export { c } from "./c";',
        'import { d } from "three";',
        'import { e } from "./e.ts";',
      ].join("\n"),
      { "../scene/layout": "../legacy/layout.ts" },
      "x.ts",
    );
    expect(out).toBe(
      [
        'import { a } from "../legacy/layout.ts";',
        'import type { B } from "./b.ts";',
        'export { c } from "./c.ts";',
        'import { d } from "three";',
        'import { e } from "./e.ts";',
      ].join("\n"),
    );
  });
});

describe("spellOutParameterProperties", () => {
  test("fields go above the doc comment and are assigned first, after super()", () => {
    const out = spellOutParameterProperties(
      [
        "class A extends B {",
        "  /** Builds an A. */",
        "  constructor(private readonly size: number, public name?: string, plain = 1) {",
        "    super();",
        "    void plain;",
        "  }",
        "}",
      ].join("\n"),
      "a.ts",
    );
    expect(out).toBe(
      [
        "class A extends B {",
        "  // Constructor parameter properties in Forge, spelled out here (this repo",
        "  // allows only erasable TypeScript syntax: Node type stripping).",
        "  private readonly size: number;",
        "  public name?: string | undefined;",
        "  /** Builds an A. */",
        "  constructor(size: number, name?: string, plain = 1) {",
        "    super();",
        "    this.size = size;",
        "    this.name = name;",
        "    void plain;",
        "  }",
        "}",
      ].join("\n"),
    );
  });

  test("a property with only a default stays unannotated and keeps its default", () => {
    const out = spellOutParameterProperties(
      ["class A {", "  constructor(readonly capacity = 80) {", "    void capacity;", "  }", "}"].join("\n"),
      "a.ts",
    );
    expect(out).toBe(
      [
        "class A {",
        "  // Constructor parameter properties in Forge, spelled out here (this repo",
        "  // allows only erasable TypeScript syntax: Node type stripping).",
        "  readonly capacity;",
        "  constructor(capacity = 80) {",
        "    this.capacity = capacity;",
        "    void capacity;",
        "  }",
        "}",
      ].join("\n"),
    );
  });

  test("leaves a file without parameter properties alone", () => {
    const text = "class A {\n  constructor(size: number) {}\n}\n";
    expect(spellOutParameterProperties(text, "a.ts")).toBe(text);
  });
});

describe("subsetDeclarations", () => {
  test("keeps what the names need, in source order, with narrowed imports", () => {
    const source = [
      'import { pick, unused } from "./lib";',
      'import type { T } from "./types";',
      "const HELPER = 2;",
      "export function wanted(x: T): number { return pick(x) * HELPER; }",
      "export function other(): number { return unused(); }",
    ].join("\n");
    const result = subsetDeclarations(source, "s.ts", ["wanted"]);
    expect(result.declarations).toBe(2);
    expect(result.total).toBe(3);
    expect(result.text).toContain('import { pick } from "./lib";');
    expect(result.text).toContain('import type { T } from "./types";');
    expect(result.text).toContain("const HELPER = 2;");
    expect(result.text).not.toContain("other");
    expect(result.text.indexOf("HELPER = 2")).toBeLessThan(result.text.indexOf("function wanted"));
  });

  test("an unknown name is an error", () => {
    expect(() => subsetDeclarations("const a = 1;", "s.ts", ["b"])).toThrow(/no top-level declaration b/);
  });
});

test("referencedNames skips property names but keeps references", () => {
  const source = ts.createSourceFile("r.ts", "record.tractionSlip = tractionSlip(a); const o = { b: c };", ts.ScriptTarget.Latest, true);
  const names = referencedNames(source);
  expect([...names].sort()).toEqual(["a", "c", "o", "record", "tractionSlip"]);
});

test("portNote names the source and the cut-over tag", () => {
  expect(portNote("engine/x.ts")).toBe("// Ported from Forge WebGL engine/x.ts @ forge-webgl-final (04b5fb23); docs/PORT_LOG.md §2.\n");
});
