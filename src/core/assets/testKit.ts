// Shared fixtures for the asset tests: a registry with the level test
// components plus asset types, and builders for content file lists. Not part
// of the core surface.

import type { AssetId } from "../id.ts";
import { assetId, createTestRegistry, levelId, actorId } from "../level/testKit.ts";
import { ACTOR_CLASS_SCHEMA, LEVEL_SCHEMA } from "../level/model.ts";
import { defineComponent } from "../schema/component.ts";
import { array, assetRef, bool } from "../schema/fields.ts";
import type { SchemaRegistry } from "../schema/registry.ts";
import { defineAssetType } from "./assetType.ts";
import { buildAssetIndex } from "./assetIndex.ts";
import type { ContentFile, FileIssue } from "./identity.ts";
import { ASSET_META_SCHEMA } from "./meta.ts";

export { actorId, assetId, levelId };

export const Texture = defineAssetType("test.texture", 1, {
  extensions: ["png"],
  importFields: { srgb: bool({ default: true }) },
});

/** A mesh's import settings point at its textures: references from a meta file. */
export const Mesh = defineAssetType("test.mesh", 1, {
  extensions: ["glb"],
  importFields: { textures: array(assetRef({ assetType: "test.texture" })) },
});

/** A component whose asset reference is limited to one asset type. */
export const MeshRenderer = defineComponent(
  "test.meshRenderer",
  1,
  { mesh: assetRef({ assetType: "test.mesh" }), castShadow: bool({ default: true }) },
  { spatial: true },
);

export function createAssetTestRegistry(): SchemaRegistry {
  const registry = createTestRegistry();
  registry.registerComponent(MeshRenderer);
  registry.registerAssetType(Texture);
  registry.registerAssetType(Mesh);
  return registry;
}

export const ROOT = "content";

export function binary(path: string, root = ROOT): ContentFile {
  return { root, path };
}

export function meta(
  path: string,
  id: AssetId,
  type: string,
  extra: Record<string, unknown> = {},
  root = ROOT,
): ContentFile {
  return {
    root,
    path: `${path}.meta.json`,
    json: { schema: ASSET_META_SCHEMA, id, type, license: "CC0-1.0", source: { origin: "test" }, ...extra },
  };
}

/** A binary file and its meta file. */
export function asset(path: string, id: AssetId, type: string, extra: Record<string, unknown> = {}): ContentFile[] {
  return [binary(path), meta(path, id, type, extra)];
}

export function doc(path: string, json: unknown, root = ROOT): ContentFile {
  return { root, path, json };
}

export function actorClass(path: string, id: AssetId, components: Record<string, unknown>): ContentFile {
  return doc(path, { schema: ACTOR_CLASS_SCHEMA, id, name: "Class", components });
}

export function level(path: string, seed: string, actors: unknown[]): ContentFile {
  return doc(path, { schema: LEVEL_SCHEMA, id: levelId(seed), actors });
}

export function fileSummary(issues: readonly FileIssue[]): string[] {
  return issues.map((issue) => `${issue.severity} ${issue.code} ${issue.file} ${issue.path}`.trimEnd());
}

export const TEX = assetId("1");
export const MESH = assetId("2");
export const CAR = assetId("3");
export const WHEEL = assetId("4");

/** A small project: textures, meshes, a car class and a level using both. */
export function projectFiles(): ContentFile[] {
  return [
    ...asset("textures/paint.png", TEX, "test.texture@1"),
    ...asset("meshes/car.glb", MESH, "test.mesh@1", { import: { textures: [TEX] } }),
    ...asset("meshes/wheel.glb", WHEEL, "test.mesh@1"),
    actorClass("classes/car.json", CAR, {
      chassis: { type: "test.collider@1", parent: null },
      body: { type: "test.staticMesh@1", parent: "chassis", mesh: MESH },
      driver: { type: "test.driver@1" },
    }),
    level("levels/main/level.json", "a", [
      {
        id: actorId("1"),
        name: "Car",
        class: CAR,
        overrides: { body: { mesh: WHEEL }, driver: { targetSpeed: 18 } },
      },
      {
        id: actorId("2"),
        name: "Wheel",
        components: { mesh: { type: "test.meshRenderer@1", parent: null, mesh: WHEEL } },
      },
    ]),
  ];
}

export function build(files: readonly ContentFile[], strict = true) {
  return buildAssetIndex(files, { strict, registry: createAssetTestRegistry() });
}
