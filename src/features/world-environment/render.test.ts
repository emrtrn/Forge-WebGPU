// The environment bindings in a real world (no GPU; the Sky Light capture is
// a stub): sky, Sky Light, clouds, height fog, lights and the World
// Environment override drawn together. Rewrites of Forge WebGL's
// `authoredEnvironment.test.ts` (world environment binding, 9) and its sky,
// cloud, reflection and world settings checks in `tools/engine-tests.ts`
// (docs/PORT_LOG.md §2): the same behaviour, on components instead of layout
// actors and a shell.

import { describe, expect, test } from "vitest";
import { AmbientLight, Euler, MathUtils, Mesh, PerspectiveCamera, Texture, Vector3, type DirectionalLight, type Scene } from "three/webgpu";
import { createComponent, createSchemaRegistry, installFeatures, type ActorDoc, type ComponentDef, type FeatureDef, type Transform } from "../../core/index.ts";
import { actorId } from "../../core/level/testKit.ts";
import { directionFromAngles, evaluateSunLight, sunDirectionFromRotation } from "../../engine/environment/sunPath.ts";
import { resolveWorldEnvironment } from "../../engine/environment/worldEnvironment.ts";
import { resolveQualitySettings } from "../../engine/perf/qualityProfiles.ts";
import { createResourceCache } from "../../render/resources/resourceCache.ts";
import type { RenderBindingDef } from "../../render/sync/renderBinding.ts";
import { createRenderFeature, type RenderWorld } from "../../render/sync/renderWorld.ts";
import { createWorld } from "../../runtime/world.ts";
import cloudFeature from "../cloud-layer/feature.ts";
import { CloudLayer } from "../cloud-layer/schema.ts";
import cloudBinding from "../cloud-layer/render.ts";
import fogFeature from "../height-fog/feature.ts";
import { HeightFog } from "../height-fog/schema.ts";
import fogBinding from "../height-fog/render.ts";
import lightFeature from "../light/feature.ts";
import lightBinding from "../light/render.ts";
import postProcessFeature from "../post-process/feature.ts";
import { PostProcess } from "../post-process/schema.ts";
import skyFeature from "../sky/feature.ts";
import { SkyAtmosphere, SkyLight } from "../sky/schema.ts";
import skyBinding from "../sky/render.ts";
import environmentFeature from "./feature.ts";
import environmentBinding from "./render.ts";
import { WorldEnvironment } from "./schema.ts";

const IDENTITY: Transform = { p: [0, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1] };
const FEATURES: FeatureDef[] = [lightFeature, skyFeature, cloudFeature, fogFeature, environmentFeature, postProcessFeature];
const BINDINGS: RenderBindingDef[] = [cloudBinding, fogBinding, lightBinding, skyBinding, environmentBinding];
/** -90 degrees about X: the sun light's -Z points straight down. */
const SUN_TRANSFORM: Transform = { p: [0, 10, 0], r: [-Math.SQRT1_2, 0, 0, Math.SQRT1_2], s: [1, 1, 1] };

type Components = Record<string, Record<string, unknown>>;

function boot(actors: Record<string, Components>) {
  const registry = createSchemaRegistry();
  installFeatures(FEATURES, registry);
  const attached: RenderWorld[] = [];
  const captures: { size: number; disposed: boolean }[] = [];
  const camera = new PerspectiveCamera(44, 1, 0.1, 2000);
  camera.position.set(1, 2, 3);
  const render = createRenderFeature({
    cache: createResourceCache(),
    models: { load: async () => ({ scene: null as never, slots: [], slotMaterials: [] }) },
    bindings: BINDINGS,
    features: FEATURES,
    name: "environment",
    camera: () => camera,
    quality: () => resolveQualitySettings("high"),
    capture: {
      capture: (_scene, size) => {
        const entry = { size, disposed: false };
        captures.push(entry);
        return { texture: new Texture(), dispose: () => void (entry.disposed = true) };
      },
    },
    attach: (world) => attached.push(world),
  });
  const world = createWorld({ strict: true, registry, resolveClass: () => undefined, features: [...FEATURES, render] });
  world.init();
  let next = 0;
  const docs = (entries: Record<string, Components>): ActorDoc[] =>
    Object.entries(entries).map(([name, components]) => ({
      id: actorId(String(++next)),
      name,
      class: null,
      parent: null,
      spatiallyLoaded: false,
      transform: name === "Sun" ? SUN_TRANSFORM : IDENTITY,
      components: components as never,
    }));
  world.addActors(docs(actors), "level");
  world.beginPlay();
  world.tick(0.016);
  const out = attached[0]!;
  return {
    world,
    out,
    scene: out.scene,
    camera,
    captures,
    add: (entries: Record<string, Components>) => {
      const added = docs(entries);
      world.context.spawnActors(added as never);
      return added.map((actor) => actor.id);
    },
    remove: (ids: string[]) => world.context.destroyActors(ids as never),
    tick: () => world.tick(0.016),
  };
}

const find = <T>(scene: Scene, test: (object: unknown) => boolean): T[] => {
  const found: T[] = [];
  scene.traverse((object) => {
    if (test(object)) found.push(object as T);
  });
  return found;
};
const skyMesh = (scene: Scene) => scene.getObjectByName("sky-atmosphere") as (Mesh & { sunPosition: { value: Vector3 }; turbidity: { value: number }; userData: { night: { moon: Record<string, { value: number }>; stars: Record<string, { value: number }> } } }) | undefined;
const directional = (scene: Scene) => find<DirectionalLight>(scene, (object) => (object as DirectionalLight).isDirectionalLight === true);
const ambients = (scene: Scene) => find<AmbientLight>(scene, (object) => (object as AmbientLight).isAmbientLight === true);
const light = (data: Record<string, unknown> = {}) => ({
  light: { type: "forge.directionalLight@1", parent: null, local: IDENTITY, color: "#ffeedd", intensity: 3, castShadow: true, cascadedShadows: false, atmosphereSun: true, ...data },
});
/** A stored component: the schema's defaults under the given fields (a level is normalised on load). */
const stored = (def: ComponentDef, data: Record<string, unknown>) => {
  const base = createComponent(def) as unknown as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(data)) {
    const fallback = base[key];
    merged[key] = value && typeof value === "object" && fallback && typeof fallback === "object" ? { ...fallback, ...value } : value;
  }
  return merged;
};
const sky = (data: Record<string, unknown> = {}) => ({ sky: stored(SkyAtmosphere, data) });
const skyLight = (data: Record<string, unknown> = {}) => ({ skyLight: stored(SkyLight, data) });
const environment = (data: Record<string, unknown> = {}) => ({ environment: stored(WorldEnvironment, data) });
const post = (data: Record<string, unknown> = {}) => ({ post: stored(PostProcess, data) });
/** light -> target, unit. */
const aim = (sun: DirectionalLight): Vector3 => {
  const from = sun.getWorldPosition(new Vector3());
  return sun.target.getWorldPosition(new Vector3()).sub(from).normalize();
};
const near = (a: Vector3, b: readonly number[], digits = 5) => {
  expect(a.x).toBeCloseTo(b[0]!, digits);
  expect(a.y).toBeCloseTo(b[1]!, digits);
  expect(a.z).toBeCloseTo(b[2]!, digits);
};

describe("sky and Sky Light", () => {
  test("the sky follows the sun light's rotation; presented with ACES at its exposure x 0.2", () => {
    const { scene, out, camera, world } = boot({ Sun: light(), Sky: sky({ exposure: 2, turbidity: 3 }) });
    const mesh = skyMesh(scene)!;
    expect(mesh).toBeTruthy();
    near(mesh.sunPosition.value.clone().normalize(), [0, 1, 0]);
    expect(mesh.turbidity.value).toBe(3);
    expect(mesh.position.toArray()).toEqual(camera.position.toArray());
    expect(out.output).toMatchObject({ toneMapping: "aces", exposure: 0.4, skyRadiance: 1, postProcess: null });
    world.dispose();
  });

  // Rewritten from Forge tools/engine-tests.ts "post process tone mapping can override scene exposure
  // after sky" (25333): the Post Process's tone mapper and exposure x 0.2 present the frame over the
  // sky's; without one the sky's ACES comes back. The dome is drawn at the sky's own exposure against
  // the scene (user decision 2026-11-13).
  test("post process tone mapping can override scene exposure after sky", () => {
    const { scene, out, world, add, remove, tick } = boot({ Sun: light(), Sky: sky({ exposure: 0.4 }) });
    expect(out.output).toMatchObject({ toneMapping: "aces", skyRadiance: 1, postProcess: null });
    expect(out.output.exposure).toBeCloseTo(0.08);
    const [id] = add({ Post: post({ toneMapping: "neutral", exposure: 1.7, bloom: { enabled: true } }) });
    tick();
    expect(out.output.toneMapping).toBe("neutral");
    expect(out.output.exposure).toBeCloseTo(0.34);
    expect(out.output.skyRadiance).toBeCloseTo(0.4);
    expect((skyMesh(scene)!.userData as unknown as { radiance: { value: number } }).radiance.value).toBeCloseTo(0.4);
    expect(out.output.postProcess?.bloom.enabled).toBe(true);
    remove([id!]);
    tick();
    expect(out.output).toMatchObject({ toneMapping: "aces", skyRadiance: 1, postProcess: null });
    expect(out.output.exposure).toBeCloseTo(0.08);
    world.dispose();
  });

  test("the Post Process reaches the pipeline gated by the quality profile, the component unchanged", () => {
    const { out, world } = boot({ Post: post({ antialias: "smaa", ao: { enabled: true }, dof: { enabled: true } }) });
    // The harness runs on "high": SMAA, AO and DoF allowed.
    expect(out.output.postProcess).toMatchObject({ antialias: "smaa", ao: { enabled: true }, dof: { enabled: true } });
    expect(out.output.toneMapping).toBe("aces");
    expect(out.output.exposure).toBeCloseTo(0.2);
    world.dispose();
  });

  test("the default sun of a level without lights places the sun disc (Forge's -55 / 35 rotation)", () => {
    const { scene, world } = boot({ Sky: sky() });
    near(skyMesh(scene)!.sunPosition.value.clone().normalize(), sunDirectionFromRotation([-55, 35, 0]));
    world.dispose();
  });

  test("the Sky Light captures the sky once, recaptures when the scattering changes, and clears with the sky", () => {
    const { scene, captures, world, remove, tick, add } = boot({ Sun: light(), Sky: sky(), Light: skyLight({ intensity: 0.5 }) });
    expect(captures).toEqual([{ size: 256, disposed: false }]);
    expect(scene.environment).toBeTruthy();
    expect(scene.environmentIntensity).toBe(0.5);
    tick();
    expect(captures).toHaveLength(1);
    (world.context.componentsOf("forge.skyAtmosphere")[0]!.component as unknown as { rayleigh: number }).rayleigh = 3;
    tick();
    expect(captures).toHaveLength(2);
    expect(captures[0]!.disposed).toBe(true);
    // The sky goes: no dome, no environment, the capture freed, no tone mapping.
    remove([world.context.componentsOf("forge.skyAtmosphere")[0]!.actor.id]);
    tick();
    expect(skyMesh(scene)).toBeUndefined();
    expect(scene.environment).toBeNull();
    expect(captures[1]!.disposed).toBe(true);
    // A rebuilt sky captures again.
    add({ Sky: sky() });
    tick();
    expect(skyMesh(scene)).toBeTruthy();
    expect(captures).toHaveLength(3);
    world.dispose();
  });

  test("background and ambient light: Forge's defaults without a Sky Light; its colour and ambient with one; no residue", () => {
    const bare = boot({});
    expect((bare.scene.background as { getHexString(): string }).getHexString()).toBe("d7d7c7");
    expect(ambients(bare.scene)).toEqual([]);
    expect(bare.out.output).toMatchObject({ toneMapping: "none", exposure: 1, postProcess: null });
    const ids = bare.add({ Light: skyLight({ backgroundColor: "#a9c9df", ambientColor: "#ece6da", ambientIntensity: 1.1 }) });
    bare.tick();
    expect((bare.scene.background as { getHexString(): string }).getHexString()).toBe("a9c9df");
    const [ambient] = ambients(bare.scene);
    expect(ambient?.intensity).toBe(1.1);
    expect(ambient?.color.getHexString()).toBe("ece6da");
    bare.remove(ids);
    bare.tick();
    expect(ambients(bare.scene)).toEqual([]);
    expect((bare.scene.background as { getHexString(): string }).getHexString()).toBe("d7d7c7");
    // No sky: no capture even with a Sky Light.
    expect(bare.scene.environment).toBeNull();
    bare.world.dispose();
  });
});

describe("cloud layer", () => {
  test("pushes its settings onto the dome; follows the camera at 0.9 x far; goes with the actor", () => {
    const { scene, world, remove, tick, camera } = boot({ Clouds: { clouds: stored(CloudLayer, { coverage: 0.4, speed: 0.1 }) } });
    const dome = scene.getObjectByName("cloud-layer") as Mesh;
    expect(dome).toBeTruthy();
    expect(dome.position.toArray()).toEqual(camera.position.toArray());
    expect(dome.scale.x * 90).toBeCloseTo(1800);
    remove([world.context.componentsOf("forge.cloudLayer")[0]!.actor.id]);
    tick();
    expect(scene.getObjectByName("cloud-layer")).toBeUndefined();
    world.dispose();
  });
});

describe("world environment binding", () => {
  const env = resolveWorldEnvironment({ time: { hour: 12 } });

  test("no actor renders the authored look (ENV-00)", () => {
    const { scene, out, world } = boot({ Sun: light(), Sky: sky() });
    const [sun] = directional(scene);
    expect(sun!.color.getHexString()).toBe("ffeedd");
    expect(sun!.intensity).toBe(3);
    expect(sun!.shadow.intensity).toBe(1);
    expect(out.output.exposure).toBeCloseTo(0.2);
    expect(ambients(scene)).toEqual([]);
    expect(skyMesh(scene)!.userData.night.stars.brightness!.value).toBe(0);
    world.dispose();
  });

  test("the clock aims the sun's three light, never the component (§4.4)", () => {
    const { scene, world } = boot({ Sun: light(), Sky: sky(), Env: environment({ hour: 15, sunPath: { azimuthDeg: 90 } }) });
    const state = evaluateSunLight(15, resolveWorldEnvironment({ time: { hour: 15 }, sunPath: { azimuthDeg: 90 } }));
    const [sun] = directional(scene);
    near(aim(sun!), state.lightDirection.map((value) => -value));
    near(skyMesh(scene)!.sunPosition.value.clone().normalize(), state.sunDirection);
    // The component keeps its own values.
    const component = world.context.componentsOf("forge.directionalLight")[0]!.component as unknown as { intensity: number; color: string };
    expect(component).toMatchObject({ intensity: 3, color: "#ffeedd" });
    world.dispose();
  });

  test("night dims to the moon, raises exposure, keeps an ambient floor and lights the night fill", () => {
    const day = boot({ Sun: light(), Sky: sky(), Light: skyLight({ ambientIntensity: 1 }), Env: environment({ hour: 12 }) });
    const night = boot({ Sun: light(), Sky: sky(), Light: skyLight({ ambientIntensity: 1 }), Env: environment({ hour: 0 }) });
    const [daySun] = directional(day.scene);
    const [nightSun] = directional(night.scene);
    expect(nightSun!.intensity).toBeLessThan(daySun!.intensity);
    expect(nightSun!.intensity).toBeCloseTo(3 * env.night.moonIntensity);
    expect(nightSun!.shadow.intensity).toBeCloseTo(env.night.moonShadowStrength);
    expect(daySun!.shadow.intensity).toBe(1);
    expect(night.out.output.exposure).toBeGreaterThan(day.out.output.exposure);
    const authored = (scene: Scene) => ambients(scene).find((light) => light.name === "Sky Light Ambient")!;
    const fill = (scene: Scene) => ambients(scene).find((light) => light.name === "World Environment Night Fill")!;
    expect(authored(night.scene).intensity).toBeCloseTo(env.night.ambientFloor);
    expect(authored(day.scene).intensity).toBe(1);
    expect(fill(night.scene).intensity).toBeCloseTo(env.night.ambientIntensity);
    expect(fill(day.scene).intensity).toBe(0);
    day.world.dispose();
    night.world.dispose();
  });

  test("the visible moon and the stars follow the clock and clear when the environment goes; the authored sky stays", () => {
    const { scene, world, remove, tick } = boot({ Sun: light(), Sky: sky({ turbidity: 3 }), Env: environment({ hour: 0 }) });
    const night = skyMesh(scene)!.userData.night;
    expect(night.moon.brightness!.value).toBeGreaterThan(0);
    expect(night.stars.brightness!.value).toBeGreaterThan(0);
    remove([world.context.componentsOf("forge.worldEnvironment")[0]!.actor.id]);
    tick();
    expect(night.moon.brightness!.value).toBe(0);
    expect(night.stars.brightness!.value).toBe(0);
    expect(skyMesh(scene)!.turbidity.value).toBe(3);
    expect((world.context.componentsOf("forge.skyAtmosphere")[0]!.component as unknown as { turbidity: number }).turbidity).toBe(3);
    world.dispose();
  });

  test("night fill works without authored lights (the default sun is driven), keeps one light and leaves no residue", () => {
    const { scene, world, remove, tick } = boot({ Env: environment({ hour: 0 }) });
    const [sun] = directional(scene);
    expect(sun!.name).toBe("Default Sun");
    expect(sun!.intensity).toBeCloseTo(2 * env.night.moonIntensity);
    tick();
    tick();
    expect(ambients(scene).filter((light) => light.name === "World Environment Night Fill")).toHaveLength(1);
    remove([world.context.componentsOf("forge.worldEnvironment")[0]!.actor.id]);
    tick();
    expect(ambients(scene)).toEqual([]);
    expect(sun!.intensity).toBe(2);
    near(aim(sun!), sunDirectionFromRotation([-55, 35, 0]).map((value) => -value));
    world.dispose();
  });

  test("a component edit while active becomes the new base", () => {
    const { scene, world, tick } = boot({ Sun: light(), Env: environment({ hour: 12 }) });
    const [sun] = directional(scene);
    const before = sun!.intensity;
    (world.context.componentsOf("forge.directionalLight")[0]!.component as unknown as { intensity: number }).intensity = 6;
    tick();
    expect(sun!.intensity).toBeCloseTo(before * 2);
    world.dispose();
  });

  test("ending the override restores every value it changed", () => {
    const { scene, out, world, remove, tick } = boot({
      Sun: light(), Sky: sky(), Light: skyLight({ ambientIntensity: 1 }),
      Fog: { fog: stored(HeightFog, { density: 0.01 }) }, Env: environment({ hour: 6.5, weather: { preset: "fog", intensity: 1 } }),
    });
    const [sun] = directional(scene);
    expect(sun!.color.getHexString()).not.toBe("ffeedd");
    remove([world.context.componentsOf("forge.worldEnvironment")[0]!.actor.id]);
    tick();
    expect(sun!.color.getHexString()).toBe("ffeedd");
    expect(sun!.intensity).toBe(3);
    expect(sun!.shadow.intensity).toBe(1);
    near(aim(sun!), [0, -1, 0]);
    expect(out.output.exposure).toBeCloseTo(0.2);
    expect(skyMesh(scene)!.turbidity.value).toBe(10);
    expect(ambients(scene).map((light) => [light.name, light.intensity])).toEqual([["Sky Light Ambient", 1]]);
    world.dispose();
  });

  test("the three-free sun rotation matches three.js (Forge's worldEnvironment.test sun path check)", () => {
    for (const rotation of [[-55, 35, 0], [-48, 35, 0], [10, -120, 30], [-90, 0, 0]] as [number, number, number][]) {
      const three = new Vector3(0, 0, -1).applyEuler(new Euler(...rotation.map((deg) => MathUtils.degToRad(deg)) as [number, number, number], "XYZ")).negate();
      near(new Vector3(...sunDirectionFromRotation(rotation)), three.toArray(), 9);
    }
    near(new Vector3(...directionFromAngles(180, 60)), [0, Math.sin(Math.PI / 3), -0.5], 9);
  });
});
