// The light binding in a real world (no GPU): lights replace the default sun,
// the marked sun publishes its direction, and shadows follow the quality
// profile (cascades for a cascaded sun, the follow map otherwise).

import { describe, expect, test } from "vitest";
import { PerspectiveCamera, Quaternion, Vector3, type DirectionalLight, type Light, type Scene } from "three/webgpu";
import { createSchemaRegistry, installFeatures, type ActorDoc, type Transform } from "../../core/index.ts";
import { actorId } from "../../core/level/testKit.ts";
import { resolveQualitySettings, type QualitySettings } from "../../engine/perf/qualityProfiles.ts";
import { createResourceCache } from "../../render/resources/resourceCache.ts";
import { createRenderFeature, type RenderWorld } from "../../render/sync/renderWorld.ts";
import { createWorld } from "../../runtime/world.ts";
import lightFeature from "./feature.ts";
import lightBinding from "./render.ts";

const IDENTITY: Transform = { p: [0, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] };
/** -90 degrees about X: the light's -Z points straight down. */
const DOWN: Transform = { p: [0, 10, 0], r: [-Math.SQRT1_2, 0, 0, Math.SQRT1_2], s: [1, 1, 1] };

function boot(components: Record<string, Record<string, unknown>>, quality: QualitySettings) {
  const registry = createSchemaRegistry();
  installFeatures([lightFeature], registry);
  const attached: RenderWorld[] = [];
  const settings = { current: quality };
  const camera = new PerspectiveCamera(44, 1, 0.1, 2000);
  camera.position.set(0, 2, 10);
  const render = createRenderFeature({
    cache: createResourceCache(),
    models: { load: async () => ({ scene: null as never, slots: [], slotMaterials: [] }) },
    bindings: [lightBinding],
    features: [lightFeature],
    name: "lights",
    camera: () => camera,
    quality: () => settings.current,
    attach: (world) => attached.push(world),
  });
  const world = createWorld({ strict: true, registry, resolveClass: () => undefined, features: [lightFeature, render] });
  world.init();
  world.addActors(
    Object.entries(components).map(([name, component], index): ActorDoc => ({
      id: actorId(String(index + 1)),
      name,
      class: null,
      parent: null,
      spatiallyLoaded: true,
      transform: name === "Sun" ? DOWN : IDENTITY,
      components: { light: { parent: null, local: IDENTITY, ...component } as never },
    })),
    "level",
  );
  world.beginPlay();
  world.tick(0.016);
  const scene = attached[0]!.scene;
  return { world, scene, settings, lights: () => lightsIn(scene) };
}

function lightsIn(scene: Scene): Light[] {
  const found: Light[] = [];
  scene.traverse((object) => {
    if ((object as Light).isLight) found.push(object as Light);
  });
  return found;
}

const sun = (overrides: Record<string, unknown> = {}) => ({
  type: "forge.directionalLight@1",
  color: "#ffeedd",
  intensity: 3,
  castShadow: true,
  cascadedShadows: false,
  atmosphereSun: true,
  ...overrides,
});

describe("light binding", () => {
  test("authored lights replace the default sun; each component gets its light", () => {
    const { lights, world } = boot(
      {
        Sun: sun(),
        Lamp: { type: "forge.pointLight@1", color: "#ffffff", intensity: 5, distance: 6, decay: 2, castShadow: false },
        Torch: { type: "forge.spotLight@1", color: "#ffffff", intensity: 4, distance: 12, angle: 25, penumbra: 0.2, decay: 2, castShadow: false },
      },
      resolveQualitySettings("high"),
    );
    const found = lights();
    expect(found.map((light) => [light.type, light.name])).toEqual([
      ["DirectionalLight", "Sun/light"],
      ["PointLight", "Lamp/light"],
      ["SpotLight", "Torch/light"],
    ]);
    expect(found[0]!.intensity).toBe(3);
    expect((found[2] as unknown as { angle: number }).angle).toBeCloseTo((25 * Math.PI) / 180);
    world.dispose();
  });

  test("the marked sun publishes its direction (ground -> sun) for fog and sky", () => {
    const registry = createSchemaRegistry();
    installFeatures([lightFeature], registry);
    let published: Vector3 | null = null;
    const probe = {
      kind: "renderBinding" as const,
      feature: "forge.light",
      create: (ctx: { lighting: { sunDirection: Vector3 } }) => ({
        sync: () => void (published = ctx.lighting.sunDirection.clone()),
      }),
    };
    const render = createRenderFeature({
      cache: createResourceCache(),
      models: { load: async () => ({ scene: null as never, slots: [], slotMaterials: [] }) },
      bindings: [lightBinding, probe],
      features: [lightFeature],
      name: "probe",
      camera: () => null,
      quality: () => resolveQualitySettings("high"),
    });
    const world = createWorld({ strict: true, registry, resolveClass: () => undefined, features: [lightFeature, render] });
    world.init();
    world.addActors([{ id: actorId("1"), name: "Sun", class: null, parent: null, spatiallyLoaded: true, transform: DOWN, components: { light: { parent: null, local: IDENTITY, ...sun() } as never } }], "level");
    world.beginPlay();
    world.tick(0.016);
    expect(published).not.toBeNull();
    expect(published!.toArray().map((value) => Math.round(value * 1e6) / 1e6 + 0)).toEqual([0, 1, 0]);
    world.dispose();
  });

  test("shadows follow the profile: the cascaded sun gets CSM, a plain one the follow map, Low none", () => {
    const cascaded = boot({ Sun: sun({ cascadedShadows: true }) }, resolveQualitySettings("high"));
    const csmSun = cascaded.lights()[0] as DirectionalLight;
    expect(csmSun.castShadow).toBe(true);
    expect((csmSun.shadow as { shadowNode?: unknown }).shadowNode).toBeTruthy();
    expect(csmSun.shadow.mapSize.width).toBe(resolveQualitySettings("high").shadowMapSize);
    // A profile without shadows drops the cascades.
    cascaded.settings.current = resolveQualitySettings("low");
    cascaded.world.tick(0.016);
    expect(csmSun.castShadow).toBe(false);
    expect((csmSun.shadow as { shadowNode?: unknown }).shadowNode ?? null).toBeNull();
    cascaded.world.dispose();

    // Forge's "count or sun changes rebuild the cascades": a new count is a new node, an unchanged one keeps it.
    const rebuilt = boot({ Sun: sun({ cascadedShadows: true }) }, resolveQualitySettings("high"));
    const rebuiltSun = rebuilt.lights()[0] as DirectionalLight;
    const first = (rebuiltSun.shadow as { shadowNode?: unknown }).shadowNode;
    rebuilt.world.tick(0.016);
    expect((rebuiltSun.shadow as { shadowNode?: unknown }).shadowNode).toBe(first);
    rebuilt.settings.current = { ...resolveQualitySettings("high"), shadowCascades: 2 };
    rebuilt.world.tick(0.016);
    const second = (rebuiltSun.shadow as { shadowNode?: unknown }).shadowNode as { cascades: number };
    expect(second).not.toBe(first);
    expect(second.cascades).toBe(2);
    rebuilt.world.dispose();

    const plain = boot({ Sun: sun() }, resolveQualitySettings("medium"));
    const followSun = plain.lights()[0] as DirectionalLight;
    expect(followSun.castShadow).toBe(true);
    expect((followSun.shadow as { shadowNode?: unknown }).shadowNode ?? null).toBeNull();
    // The follow map: 60 m x Medium's distance scale, centred ahead of the camera.
    const half = 60 * resolveQualitySettings("medium").shadowDistanceScale;
    expect(followSun.shadow.camera.right).toBeCloseTo(half);
    expect(followSun.shadow.camera.far).toBeCloseTo(300);
    plain.world.dispose();
  });

  test("a directional light lives in the world frame: CSMShadowNode reads its local position and target as world and adds the cascade lights to its parent", () => {
    // Every imported level's sun actor sits at (3, 9, 4) and is turned. Under the actor's holder the
    // cascades were fitted to the camera turned about that actor, so far from the origin (every
    // terrain level) no cascade covered the view and nothing cast a shadow (phase 3 step 9 grid).
    const turned: Transform = { p: [3, 9, 4], r: [-0.4403775, 0.2667293, -0.1388505, 0.8459573], s: [1, 1, 1] };
    const registry = createSchemaRegistry();
    installFeatures([lightFeature], registry);
    const attached: RenderWorld[] = [];
    const render = createRenderFeature({
      cache: createResourceCache(),
      models: { load: async () => ({ scene: null as never, slots: [], slotMaterials: [] }) },
      bindings: [lightBinding],
      features: [lightFeature],
      name: "frame",
      camera: () => null,
      quality: () => resolveQualitySettings("high"),
      attach: (world) => attached.push(world),
    });
    const world = createWorld({ strict: true, registry, resolveClass: () => undefined, features: [lightFeature, render] });
    world.init();
    world.addActors([{ id: actorId("1"), name: "Sun", class: null, parent: null, spatiallyLoaded: true, transform: turned, components: { light: { parent: null, local: IDENTITY, ...sun({ cascadedShadows: true }) } as never } }], "level");
    world.beginPlay();
    world.tick(0.016);
    const light = lightsIn(attached[0]!.scene)[0] as DirectionalLight;
    const parent = light.parent!;
    parent.updateWorldMatrix(true, false);
    expect(parent.matrixWorld.equals(parent.matrixWorld.clone().identity()), "the light's parent is the world frame").toBe(true);
    expect(light.target.parent).toBe(parent);
    const round = (vector: Vector3) => vector.toArray().map((value) => Math.round(value * 1e5) / 1e5 + 0);
    expect(round(light.position)).toEqual([3, 9, 4]);
    // The target one metre along the actor's -Z, in world space.
    const ahead = new Vector3(0, 0, -1).applyQuaternion(new Quaternion(...turned.r)).add(new Vector3(...turned.p));
    expect(round(light.target.position)).toEqual(round(ahead));
    world.dispose();
  });
});
