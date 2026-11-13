// Edits reach the render bindings (plan phase 4, decision 3): a binding with
// `actorsChanged` gets the changes, one without gets removed (previous) +
// added (now). The render subsystem is installed in the editor's world.

import { describe, expect, test } from "vitest";
import { defineFeature, normalizeLevel, type WorldActor } from "../core/index.ts";
import { actorId, createOptions, levelId } from "../core/level/testKit.ts";
import { resolveQualitySettings } from "../engine/perf/qualityProfiles.ts";
import { createWorld } from "./world.ts";
import { createResourceCache } from "../render/resources/resourceCache.ts";
import type { RenderBindingDef } from "../render/sync/renderBinding.ts";
import { createRenderFeature } from "../render/sync/renderWorld.ts";

const OPTIONS = createOptions(true);
const FEATURE = defineFeature({ id: "test.drawn" });
const names = (actors: readonly WorldActor[]) => actors.map((actor) => actor.name).join(",");

describe("render bindings and edits", () => {
  test("a binding with actorsChanged gets the changes; one without gets removed + added; the editor's world draws", () => {
    const log: string[] = [];
    const withHook: RenderBindingDef = {
      kind: "renderBinding",
      feature: FEATURE.id,
      create: () => ({ actorsChanged: (changes) => log.push(`hook ${changes.map((change) => `${change.actor.name}${change.transformOnly ? "(t)" : ""}`).join(",")}`) }),
    };
    const without: RenderBindingDef = {
      kind: "renderBinding",
      feature: FEATURE.id,
      create: () => ({
        actorsAdded: (actors) => log.push(`added ${names(actors)}`),
        actorsRemoved: (actors) => log.push(`removed ${names(actors)}`),
      }),
    };
    const render = createRenderFeature({
      cache: createResourceCache(),
      models: { load: async () => ({ scene: null as never, slots: [], slotMaterials: [] }) },
      bindings: [withHook, without],
      features: [FEATURE],
      name: "editor",
      camera: () => null,
      quality: () => resolveQualitySettings("high"),
    });
    const world = createWorld({ ...OPTIONS, features: [FEATURE, render], mode: "editor" });
    world.init();
    const level = normalizeLevel({ schema: "forge.level/1", id: levelId("1"), actors: [{ id: actorId("1"), name: "box" }] }, OPTIONS).value!;
    world.addActors(level.actors, "level");
    log.length = 0;
    world.updateActors([{ ...level.actors[0]!, transform: { p: [1, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] } }]);
    world.updateActors([{ ...level.actors[0]!, name: "crate", transform: { p: [1, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] } }]);
    expect(log).toEqual(["hook box(t)", "removed box", "added box", "hook crate", "removed box", "added crate"]);
    world.dispose();
  });
});
