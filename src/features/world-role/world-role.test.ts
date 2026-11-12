import { describe, expect, test } from "vitest";
import { createSchemaRegistry, installFeatures, normalizeComponent } from "../../core/index.ts";
import shapeFeature from "../shape/feature.ts";
import { Shape } from "../shape/schema.ts";
import staticMeshFeature from "../static-mesh/feature.ts";
import { StaticMesh } from "../static-mesh/schema.ts";
import terrainFeature from "../terrain/feature.ts";
import { Terrain } from "../terrain/schema.ts";
import worldRoleFeature from "./feature.ts";
import { WorldRole } from "./schema.ts";

// The four schema-only features World Builder and the importer write (plan 2b).
describe("World Builder output components", () => {
  test("they install together and their defaults normalise without issues", () => {
    const registry = createSchemaRegistry();
    installFeatures([staticMeshFeature, shapeFeature, worldRoleFeature, terrainFeature], registry);
    expect(registry.components().map((def) => def.name)).toEqual([
      "forge.staticMesh",
      "forge.shape",
      "forge.worldRole",
      "forge.terrain",
    ]);
    const shape = normalizeComponent(Shape, { type: "forge.shape@1" }, { strict: true });
    expect(shape.ok).toBe(true);
    expect(shape.value).toEqual({
      type: "forge.shape@1",
      parent: null,
      local: { p: [0, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] },
      primitive: "cube",
      color: "#c8c8c8",
      collision: true,
    });
    expect(normalizeComponent(StaticMesh, { type: "forge.staticMesh@1" }, { strict: true }).value).toMatchObject({ mesh: null, collision: true });
    expect(normalizeComponent(Terrain, { type: "forge.terrain@1" }, { strict: true }).value).toMatchObject({ data: null });
    expect(WorldRole.spatial).toBe(false);
  });

  test("a role is a dotted name and a stage a World Builder stage id", () => {
    const role = (value: Record<string, unknown>) => normalizeComponent(WorldRole, { type: "forge.worldRole@1", ...value }, { strict: true });
    expect(role({ role: "building.residential.detached", stage: "settlementSites" }).ok).toBe(true);
    expect(role({ role: "prop.rock" }).value).toEqual({ type: "forge.worldRole@1", role: "prop.rock", stage: "" });
    expect(role({ role: "Building" }).ok).toBe(false);
    expect(role({ role: "prop..rock" }).ok).toBe(false);
    expect(role({ role: "prop.rock", stage: "Roads" }).ok).toBe(false);
  });
});
