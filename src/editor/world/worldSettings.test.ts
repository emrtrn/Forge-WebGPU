import { expect, test } from "vitest";
import { normalizeLevel, type LevelDoc } from "../../core/index.ts";
import { actorId, createOptions, levelId } from "../../core/level/testKit.ts";
import { createEditorCatalog } from "../host/editorCatalog.ts";
import { defineFeatureEditor } from "../host/featureEditor.ts";
import type { PlacerEntry } from "../place/actorPlacer.ts";
import { environmentRows } from "./worldSettings.ts";

const OPTIONS = createOptions(true);

test("World Settings lists every one-per-level component: the actor that has it, or the Add Actor entry that places it", () => {
  const level = normalizeLevel({ schema: "forge.level/1", id: levelId("1"), actors: [{ id: actorId("f"), name: "Fog", components: { fog: { type: "test.fog@2" } } }] }, OPTIONS).value as LevelDoc;
  const entries: PlacerEntry[] = [{ key: "test:fog", label: "Fog", category: "Visual Effects", icon: "cloud", components: { fog: { type: "test.fog@2" } }, singleton: true }];
  expect(environmentRows(OPTIONS.registry, level.actors, OPTIONS.resolveClass, entries)).toEqual([{ component: "test.fog", label: "Fog", actor: level.actors[0], entry: "test:fog" }]);
  expect(environmentRows(OPTIONS.registry, [], OPTIONS.resolveClass, [])).toEqual([{ component: "test.fog", label: "Fog", actor: null, entry: null }]);
});

test("a feature's Details extension is found by component; two for one component are refused", () => {
  const extension = () => ({ element: {} as HTMLElement });
  const editor = defineFeatureEditor({ feature: "test.fog", details: { "test.fog": extension } });
  const catalog = createEditorCatalog([editor], OPTIONS.registry);
  expect(catalog.details("test.fog")).toBe(extension);
  expect(catalog.details("test.driver")).toBeUndefined();
  expect(() => createEditorCatalog([editor, defineFeatureEditor({ feature: "other", details: { "test.fog": extension } })], OPTIONS.registry)).toThrow(/Details of test.fog/);
  expect(() => defineFeatureEditor({ feature: "x", details: { Fog: extension } })).toThrow(/namespaced/);
});
