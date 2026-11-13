import { describe, expect, test } from "vitest";
import { defineFeature } from "../feature.ts";
import { SchemaDefinitionError } from "../schema/fields.ts";
import { createServiceKey, createServices, ServiceError } from "./services.ts";
import { defineSubsystem, TICK_GROUPS } from "./subsystem.ts";

describe("defineSubsystem", () => {
  test("a frozen definition with its tick groups", () => {
    const create = () => ({});
    const def = defineSubsystem({ id: "test.wind", tickGroups: ["physics", "renderSync"], create });
    expect(def).toEqual({ kind: "subsystem", id: "test.wind", tickGroups: ["physics", "renderSync"], inEditor: false, create });
    expect(defineSubsystem({ id: "test.look", inEditor: true, create }).inEditor).toBe(true);
    expect(Object.isFrozen(def)).toBe(true);
    expect(defineSubsystem({ id: "test.idle", create }).tickGroups).toEqual([]);
    expect(TICK_GROUPS).toEqual(["prePhysics", "physics", "postPhysics", "renderSync"]);
  });

  test("refuses a bad id, an unknown group, a group twice", () => {
    const create = () => ({});
    expect(() => defineSubsystem({ id: "wind", create })).toThrow(SchemaDefinitionError);
    expect(() => defineSubsystem({ id: "test.wind", tickGroups: ["late" as "physics"], create })).toThrow(/unknown tick group/);
    expect(() => defineSubsystem({ id: "test.wind", tickGroups: ["physics", "physics"], create })).toThrow(/twice/);
  });

  test("a feature lists its subsystems once each", () => {
    const wind = defineSubsystem({ id: "test.wind", create: () => ({}) });
    expect(defineFeature({ id: "test.weather", subsystems: [wind] }).subsystems).toEqual([wind]);
    expect(() => defineFeature({ id: "test.weather", subsystems: [wind, wind] })).toThrow(/subsystem is listed twice/);
  });
});

describe("services", () => {
  test("typed keys, compared by identity", () => {
    const services = createServices();
    const speed = createServiceKey<number>("test.speed");
    const sameName = createServiceKey<string>("test.speed");
    services.provide(speed, 3);
    expect(services.get(speed)).toBe(3);
    expect(services.get(sameName)).toBeUndefined();
    expect(services.require(speed)).toBe(3);
    expect(() => services.require(sameName)).toThrow(ServiceError);
    expect(() => services.provide(speed, 4)).toThrow(/already provided/);
  });

  test("each table is its own", () => {
    const key = createServiceKey<number>("test.n");
    const a = createServices();
    const b = createServices();
    a.provide(key, 1);
    expect(b.get(key)).toBeUndefined();
  });
});
