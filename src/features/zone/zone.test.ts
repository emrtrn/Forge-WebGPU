import { expect, test } from "vitest";
import { createSchemaRegistry, installFeatures, normalizeComponent } from "../../core/index.ts";
import zoneFeature from "./feature.ts";
import { Portal, Zone } from "./schema.ts";

test("R9b Z1: zone and portal install and their defaults are canonical", () => {
  const registry = createSchemaRegistry();
  installFeatures([zoneFeature], registry);
  expect(registry.components().map((def) => def.name)).toEqual(["forge.zone", "forge.portal"]);
  expect(Zone.spatial && Portal.spatial).toBe(true);
  const zone = normalizeComponent(Zone, { type: "forge.zone@1" }, { strict: true });
  expect(zone.ok).toBe(true);
  expect(zone.value).toEqual({
    type: "forge.zone@1", parent: null, local: { p: [0, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] },
    size: [8, 3, 8], zoneName: "", alwaysCastShadows: false, generated: false,
  });
  const portal = normalizeComponent(Portal, { type: "forge.portal@1", zoneA: "act_00000000000000000000000000000001" }, { strict: true });
  expect(portal.ok).toBe(true);
  expect(portal.value).toMatchObject({ type: "forge.portal@1", size: [1.2, 2.2], zoneA: "act_00000000000000000000000000000001", zoneB: null, generated: false });
});

test("R9b Z1: a zone's size is clamped to its limits", () => {
  const zone = normalizeComponent(Zone, { type: "forge.zone@1", size: [0, 3, 8] }, { strict: false });
  expect(zone.value?.size[0]).toBe(0.1);
});
