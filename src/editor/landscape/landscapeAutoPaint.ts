// Auto Paint in the editor (plan 5d step 3, INV-B05; Forge WebGL
// landscapeAutoPaintDetails.ts @ forge-webgl-final). The rules are the
// actor's `forge.landscapeAutoPaint` component (user decision 2026-11-19:
// saved with the level, an agent writes them with `forge edit set`), edited in
// its own Details form. Below that form: the terrain's layer ids (what a rule's
// `layer` names) and Apply Auto Paint, which repaints the whole terrain once
// (landscapeLayers.ts, one undo step). The rules never repaint by themselves.

import type { LandscapeAutoPaintData } from "../../features/terrain/schema.ts";
import type { TerrainAutoPaintSettings } from "../../engine/terrain/terrainAutoPaint.ts";
import { TerrainEditingKey } from "../../engine/terrain/terrainEditing.ts";
import type { DetailsExtensionContext } from "../host/featureEditor.ts";
import { LandscapeLayersKey } from "./landscapeLayers.ts";

/** The component's rules as the engine's settings; an empty base layer is the terrain's first. */
export function landscapeAutoPaintSettings(data: LandscapeAutoPaintData, firstLayer: string): TerrainAutoPaintSettings {
  return {
    baseLayerId: data.baseLayer.trim() || firstLayer,
    seed: data.seed,
    rules: data.rules.map((rule) => ({
      layerId: rule.layer.trim(),
      enabled: rule.enabled,
      strength: rule.strength,
      heightMin: rule.heightMin,
      heightMax: rule.heightMax,
      heightFalloff: rule.heightFalloff,
      slopeMin: rule.slopeMin,
      slopeMax: rule.slopeMax,
      slopeFalloff: rule.slopeFalloff,
      noiseAmount: rule.noiseAmount,
      noiseScale: rule.noiseScale,
    })),
  };
}

export function createAutoPaintDetails(ctx: DetailsExtensionContext): { element: HTMLElement; dispose(): void } {
  const doc = ctx.document;
  const element = doc.createElement("div");
  element.dataset.testid = "landscape-auto-paint-panel";
  const editing = ctx.service(TerrainEditingKey);
  const layers = ctx.service(LandscapeLayersKey);
  if (!editing || !layers) {
    element.className = "detail-hint";
    element.textContent = "Auto Paint yalnız editörde uygulanır.";
    return { element, dispose() {} };
  }
  const ids = doc.createElement("div");
  ids.className = "detail-hint";
  ids.dataset.testid = "landscape-auto-paint-layers";
  const apply = doc.createElement("button");
  apply.type = "button";
  apply.className = "detail-inline-button";
  apply.textContent = "Apply Auto Paint";
  apply.title = "Kurallarla bütün terrain'i bir kerede yeniden boyar; önceki boyanın üstüne yazar (tek Undo).";
  apply.dataset.testid = "landscape-auto-paint-apply";
  apply.addEventListener("click", () => {
    const target = ctx.target();
    const terrain = target ? editing.find(target.actor) : undefined;
    if (!target || !terrain) {
      ctx.status("Auto Paint needs this actor's terrain drawn in the viewport.", "warning");
      return;
    }
    const first = terrain.session.world.def.layers[0]?.id ?? "";
    void layers.autoPaint(target.actor, landscapeAutoPaintSettings(ctx.value() as unknown as LandscapeAutoPaintData, first));
  });
  element.append(ids, apply);
  let shown = "";
  const draw = (): void => {
    const target = ctx.target();
    const terrain = target ? editing.find(target.actor) : undefined;
    const text = terrain
      ? `Terrain layers: ${terrain.session.world.def.layers.map((layer) => layer.id).join(", ")}`
      : "Bu aktörde çizilmiş terrain yok.";
    apply.disabled = !terrain || layers.busy;
    if (text === shown) return;
    shown = text;
    ids.textContent = text;
  };
  draw();
  const stop = editing.onChange(draw);
  let since = 0;
  ctx.onFrame((dt) => {
    since += dt;
    if (since < 0.25) return;
    since = 0;
    draw();
  });
  return { element, dispose: stop };
}
