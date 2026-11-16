import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { createSchemaRegistry, installFeatures, normalizeLevel } from "../../core/index.ts";
import skyEditor from "../../features/sky/editor.ts";
import skyFeature from "../../features/sky/feature.ts";
import fogEditor from "../../features/height-fog/editor.ts";
import fogFeature from "../../features/height-fog/feature.ts";
import cloudEditor from "../../features/cloud-layer/editor.ts";
import cloudFeature from "../../features/cloud-layer/feature.ts";
import environmentEditor from "../../features/world-environment/editor.ts";
import environmentFeature from "../../features/world-environment/feature.ts";
import postEditor from "../../features/post-process/editor.ts";
import postFeature from "../../features/post-process/feature.ts";
import lightEditor from "../../features/light/editor.ts";
import lightFeature from "../../features/light/feature.ts";
import materialEditor from "../../features/material/editor.ts";
import materialFeature from "../../features/material/feature.ts";
import type { AddActorEntry } from "../host/featureEditor.ts";
import { NEW_LEVEL_TEMPLATE, newAssetItems, newLevelActors } from "./newAssets.ts";

test("the New menu: Level, Actor Class, then each JSON asset type with its feature's templates", () => {
  const registry = createSchemaRegistry();
  installFeatures([materialFeature], registry);
  const items = newAssetItems(registry, [materialEditor]);
  expect(items.map((item) => item.label)).toEqual(["Level", "Actor Class", "Material"]);
  const material = items[2]!;
  expect(material).toMatchObject({ kind: "asset", type: "forge.material" });
  expect(material.templates.map((template) => template.label)).toEqual(["Standard Surface", "Textured Surface", "Metal", "Glass", "Emissive", "Unlit Basic"]);
  expect(material.templates[2]!.values).toMatchObject({ metalness: 1 });
});

test("a new level is Forge's default from the Add Actor entries; a missing entry is skipped; fields go over the entry's", () => {
  const entry = (key: string, components: AddActorEntry["components"], rotation?: [number, number, number]): AddActorEntry => ({
    key,
    label: key,
    category: "x",
    icon: "generic",
    components,
    ...(rotation ? { rotation } : {}),
  });
  let n = 0;
  const actors = newLevelActors(
    [
      entry("forge.light:directional", { light: { type: "forge.directionalLight@1" } }, [-55, 35, 0]),
      entry("forge.shape:cube", { shape: { type: "forge.shape@2", primitive: "cube" } }),
    ],
    () => `act_${++n}`,
  ) as { id: string; name: string; transform: { p: number[]; s: number[]; r: number[] }; components: Record<string, Record<string, unknown>> }[];
  expect(actors.map((actor) => actor.name)).toEqual(["Sun", "Cube"]);
  expect(actors[0]!.components.light).toEqual({ type: "forge.directionalLight@1", atmosphereSun: true, castShadow: true, cascadedShadows: true });
  expect(actors[0]!.transform.r[3]).not.toBe(1);
  expect(actors[1]!.transform).toMatchObject({ p: [0, 0.5, 0], s: [2, 2, 2] });
  expect(NEW_LEVEL_TEMPLATE).toHaveLength(9);
});

test("a new level's seven visual effects match the saved test scene after save normalization", () => {
  // Captured from the user's saved test scene, independent of the template.
  const expected: unknown = JSON.parse(readFileSync(new URL("../../../tests/fixtures/new-level/test-environment.json", import.meta.url), "utf8"));
  const registry = createSchemaRegistry();
  installFeatures([skyFeature, fogFeature, cloudFeature, environmentFeature, postFeature, lightFeature], registry);
  const entries = [skyEditor, fogEditor, cloudEditor, environmentEditor, postEditor, lightEditor].flatMap((editor) => editor.addActor);
  const actors = newLevelActors(entries);
  const saved = normalizeLevel({ schema: "forge.level/1", id: "lvl_138121344c9d1dace80c876da55703b0", actors }, { strict: true, registry, resolveClass: () => undefined });
  expect(saved.issues).toEqual([]);
  expect(saved.value?.actors.map((actor) => {
    expect(actor.class).toBeNull();
    return { name: actor.name, transform: actor.transform, components: actor.class === null ? actor.components : {} };
  })).toEqual(expected);
  const next = newLevelActors(entries);
  expect(next).not.toEqual(actors); // Each new level gets fresh actor identities.
});
