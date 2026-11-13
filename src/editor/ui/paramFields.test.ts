import { describe, expect, test } from "vitest";
import { getAtPath, pathKey, setAtPath } from "./formPath.ts";
import { clampParam, clampWarning, formatParamLimit, paramRangeText, sliderStep } from "./paramFields.ts";

describe("parameter rules (Forge paramFields, user rules 2026-10-31)", () => {
  test("limits read in the number box's locale, shortest form", () => {
    expect(formatParamLimit(0.05, "en-US")).toBe("0.05");
    expect(formatParamLimit(0.05, "tr-TR")).toBe("0,05");
    expect(formatParamLimit(10000, "en-US")).toBe("10000");
    expect(formatParamLimit(0.1 + 0.2, "en-US")).toBe("0.3");
    expect(paramRangeText({ min: 0, max: 1 }, "en-US")).toBe("0 – 1");
    expect(paramRangeText({ min: 0, max: null }, "en-US")).toBeNull();
  });

  test("out-of-range input is clamped, never rejected", () => {
    expect(clampParam(1.5, { min: 0, max: 1 })).toEqual({ value: 1, clamped: true });
    expect(clampParam(-2, { min: 0, max: null })).toEqual({ value: 0, clamped: true });
    expect(clampParam(0.4, { min: 0, max: 1 })).toEqual({ value: 0.4, clamped: false });
    expect(clampParam(9e9, { min: null, max: null })).toEqual({ value: 9e9, clamped: false });
    expect(clampParam(Number.NaN, { min: 0, max: 1 }).clamped).toBe(false);
  });

  test("the warning names the parameter, the range and the value applied, in Turkish", () => {
    expect(clampWarning("Density", { min: 0, max: 1 }, 1, "en-US")).toBe("Density 0 – 1 aralığında olmalı; 1 uygulandı.");
    expect(clampWarning("Radius", { min: 0.05, max: null }, 0.05, "tr-TR")).toBe("Radius en az 0,05 olmalı; 0,05 uygulandı.");
    expect(clampWarning("Height", { min: null, max: 500 }, 500, "en-US")).toBe("Height en fazla 500 olmalı; 500 uygulandı.");
    expect(clampWarning("  ", { min: 0, max: 1 }, 0, "en-US")).toBe("Value 0 – 1 aralığında olmalı; 0 uygulandı.");
  });

  test("the slider steps by the field's step, else 1/200 of its travel", () => {
    expect(sliderStep(0.001, { min: 0, max: 1 })).toBe(0.001);
    expect(sliderStep(null, { min: 0, max: 50 })).toBe(0.25);
    expect(sliderStep(0, { min: -1, max: 1 })).toBe(0.01);
  });
});

describe("form paths", () => {
  test("text form for ids and messages", () => {
    expect(pathKey(["density"])).toBe("density");
    expect(pathKey(["wheel", "radius"])).toBe("wheel.radius");
    expect(pathKey(["waypoints", 2])).toBe("waypoints[2]");
    expect(pathKey(["layers", 0, "tint"])).toBe("layers[0].tint");
  });

  test("set copies along the path and shares the rest; get reads it back", () => {
    const root = { wheel: { radius: 0.35, steering: false }, waypoints: [[0, 0, 0], [1, 1, 1]], tint: "#ffffff" };
    const next = setAtPath(root, ["waypoints", 1, 2], 5);
    expect(getAtPath(next, ["waypoints", 1])).toEqual([1, 1, 5]);
    expect(root.waypoints[1]).toEqual([1, 1, 1]);
    expect(next.wheel).toBe(root.wheel);
    expect(next.waypoints[0]).toBe(root.waypoints[0]);
    const nested = setAtPath(root, ["wheel", "radius"], 0.5);
    expect(nested.wheel).toEqual({ radius: 0.5, steering: false });
    expect(nested.waypoints).toBe(root.waypoints);
    expect(getAtPath(root, ["missing", "deep"])).toBeUndefined();
    expect(setAtPath(root, [], "whole")).toBe("whole");
  });
});
