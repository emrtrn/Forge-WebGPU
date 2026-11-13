// Two worlds, one render resource cache (architecture A6, §4.9): the cache
// belongs to the render host, not to a world. Both worlds take the same
// model through it; it loads once, each world counts its use, and disposing
// one world releases only its own use and leaves the other's objects alone.

import { describe, expect, test } from "vitest";
import { createSchemaRegistry, defineFeature, installFeatures, type FeatureDef } from "../core/index.ts";
import { actorId, assetId, StaticMesh } from "../core/level/testKit.ts";
import { createResourceCache, resourceKey } from "../render/resources/resourceCache.ts";
import type { ModelSource, ModelTemplate } from "../render/resources/worldResources.ts";
import { defineRenderBinding } from "../render/sync/renderBinding.ts";
import { createRenderFeature, type RenderWorld } from "../render/sync/renderWorld.ts";
import { createWorld } from "./world.ts";

const MESH = assetId("7");
/** Every model a binding got, in order; runtime code does not import three, so the template is a token. */
const received: ModelTemplate[] = [];
const template = (): ModelTemplate => ({ scene: null as unknown as ModelTemplate["scene"] });
const meshes = defineFeature({ id: "test.meshes", components: [StaticMesh] });

/** Puts one object per test.staticMesh component under the world's root, once its model is in. */
const meshBinding = defineRenderBinding({
  feature: "test.meshes",
  create(ctx) {
    return {
      actorsAdded(actors) {
        for (const actor of actors) {
          for (const component of Object.values(actor.components)) {
            const guid = component.mesh;
            if (typeof guid !== "string") continue;
            void ctx.resources.model(guid).then((model) => {
              received.push(model);
              const placed = ctx.root.clone(false);
              placed.name = actor.id;
              ctx.root.add(placed);
            });
          }
        }
      },
      dispose: () => ctx.resources.releaseAll(),
    };
  },
});

/** A binding of a feature the worlds do not install: it never runs. */
const strayBinding = defineRenderBinding({
  feature: "test.notInstalled",
  create() {
    throw new Error("a binding of a feature the world does not install must not run");
  },
});

function boot(name: string, features: FeatureDef[], render: FeatureDef) {
  const registry = createSchemaRegistry();
  installFeatures(features, registry);
  const world = createWorld({ strict: true, registry, resolveClass: () => undefined, features: [...features, render] });
  world.init();
  world.addActors(
    [{ id: actorId(name === "a" ? "1" : "2"), name, class: null, parent: null, spatiallyLoaded: true, transform: { p: [0, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] }, components: { mesh: { type: "test.staticMesh@1", parent: null, local: { p: [0, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] }, mesh: MESH } } }],
    "level",
  );
  world.beginPlay();
  return world;
}

describe("render worlds share the host's resource cache", () => {
  test("one load, a use per world; disposing one world leaves the other drawn", async () => {
    const cache = createResourceCache();
    let loads = 0;
    const models: ModelSource = {
      load: async () => {
        loads += 1;
        return template();
      },
    };
    const attached: RenderWorld[] = [];
    const renderFor = (name: string) =>
      createRenderFeature({
        cache,
        models,
        bindings: [meshBinding, strayBinding],
        features: [meshes],
        name,
        attach: (world) => attached.push(world),
        detach: (world) => attached.splice(attached.indexOf(world), 1),
      });

    const a = boot("a", [meshes], renderFor("a"));
    const b = boot("b", [meshes], renderFor("b"));
    await cache.settled();
    await Promise.resolve();

    const key = resourceKey.model(MESH);
    expect(loads).toBe(1);
    expect(cache.uses(key)).toBe(2);
    expect(attached.map((world) => world.name)).toEqual(["a", "b"]);
    const [worldA, worldB] = attached as [RenderWorld, RenderWorld];
    const names = (root: RenderWorld["root"]) => root.children.map((child) => child.name);
    expect(names(worldA.root)).toEqual([actorId("1")]);
    expect(names(worldB.root)).toEqual([actorId("2")]);
    // Both worlds got the one loaded model, each in its own scene.
    expect(received).toHaveLength(2);
    expect(received[0]).toBe(received[1]);
    expect(worldA.scene).not.toBe(worldB.scene);

    a.dispose();
    expect(cache.uses(key)).toBe(1);
    expect(attached.map((world) => world.name)).toEqual(["b"]);
    expect(names(worldB.root)).toEqual([actorId("2")]);
    // The entry stays for a world that comes later (eviction is phase 5b).
    const c = boot("c", [meshes], renderFor("c"));
    await cache.settled();
    expect(loads).toBe(1);
    expect(cache.uses(key)).toBe(2);
    b.dispose();
    c.dispose();
    expect(cache.uses(key)).toBe(0);
    expect(attached).toEqual([]);
  });

  test("a level without lights gets the default sun; the background is Forge's default", () => {
    const cache = createResourceCache();
    const attached: RenderWorld[] = [];
    const render = createRenderFeature({
      cache,
      models: { load: async () => template() },
      bindings: [],
      features: [meshes],
      name: "a",
      attach: (world) => attached.push(world),
    });
    const world = boot("a", [meshes], render);
    const scene = attached[0]!.scene;
    const lights = scene.children.filter((child) => (child as { isLight?: boolean }).isLight);
    expect(lights.map((light) => [light.type, (light as unknown as { intensity: number }).intensity])).toEqual([["DirectionalLight", 2]]);
    expect((scene.background as { getHexString(): string }).getHexString()).toBe("d7d7c7");
    world.dispose();
  });
});
