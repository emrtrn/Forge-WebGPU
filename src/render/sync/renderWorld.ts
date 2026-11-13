// The `forge.render` subsystem (architecture §4.7, §4.9): the render host
// installs one into every world it draws. It owns the world's scene, runs the
// collected render bindings of the features the world installed (batched
// `actorsAdded` / `actorsRemoved`, `sync` each frame in `renderSync`) and
// counts the world's resources in the host's cache. Disposing the world
// releases those counts and nothing else: another world's resources stay.
//
// Each frame, before the bindings: the World Environment override is
// resolved (environment.ts), then the default sun is drawn with it.
//
// A headless boot (Node, check:projects) installs no such subsystem, so the
// world runs without render.

import { Group, Scene, type Camera } from "three/webgpu";
import type { QualitySettings } from "../../engine/perf/qualityProfiles.ts";
import { defineFeature, defineSubsystem, type FeatureDef, type SubsystemContext } from "../../core/index.ts";
import type { ResourceCache } from "../resources/resourceCache.ts";
import type { SurfaceMaterials } from "../resources/surfaceMaterials.ts";
import { createWorldResources, type ModelSource, type WorldResources } from "../resources/worldResources.ts";
import { createDefaultLighting } from "./defaultLighting.ts";
import { createEnvironmentOverride } from "./environment.ts";
import type { EnvironmentCapture, RenderBindingDef, RenderBindingInstance, RenderOutput, RenderWorldView } from "./renderBinding.ts";

export const RENDER_FEATURE_ID = "forge.render";

/** A world as the host draws it. */
export interface RenderWorld {
  readonly name: string;
  readonly scene: Scene;
  readonly root: Group;
  readonly resources: WorldResources;
  /** Tone mapping and exposure the frame is presented with (the sky sets them). */
  readonly output: RenderOutput;
}

export interface RenderFeatureOptions {
  readonly cache: ResourceCache;
  readonly models: ModelSource;
  /** `forge.material` assets; absent in tests that draw none. */
  readonly materials?: SurfaceMaterials;
  readonly bindings: readonly RenderBindingDef[];
  /** The world's features: a binding runs only when its feature is installed. */
  readonly features: readonly FeatureDef[];
  /** For messages and the cache owner. */
  readonly name: string;
  /** The camera frames are drawn with (follow shadows, cascades). */
  readonly camera: () => Camera | null;
  /** The effective quality settings now. */
  readonly quality: () => QualitySettings;
  /** The Sky Light capture; absent where there is no GPU (tests). */
  readonly capture?: EnvironmentCapture;
  /** The world's scene exists (the host presents it). */
  readonly attach?: (world: RenderWorld) => void;
  /** The world is going away. */
  readonly detach?: (world: RenderWorld) => void;
}

export function createRenderFeature(options: RenderFeatureOptions): FeatureDef {
  const installed = new Set(options.features.map((feature) => feature.id));
  const bindings = options.bindings.filter((binding) => installed.has(binding.feature));
  const subsystem = defineSubsystem({
    id: RENDER_FEATURE_ID,
    tickGroups: ["renderSync"],
    create(ctx: SubsystemContext) {
      const scene = new Scene();
      const root = new Group();
      root.name = "actors";
      scene.add(root);
      const resources = createWorldResources(options.cache, options.name, options.models, options.materials ?? null);
      const view: RenderWorldView = {
        services: ctx.services,
        actor: (id) => ctx.actor(id),
        componentsOf: (type) => ctx.componentsOf(type),
      };
      const lighting = createDefaultLighting(scene, view);
      const environment = createEnvironmentOverride(view, lighting);
      const output: RenderOutput = { toneMapping: "none", exposure: 1 };
      const instances: RenderBindingInstance[] = bindings.map((binding) =>
        binding.create({
          world: view, scene, root, resources, lighting, environment: environment.environment, output,
          capture: options.capture ?? null, quality: options.quality,
        }),
      );
      const world: RenderWorld = { name: options.name, scene, root, resources, output };
      options.attach?.(world);
      return {
        actorsAdded(actors) {
          lighting.refresh();
          for (const instance of instances) instance.actorsAdded?.(actors);
        },
        actorsRemoved(actors) {
          lighting.refresh();
          for (const instance of instances) instance.actorsRemoved?.(actors);
        },
        tick(_group, dt) {
          const frame = { dt, camera: options.camera() };
          environment.update();
          lighting.sync(frame.camera, options.quality(), environment.environment.override);
          for (const instance of instances) instance.sync?.(frame);
        },
        dispose() {
          for (const instance of [...instances].reverse()) instance.dispose?.();
          instances.length = 0;
          lighting.dispose();
          resources.releaseAll();
          options.detach?.(world);
          root.clear();
          scene.clear();
        },
      };
    },
  });
  return defineFeature({ id: RENDER_FEATURE_ID, subsystems: [subsystem] });
}
