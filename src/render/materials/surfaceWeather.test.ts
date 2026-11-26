import { describe, expect, test } from "vitest";
import { Color, MeshBasicNodeMaterial, MeshPhysicalMaterial, MeshStandardMaterial, MeshStandardNodeMaterial } from "three/webgpu";
import { createSurfaceWeather, MATERIAL_WEATHER_KEY } from "./surfaceWeather.ts";

const weatherOf = (material: unknown) => (material as { forgeWeather?: unknown }).forgeWeather;

describe("surface weather (plan phase W4)", () => {
  test("a glTF material becomes a weathered node material with its own values; its clones stay weathered", () => {
    const weather = createSurfaceWeather();
    const source = new MeshStandardMaterial({ color: new Color(0.5, 0.2, 0.1), roughness: 0.6, metalness: 0.3 });
    const drawn = weather.material(source) as MeshStandardNodeMaterial;
    expect(drawn).not.toBe(source);
    expect(drawn.isNodeMaterial).toBe(true);
    expect(weatherOf(drawn)).toBeTruthy();
    expect(drawn.color.getHex()).toBe(source.color.getHex());
    expect(drawn.roughness).toBe(0.6);
    expect(drawn.roughnessNode).toBeTruthy();
    expect(weather.material(source)).toBe(drawn);
    // The batches clone what they draw (detail fade, GPU-driven views): the hook and the response go along.
    const clone = drawn.clone();
    expect(weatherOf(clone)).toBe(weatherOf(drawn));
    expect((clone as unknown as Record<string, unknown>).forgeWeatherPorosity).toBe(0.5);
    // A copy handed back in is drawn as it is.
    expect(weather.material(drawn)).toBe(drawn);
    expect((weather.material(new MeshPhysicalMaterial()) as { isMeshPhysicalNodeMaterial?: boolean }).isMeshPhysicalNodeMaterial).toBe(true);
    expect(weather.size).toBe(2);
  });

  test("a forge.material's response is read; one that takes neither wetness nor snow, and an unlit one, are left alone", () => {
    const weather = createSurfaceWeather();
    const hard = new MeshStandardNodeMaterial();
    hard.userData[MATERIAL_WEATHER_KEY] = { wetting: 1, porosity: 0, snowAccept: 0.5, puddleAccept: 1 };
    const drawn = weather.material(hard) as unknown as Record<string, unknown>;
    expect([drawn.forgeWeatherWetting, drawn.forgeWeatherPorosity, drawn.forgeWeatherSnowAccept]).toEqual([1, 0, 0.5]);
    const glass = new MeshStandardNodeMaterial();
    glass.userData[MATERIAL_WEATHER_KEY] = { wetting: 0, porosity: 0.5, snowAccept: 0, puddleAccept: 0 };
    expect(weather.material(glass)).toBe(glass);
    const unlit = new MeshBasicNodeMaterial();
    expect(weather.material(unlit)).toBe(unlit);
  });

  test("a disposed source takes its copy along; the world going disposes the rest", () => {
    const weather = createSurfaceWeather();
    const first = new MeshStandardNodeMaterial(), second = new MeshStandardNodeMaterial();
    const copies = [weather.material(first), weather.material(second)];
    const disposed: unknown[] = [];
    for (const copy of copies) copy.addEventListener("dispose", () => disposed.push(copy));
    first.dispose();
    expect(disposed).toEqual([copies[0]]);
    expect(weather.size).toBe(1);
    weather.dispose();
    expect(disposed).toEqual(copies);
    expect(weather.size).toBe(0);
  });
});
