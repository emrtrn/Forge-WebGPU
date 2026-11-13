import { describe, expect, test } from "vitest";
import { createComponent, createSchemaRegistry, formOf, installFeatures } from "../../core/index.ts";
import cloudLayerFeature from "./feature.ts";
import { CloudLayer } from "./schema.ts";

describe("cloud layer schema", () => {
  test("defaults are Forge WebGL's CLOUD_LAYER_DEFAULTS", () => {
    expect(createComponent(CloudLayer)).toEqual({
      type: "forge.cloudLayer@1", color: "#ffffff", coverage: 0.5, density: 0.85, softness: 0.3, scale: 2, speed: 0,
    });
  });

  test("ranges are the ones of Forge's Details panel; drift is called Wind there", () => {
    const rows = formOf(CloudLayer).fields.map((field) =>
      field.kind === "number" ? `${field.label} ${field.range.min}..${field.range.max}` : field.label);
    expect(rows).toEqual(["Color", "Coverage 0..1", "Density 0..1", "Softness 0..1", "Scale 0.1..20", "Wind 0..5"]);
  });

  test("a singleton feature; every field has a Turkish hint", () => {
    const registry = createSchemaRegistry();
    installFeatures([cloudLayerFeature], registry);
    expect(registry.getComponent("forge.cloudLayer")).toBe(CloudLayer);
    expect(CloudLayer.singleton).toBe(true);
    for (const field of formOf(CloudLayer).fields) expect(field.hint, field.key).toBeTruthy();
  });
});
