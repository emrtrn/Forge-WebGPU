// The `forge.render` subsystem (architecture §4.7, §4.9): the render host
// installs one into every world it draws. It owns the world's scene, runs the
// collected render bindings of the features the world installed (batched
// `actorsAdded` / `actorsRemoved`, `sync` each frame in `renderSync`) and
// counts the world's resources in the host's cache. Disposing the world
// releases those counts and nothing else: another world's resources stay.
//
// An edit in the editor (`actorsChanged`) reaches each binding through its
// own hook, or as removed (the previous actors) + added without one.
//
// Each frame, before the bindings: the World Environment override is
// resolved (environment.ts), then the default sun is drawn with it and the
// output transform (tone mapping, exposure, the gated Post Process) is
// resolved (output.ts).
//
// A headless boot (Node, check:projects) installs no such subsystem, so the
// world runs without render.

import { Group, Scene, Vector3, type Camera, type Object3D } from "three/webgpu";
import type { QualitySettings } from "../../engine/perf/qualityProfiles.ts";
import { defineFeature, defineSubsystem, LevelSettingsKey, type FeatureDef, type LevelSettings, type SubsystemContext } from "../../core/index.ts";
import type { ResourceCache } from "../resources/resourceCache.ts";
import type { SurfaceMaterials } from "../resources/surfaceMaterials.ts";
import type { TerrainSource } from "../resources/terrains.ts";
import type { TextureSource } from "../resources/textures.ts";
import { createWorldResources, type JsonAssetSource, type ModelSource, type WorldResources } from "../resources/worldResources.ts";
import type { CameraViews, GpuDrivenBatches } from "../gpu/gpuDriven.ts";
import type { StaticPath } from "../triangles/staticPath.ts";
import type { TriangleDrawing } from "../triangles/triangleDrawing.ts";
import { createDefaultLighting } from "./defaultLighting.ts";
import { createZoneDrawing, type ZoneDrawing } from "./zoneDrawing.ts";
import { createHlodProxies, type HlodProxies } from "./hlodProxies.ts";
import { HlodSourceKey } from "../../engine/world/hlod.ts";
import { PortalSidesKey } from "../../engine/world/zones.ts";
import { RenderReadinessKey } from "../../engine/world/renderReadiness.ts";
import { createEnvironmentOverride } from "./environment.ts";
import { createOutputState } from "./output.ts";
import { sceneShadowQuality, sceneShadowsEnabled } from "./sceneShadows.ts";
import type { EnvironmentCapture, RenderBindingDef, RenderBindingInstance, RenderOutput, RenderWorldView } from "./renderBinding.ts";
import type { ZoneBox } from "../../engine/world/zones.ts";

export const RENDER_FEATURE_ID = "forge.render";

/** A world as the host draws it. */
export interface RenderWorld {
  readonly name: string;
  readonly scene: Scene;
  readonly root: Group;
  readonly resources: WorldResources;
  /** The output transform the frame is presented with, resolved each frame. */
  readonly output: RenderOutput;
  /** Absent in older host adapters means on. This world's authored scene gate. */
  readonly shadowsEnabled?: boolean;
  /** The level's settings now (view distance, load range); absent before a level is assembled. */
  readonly levelSettings?: () => LevelSettings | undefined;
  /** Its zones (plan 5c R9b): the host updates them once a frame, before the cull. */
  readonly zones?: ZoneDrawing;
}

export interface RenderFeatureOptions {
  readonly buildingStreaming?: boolean;
  readonly modelBounds?: (guid: string) => ZoneBox | null;
  readonly prepare?: (objects: readonly Object3D[], scene: Scene, signal?: AbortSignal) => Promise<void>;
  /** The GPU-driven automatic LOD drawing static batches may take (R9.4). */
  readonly triangles?: TriangleDrawing;
  readonly staticPath?: () => StaticPath;
  readonly staticCellSize?: () => number;
  /** Cameras that draw the scene register their GPU-driven views here (R9a step 1). */
  readonly cameraViews?: CameraViews;
  /** GPU-driven batches (foliage, plan 5c F1); absent in tests that draw none. */
  readonly gpuDriven?: GpuDrivenBatches;
  readonly cache: ResourceCache;
  readonly models: ModelSource;
  /** `forge.material` assets; absent in tests that draw none. */
  readonly materials?: SurfaceMaterials;
  /** `forge.terrain` data; absent in tests that draw none. */
  readonly terrains?: TerrainSource;
  readonly textures?: TextureSource;
  /** JSON asset documents (`forge.foliageType`); absent in tests that read none. */
  readonly jsonAssets?: JsonAssetSource;
  readonly bindings: readonly RenderBindingDef[];
  /** The world's features: a binding runs only when its feature is installed. */
  readonly features: readonly FeatureDef[];
  /** For messages and the cache owner. */
  readonly name: string;
  /** The camera frames are drawn with (follow shadows, cascades). */
  readonly camera: () => Camera | null;
  /** The effective quality settings now. */
  readonly quality: () => QualitySettings;
  /** The quality profile's view distance multiplier now (HLOD layer switch, plan 5c R8.3); 1 when absent. */
  readonly viewDistanceMultiplier?: () => number;
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
    // The editor's viewport draws with it too (plan phase 4).
    inEditor: true,
    create(ctx: SubsystemContext) {
      const scene = new Scene();
      const root = new Group();
      root.name = "actors";
      scene.add(root);
      const resources = createWorldResources(options.cache, options.name, options.models, options.materials ?? null, options.terrains ?? null, options.textures ?? null, options.jsonAssets ?? null);
      const view: RenderWorldView = {
        services: ctx.services,
        actor: (id) => ctx.actor(id),
        componentsOf: (type) => ctx.componentsOf(type),
      };
      const lighting = createDefaultLighting(scene, view);
      const environment = createEnvironmentOverride(view, lighting);
      const outputState = createOutputState(view);
      const output = outputState.output;
      const effectiveQuality = sceneShadowQuality(view, options.quality);
      const zones = createZoneDrawing(view, options.buildingStreaming ? options.viewDistanceMultiplier ?? (() => 1) : undefined);
      const cameraPosition = new Vector3();
      ctx.services.provide(PortalSidesKey, zones);
      const instances: RenderBindingInstance[] = bindings.map((binding) =>
        binding.create({
          world: view, scene, root, resources, lighting, environment: environment.environment, output,
          capture: options.capture ?? null, quality: effectiveQuality,
          ...(options.prepare ? { prepare: (objects: readonly Object3D[], signal?: AbortSignal) => resources.track(options.prepare!(objects, scene, signal)) } : {}),
          ...(options.triangles ? { triangles: options.triangles } : {}),
          ...(options.staticPath ? { staticPath: options.staticPath } : {}),
          ...(options.cameraViews ? { cameraViews: options.cameraViews } : {}),
          ...(options.gpuDriven ? { gpuDriven: options.gpuDriven } : {}),
          ...(options.staticCellSize ? { staticCellSize: options.staticCellSize } : {}),
          ...(options.modelBounds ? { modelBounds: options.modelBounds } : {}),
          zones,
        }),
      );
      const readiness = instances.filter((instance) => instance.isActorReady !== undefined);
      ctx.services.provide(RenderReadinessKey, { isActorReady: (id) => readiness.every((instance) => instance.isActorReady!(id)) });
      const world: RenderWorld = {
        name: options.name, scene, root, resources, output,
        get shadowsEnabled() { return sceneShadowsEnabled(view); },
        levelSettings: () => ctx.services.get(LevelSettingsKey)?.current,
        zones,
      };
      options.attach?.(world);
      // HLOD proxies (phase 5b): the level's source is provided once the world is assembled.
      let hlod: HlodProxies | null = null;
      let hlodRevision: number | undefined;
      const hlodRoot = new Group();
      hlodRoot.name = "hlod";
      scene.add(hlodRoot);
      return {
        actorsAdded(actors) {
          lighting.refresh();
          zones.refresh(actors);
          for (const instance of instances) instance.actorsAdded?.(actors);
        },
        actorsRemoved(actors) {
          lighting.refresh();
          zones.refresh(actors);
          for (const instance of instances) instance.actorsRemoved?.(actors);
        },
        actorsChanged(changes) {
          lighting.refresh();
          const previous = changes.map((change) => change.previous);
          const actors = changes.map((change) => change.actor);
          zones.refresh([...previous, ...actors]);
          for (const instance of instances) {
            if (instance.actorsChanged) instance.actorsChanged(changes);
            else {
              instance.actorsRemoved?.(previous);
              instance.actorsAdded?.(actors);
            }
          }
        },
        tick(_group, dt) {
          const frame = { dt, camera: options.camera() };
          if (zones.residency && frame.camera) {
            frame.camera.getWorldPosition(cameraPosition);
            zones.residency.update([cameraPosition.x, cameraPosition.y, cameraPosition.z]);
          }
          environment.update();
          lighting.sync(frame.camera, effectiveQuality(), environment.environment.override);
          outputState.update(environment.environment.override, options.quality());
          for (const instance of instances) instance.sync?.(frame);
          const source = ctx.services.get(HlodSourceKey);
          if (hlod !== null && source?.revision !== hlodRevision) { hlod.dispose(); hlod = null; }
          if (hlod === null) {
            if (source) hlod = createHlodProxies(source, hlodRoot, (work) => resources.track(work));
            hlodRevision = source?.revision;
          }
          hlod?.sync(frame.camera, ctx.services.get(LevelSettingsKey)?.current, options.viewDistanceMultiplier?.() ?? 1);
        },
        dispose() {
          hlod?.dispose();
          hlod = null;
          for (const instance of [...instances].reverse()) instance.dispose?.();
          instances.length = 0;
          readiness.length = 0;
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
