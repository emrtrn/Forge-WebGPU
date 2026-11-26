/** A terrain paint layer's response to the World Environment. */
export interface LayerWeather {
  /** How much of the wetness the layer takes, 0..1. */
  readonly wetting: number;
  /** 0 hard (turns glossy when wet), 1 porous (darkens). */
  readonly porosity: number;
  /** How much of the snow the layer takes, 0..1; visible snow and (phase W8) physics read the same value. */
  readonly snowAccept: number;
  /** Physical material the layer blends toward as it soaks (e.g. dirt -> "mud"); null keeps its own. */
  readonly wetPhysicalMaterial: string | null;
}

export const LAYER_WEATHER_DEFAULTS: LayerWeather = Object.freeze({
  wetting: 1, porosity: 0.5, snowAccept: 1, wetPhysicalMaterial: null,
});
const MUD_WEATHER_DEFAULTS: LayerWeather = Object.freeze({ ...LAYER_WEATHER_DEFAULTS, snowAccept: 0 });

export function defaultLayerWeather(physicalMaterial: string | null): LayerWeather {
  return physicalMaterial === "mud" ? MUD_WEATHER_DEFAULTS : LAYER_WEATHER_DEFAULTS;
}

function unitValue(value: unknown, fallback: number): number {
  return typeof value === "number" && !Number.isNaN(value) ? Math.min(1, Math.max(0, value)) : fallback;
}

export function resolveLayerWeather(layer: { weather?: Partial<LayerWeather> | null | undefined; physicalMaterial: string | null }): LayerWeather {
  const defaults = defaultLayerWeather(layer.physicalMaterial);
  const { weather } = layer;
  if (!weather) return defaults;

  const wetting = unitValue(weather.wetting, defaults.wetting);
  const porosity = unitValue(weather.porosity, defaults.porosity);
  const snowAccept = unitValue(weather.snowAccept, defaults.snowAccept);
  const wetPhysicalMaterial = typeof weather.wetPhysicalMaterial === "string" ? weather.wetPhysicalMaterial.trim() || null : null;
  if (wetting === defaults.wetting && porosity === defaults.porosity && snowAccept === defaults.snowAccept && wetPhysicalMaterial === null) {
    return defaults;
  }
  return Object.freeze({ wetting, porosity, snowAccept, wetPhysicalMaterial });
}

export function blendLayerWeather(weights: ArrayLike<number>, layers: readonly LayerWeather[]): LayerWeather {
  const count = Math.min(weights.length, layers.length);
  let maxWeight = 0;
  for (let i = 0; i < count; i++) {
    const weight = weights[i]!;
    if (Number.isFinite(weight) && weight > maxWeight) maxWeight = weight;
  }
  if (maxWeight === 0) return LAYER_WEATHER_DEFAULTS;

  // A power-of-two scale keeps finite totals in range and preserves exact binary weight ratios.
  const scale = 2 ** Math.min(1023, Math.floor(Math.log2(maxWeight)));
  let total = 0, wetting = 0, porosity = 0, snowAccept = 0;
  let materialTotal = 0;
  const materialWeights = new Map<string, number>();
  for (let i = 0; i < count; i++) {
    const raw = weights[i]!;
    const weight = Number.isFinite(raw) && raw > 0 ? raw / scale : 0;
    const layer = layers[i]!;
    total += weight;
    wetting += weight * layer.wetting;
    porosity += weight * layer.porosity;
    snowAccept += weight * layer.snowAccept;
    const material = layer.wetPhysicalMaterial;
    if (material !== null) {
      materialTotal += weight;
      materialWeights.set(material, (materialWeights.get(material) ?? 0) + weight);
    }
  }

  let wetPhysicalMaterial: string | null = null;
  if (materialTotal >= total / 2) {
    let largest = 0;
    for (const [material, weight] of materialWeights) {
      if (weight > largest) {
        largest = weight;
        wetPhysicalMaterial = material;
      }
    }
  }
  return Object.freeze({ wetting: wetting / total, porosity: porosity / total, snowAccept: snowAccept / total, wetPhysicalMaterial });
}
