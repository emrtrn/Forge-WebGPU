// Shared fixtures for the level tests: a small registry, an actor class and
// helpers. Not part of the core surface.

import type { ActorId, AssetId, LevelId } from "../id.ts";
import { defineComponent } from "../schema/component.ts";
import { actorRef, assetRef, color, num, vec3 } from "../schema/fields.ts";
import type { Issue } from "../schema/issues.ts";
import { createSchemaRegistry, type SchemaRegistry } from "../schema/registry.ts";
import { normalizeActorClass } from "./actorClass.ts";
import type { ActorClassDoc } from "./model.ts";
import type { LevelNormalizeOptions } from "./normalizeLevel.ts";

export const Fog = defineComponent(
  "test.fog",
  2,
  {
    density: num({ min: 0, max: 1, default: 0.02 }),
    heightFalloff: num({ min: 0, max: 5, default: 0.2 }),
    color: color({ default: "#b8c4d6" }),
  },
  {
    singleton: true,
    migrations: { 1: ({ falloff, ...rest }) => ({ ...rest, heightFalloff: falloff }) },
  },
);

export const Collider = defineComponent(
  "test.collider",
  1,
  { size: vec3({ default: [1, 1, 1], min: 0 }) },
  { spatial: true },
);

export const StaticMesh = defineComponent("test.staticMesh", 1, { mesh: assetRef() }, { spatial: true });

export const Driver = defineComponent("test.driver", 1, {
  targetSpeed: num({ min: 0, max: 50, default: 14 }),
  target: actorRef(),
});

export function createTestRegistry(): SchemaRegistry {
  const registry = createSchemaRegistry();
  for (const component of [Fog, Collider, StaticMesh, Driver]) {
    registry.registerComponent(component);
  }
  return registry;
}

const hex = (seed: string): string => seed.repeat(32).slice(0, 32);
export const actorId = (seed: string): ActorId => `act_${hex(seed)}`;
export const assetId = (seed: string): AssetId => `ast_${hex(seed)}`;
export const levelId = (seed: string): LevelId => `lvl_${hex(seed)}`;

export const CAR_CLASS_ID = assetId("c");
export const MESH_ID = assetId("e");

/** The `root -> chassis -> body` chain of a Forge actor class, without child actors. */
export const CAR_CLASS_SOURCE = {
  schema: "forge.actorClass/1",
  id: CAR_CLASS_ID,
  name: "Reference Car",
  components: {
    chassis: { type: "test.collider@1", parent: null, local: { p: [0, 1, -0.04] }, size: [2.08, 1.52, 4.08] },
    body: { type: "test.staticMesh@1", parent: "chassis", local: { s: [1.6, 1.6, 1.6] }, mesh: MESH_ID },
    driver: { type: "test.driver@1", targetSpeed: 14 },
  },
};

export function createCarClass(registry: SchemaRegistry): ActorClassDoc {
  const result = normalizeActorClass(CAR_CLASS_SOURCE, { strict: true, registry });
  if (!result.ok || !result.value) {
    throw new Error("test fixture: the car class does not normalise cleanly");
  }
  return result.value;
}

export function createOptions(strict: boolean): LevelNormalizeOptions {
  const registry = createTestRegistry();
  const car = createCarClass(registry);
  return {
    strict,
    registry,
    resolveClass: (id) => (id === car.id ? car : undefined),
  };
}

export function summary(issues: readonly Issue[]): string[] {
  return issues.map((issue) => `${issue.severity} ${issue.code} ${issue.path}`);
}
