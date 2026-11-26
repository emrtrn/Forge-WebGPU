// The frame pipeline (plan phase 3 step 6, architecture §4.9): one three
// `RenderPipeline` over an MRT scene pass, built from a plan
// (pipelinePlan.ts) and rebuilt only when the plan's key, the scene or the
// camera changes; authored numbers (bloom strength, grading, ...) are
// uniforms written every frame. Forge WebGL's composer passes are rewritten
// as three's TSL nodes (GTAO, SSGI, SSR, TRAA, SMAA, depth of field, bloom,
// RGB shift, film) and two TSL functions (Forge's grading and vignette
// shaders); the three addons are used only here.
//
// The output transform is the renderer's: tone mapping and exposure from the
// frame's output (output.ts), applied by the render pipeline's last step, or
// by the renderer itself when a plan has no pass and the scene is drawn
// straight to the canvas (with the renderer's MSAA, as Forge drew a level
// without effect passes). The late layer (lateLayer.ts: rain, snow) is drawn in
// its own pass over the anti-aliased colour; while it has nothing to draw, its
// pass is skipped and its cleared target composited. The scene pass has no MSAA: its depth, normal and
// velocity feed the screen-space passes, and anti-aliasing is TRAA / SMAA.
//
// Forge's mapping of its 1-based authored values onto its passes is kept
// where three's node is the same algorithm (bloom: UnrealBloom, x 0.001;
// RGB shift x 0.01; GTAO radius x 0.1, `intensity` blends the occlusion in).
// Depth of field is a different model in three (circle of confusion, not
// Bokeh): focus is the same distance, the distance to full blur is Forge's
// `maxBlur / aperture` ratio and the bokeh scale is `maxBlur`.

import {
  ACESFilmicToneMapping,
  Color,
  HalfFloatType,
  Matrix4,
  NeutralToneMapping,
  NoToneMapping,
  PerspectiveCamera,
  RenderPipeline,
  RGFormat,
  UnsignedByteType,
  type Camera,
  type Object3D,
  type Node,
  type Scene,
  type Texture,
  type ToneMapping,
  type UniformNode,
  type WebGPURenderer,
} from "three/webgpu";
import {
  EnvironmentBRDF,
  diffuseColor,
  dot,
  float,
  getViewPosition,
  luminance,
  max,
  mix,
  mrt,
  normalView,
  output,
  packNormalToRGB,
  pass,
  pmremTexture,
  positionViewDirection,
  reflect,
  roughness,
  sample,
  screenUV,
  smoothstep,
  specularColorBlended,
  specularF90,
  uniform,
  unpackRGBToNormal,
  vec2,
  vec3,
  vec4,
  velocity,
} from "three/tsl";
import { bloom, type default as BloomNode } from "three/examples/jsm/tsl/display/BloomNode.js";
import { dof } from "three/examples/jsm/tsl/display/DepthOfFieldNode.js";
import { film } from "three/examples/jsm/tsl/display/FilmNode.js";
import { ao, type default as GTAONode } from "three/examples/jsm/tsl/display/GTAONode.js";
import { rgbShift } from "three/examples/jsm/tsl/display/RGBShiftNode.js";
import { smaa } from "three/examples/jsm/tsl/display/SMAANode.js";
import { ssgi, type default as SSGINode } from "three/examples/jsm/tsl/display/SSGINode.js";
import { ssr } from "three/examples/jsm/tsl/display/SSRNode.js";
import { traa } from "three/examples/jsm/tsl/display/TRAANode.js";
import type { LateLayer } from "./lateLayer.ts";
import type { FrameOutput, OutputToneMapping, PostProcessSettings } from "./output.ts";
import { planPipeline, type PipelinePlan } from "./pipelinePlan.ts";
import type { QualitySettings } from "../../engine/perf/qualityProfiles.ts";

/** Forge's `BLOOM_INTENSITY_SCALE`: the authored 1 is UnrealBloom strength 0.001 (the sun disc's HDR radiance). */
export const BLOOM_INTENSITY_SCALE = 0.001;
/** Forge's `CHROMATIC_ABERRATION_AMOUNT_SCALE`: the authored 0.5 is the RGB shift's default 0.005. */
export const CHROMATIC_ABERRATION_AMOUNT_SCALE = 0.01;
/** Forge's `AO_RADIUS_SCALE`: the authored 1 is a 0.1 m sample radius (contact shadow scale). */
export const AO_RADIUS_SCALE = 0.1;
/** Forge's Bokeh scales; their ratio is the distance to full blur per unit of `maxBlur / aperture`. */
const DOF_APERTURE_SCALE = 0.0002;
const DOF_MAXBLUR_SCALE = 0.01;
/** SSR settings of the phase 1 measurement (spike S3). */
const SSR_SETTINGS = { quality: 0.5, maxDistance: 50, thickness: 0.5, blurQuality: 2 } as const;
/** The Post Process `ssr` group's defaults (schema), for data written before it. */
export const SSR_DEFAULTS = { maxRoughness: 0.6, intensity: 1 } as const;
/** SSR fades out over the last 30 % of `maxRoughness`. */
const SSR_ROUGHNESS_FADE = 0.7;
/** Floor of the SSR node's built-in grazing term in the weight's division (head-on views). */
const SSR_MIN_GRAZING = 0.05;
/** World distance (m) over which a blurred hit's alpha reaches full coverage. */
const SSR_HIT_EDGE = 0.05;

/**
 * The SSR weight the scene pass writes (`specular` R; plan decision
 * 2026-11-26). three's mirror SSR weighs a hit by its metalness channel and
 * the grazing term 1 - (N.V)^2, so only metals reflected. The channel carries
 * the material's own specular reflectance instead: three's split-sum
 * environment BRDF of its F0 / F90 (IOR, specular intensity and metalness
 * included; zero on unlit materials) at its roughness, divided by that
 * grazing term, faded out towards `maxRoughness`. Every lit material then
 * reflects by its roughness and Fresnel.
 */
function ssrWeight(maxRoughness: Node<"float">): F {
  const nDotV = dot(normalView, positionViewDirection).clamp(1e-4, 1);
  const reflectance = luminance(EnvironmentBRDF({ dotNV: nDotV, specularColor: specularColorBlended, specularF90, roughness }));
  const grazing = max(float(1).sub(nDotV.mul(nDotV)), SSR_MIN_GRAZING);
  const fade = float(1).sub(smoothstep(maxRoughness.mul(SSR_ROUGHNESS_FADE), maxRoughness, roughness));
  return reflectance.div(grazing).min(1).mul(fade) as F;
}
/** SSGI's medium preset of the phase 1 measurement (spike S3). */
const SSGI_SETTINGS = { sliceCount: 2, stepCount: 8 } as const;

const TONE_MAPPINGS: Record<OutputToneMapping, ToneMapping> = {
  none: NoToneMapping,
  aces: ACESFilmicToneMapping,
  neutral: NeutralToneMapping,
};

/** Distance from the focus at which three's depth of field reaches full blur, from Forge's Bokeh terms. */
export function dofFocalLength(aperture: number, maxBlur: number): number {
  const apertureScaled = aperture * DOF_APERTURE_SCALE;
  if (!(apertureScaled > 0)) return 1e6;
  return Math.max(1e-3, (Math.max(0, maxBlur) * DOF_MAXBLUR_SCALE) / apertureScaled);
}

type F = Node<"float">;
type V3 = Node<"vec3">;
type V4 = Node<"vec4">;

interface Uniforms {
  readonly aoIntensity: UniformNode<"float">;
  readonly focus: UniformNode<"float">;
  readonly focalLength: UniformNode<"float">;
  readonly bokehScale: UniformNode<"float">;
  readonly saturation: UniformNode<"float">;
  readonly contrast: UniformNode<"float">;
  readonly temperature: UniformNode<"float">;
  readonly tint: UniformNode<"float">;
  readonly caAmount: UniformNode<"float">;
  readonly vignetteIntensity: UniformNode<"float">;
  readonly vignetteOffset: UniformNode<"float">;
  readonly grain: UniformNode<"float">;
}

interface Built {
  readonly scenePass: ReturnType<typeof pass>;
  readonly key: string;
  readonly scene: Scene;
  readonly camera: Camera;
  readonly late: LateLayer | null;
  readonly latePass: ReturnType<typeof pass> | null;
  readonly pipeline: RenderPipeline;
  readonly plan: PipelinePlan;
  /** The scene pass's depth (single sample, the jittered camera's when TRAA runs). */
  readonly depth: Texture | null;
  /** The environment the SSR composite was built for (null without SSR or a Sky Light). */
  readonly environment: Texture | null;
  update(post: PostProcessSettings): void;
  dispose(): void;
}

/** Forge's colour grading shader: white balance, contrast around mid grey, saturation by Rec. 601 luma. */
function grade(rgb: V3, u: Uniforms): V3 {
  const balanced = rgb.add(vec3(u.temperature.mul(0.1), u.tint.mul(-0.1), u.temperature.mul(-0.1))) as V3;
  const contrasted = balanced.sub(0.5).mul(u.contrast).add(0.5) as V3;
  const luma = dot(contrasted, vec3(0.299, 0.587, 0.114));
  return mix(vec3(luma), contrasted, u.saturation) as V3;
}

/** three's VignetteShader: towards 1 - darkness by the squared distance from the centre, scaled by the offset. */
function vignette(rgb: V3, u: Uniforms): V3 {
  const centred = screenUV.sub(0.5).mul(u.vignetteOffset);
  return mix(rgb, vec3(float(1).sub(u.vignetteIntensity)), dot(centred, centred)) as V3;
}

/** The late layer's pass: transparent clear; not drawn while the layer is empty (once more, to clear it). */
function createLatePass(late: LateLayer, camera: Camera): ReturnType<typeof pass> {
  const latePass = pass(late.scene, camera, { samples: 0 });
  const draw = latePass.updateBefore.bind(latePass) as unknown as (frame: { renderer: WebGPURenderer }) => void;
  const clearColor = new Color();
  let drawn = false;
  (latePass as unknown as { updateBefore: (frame: { renderer: WebGPURenderer }) => void }).updateBefore = (frame) => {
    const active = late.active;
    if (!active && !drawn) return;
    drawn = active;
    const { renderer } = frame;
    renderer.getClearColor(clearColor);
    const alpha = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 0);
    draw(frame);
    renderer.setClearColor(clearColor, alpha);
  };
  return latePass;
}

function build(renderer: WebGPURenderer, scene: Scene, camera: Camera, plan: PipelinePlan, late: LateLayer | null): Built {
  const disposables: { dispose(): void }[] = [];
  const has = (name: string): boolean => plan.passes.includes(name as PipelinePlan["passes"][number]);
  const u: Uniforms = {
    aoIntensity: uniform(1),
    focus: uniform(10),
    focalLength: uniform(1),
    bokehScale: uniform(1),
    saturation: uniform(1),
    contrast: uniform(1),
    temperature: uniform(0),
    tint: uniform(0),
    caAmount: uniform(0.005),
    vignetteIntensity: uniform(0.35),
    vignetteOffset: uniform(1),
    grain: uniform(0.5),
  };

  const scenePass = pass(scene, camera, { samples: 0 });
  disposables.push(scenePass);
  const targets = new Set(plan.mrt.map((target) => target.name));
  const outputs: Record<string, Node> = { output };
  if (targets.has("normal")) outputs.normal = packNormalToRGB(normalView);
  if (targets.has("velocity")) outputs.velocity = velocity;
  const ssrMaxRoughness = uniform(SSR_DEFAULTS.maxRoughness);
  const ssrIntensity = uniform(SSR_DEFAULTS.intensity);
  /** The Sky Light's PMREM SSR replaces; a change of it rebuilds the pipeline (`render`). */
  const environment = has("ssr") ? scene.environment : null;
  const ssrCamera = { projectionInverse: uniform(new Matrix4()), world: uniform(new Matrix4()), environmentIntensity: uniform(1) };
  if (targets.has("specular")) outputs.specular = vec2(ssrWeight(ssrMaxRoughness), roughness);
  if (targets.has("diffuse")) outputs.diffuse = diffuseColor;
  scenePass.setMRT(mrt(outputs));
  if (targets.has("normal")) scenePass.getTexture("normal").type = UnsignedByteType;
  if (targets.has("velocity")) {
    const texture = scenePass.getTexture("velocity");
    texture.type = HalfFloatType;
    texture.format = RGFormat;
  }
  if (targets.has("specular")) {
    const texture = scenePass.getTexture("specular");
    texture.type = UnsignedByteType;
    texture.format = RGFormat;
  }
  if (targets.has("diffuse")) scenePass.getTexture("diffuse").type = UnsignedByteType;

  const color = scenePass.getTextureNode("output");
  const depth = scenePass.getTextureNode("depth");
  const normal = targets.has("normal")
    ? (sample((uv: Node<"vec2">) => unpackRGBToNormal(scenePass.getTextureNode("normal").sample(uv).xyz)) as unknown as V3)
    : null;

  let rgb = color.rgb as V3;
  let gtao: GTAONode | null = null;
  let gi: SSGINode | null = null;
  const traaOn = has("traa");
  const ssgiOn = has("ssgi") && camera instanceof PerspectiveCamera;

  if ((has("gtao") || (has("ssgi") && !ssgiOn)) && normal) {
    gtao = ao(depth, normal, camera);
    gtao.resolutionScale = plan.aoResolutionScale;
    gtao.useTemporalFiltering = traaOn;
    disposables.push(gtao);
    rgb = rgb.mul(mix(float(1), gtao.getTextureNode().r, u.aoIntensity)) as V3;
  } else if (ssgiOn && normal) {
    gi = ssgi(color, depth, normal, camera as PerspectiveCamera);
    gi.sliceCount.value = SSGI_SETTINGS.sliceCount;
    gi.stepCount.value = SSGI_SETTINGS.stepCount;
    gi.useTemporalFiltering = traaOn;
    gi.resolutionScale = plan.aoResolutionScale;
    disposables.push(gi);
    const albedo = scenePass.getTextureNode("diffuse");
    rgb = rgb.mul(mix(float(1), gi.a, u.aoIntensity)).add(albedo.rgb.mul(gi.rgb)) as V3;
  }

  if (has("ssr") && normal) {
    const specular = scenePass.getTextureNode("specular");
    const reflection = ssr(color, depth, normal, {
      metalnessNode: specular.r as F,
      roughnessNode: specular.g as F,
      reflectNonMetals: true,
      stochastic: false,
      camera,
    });
    reflection.quality.value = SSR_SETTINGS.quality;
    reflection.maxDistance.value = SSR_SETTINGS.maxDistance;
    reflection.thickness.value = SSR_SETTINGS.thickness;
    reflection.blurQuality = SSR_SETTINGS.blurQuality;
    reflection.resolutionScale = plan.ssrResolutionScale;
    disposables.push(reflection);
    let reflected = reflection.rgb as V3;
    // Where a ray hit, SSR takes the place of the environment reflection the scene pass already lit:
    // the Sky Light's PMREM at the pixel's reflected direction and roughness, by the same weight and
    // grazing term the SSR node applied, is taken out (plan decision 2026-11-26).
    if (environment) {
      const viewPosition = getViewPosition(screenUV, depth.x as F, ssrCamera.projectionInverse);
      const viewNormal = (normal as unknown as { sample(uv: Node): V3 }).sample(screenUV);
      const nDotV = dot(viewNormal, viewPosition.negate().normalize()).clamp(0, 1);
      const reflectWorld = ssrCamera.world.mul(vec4(reflect(viewPosition.normalize(), viewNormal), 0)).xyz;
      const radiance = pmremTexture(environment, reflectWorld, specular.g).rgb.mul(ssrCamera.environmentIntensity);
      const share = specular.r.mul(float(1).sub(nDotV.mul(nDotV)));
      const hit = smoothstep(0, SSR_HIT_EDGE, reflection.a);
      reflected = reflected.sub(radiance.mul(share).mul(hit)) as V3;
    }
    rgb = max(rgb.add(reflected.mul(ssrIntensity)), 0) as V3;
  }

  let node: V4 = (gtao || gi || has("ssr") ? vec4(rgb, color.a) : color) as V4;

  if (traaOn) {
    const resolved = traa(node, depth, scenePass.getTextureNode("velocity"), camera);
    disposables.push(resolved);
    node = resolved as unknown as V4;
  } else if (has("smaa")) {
    const resolved = smaa(node);
    disposables.push(resolved);
    node = resolved as unknown as V4;
  }

  // After the history and the MRT passes, before what blurs and grades the picture (premultiplied).
  const latePass = late ? createLatePass(late, camera) : null;
  if (latePass) {
    disposables.push(latePass);
    const over = latePass.getTextureNode("output");
    node = vec4(node.rgb.mul(float(1).sub(over.a)).add(over.rgb), node.a) as V4;
  }

  if (has("dof")) {
    const blurred = dof(node, scenePass.getViewZNode(), u.focus, u.focalLength, u.bokehScale);
    disposables.push(blurred);
    node = blurred as unknown as V4;
  }

  let bloomNode: BloomNode | null = null;
  if (has("bloom")) {
    bloomNode = bloom(node);
    bloomNode.setResolutionScale(plan.bloomResolutionScale);
    disposables.push(bloomNode);
    node = node.add(bloomNode) as V4;
  }

  if (has("grading")) node = vec4(grade(node.rgb as V3, u), node.a) as V4;
  if (has("chromaticAberration")) {
    const shifted = rgbShift(node, u.caAmount);
    disposables.push(shifted);
    node = shifted as unknown as V4;
  }
  if (has("vignette")) node = vec4(vignette(node.rgb as V3, u), node.a) as V4;
  if (has("grain")) node = film(node, u.grain) as unknown as V4;

  const pipeline = new RenderPipeline(renderer, node);
  return {
    key: plan.key,
    scene,
    camera,
    late,
    latePass,
    pipeline,
    plan,
    depth: scenePass.renderTarget.depthTexture,
    environment,
    scenePass,
    update(post) {
      u.aoIntensity.value = post.ao.intensity;
      ssrMaxRoughness.value = post.ssr?.maxRoughness ?? SSR_DEFAULTS.maxRoughness;
      ssrIntensity.value = post.ssr?.intensity ?? SSR_DEFAULTS.intensity;
      ssrCamera.projectionInverse.value.copy(camera.projectionMatrixInverse);
      ssrCamera.world.value.copy(camera.matrixWorld);
      ssrCamera.environmentIntensity.value = scene.environmentIntensity;
      if (gtao) gtao.radius.value = post.ao.radius * AO_RADIUS_SCALE;
      if (gi) gi.radius.value = post.ao.radius;
      u.focus.value = post.dof.focusDistance;
      u.focalLength.value = dofFocalLength(post.dof.aperture, post.dof.maxBlur);
      u.bokehScale.value = Math.max(0, post.dof.maxBlur);
      if (bloomNode) {
        bloomNode.strength.value = post.bloom.intensity * BLOOM_INTENSITY_SCALE;
        bloomNode.radius.value = post.bloom.radius;
        bloomNode.threshold.value = post.bloom.threshold;
      }
      u.saturation.value = post.saturation;
      u.contrast.value = post.contrast;
      u.temperature.value = post.temperature;
      u.tint.value = post.tint;
      u.caAmount.value = post.chromaticAberration.amount * CHROMATIC_ABERRATION_AMOUNT_SCALE;
      u.vignetteIntensity.value = post.vignette.intensity;
      u.vignetteOffset.value = post.vignette.offset;
      u.grain.value = post.grain.intensity;
    },
    dispose() {
      pipeline.dispose();
      for (const disposable of disposables.reverse()) disposable.dispose();
    },
  };
}

export interface FramePipeline {
  compile(objects: Object3D, scene: Scene, camera: Camera): Promise<void>;
  /** Draws a frame: the plan from the gated Post Process and the quality; rebuilt only when it changes. */
  render(scene: Scene, camera: Camera, output: FrameOutput, quality: QualitySettings, late?: LateLayer | null): void;
  /** The plan of the last frame. */
  readonly plan: PipelinePlan;
  /** Pipelines built so far (a rebuild counts). */
  readonly builds: number;
  /**
   * The last frame's scene depth when it went through the pipeline's scene
   * pass; null when it was drawn straight to the canvas (its depth is the
   * renderer's multisampled frame buffer, which cannot be sampled). The
   * editor's overlay tests against it (plan phase 4 step 3).
   */
  readonly sceneDepth: Texture | null;
  dispose(): void;
}

export function createFramePipeline(renderer: WebGPURenderer): FramePipeline {
  let built: Built | null = null;
  let plan = planPipeline(null, {} as QualitySettings);
  let builds = 0;
  let direct = true;
  const release = (): void => {
    built?.dispose();
    built = null;
  };
  /** What the late layer's drawings were last prepared for: the first rain then compiles nothing. */
  let prepared = "";
  let preparedLate: LateLayer | null = null;
  const prepareLate = (late: LateLayer, parent: Scene, camera: Camera): void => {
    const key = `${direct ? "direct" : builds}:${late.root.children.map((child) => child.id).join(",")}`;
    if (late === preparedLate && key === prepared) return;
    preparedLate = late;
    prepared = key;
    if (late.root.children.length === 0) return;
    const visible = late.root.children.map((child) => child.visible);
    const previousTarget = renderer.getRenderTarget(), previousMrt = renderer.getMRT();
    for (const child of late.root.children) child.visible = true;
    try {
      if (!direct && built?.latePass) { renderer.setRenderTarget(built.latePass.renderTarget); renderer.setMRT(null); }
      // The state is taken before the first await; visibility is put back at once.
      // compileAsync leaves its captured target and MRT behind when it ends, as `compile` below knows.
      void renderer.compileAsync(late.root, camera, parent)
        .catch((error: unknown) => console.warn("Late layer not prepared", error))
        .finally(() => { renderer.setRenderTarget(previousTarget); renderer.setMRT(previousMrt); });
    } finally {
      late.root.children.forEach((child, i) => { child.visible = visible[i]!; });
      renderer.setRenderTarget(previousTarget);
      renderer.setMRT(previousMrt);
    }
  };
  return {
    compile(objects, scene, camera) {
      // Capture the actual scene pass's MRT/depth/sample formats. Restore
      // renderer state immediately; compileAsync captures it before yielding.
      const previousTarget = renderer.getRenderTarget(), previousMrt = renderer.getMRT();
      try {
        if (!direct && built) { renderer.setRenderTarget(built.scenePass.renderTarget); renderer.setMRT(built.scenePass.getMRT()); }
        return renderer.compileAsync(objects, camera, scene).then(() => {}).finally(() => {
          renderer.setRenderTarget(previousTarget); renderer.setMRT(previousMrt);
        });
      } finally { renderer.setRenderTarget(previousTarget); renderer.setMRT(previousMrt); }
    },
    render(scene, camera, frame, quality, late = null) {
      plan = planPipeline(frame.postProcess, quality);
      const toneMapping = TONE_MAPPINGS[frame.toneMapping];
      if (renderer.toneMapping !== toneMapping) renderer.toneMapping = toneMapping;
      renderer.toneMappingExposure = frame.exposure;
      if (plan.direct || !frame.postProcess) {
        release();
        direct = true;
        if (late) {
          if (late.root.parent !== scene) scene.add(late.root);
          late.setSceneDepth(null);
          prepareLate(late, scene, camera);
        }
        renderer.render(scene, camera);
        return;
      }
      direct = false;
      if (!built || built.key !== plan.key || built.scene !== scene || built.camera !== camera || built.late !== late
        || (plan.passes.includes("ssr") && built.environment !== scene.environment)) {
        release();
        built = build(renderer, scene, camera, plan, late);
        builds += 1;
      }
      if (late) {
        if (late.root.parent !== late.scene) late.scene.add(late.root);
        late.scene.fogNode = scene.fogNode;
        late.setSceneDepth(built.depth);
      }
      built.update(frame.postProcess);
      built.pipeline.render();
      // Once the pass has set its target up (its formats are the renderer's only then).
      if (late) prepareLate(late, late.scene, camera);
    },
    get plan() {
      return plan;
    },
    get builds() {
      return builds;
    },
    get sceneDepth() {
      return direct || !built ? null : built.depth;
    },
    dispose: release,
  };
}
