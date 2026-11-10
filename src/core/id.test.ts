import { describe, expect, test } from "vitest";
import { createId, isId } from "./id.ts";

describe("createId", () => {
  test("produces a prefixed 128-bit hex id per kind", () => {
    expect(createId("actor")).toMatch(/^act_[0-9a-f]{32}$/);
    expect(createId("asset")).toMatch(/^ast_[0-9a-f]{32}$/);
    expect(createId("level")).toMatch(/^lvl_[0-9a-f]{32}$/);
  });

  test("does not repeat", () => {
    const ids = new Set(Array.from({ length: 1000 }, () => createId("actor")));
    expect(ids.size).toBe(1000);
  });
});

describe("isId", () => {
  test("accepts ids of the requested kind only", () => {
    const actor = createId("actor");
    expect(isId(actor, "actor")).toBe(true);
    expect(isId(actor, "asset")).toBe(false);
  });

  test("rejects malformed values", () => {
    expect(isId("act_123", "actor")).toBe(false);
    expect(isId(`act_${"G".repeat(32)}`, "actor")).toBe(false);
    expect(isId("actor:3", "actor")).toBe(false);
    expect(isId(42, "actor")).toBe(false);
    expect(isId(undefined, "actor")).toBe(false);
  });
});
