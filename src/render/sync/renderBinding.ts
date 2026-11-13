// Render bindings (architecture §4.3, §4.9; phase 3 decision 2).
//
// A feature draws through its own `features/<name>/render.ts`, which
// default-exports `defineRenderBinding({ feature, create })`. The binding is
// its own registration unit, like the editor part: `feature.ts` never names
// it (a layer rule), so Node tools and a headless boot load features without
// three. The application entry collects `features/*/render.ts` and hands
// them to the render host, which runs them inside each world's `forge.render`
// subsystem.
//
// Gameplay code never touches three objects: a binding watches components.
// Components that come in numbers (static mesh, shape) are built on
// `actorsAdded` / `actorsRemoved`, in batches (F11); singletons (fog) are
// compared every frame in `sync`. Notification of field and transform edits
// comes with the editor (phase 4).

import type { Camera, Group, Scene, Texture, Vector3 } from "three/webgpu";
import type { ResolvedEnvironment } from "../../engine/environment/environmentResolve.ts";
import type { QualitySettings } from "../../engine/perf/qualityProfiles.ts";
import { COMPONENT_NAME_PATTERN, SchemaDefinitionError, type ActorId, type ComponentEntry, type Services, type WorldActor } from "../../core/index.ts";
import type { FrameOutput } from "../pipeline/output.ts";
import type { WorldResources } from "../resources/worldResources.ts";

/** What a binding sees of its world: read only. */
export interface RenderWorldView {
  readonly services: Services;
  actor(id: ActorId): WorldActor | undefined;
  /** Every component of a type (by name, e.g. `forge.shape`), in actor order. */
  componentsOf(type: string): ComponentEntry[];
}

/** The lights other bindings read (fog's sun tint, the sky, the Sky Light capture). */
export interface RenderLighting {
  /**
   * Ground -> sun, unit length. One shared vector: the default sun writes it
   * while it shows, the light binding writes its `atmosphereSun` light's; while
   * a World Environment is active, its true sun (below the horizon at night).
   */
  readonly sunDirection: Vector3;
}

/**
 * The World Environment's reading of the authored look this frame (Forge's
 * WES override, engine/environment/environmentResolve.ts): the sun light,
 * sky haze, moon, stars, fog, clouds, ambient and exposure it changes. Worked
 * out once per frame before any binding syncs; null renders what is authored.
 * The components are never written.
 */
export interface RenderEnvironment {
  readonly override: ResolvedEnvironment | null;
}

/**
 * The world's output transform this frame (render/sync/output.ts): tone
 * mapping, exposure, the sky dome's radiance and the quality-gated Post
 * Process, resolved before the bindings sync. Read only.
 */
export type RenderOutput = FrameOutput;

/** A prefiltered environment map (PMREM) the caller owns. */
export interface CapturedEnvironment {
  readonly texture: Texture;
  /**
   * Renders a scene into the same map again. The texture object stays, so
   * the materials that sample it keep their environment node: a new texture
   * on every capture rebuilt them (plan phase 3 step 7 measurement).
   */
  recapture(scene: Scene): void;
  dispose(): void;
}

/** Renders a scene seen from its origin into a PMREM (the Sky Light capture). */
export interface EnvironmentCapture {
  capture(scene: Scene, size: number): CapturedEnvironment;
}

export interface RenderBindingContext {
  readonly world: RenderWorldView;
  /** This world's scene: singletons set fog, background and environment here. */
  readonly scene: Scene;
  /** Parent of the objects a binding adds for actors. */
  readonly root: Group;
  /** The host's resource cache, counted for this world. */
  readonly resources: WorldResources;
  readonly lighting: RenderLighting;
  readonly environment: RenderEnvironment;
  /** The output transform this frame; the sky reads its dome radiance here. */
  readonly output: RenderOutput;
  /** Null where there is no GPU (tests). */
  readonly capture: EnvironmentCapture | null;
  /** The effective quality settings now (profile and adaptive reductions). */
  quality(): QualitySettings;
}

export interface RenderFrame {
  /** Seconds since the last frame, as the world ticked it. */
  readonly dt: number;
  /** The camera the frame is drawn with; null before one is set. */
  readonly camera: Camera | null;
}

export interface RenderBindingInstance {
  actorsAdded?(actors: readonly WorldActor[]): void;
  actorsRemoved?(actors: readonly WorldActor[]): void;
  /** Once per frame, in the world's `renderSync` group. */
  sync?(frame: RenderFrame): void;
  dispose?(): void;
}

export interface RenderBindingDef {
  readonly kind: "renderBinding";
  /** The feature this binding draws; it runs only in worlds that install that feature. */
  readonly feature: string;
  readonly create: (ctx: RenderBindingContext) => RenderBindingInstance;
}

export function defineRenderBinding(definition: {
  readonly feature: string;
  readonly create: (ctx: RenderBindingContext) => RenderBindingInstance;
}): RenderBindingDef {
  if (!COMPONENT_NAME_PATTERN.test(definition.feature)) {
    throw new SchemaDefinitionError(`defineRenderBinding: "${definition.feature}" must be a feature id such as "forge.heightFog".`);
  }
  return Object.freeze({ kind: "renderBinding", feature: definition.feature, create: definition.create });
}
