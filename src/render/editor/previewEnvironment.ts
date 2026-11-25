// The plant previews' weather (vegetation plan §9, PG5): season and its
// transition, snow, wetness and wind, read by the same plant drawing a world
// uses (render/plant/plantDrawing.ts), so a preview shows what WES would. It
// is the preview's own: nothing is written to the asset, a level or WES, and
// it is gone with the window.

import { float, mat3, positionGeometry, positionLocal, uint, uniform, vec3 } from "three/tsl";
import { Vector3, type Camera, type Node, type NodeMaterial } from "three/webgpu";
import type { PlantResponseProfile, PlantSeason } from "../../engine/plant/plantResponse.ts";
import { WorldEnvironmentKey } from "../../engine/environment/worldEnvironmentRuntime.ts";
import type { InstanceShading } from "../gpu/instanceShading.ts";
import { plantWorld, type PlantWorld } from "../plant/plantDrawing.ts";
import type { RenderWorldView } from "../sync/renderBinding.ts";

const SEASONS: readonly PlantSeason[] = ["spring", "summer", "autumn", "winter"];
const LABELS: Readonly<Record<PlantSeason, string>> = { spring: "Spring", summer: "Summer", autumn: "Autumn", winter: "Winter" };

export interface PreviewEnvironment {
  readonly plants: PlantWorld;
  /** Once per drawn frame. */
  sync(dt: number, camera: Camera): void;
}

/** A labelled control of a preview's bar. */
export function previewControl<K extends "select" | "input">(doc: Document, bar: HTMLElement, name: string, kind: K, hint: string): HTMLElementTagNameMap[K] {
  const label = doc.createElement("label"), input = doc.createElement(kind);
  label.title = hint;
  label.append(name, input);
  bar.append(label);
  return input;
}

export function previewSlider(doc: Document, bar: HTMLElement, name: string, value: number, hint: string): HTMLInputElement {
  const input = previewControl(doc, bar, name, "input", hint);
  Object.assign(input, { type: "range", min: "0", max: "1", step: "0.01" });
  input.value = String(value);
  return input;
}

/** Season and cover controls into `bar`; `seasons` false leaves only the wind (a rock, a data-less plant). */
export function createPreviewEnvironment(doc: Document, bar: HTMLElement): PreviewEnvironment {
  const season = previewControl(doc, bar, "Season", "select", "Önizlenen mevsim; aileye ve level'a yazılmaz.");
  season.append(...SEASONS.map((value) => { const option = doc.createElement("option"); option.value = value; option.textContent = LABELS[value]; return option; }));
  season.value = "summer";
  const progress = previewSlider(doc, bar, "Transition", 1, "Bir önceki mevsimden seçili mevsime geçiş (1: geçiş bitti).");
  const snow = previewSlider(doc, bar, "Snow", 0, "Kar örtüsü (0–1); mevsimden bağımsız.");
  const wetness = previewSlider(doc, bar, "Wetness", 0, "Islaklık (0–1).");
  const wind = previewSlider(doc, bar, "Wind", 0.3, "Rüzgâr gücü (0 sakin).");

  const state = () => ({
    hour: 12, season: season.value as PlantSeason,
    ...(Number(progress.value) < 1
      ? { seasonFrom: SEASONS[(SEASONS.indexOf(season.value as PlantSeason) + SEASONS.length - 1) % SEASONS.length]!, seasonProgress: Number(progress.value) } : {}),
    // A neutral weather: only the sliders move the plants.
    weather: { preset: "clear" as const, intensity: 0 },
    surface: { snowCoverage: Number(snow.value), wetness: Number(wetness.value) },
  });
  const world = {
    services: { get: (key: unknown) => key === WorldEnvironmentKey ? { controller: { current: state }, environment: null } : undefined },
    componentsOf: (name: string) => name === "forge.worldEnvironment"
      ? [{ component: { wind: { useLevelWind: false, directionDeg: 45, strength: Number(wind.value), gust: 0.3 } } }] : [],
  } as unknown as Pick<RenderWorldView, "services" | "componentsOf">;
  const plants = plantWorld(world);
  const position = new Vector3();
  return { plants, sync: (dt, camera) => plants.sync({}, dt, camera.getWorldPosition(position)) };
}

/** The response a preview without a profile gets: summer all year, no snow. */
export const NEUTRAL_RESPONSE: PlantResponseProfile = {
  habit: "evergreen", spring: { foliage: 1, tint: "#ffffff" }, summer: { foliage: 1, tint: "#ffffff" }, autumn: { foliage: 1, tint: "#ffffff" },
  winter: { foliage: 1, tint: "#ffffff" }, windFlex: 1, snow: { wood: 0.6, leaf: 0.8 }, wetness: 0.5,
};

/**
 * Shades one plain mesh as a batch shades an instance: the mesh stands at `origin` unrotated and at scale 1, so
 * its space is the world's moved by it.
 */
export function shadePreviewMesh(hook: InstanceShading, material: NodeMaterial, origin: Vector3, seed: number): void {
  const result = hook(material, {
    origin: uniform(origin.clone()), scale: float(1), seed: uint(seed & 0xffffff) as unknown as Node<"uint">,
    template: positionGeometry, basis: mat3(vec3(1, 0, 0), vec3(0, 1, 0), vec3(0, 0, 1)) as unknown as Node<"mat3">,
  }, "main");
  if (!result?.worldOffset) return;
  material.positionNode = ((material.positionNode as Node<"vec3"> | null) ?? positionLocal).add(result.worldOffset);
}
