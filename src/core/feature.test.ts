import { describe, expect, test } from "vitest";
import { defineFeature, installFeatures } from "./feature.ts";
import { defineComponent } from "./schema/component.ts";
import { bool, num, SchemaDefinitionError } from "./schema/fields.ts";
import { createContext } from "./schema/issues.ts";
import {
  componentDefOf,
  createSchemaRegistry,
  normalizeRegisteredComponentInto,
} from "./schema/registry.ts";

const Fog = defineComponent("test.fog", 1, { density: num({ min: 0, max: 1, default: 0.02 }) });
const Wind = defineComponent("test.wind", 1, { gusty: bool({ default: false }) });
const Rain = defineComponent("game.rain", 1, { heavy: bool({ default: false }) });

describe("schema registry", () => {
  test("registerComponent makes a definition findable by name", () => {
    const registry = createSchemaRegistry();
    registry.registerComponent(Fog);
    registry.registerComponent(Wind);
    expect(registry.getComponent("test.fog")).toBe(Fog);
    expect(registry.getComponent("test.none")).toBeUndefined();
    expect(registry.components()).toEqual([Fog, Wind]);
  });

  test("a name registers once", () => {
    const registry = createSchemaRegistry();
    registry.registerComponent(Fog);
    expect(() => registry.registerComponent(Fog)).toThrow(SchemaDefinitionError);
    const impostor = defineComponent("test.fog", 1, { other: bool({ default: true }) });
    expect(() => registry.registerComponent(impostor)).toThrow(/already registered/);
  });

  test("rejects something that is not a component definition", () => {
    const registry = createSchemaRegistry();
    expect(() => registry.registerComponent({ name: "test.fake" } as never)).toThrow(SchemaDefinitionError);
  });

  test("two registries share nothing", () => {
    const first = createSchemaRegistry();
    const second = createSchemaRegistry();
    first.registerComponent(Fog);
    expect(second.getComponent("test.fog")).toBeUndefined();
    expect(() => second.registerComponent(Fog)).not.toThrow();
  });

  test("the list it returns is a copy", () => {
    const registry = createSchemaRegistry();
    registry.registerComponent(Fog);
    (registry.components() as unknown[]).length = 0;
    expect(registry.components()).toEqual([Fog]);
  });
});

describe("normalising by type tag", () => {
  const registry = createSchemaRegistry();
  registry.registerComponent(Fog);

  test("finds the definition from the stored type tag", () => {
    expect(componentDefOf(registry, { type: "test.fog@1" })).toBe(Fog);
    expect(componentDefOf(registry, { type: "test.wind@1" })).toBeUndefined();
    expect(componentDefOf(registry, "test.fog@1")).toBeUndefined();
  });

  test("a registered type is normalised with its definition", () => {
    const ctx = createContext({ strict: true });
    const value = normalizeRegisteredComponentInto(registry, { type: "test.fog@1", density: 3 }, "c.fog", ctx);
    expect(value).toEqual({ type: "test.fog@1", density: 1 });
    expect(ctx.issues.map((issue) => `${issue.code} ${issue.path}`)).toEqual(["clamped c.fog.density"]);
  });

  test.each([
    ["an unregistered type", { type: "test.wind@1" }, "unknown-component-type c.x.type"],
    ["a malformed tag", { type: "wind" }, "invalid-value c.x.type"],
    ["no tag", {}, "invalid-value c.x.type"],
    ["a non-object", "fog", "invalid-value c.x"],
  ])("%s is dropped: error when strict, warning otherwise", (_name, raw, issue) => {
    const strict = createContext({ strict: true });
    expect(normalizeRegisteredComponentInto(registry, raw, "c.x", strict)).toBeNull();
    expect(strict.issues.map((entry) => `${entry.severity} ${entry.code} ${entry.path}`)).toEqual([
      `error ${issue}`,
    ]);
    const lenient = createContext({ strict: false });
    expect(normalizeRegisteredComponentInto(registry, raw, "c.x", lenient)).toBeNull();
    expect(lenient.issues[0]?.severity).toBe("warning");
  });
});

describe("defineFeature", () => {
  test("returns a frozen definition", () => {
    const feature = defineFeature({ id: "test.weather", components: [Fog, Wind] });
    expect(feature).toEqual({ kind: "feature", id: "test.weather", components: [Fog, Wind], assetTypes: [], subsystems: [] });
    expect(Object.isFrozen(feature)).toBe(true);
    expect(Object.isFrozen(feature.components)).toBe(true);
  });

  test("a feature may have no components", () => {
    expect(defineFeature({ id: "test.empty" }).components).toEqual([]);
  });

  test("rejects a bad id and a component listed twice", () => {
    expect(() => defineFeature({ id: "weather" })).toThrow(SchemaDefinitionError);
    expect(() => defineFeature({ id: "test.weather", components: [Fog, Fog] })).toThrow(SchemaDefinitionError);
  });
});

describe("installFeatures", () => {
  const weather = defineFeature({ id: "test.weather", components: [Fog, Wind] });
  const game = defineFeature({ id: "game.rain", components: [Rain] });

  test("registers the components of engine and game features into one registry", () => {
    const registry = createSchemaRegistry();
    installFeatures([weather, game], registry);
    expect(registry.components().map((component) => component.name)).toEqual([
      "test.fog",
      "test.wind",
      "game.rain",
    ]);
  });

  test("a feature listed twice is rejected", () => {
    expect(() => installFeatures([weather, weather], createSchemaRegistry())).toThrow(/listed twice/);
  });

  test("two features cannot own the same component", () => {
    const clash = defineFeature({ id: "test.clash", components: [Fog] });
    expect(() => installFeatures([weather, clash], createSchemaRegistry())).toThrow(/already registered/);
  });
});
